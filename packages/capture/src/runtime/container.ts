import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import { promisify } from "node:util";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import {
  assertAllowedUrl,
  assertRuntimeCommand,
  buildChildEnvironment,
  resolveContainedPath
} from "@utsu-ri/security";
import type {
  CaptureCapability,
  ContainerConfiguration,
  ResourceLimits,
  ServerConfiguration
} from "../types";
import type { ServerHandle } from "../server-runtime";
import { runCleanupSteps } from "./cleanup";

const execFileAsync = promisify(execFile);
const maximumLogBytes = 64 * 1024;

function appendBounded(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(-maximumLogBytes);
}

export function assertPinnedContainerImage(image: string): string {
  if (!/^[^\s@]+(?:\/[^\s@]+)*@sha256:[a-f0-9]{64}$/u.test(image)) {
    throw new UtsuriError(
      "CONTAINER_IMAGE_NOT_PINNED",
      "Container image must use an exact sha256 digest",
      ExitCode.Security
    );
  }
  return image;
}

export function buildContainerCreateArguments(input: {
  name: string;
  projectDirectory: string;
  server: ServerConfiguration;
  container: ContainerConfiguration;
  limits: ResourceLimits;
}): string[] {
  if (!/^utsuri-[a-f0-9-]+$/u.test(input.name)) {
    throw new UtsuriError("CONTAINER_NAME_INVALID", "Container name is invalid", ExitCode.Security);
  }
  if (!input.server.command) {
    throw new UtsuriError(
      "CONTAINER_COMMAND_REQUIRED",
      "Container execution requires an explicit argv command",
      ExitCode.Arguments
    );
  }
  if (input.projectDirectory.includes(",") || input.projectDirectory.includes("\0")) {
    throw new UtsuriError(
      "CONTAINER_MOUNT_PATH_INVALID",
      "Container project path cannot be represented safely",
      ExitCode.Security
    );
  }
  assertRuntimeCommand(input.server.command);
  assertPinnedContainerImage(input.container.image);
  return [
    "create",
    "--pull=never",
    `--name=${input.name}`,
    "--network=none",
    "--read-only",
    "--security-opt=no-new-privileges",
    "--cap-drop=ALL",
    `--pids-limit=${input.container.pidsLimit}`,
    `--cpus=${input.container.cpus}`,
    `--memory=${input.limits.maxMemoryMiB}m`,
    `--memory-swap=${input.limits.maxMemoryMiB}m`,
    "--user=65534:65534",
    `--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=${input.container.tmpfsMiB}m`,
    `--mount=type=bind,src=${input.projectDirectory},dst=/workspace,readonly`,
    "--workdir=/workspace",
    input.container.image,
    ...input.server.command
  ];
}

export const buildContainerRunArguments = buildContainerCreateArguments;

export async function probeContainerCapability(
  container: ContainerConfiguration
): Promise<CaptureCapability> {
  const base = {
    startsProjectCode: true,
    requiresExplicitCommand: true,
    engine: container.engine
  } as const;
  try {
    await execFileAsync(container.engine, ["version", "--format", "{{.Server.Version}}"], {
      env: buildChildEnvironment(process.env, []),
      timeout: 5000,
      windowsHide: true
    });
    await execFileAsync(container.engine, ["image", "inspect", container.image], {
      env: buildChildEnvironment(process.env, []),
      timeout: 5000,
      windowsHide: true
    });
    return { ...base, supported: true };
  } catch {
    return {
      ...base,
      supported: false,
      reason: "container-engine-or-pinned-image-unavailable"
    };
  }
}

