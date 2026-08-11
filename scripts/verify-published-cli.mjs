#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@utsu-ri/cli";
const maximumOutputBytes = 1024 * 1024;
const reportSelector = {
  type: "string",
  pattern: "^report[-:][A-Za-z0-9._:-]+$",
  maxLength: 256
};
const expectedMcpToolSchemas = {
  review_list_batches: {
    type: "object",
    additionalProperties: false,
    properties: {
      report_id: reportSelector,
      state: { enum: ["draft", "ready", "submitted", "consumed", "answered", "stale"] }
    }
  },
  review_get_batch: {
    type: "object",
    additionalProperties: false,
    properties: {
      batch_id: { type: "string", pattern: "^fb[-:]" },
      report_id: reportSelector
    }
  },
  review_claim_batch: {
    type: "object",
    additionalProperties: false,
    properties: {
      batch_id: { type: "string", pattern: "^fb[-:]" },
      report_id: reportSelector
    }
  },
  review_get_item_context: {
    type: "object",
    additionalProperties: false,
    required: ["item_id"],
    properties: {
      item_id: { type: "string", pattern: "^item[-:]" },
      report_id: reportSelector
    }
  },
  review_post_answers: {
    type: "object",
    additionalProperties: false,
    required: ["batch_id", "answers"],
    properties: {
      batch_id: { type: "string", pattern: "^fb[-:]" },
      answers: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "object" }
      },
      report_id: reportSelector
    }
  },
  review_release_batch: {
    type: "object",
    additionalProperties: false,
    required: ["batch_id"],
    properties: {
      batch_id: { type: "string", pattern: "^fb[-:]" },
      report_id: reportSelector
    }
  }
};

function exactVersion(value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new Error("Published smoke requires an exact SemVer without a range or tag");
  }
  return value;
}

async function resolveExecutable(name, pathValue, options = {}) {
  for (const directory of (pathValue ?? "").split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      const resolved = await realpath(candidate);
      const fileStat = await lstat(resolved);
      if (fileStat.isFile() && !fileStat.isSymbolicLink()) {
        return options.preserveInvocationPath ? candidate : resolved;
      }
    } catch {
      // Continue to the next PATH entry.
    }
  }
  throw new Error(`Native package manager executable is unavailable: ${name}`);
}

async function signalProcessGroupWithNativeKill(pid, signal) {
  const executable = await resolveExecutable("kill", process.env.PATH ?? "/bin:/usr/bin", {
    preserveInvocationPath: true
  });
  const child = spawn(executable, ["-s", signal.replace(/^SIG/u, ""), `-${pid}`], {
    shell: false,
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (Buffer.byteLength(stderr) < 16 * 1024) stderr += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code === 0 || /no such process/iu.test(stderr)) return;
  throw new Error(`Native process-group ${signal} failed: status=${code} ${stderr.trim()}`);
}

async function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code === "ESRCH") return;
    if (error.code === "EPERM") {
      await signalProcessGroupWithNativeKill(pid, signal);
      return;
    }
    throw error;
  }
}

async function stopProcessGroup(pid) {
  if (!pid || process.platform === "win32") return;
  await signalProcessGroup(pid, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await signalProcessGroup(pid, "SIGKILL");
}

async function runBounded(executable, args, options) {
  const child = spawn(executable, args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env,
    shell: false,
    stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let overflow = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > maximumOutputBytes) {
      overflow = true;
      child.kill("SIGTERM");
      return;
    }
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    if (Buffer.byteLength(stderr) + Buffer.byteLength(chunk) > maximumOutputBytes) {
      overflow = true;
      child.kill("SIGTERM");
      return;
    }
    stderr += chunk;
  });
  if (options.stdin !== undefined) {
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.stdin);
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    if (child.pid && process.platform !== "win32") {
      void signalProcessGroup(child.pid, "SIGTERM").catch(() => undefined);
    }
  }, options.timeoutMs);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    if (timedOut) throw new Error(`${options.label} timed out after ${options.timeoutMs}ms`);
    if (overflow) throw new Error(`${options.label} exceeded the output byte limit`);
    if (result.signal || result.code !== 0) {
      throw new Error(
        `${options.label} failed: status=${result.code ?? "none"} signal=${result.signal ?? "none"}`
      );
    }
    return { stdout, stderr };
  } finally {
    clearTimeout(timer);
    await stopProcessGroup(child.pid);
  }
}

