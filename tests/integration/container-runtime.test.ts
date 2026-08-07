import { afterAll, describe, expect, test } from "bun:test";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import type { UtsuriConfig } from "../../packages/report-model/src";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import {
  probeContainerCapability,
  startContainerServer
} from "../../packages/capture/src/runtime/container";
import { captureConfig, freePort, repositoryRoot } from "./capture-helpers";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

function unavailableContainerConfig(): UtsuriConfig {
  const value = captureConfig({ mode: "dual-url" });
  value.execution.mode = "container";
  value.execution.trust = "untrusted";
  value.servers!.before = {
    command: ["node", "server.mjs"],
    cwd: "before",
    readyUrl: "http://127.0.0.1:4173/"
  };
  value.servers!.after = {
    command: ["node", "server.mjs"],
    cwd: "after",
    readyUrl: "http://127.0.0.1:4174/"
  };
  value.security!.envAllowlist = [];
  value.network!.allowedOrigins = [];
  value.container = {
    engine: "docker",
    image: `example.invalid/definitely-unavailable@sha256:${"f".repeat(64)}`,
    network: "none",
    readOnlyRoot: true,
    noNewPrivileges: true,
    capDrop: ["ALL"],
    mountProjectReadOnly: true
  };
  return value;
}

describe("container runtime capability", () => {
  test("records a missing engine or exact image instead of claiming capture success", async () => {
    const root = await temporaryRoot("utsuri-container-capability-");
    const run = path.join(root, "run");
    await Promise.all([
      mkdir(run, { mode: 0o700 }),
      mkdir(path.join(root, "before")),
      mkdir(path.join(root, "after"))
    ]);
    const config = normalizeCaptureConfig(unavailableContainerConfig());
    const capability = await probeContainerCapability(config.container!);
    expect(capability.supported).toBeFalse();
    expect(capability.reason).toBe("container-engine-or-pinned-image-unavailable");

    const result = await captureRun(root, run, config);
    expect(result.complete).toBeFalse();
    expect(result.manifest.capability).toMatchObject({ supported: false, engine: "docker" });
    expect(result.manifest.environment.limits.maxMemoryMiB).toBe(512);
    expect(result.manifest.targets[0]?.before.failure?.code).toBe("CONTAINER_CAPABILITY_MISSING");
  }, 20_000);

  test("turns an oversized diff into bounded incomplete evidence before browser launch", async () => {
    const root = await temporaryRoot("utsuri-resource-limit-");
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await copyFile(
      path.join(repositoryRoot, "fixtures/runtime-security/large-diff.json"),
      path.join(run, "diff.json")
    );
    const raw = captureConfig({ mode: "dual-url" });
    raw.limits = { maxDiffLines: 2 };
    const result = await captureRun(root, run, normalizeCaptureConfig(raw));
    expect(result.complete).toBeFalse();
    expect(result.manifest.targets[0]?.before.failure?.code).toBe("CAPTURE_DIFF_LINE_LIMIT");
    expect(result.manifest.environment.limits.maxDiffLines).toBe(2);
    expect(result.manifest.browser.version).toBe("unavailable");
  });

  test("rejects a malformed diff instead of treating missing hunks as zero", async () => {
    const root = await temporaryRoot("utsuri-invalid-diff-limit-");
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await writeFile(path.join(run, "diff.json"), '{"files":[]}\n');
    const result = await captureRun(
      root,
      run,
      normalizeCaptureConfig(captureConfig({ mode: "dual-url" }))
    );
    expect(result.complete).toBeFalse();
    expect(result.manifest.targets[0]?.before.failure?.code).toBe("CAPTURE_DIFF_INVALID");
    expect(result.manifest.browser.version).toBe("unavailable");
  });

  test("preflights oversized input before capture reuse can be considered", async () => {
    const root = await temporaryRoot("utsuri-input-limit-");
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await writeFile(path.join(run, "input.json"), JSON.stringify({ value: "x".repeat(2048) }));
    const raw = captureConfig({ mode: "dual-url" });
    raw.limits = { maxArtifactBytes: 1024 };
    const result = await captureRun(root, run, normalizeCaptureConfig(raw));
    expect(result.complete).toBeFalse();
    expect(result.manifest.targets[0]?.before.failure?.code).toBe("CAPTURE_INPUT_ARTIFACT_LIMIT");
    expect(result.reusedSides).toBe(0);
  });

  test("retries transient readiness through the immutable ID and never a host decoy", async () => {
    const root = await temporaryRoot("utsuri-container-proxy-");
    const project = path.join(root, "project");
    const bin = path.join(root, "bin");
    const marker = path.join(root, "identity-replaced");
    await Promise.all([mkdir(project), mkdir(bin)]);
    const containerId = "a".repeat(64);
    const replacementId = "b".repeat(64);
    const removed = path.join(root, "container-removed");
    const delayed = path.join(root, "container-delayed");
    const fakeDocker = path.join(bin, "docker");
    await writeFile(
      fakeDocker,
      `#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const id = ${JSON.stringify(containerId)};
const replacement = ${JSON.stringify(replacementId)};
const marker = ${JSON.stringify(marker)};
const removed = ${JSON.stringify(removed)};
const delayed = ${JSON.stringify(delayed)};
if (args[0] === "version" || (args[0] === "image" && args[1] === "inspect")) process.exit(0);
if (args[0] === "create") { rmSync(removed, { force: true }); rmSync(delayed, { force: true }); process.stdout.write(id + "\\n"); process.exit(0); }
if (args[0] === "start") { setInterval(() => {}, 1000); }
else if (args[0] === "ps") { if (!existsSync(removed)) process.stdout.write(id + "\\n"); }
else if (args[0] === "inspect") {
  if (existsSync(removed)) process.exit(1);
  process.stdout.write((existsSync(marker) ? replacement : id) + " true\\n");
} else if (args[0] === "exec") {
  if (!existsSync(delayed)) { writeFileSync(delayed, "retry"); process.exit(1); }
  const target = new URL(args[6]);
  const redirect = target.pathname === "/redirect";
  const externalRedirect = target.pathname === "/external-redirect";
  const body = Buffer.from("container-response");
  process.stdout.write(JSON.stringify({
    status: redirect || externalRedirect ? 302 : 200,
    headers: redirect || externalRedirect
      ? { location: externalRedirect ? "https://attacker.invalid/" : new URL("/final", target).toString() }
      : { "content-type": "text/plain" },
    body: (redirect || externalRedirect ? Buffer.alloc(0) : body).toString("base64")
  }));
} else if (args[0] === "rm") { writeFileSync(removed, "removed"); process.exit(0); }
else process.exit(64);
`
    );
    await chmod(fakeDocker, 0o755);

    let decoyRequests = 0;
    const decoy = createServer();
    decoy.on("request", (_request, response) => {
      decoyRequests += 1;
      response.end("host-decoy");
    });
    decoy.listen(await freePort(), "127.0.0.1");
    await once(decoy, "listening");
    const address = decoy.address();
    if (!address || typeof address === "string") throw new Error("decoy port unavailable");
    const previousPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;
    let handle: Awaited<ReturnType<typeof startContainerServer>> | undefined;
    try {
      handle = await startContainerServer(
        root,
        {
          command: ["node", "server.mjs"],
          cwd: "project",
          readyUrl: `http://127.0.0.1:${address.port}/`,
          shutdownTimeoutMs: 1000
        },
        {
          engine: "docker",
          image: `example.invalid/utsuri@sha256:${"a".repeat(64)}`,
          network: "none",
          readOnlyRoot: true,
          noNewPrivileges: true,
          capDrop: ["ALL"],
          mountProjectReadOnly: true,
          pidsLimit: 64,
          cpus: 1,
          tmpfsMiB: 64
        },
        {
          maxDiffLines: 100,
          maxImagePixels: 1_000_000,
          maxTimeMs: 5000,
          maxMemoryMiB: 256,
          maxArtifactBytes: 64 * 1024
        }
      );
      expect(decoyRequests).toBe(0);
      expect(await (await fetch(handle.readyUrl!, { headers: handle.requestHeaders })).text()).toBe(
        "container-response"
      );
      expect((await fetch(handle.readyUrl!)).status).toBe(403);
      const redirected = await fetch(new URL("redirect", handle.readyUrl!), {
        headers: handle.requestHeaders,
        redirect: "manual"
      });
      expect(redirected.status).toBe(302);
      expect(new URL(redirected.headers.get("location")!).origin).toBe(
        new URL(handle.readyUrl!).origin
      );
      expect(decoyRequests).toBe(0);

      expect(
        (
          await fetch(new URL("external-redirect", handle.readyUrl!), {
            headers: handle.requestHeaders,
            redirect: "manual"
          })
        ).status
      ).toBe(502);
      expect(() => handle!.assertHealthy!()).toThrow("identity-bound proxy failed");
      await handle.stop();
      handle = await startContainerServer(
        root,
        {
          command: ["node", "server.mjs"],
          cwd: "project",
          readyUrl: `http://127.0.0.1:${address.port}/`,
          shutdownTimeoutMs: 1000
        },
        {
          engine: "docker",
          image: `example.invalid/utsuri@sha256:${"a".repeat(64)}`,
          network: "none",
          readOnlyRoot: true,
          noNewPrivileges: true,
          capDrop: ["ALL"],
          mountProjectReadOnly: true,
          pidsLimit: 64,
          cpus: 1,
          tmpfsMiB: 64
        },
        {
          maxDiffLines: 100,
          maxImagePixels: 1_000_000,
          maxTimeMs: 5000,
          maxMemoryMiB: 256,
          maxArtifactBytes: 64 * 1024
        }
      );

      await writeFile(marker, "replaced");
      expect((await fetch(handle.readyUrl!, { headers: handle.requestHeaders })).status).toBe(502);
      expect(() => handle!.assertHealthy!()).toThrow("identity-bound proxy failed");
      expect(decoyRequests).toBe(0);
    } finally {
      if (handle) await handle.stop();
      process.env.PATH = previousPath;
      await new Promise<void>((resolve) => decoy.close(() => resolve()));
    }
  }, 20_000);

  test("fails closed when immutable container removal cannot be verified", async () => {
    const root = await temporaryRoot("utsuri-container-cleanup-");
    const project = path.join(root, "project");
    const bin = path.join(root, "bin");
    await Promise.all([mkdir(project), mkdir(bin)]);
    const containerId = "c".repeat(64);
    const fakeDocker = path.join(bin, "docker");
    await writeFile(
      fakeDocker,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
const id = ${JSON.stringify(containerId)};
if (args[0] === "version" || (args[0] === "image" && args[1] === "inspect")) process.exit(0);
if (args[0] === "create") { process.stdout.write(id + "\\n"); process.exit(0); }
if (args[0] === "start") { setInterval(() => {}, 1000); }
else if (args[0] === "ps") process.stdout.write(id + "\\n");
else if (args[0] === "inspect") process.stdout.write(id + " true\\n");
else if (args[0] === "exec") process.stdout.write(JSON.stringify({ status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("ready").toString("base64") }));
else if (args[0] === "rm") process.exit(1);
else process.exit(64);
`
    );
    await chmod(fakeDocker, 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;
    try {
      const handle = await startContainerServer(
        root,
        {
          command: ["node", "server.mjs"],
          cwd: "project",
          readyUrl: "http://127.0.0.1:4173/",
          shutdownTimeoutMs: 1000
        },
        {
          engine: "docker",
          image: `example.invalid/utsuri@sha256:${"a".repeat(64)}`,
          network: "none",
          readOnlyRoot: true,
          noNewPrivileges: true,
          capDrop: ["ALL"],
          mountProjectReadOnly: true,
          pidsLimit: 64,
          cpus: 1,
          tmpfsMiB: 64
        },
        {
          maxDiffLines: 100,
          maxImagePixels: 1_000_000,
          maxTimeMs: 5000,
          maxMemoryMiB: 256,
          maxArtifactBytes: 64 * 1024
        }
      );
      await expect(handle.stop()).rejects.toMatchObject({
        diagnosticId: "CONTAINER_CLEANUP_FAILED"
      });
      expect(() => process.kill(handle.pid, 0)).toThrow();
    } finally {
      process.env.PATH = previousPath;
    }
  }, 20_000);
});