const fullContainerId = /^[a-f0-9]{64}$/u;
const proxyCapabilityHeader = "x-utsuri-container-capability";
const bridgeScript = String.raw`
const [target, method, maximumText, headersText] = process.argv.slice(1);
const maximum = Number(maximumText);
if (!Number.isSafeInteger(maximum) || maximum < 0) process.exit(64);
const headers = JSON.parse(headersText);
const response = await fetch(target, { method, headers, redirect: "manual" });
const body = method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
if (body.byteLength > maximum) process.exit(71);
const forwarded = {};
for (const name of ["cache-control", "content-language", "content-type", "etag", "last-modified", "location"]) {
  const value = response.headers.get(name);
  if (value !== null && value.length <= 8192) forwarded[name] = value;
}
process.stdout.write(JSON.stringify({ status: response.status, headers: forwarded, body: body.toString("base64") }));
`;

interface BridgeResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function equalCapability(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function assertFullContainerId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!fullContainerId.test(normalized)) {
    throw new UtsuriError(
      "CONTAINER_ID_INVALID",
      "Container engine did not return a full immutable container ID",
      ExitCode.Environment
    );
  }
  return normalized;
}

export function mapContainerLocation(
  location: string,
  requestUrl: string,
  internalOrigin: string,
  proxyOrigin: string
): string {
  const resolved = new URL(location, requestUrl);
  if (resolved.origin !== internalOrigin) {
    throw new UtsuriError(
      "CONTAINER_REDIRECT_ORIGIN_FORBIDDEN",
      "Container redirect left the configured internal origin",
      ExitCode.Security
    );
  }
  return new URL(`${resolved.pathname}${resolved.search}${resolved.hash}`, proxyOrigin).toString();
}

export function mapContainerTargetUrl(
  targetPath: string,
  internalReadyUrl: string,
  proxyReadyUrl: string
): string {
  const logical = new URL(targetPath, internalReadyUrl);
  if (logical.origin !== new URL(internalReadyUrl).origin) return logical.toString();
  return new URL(`${logical.pathname}${logical.search}${logical.hash}`, proxyReadyUrl).toString();
}

async function inspectContainerIdentity(
  engine: "docker" | "podman",
  containerId: string,
  timeoutMs: number
): Promise<void> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      engine,
      ["inspect", "--format", "{{.Id}} {{.State.Running}}", containerId],
      {
        encoding: "utf8",
        env: buildChildEnvironment(process.env, []),
        timeout: Math.max(1000, timeoutMs),
        windowsHide: true
      }
    ));
  } catch {
    throw new UtsuriError(
      "CONTAINER_IDENTITY_UNAVAILABLE",
      "The original container identity is no longer available",
      ExitCode.Incomplete
    );
  }
  const [observedId, running, ...extra] = stdout.trim().split(/\s+/u);
  if (
    extra.length > 0 ||
    !observedId ||
    assertFullContainerId(observedId) !== containerId ||
    running !== "true"
  ) {
    throw new UtsuriError(
      "CONTAINER_IDENTITY_CHANGED",
      "Container identity or lifecycle changed during capture",
      ExitCode.Incomplete
    );
  }
}

