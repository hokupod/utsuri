import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

const shellExecutables = new Set(["bash", "cmd", "fish", "powershell", "pwsh", "sh", "zsh"]);
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
  const executable = path.basename(value[0]).toLowerCase();
  if (shellExecutables.has(executable)) {
    securityError("SEC_COMMAND_SHELL", "Shell executables are not allowed in configured commands");
  }
  if (/[;&|`\n\r]/u.test(value[0]) || /\s/u.test(value[0])) {
    securityError("SEC_COMMAND_EXECUTABLE", "The command executable contains shell-like syntax");
  }
}

export function buildChildEnvironment(
  parent: NodeJS.ProcessEnv,
  allowlist: readonly string[],
  options: { allowSensitiveNames?: boolean } = {}
): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const baseline of ["PATH", "TMPDIR", "LANG", "LC_ALL"]) {
    if (parent[baseline]) output[baseline] = parent[baseline];
  }
  for (const name of allowlist) {
    if (!options.allowSensitiveNames && secretName.test(name)) {
      securityError("SEC_ENV_SECRET_NAME", `Sensitive environment name is not allowed: ${name}`);
    }
    if (parent[name] !== undefined) output[name] = parent[name];
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
  if (entry.includes("\0") || path.isAbsolute(entry)) {
    securityError("SEC_ARCHIVE_PATH", "Archive entries must be relative and contain no NUL byte");
  }
  const normalized = path.posix.normalize(entry.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    securityError("SEC_ARCHIVE_TRAVERSAL", "Archive entry escapes the destination");
  }
  return normalized;
}

export async function resolveContainedPath(
  rootInput: string,
  relativeInput: string,
  options: { allowMissing?: boolean } = {}
): Promise<string> {
  if (path.isAbsolute(relativeInput) || relativeInput.includes("\0")) {
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
