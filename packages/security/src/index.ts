import { closeSync, constants, fstatSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { resolveNativeHelper } from "./native-helper";

export * from "./native-helper";

export {
  assertPngBytes,
  assertRasterImageReference,
  assertSafeReportAssetReference,
  interactiveReportCsp,
  parseBoundedJson,
  reportSecurityHeaders,
  sandboxedStaticFragment,
  sanitizeStaticFragment,
  staticFragmentCsp,
  staticFragmentDocument,
  staticReportCsp
} from "./report";

const shellExecutables = new Set(["bash", "cmd", "fish", "powershell", "pwsh", "sh", "zsh"]);
const delegatingExecutables = new Set(["busybox", "env"]);
const secretName = /(TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|AUTH|COOKIE|SESSION|KEY)/iu;

function securityError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Security);
}

export function assertArgvCommand(value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((part) => typeof part !== "string" || !part)
  ) {
    securityError("SEC_COMMAND_ARGV", "Commands must be non-empty argv arrays");
  }
  const executable = path
    .basename(value[0])
    .replace(/\.(?:cmd|exe)$/iu, "")
    .toLowerCase();
  if (shellExecutables.has(executable)) {
    securityError("SEC_COMMAND_SHELL", "Shell executables are not allowed in configured commands");
  }
  if (delegatingExecutables.has(executable)) {
    securityError(
      "SEC_COMMAND_DELEGATE",
      "Command-delegating executables are not allowed in configured commands"
    );
  }
  if (/[;&|`\n\r]/u.test(value[0]) || /\s/u.test(value[0])) {
    securityError("SEC_COMMAND_EXECUTABLE", "The command executable contains shell-like syntax");
  }
}

const packageManagerInstallCommands: Readonly<Record<string, ReadonlySet<string>>> = {
  bun: new Set(["add", "install", "remove", "update", "x"]),
  npm: new Set(["ci", "exec", "i", "install", "uninstall", "update"]),
  pnpm: new Set(["add", "dlx", "exec", "i", "install", "remove", "update"]),
  yarn: new Set(["add", "dlx", "install", "remove", "up"])
};

export function assertRuntimeCommand(value: unknown): asserts value is string[] {
  assertArgvCommand(value);
  const executable = path
    .basename(value[0]!)
    .replace(/\.(?:cmd|exe)$/iu, "")
    .toLowerCase();
  const operation = value[1]?.toLowerCase();
  if (executable === "npx" || executable === "bunx" || executable === "corepack") {
    securityError(
      "SEC_COMMAND_ON_DEMAND_EXECUTION",
      `On-demand package execution is not allowed: ${executable}`
    );
  }
  if (operation && packageManagerInstallCommands[executable]?.has(operation)) {
    securityError(
      "SEC_COMMAND_INSTALL",
      `Dependency mutation is not allowed in runtime commands: ${executable} ${operation}`
    );
  }
  const nodePlaywrightCli =
    executable === "node" &&
    value.some(
      (argument, index) =>
        index > 0 && /playwright[^/\\]*[/\\].*cli|playwright.*cli/iu.test(argument)
    );
  if (
    (executable === "playwright" && operation === "install") ||
    (nodePlaywrightCli && value.includes("install"))
  ) {
    securityError("SEC_BROWSER_INSTALL", "Browser installation is not allowed at runtime");
  }
}

export function buildChildEnvironment(
  parent: NodeJS.ProcessEnv,
  allowlist: readonly string[],
  options: { allowSensitiveNames?: boolean } = {}
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const baseline of ["PATH", "TMPDIR", "LANG", "LC_ALL"]) {
    const value = parent[baseline];
    if (value) output[baseline] = value;
  }
  for (const name of allowlist) {
    if (!options.allowSensitiveNames && secretName.test(name)) {
      securityError("SEC_ENV_SECRET_NAME", `Sensitive environment name is not allowed: ${name}`);
    }
    const value = parent[name];
    if (value !== undefined) output[name] = value;
  }
  return output;
}

export function assertAllowedUrl(input: string, allowedOrigins: readonly string[] = []): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return securityError("SEC_URL_PARSE", "URL is invalid");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    securityError("SEC_URL_SCHEME", `URL scheme is not allowed: ${url.protocol}`);
  }
  const loopback = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]).has(url.hostname);
  if (!loopback && !allowedOrigins.includes(url.origin)) {
    securityError("SEC_URL_ORIGIN", `URL origin is not allowed: ${url.origin}`);
  }
  return url;
}

export function assertLoopbackAddress(host: string): void {
  if (!new Set(["127.0.0.1", "::1", "localhost"]).has(host)) {
    securityError("SEC_BIND_NON_LOOPBACK", "Only loopback addresses are allowed");
  }
}

export function assertArchiveEntryPath(entry: string): string {
  if (
    entry.includes("\0") ||
    path.isAbsolute(entry) ||
    /^[a-z]:[\\/]/iu.test(entry) ||
    entry.startsWith("\\\\")
  ) {
    securityError("SEC_ARCHIVE_PATH", "Archive entries must be relative and contain no NUL byte");
  }
  const normalized = path.posix.normalize(entry.replaceAll("\\", "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    securityError("SEC_ARCHIVE_TRAVERSAL", "Archive entry escapes the destination");
  }
  return normalized;
}

export function assertArchiveEntriesSafe(
  entries: readonly {
    path: string;
    kind: "directory" | "file" | "symlink" | "special";
    uncompressedBytes: number;
  }[],
  options: { maximumEntries?: number; maximumUncompressedBytes?: number } = {}
): string[] {
  const maximumEntries = options.maximumEntries ?? 10_000;
  const maximumUncompressedBytes = options.maximumUncompressedBytes ?? 64 * 1024 * 1024;
  if (entries.length > maximumEntries) {
    securityError("SEC_ARCHIVE_ENTRY_LIMIT", "Archive contains too many entries");
  }
  let totalBytes = 0;
  const normalized = entries.map((entry) => {
    if (entry.kind !== "file" && entry.kind !== "directory") {
      securityError("SEC_ARCHIVE_ENTRY_TYPE", "Archive symlinks and special files are forbidden");
    }
    if (!Number.isSafeInteger(entry.uncompressedBytes) || entry.uncompressedBytes < 0) {
      securityError("SEC_ARCHIVE_SIZE", "Archive entry size is invalid");
    }
    totalBytes += entry.uncompressedBytes;
    if (totalBytes > maximumUncompressedBytes) {
      securityError("SEC_ARCHIVE_SIZE_LIMIT", "Archive exceeds the uncompressed byte limit");
    }
    return assertArchiveEntryPath(entry.path);
  });
  if (new Set(normalized).size !== normalized.length) {
    securityError("SEC_ARCHIVE_DUPLICATE", "Archive contains duplicate normalized paths");
  }
  return normalized;
}

export async function resolveContainedPath(
  rootInput: string,
  relativeInput: string,
  options: { allowMissing?: boolean } = {}
): Promise<string> {
  if (
    path.isAbsolute(relativeInput) ||
    relativeInput.includes("\0") ||
    /^[a-z]:[\\/]/iu.test(relativeInput) ||
    relativeInput.startsWith("\\\\")
  ) {
    securityError("SEC_PATH_RELATIVE", "Repository paths must be relative");
  }
  const root = await realpath(rootInput);
  const candidate = path.resolve(root, relativeInput);
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    securityError("SEC_PATH_TRAVERSAL", "Path escapes the allowed root");
  }

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink())
        securityError("SEC_PATH_SYMLINK", "Symbolic links are not allowed");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && options.allowMissing) break;
      if (code === "ENOENT") securityError("SEC_PATH_MISSING", "Path does not exist");
      throw error;
    }
  }
  return candidate;
}

export async function readContainedRegularFile(
  rootInput: string,
  relativeInput: string,
  options: { maximumBytes?: number; timeoutMs?: number } = {}
): Promise<Buffer> {
  if (
    !relativeInput ||
    path.isAbsolute(relativeInput) ||
    relativeInput.includes("\\") ||
    relativeInput.includes("\0") ||
    relativeInput.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    securityError("SEC_PATH_RELATIVE", "Repository paths must use safe relative components");
  }
  const maximumBytes = options.maximumBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    securityError("SEC_FILE_SIZE_LIMIT", "Contained input byte limit is invalid");
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    securityError("SEC_FILE_TIMEOUT_LIMIT", "Contained input timeout must be 1 to 30000ms");
  }
  const root = await realpath(rootInput);
  const helper = await resolveNativeHelper();
  if (!helper) {
    securityError("SEC_NATIVE_HELPER_UNAVAILABLE", "Contained read helper is unavailable");
  }
  const rootDescriptor = openSync(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  let rootIdentity: ReturnType<typeof fstatSync>;
  try {
    rootIdentity = fstatSync(rootDescriptor, { bigint: true });
  } finally {
    closeSync(rootDescriptor);
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      helper,
      [
        "read-contained-root",
        root,
        relativeInput,
        String(maximumBytes),
        String(rootIdentity.dev),
        String(rootIdentity.ino)
      ],
      {
        env: {},
        killSignal: "SIGKILL",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
        windowsHide: true
      }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout!.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumBytes) {
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      const remaining = 8192 - stderrBytes;
      if (remaining <= 0) return;
      const retained = chunk.subarray(0, remaining);
      stderrBytes += retained.length;
      stderr.push(retained);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (stdoutBytes > maximumBytes || code === 71) {
        reject(
          new UtsuriError(
            "SEC_FILE_SIZE_LIMIT",
            `Contained input exceeds ${maximumBytes} bytes`,
            ExitCode.Security
          )
        );
        return;
      }
      if (code === 72) {
        reject(new UtsuriError("SEC_PATH_MISSING", "Path does not exist", ExitCode.Security));
        return;
      }
      if (code === 69) {
        reject(
          new UtsuriError(
            "SEC_PATH_RELATIVE",
            "Repository paths must use safe relative components",
            ExitCode.Security
          )
        );
        return;
      }
      if (code === 66) {
        reject(
          new UtsuriError(
            "SEC_ROOT_IDENTITY_CHANGED",
            "Contained input root identity changed before the native read",
            ExitCode.Security
          )
        );
        return;
      }
      if (code === 70) {
        reject(
          new UtsuriError(
            "SEC_FILE_TYPE",
            "Contained input must be a regular non-symlink file",
            ExitCode.Security
          )
        );
        return;
      }
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new UtsuriError(
            "SEC_CONTAINED_READ_FAILED",
            detail || `Contained read helper failed (${signal ?? code ?? "unknown"})`,
            ExitCode.Security
          )
        );
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}