async function fetchThroughContainer(
  engine: "docker" | "podman",
  containerId: string,
  internalOrigin: string,
  targetUrl: string,
  method: "GET" | "HEAD",
  requestHeaders: Readonly<Record<string, string>>,
  maximumBytes: number,
  timeoutMs: number
): Promise<BridgeResponse> {
  const parsed = new URL(targetUrl);
  if (parsed.origin !== internalOrigin) {
    throw new UtsuriError(
      "CONTAINER_PROXY_ORIGIN_FORBIDDEN",
      "Container bridge requests must remain on the configured internal origin",
      ExitCode.Security
    );
  }
  await inspectContainerIdentity(engine, containerId, timeoutMs);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      engine,
      [
        "exec",
        containerId,
        "node",
        "--input-type=module",
        "--eval",
        bridgeScript,
        targetUrl,
        method,
        String(maximumBytes),
        JSON.stringify(requestHeaders)
      ],
      {
        encoding: "utf8",
        env: buildChildEnvironment(process.env, []),
        maxBuffer: Math.ceil(maximumBytes * 1.5) + 65_536,
        timeout: Math.max(1000, timeoutMs),
        windowsHide: true
      }
    ));
  } catch {
    throw new UtsuriError(
      "CONTAINER_BRIDGE_FAILED",
      "Identity-bound container request failed",
      ExitCode.Incomplete
    );
  }
  await inspectContainerIdentity(engine, containerId, timeoutMs);
  const value = JSON.parse(stdout) as {
    status?: unknown;
    headers?: unknown;
    body?: unknown;
  };
  if (
    !Number.isInteger(value.status) ||
    Number(value.status) < 100 ||
    Number(value.status) > 599 ||
    typeof value.body !== "string" ||
    !value.headers ||
    typeof value.headers !== "object" ||
    Array.isArray(value.headers)
  ) {
    throw new UtsuriError(
      "CONTAINER_BRIDGE_RESPONSE_INVALID",
      "Container bridge returned an invalid response envelope",
      ExitCode.Incomplete
    );
  }
  const body = Buffer.from(value.body, "base64");
  if (body.toString("base64") !== value.body || body.byteLength > maximumBytes) {
    throw new UtsuriError(
      "CONTAINER_BRIDGE_RESPONSE_LIMIT",
      "Container bridge response exceeded its byte boundary",
      ExitCode.Incomplete
    );
  }
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value.headers)) {
    if (
      !new Set([
        "cache-control",
        "content-language",
        "content-type",
        "etag",
        "last-modified",
        "location"
      ]).has(name) ||
      typeof headerValue !== "string" ||
      /[\r\n]/u.test(headerValue) ||
      headerValue.length > 8192
    ) {
      throw new UtsuriError(
        "CONTAINER_BRIDGE_HEADER_INVALID",
        "Container bridge returned an unsafe response header",
        ExitCode.Incomplete
      );
    }
    headers[name] = headerValue;
  }
  return { status: Number(value.status), headers, body };
}