function strictVersionResponse(label, output, version) {
  if (output.stderr !== "") throw new Error(`${label} wrote to stderr`);
  if (!output.stdout.endsWith("\n")) throw new Error(`${label} stdout is not newline terminated`);
  const lines = output.stdout.split(/\r?\n/u);
  if (lines.at(-1) !== "") throw new Error(`${label} stdout framing is invalid`);
  lines.pop();
  if (lines.length !== 1 || lines[0] === "") {
    throw new Error(`${label} must emit exactly one JSON line`);
  }
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error(`${label} stdout is not strict JSON`);
  }
  const expected = {
    ok: true,
    command: "version",
    package: packageName,
    version,
    protocolVersion: "1.1"
  };
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`${label} returned the wrong package, version, or protocol identity`);
  }
  return value;
}

function strictMcpResponse(label, output, version) {
  if (output.stderr !== "") throw new Error(`${label} wrote to stderr`);
  if (!output.stdout.endsWith("\n")) {
    throw new Error(`${label} stdout is not newline terminated`);
  }
  const lines = output.stdout.split(/\r?\n/u);
  if (lines.at(-1) !== "") throw new Error(`${label} stdout framing is invalid`);
  lines.pop();
  if (lines.length !== 2 || lines.some((line) => line === "")) {
    throw new Error(`${label} must emit exactly two NDJSON response lines`);
  }
  let initialize;
  let toolsList;
  try {
    initialize = JSON.parse(lines[0]);
    toolsList = JSON.parse(lines[1]);
  } catch {
    throw new Error(`${label} stdout is not strict NDJSON`);
  }
  if (
    initialize?.jsonrpc !== "2.0" ||
    initialize?.id !== 1 ||
    initialize?.result?.protocolVersion !== "2025-06-18" ||
    initialize?.result?.serverInfo?.name !== "utsu-ri-plugin-broker" ||
    initialize?.result?.serverInfo?.version !== version
  ) {
    throw new Error(`${label} returned the wrong MCP protocol or server identity`);
  }
  const tools = toolsList?.result?.tools;
  if (toolsList?.jsonrpc !== "2.0" || toolsList?.id !== 2 || !Array.isArray(tools)) {
    throw new Error(`${label} returned an invalid tools/list response`);
  }
  const expectedNames = Object.keys(expectedMcpToolSchemas);
  if (
    tools.length !== expectedNames.length ||
    new Set(tools.map((tool) => tool?.name)).size !== expectedNames.length
  ) {
    throw new Error(`${label} returned the wrong MCP tool inventory`);
  }
  for (const tool of tools) {
    const expected = expectedMcpToolSchemas[tool?.name];
    if (!expected || !isDeepStrictEqual(tool?.inputSchema, expected)) {
      throw new Error(`${label} returned a non-canonical MCP tool schema`);
    }
  }
  return { tools: tools.length };
}

async function writePrivate(filename, content, mode = 0o600) {
  await writeFile(filename, content, { flag: "wx", mode });
  await chmod(filename, mode);
}