async function closeProxy(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function createIdentityBoundProxy(input: {
  engine: "docker" | "podman";
  containerId: string;
  internalReadyUrl: string;
  maximumBytes: number;
  timeoutMs: number;
}): Promise<{
  readyUrl: string;
  requestHeaders: Readonly<Record<string, string>>;
  assertHealthy(): void;
  close(): Promise<void>;
}> {
  const internal = assertAllowedUrl(input.internalReadyUrl);
  const internalOrigin = internal.origin;
  const capability = randomBytes(32).toString("base64url");
  let expectedHost = "";
  let proxyOrigin = "";
  let active = true;
  let activated = false;
  let failure: UtsuriError | null = null;
  let inFlight = 0;
  const server = createServer();
  server.on("request", async (request, response) => {
    const authorized =
      request.headers.host === expectedHost &&
      equalCapability(request.headers[proxyCapabilityHeader] as string | undefined, capability);
    if (!authorized) {
      response.writeHead(403, { "cache-control": "no-store", "content-type": "text/plain" });
      response.end("Forbidden\n");
      return;
    }
    if (failure) {
      response.writeHead(502, { "cache-control": "no-store", "content-type": "text/plain" });
      response.end("Container bridge unavailable\n");
      return;
    }
    if (!active) {
      response.writeHead(403, { "cache-control": "no-store", "content-type": "text/plain" });
      response.end("Forbidden\n");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
      response.end();
      return;
    }
    if (inFlight >= 4) {
      response.writeHead(503, { "cache-control": "no-store", "retry-after": "1" });
      response.end();
      return;
    }
    inFlight += 1;
    try {
      const proxyUrl = new URL(request.url ?? "/", proxyOrigin);
      const targetUrl = new URL(
        `${proxyUrl.pathname}${proxyUrl.search}`,
        input.internalReadyUrl
      ).toString();
      const forwardedHeaders: Record<string, string> = {};
      for (const name of ["accept", "accept-language", "if-none-match", "if-modified-since"]) {
        const value = request.headers[name];
        if (typeof value === "string" && value.length <= 8192 && !/[\r\n]/u.test(value)) {
          forwardedHeaders[name] = value;
        }
      }
      const bridged = await fetchThroughContainer(
        input.engine,
        input.containerId,
        internalOrigin,
        targetUrl,
        request.method,
        forwardedHeaders,
        input.maximumBytes,
        input.timeoutMs
      );
      if (bridged.headers.location) {
        bridged.headers.location = mapContainerLocation(
          bridged.headers.location,
          targetUrl,
          internalOrigin,
          proxyOrigin
        );
      }
      activated = true;
      response.writeHead(bridged.status, {
        ...bridged.headers,
        "content-length": String(bridged.body.byteLength),
        "x-content-type-options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : bridged.body);
    } catch (error) {
      if (
        !activated &&
        error instanceof UtsuriError &&
        error.diagnosticId === "CONTAINER_BRIDGE_FAILED"
      ) {
        response.writeHead(503, {
          "cache-control": "no-store",
          "content-type": "text/plain",
          "retry-after": "1"
        });
        response.end("Container target is not ready\n");
        return;
      }
      active = false;
      failure = new UtsuriError(
        "CONTAINER_PROXY_IDENTITY_FAILED",
        "Container identity-bound proxy failed during capture",
        ExitCode.Incomplete
      );
      response.writeHead(502, { "cache-control": "no-store", "content-type": "text/plain" });
      response.end("Container bridge unavailable\n");
    } finally {
      inFlight -= 1;
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeProxy(server);
    throw new UtsuriError(
      "CONTAINER_PROXY_BIND_FAILED",
      "Container proxy did not receive a loopback TCP endpoint",
      ExitCode.Environment
    );
  }
  expectedHost = `127.0.0.1:${address.port}`;
  proxyOrigin = `http://${expectedHost}`;
  return {
    readyUrl: new URL(internal.pathname + internal.search, `${proxyOrigin}/`).toString(),
    requestHeaders: Object.freeze({ [proxyCapabilityHeader]: capability }),
    assertHealthy: () => {
      if (failure) throw failure;
    },
    close: async () => {
      active = false;
      await closeProxy(server);
    }
  };
}

async function terminateContainer(
  child: ChildProcess,
  engine: "docker" | "podman",
  containerId: string,
  timeoutMs: number
): Promise<void> {
  const environment = buildChildEnvironment(process.env, []);
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  let removed = false;
  try {
    while (Date.now() < deadline) {
      const operationTimeout = Math.max(250, Math.min(1000, deadline - Date.now()));
      await execFileAsync(engine, ["rm", "--force", containerId], {
        env: environment,
        timeout: operationTimeout,
        windowsHide: true
      }).catch(() => undefined);
      try {
        const { stdout } = await execFileAsync(
          engine,
          ["ps", "--all", "--quiet", "--no-trunc", "--filter", `id=${containerId}`],
          {
            encoding: "utf8",
            env: environment,
            timeout: operationTimeout,
            windowsHide: true
          }
        );
        const observed = stdout
          .split("\n")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean);
        if (observed.some((entry) => !fullContainerId.test(entry))) {
          throw new Error("container engine returned an invalid lifecycle identity");
        }
        if (observed.length === 0) {
          removed = true;
          break;
        }
      } catch {
        // The engine cannot prove that the immutable container ID is absent yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await Promise.race([
      once(child, "exit").catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, Math.min(Math.max(timeoutMs, 1), 1000)))
    ]);
  }
  if (!removed || (child.exitCode === null && child.signalCode === null)) {
    throw new UtsuriError(
      "CONTAINER_CLEANUP_FAILED",
      "The container engine could not verify the immutable ID as absent",
      ExitCode.Environment
    );
  }
}

async function waitUntilReady(
  child: ChildProcess,
  readyUrl: string,
  requestHeaders: Readonly<Record<string, string>>,
  timeoutMs: number
): Promise<void> {
  assertAllowedUrl(readyUrl);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new UtsuriError(
        "CONTAINER_EXITED",
        "Container exited before its identity-bound endpoint became ready",
        ExitCode.Incomplete
      );
    }
    try {
      const response = await fetch(readyUrl, {
        headers: requestHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now())))
      });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Retry only the authenticated identity-bound proxy until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new UtsuriError(
    "CONTAINER_SERVER_TIMEOUT",
    "Isolated container endpoint was unavailable; capture remains incomplete",
    ExitCode.Incomplete
  );
}

export async function startContainerServer(
  repositoryRoot: string,
  server: ServerConfiguration,
  container: ContainerConfiguration,
  limits: ResourceLimits
): Promise<ServerHandle> {
  if (!server.cwd || !server.command) {
    throw new UtsuriError(
      "CONTAINER_SERVER_NOT_EXPLICIT",
      "Container mode requires an explicit command and repository-relative directory",
      ExitCode.Arguments
    );
  }
  const projectDirectory = await resolveContainedPath(repositoryRoot, server.cwd);
  const capability = await probeContainerCapability(container);
  if (!capability.supported) {
    throw new UtsuriError(
      "CONTAINER_CAPABILITY_MISSING",
      "Container engine or exact pinned image is unavailable",
      ExitCode.Environment,
      { capability }
    );
  }
  const name = `utsuri-${randomUUID()}`;
  const args = buildContainerCreateArguments({
    name,
    projectDirectory,
    server,
    container,
    limits
  });
  let containerId: string;
  try {
    const { stdout } = await execFileAsync(container.engine, args, {
      encoding: "utf8",
      env: buildChildEnvironment(process.env, []),
      timeout: Math.max(1000, limits.maxTimeMs),
      windowsHide: true
    });
    containerId = assertFullContainerId(stdout);
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    throw new UtsuriError(
      "CONTAINER_CREATE_FAILED",
      "Container could not be created with the fixed isolation policy",
      ExitCode.Incomplete
    );
  }
  const child = spawn(container.engine, ["start", "--attach", containerId], {
    env: buildChildEnvironment(process.env, []),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => (stdout = appendBounded(stdout, chunk)));
  child.stderr?.on("data", (chunk: Buffer) => (stderr = appendBounded(stderr, chunk)));
  let proxy: Awaited<ReturnType<typeof createIdentityBoundProxy>> | null = null;
  try {
    proxy = await createIdentityBoundProxy({
      engine: container.engine,
      containerId,
      internalReadyUrl: server.readyUrl,
      maximumBytes: limits.maxArtifactBytes,
      timeoutMs: Math.min(limits.maxTimeMs, 10_000)
    });
    await Promise.race([
      waitUntilReady(child, proxy.readyUrl, proxy.requestHeaders, limits.maxTimeMs),
      new Promise<never>((_, reject) => child.once("error", reject))
    ]);
  } catch (error) {
    await runCleanupSteps([
      async () => {
        if (proxy) await proxy.close();
      },
      () => terminateContainer(child, container.engine, containerId, server.shutdownTimeoutMs)
    ]);
    throw error;
  }
  let stopPromise: Promise<void> | null = null;
  return {
    pid: child.pid ?? 0,
    readyUrl: proxy.readyUrl,
    requestHeaders: proxy.requestHeaders,
    assertHealthy: proxy.assertHealthy,
    stdout: () => stdout,
    stderr: () => stderr,
    stop: async () => {
      stopPromise ??= runCleanupSteps([
        () => proxy.close(),
        () => terminateContainer(child, container.engine, containerId, server.shutdownTimeoutMs)
      ]);
      await stopPromise;
    }
  };
}