export async function verifyPublishedCli(options) {
  const version = exactVersion(options.version);
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) {
    throw new Error("Published smoke timeout is invalid");
  }
  const inheritedPath = options.pathValue ?? process.env.PATH ?? "";
  const commands = options.commands ?? {
    npx: await resolveExecutable("npx", inheritedPath),
    bunx: await resolveExecutable("bunx", inheritedPath, { preserveInvocationPath: true })
  };
  for (const [name, executable] of Object.entries(commands)) {
    if (!path.isAbsolute(executable)) throw new Error(`${name} executable must be absolute`);
    await access(executable, constants.X_OK);
  }

  const scratchParent = await realpath(options.scratchParent ?? os.tmpdir());
  const scratch = await realpath(
    await mkdtemp(path.join(scratchParent, "utsuri-published-smoke-"))
  );
  await chmod(scratch, 0o700);
  try {
    const sentinel = path.join(scratch, "path-sentinel");
    await mkdir(sentinel, { mode: 0o700 });
    const sentinelMarker = path.join(scratch, "ambient-cli-used");
    await writePrivate(
      path.join(sentinel, "utsuri"),
      `#!/bin/sh\nprintf '%s\\n' ambient-cli-used > ${JSON.stringify(sentinelMarker)}\nexit 86\n`,
      0o755
    );
    const npmUserConfig = path.join(scratch, "npm-userconfig");
    const npmGlobalConfig = path.join(scratch, "npm-globalconfig");
    await writePrivate(
      npmUserConfig,
      "registry=https://registry.npmjs.org/\nignore-scripts=true\n"
    );
    await writePrivate(npmGlobalConfig, "");
    for (const directory of ["npm-cache", "bun-cache", "bun-install", "xdg-config", "xdg-cache"]) {
      await mkdir(path.join(scratch, directory), { mode: 0o700 });
    }
    const childEnvironment = {
      PATH: `${sentinel}${path.delimiter}${inheritedPath}`,
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      TMPDIR: scratch,
      CI: "1",
      NO_COLOR: "1",
      npm_config_cache: path.join(scratch, "npm-cache"),
      npm_config_userconfig: npmUserConfig,
      npm_config_globalconfig: npmGlobalConfig,
      npm_config_registry: "https://registry.npmjs.org/",
      npm_config_ignore_scripts: "true",
      npm_config_update_notifier: "false",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_yes: "true",
      BUN_INSTALL_CACHE_DIR: path.join(scratch, "bun-cache"),
      BUN_INSTALL: path.join(scratch, "bun-install"),
      XDG_CONFIG_HOME: path.join(scratch, "xdg-config"),
      XDG_CACHE_HOME: path.join(scratch, "xdg-cache")
    };
    const mcpEnvironment = {
      ...childEnvironment,
      CODEX_THREAD_ID: `published-smoke-${randomUUID()}`
    };
    const specifier = `${packageName}@${version}`;
    const versionInvocations = [
      {
        label: "native npx",
        executable: commands.npx,
        args: ["--yes", "--package", specifier, "--", "utsuri", "--version", "--json"]
      },
      {
        label: "native bunx",
        executable: commands.bunx,
        args: ["--silent", "--bun", specifier, "--version", "--json"]
      }
    ];
    const mcpInvocations = [
      {
        label: "native npx MCP",
        executable: commands.npx,
        args: ["--yes", "--package", specifier, "--", "utsuri", "mcp"]
      },
      {
        label: "native bunx MCP",
        executable: commands.bunx,
        args: ["--silent", "--bun", specifier, "mcp"]
      }
    ];
    const results = [];
    for (const invocation of versionInvocations) {
      const output = await runBounded(invocation.executable, invocation.args, {
        cwd: scratch,
        env: childEnvironment,
        label: invocation.label,
        timeoutMs
      });
      results.push(strictVersionResponse(invocation.label, output, version));
    }
    const mcpInput =
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "utsuri-published-smoke", version: "1.0.0" }
        }
      })}\n` + `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`;
    for (const invocation of mcpInvocations) {
      const output = await runBounded(invocation.executable, invocation.args, {
        cwd: scratch,
        env: mcpEnvironment,
        label: invocation.label,
        timeoutMs,
        stdin: mcpInput
      });
      results.push(strictMcpResponse(invocation.label, output, version));
    }
    try {
      await lstat(sentinelMarker);
      throw new Error("Published smoke fell back to an ambient utsuri executable");
    } catch (error) {
      if (error.message.includes("fell back")) throw error;
      if (error.code !== "ENOENT") throw error;
    }
    return { package: packageName, version, protocols: results.length };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  let version = option("--version");
  if (process.argv.includes("--version-from-package")) {
    if (version) throw new Error("Use only one published version source");
    const manifest = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
    version = manifest.version;
  }
  if (!version) {
    throw new Error("Usage: verify-published-cli.mjs --version VERSION | --version-from-package");
  }
  const result = await verifyPublishedCli({ version });
  console.log(
    `Verified ${result.package}@${result.version} through native npx and bunx strict JSON and MCP NDJSON`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
