import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyPublishedCli } from "../../scripts/verify-published-cli.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "utsuri-published-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function fakeManager(directory: string, name: string, body: string): Promise<string> {
  const filename = path.join(directory, name);
  await writeFile(filename, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  await chmod(filename, 0o755);
  return filename;
}

function response(version = "0.1.0"): string {
  return JSON.stringify({
    ok: true,
    command: "version",
    package: "@utsu-ri/cli",
    version,
    protocolVersion: "1.0"
  });
}

describe("published CLI verification boundary", () => {
  test("uses exact native npx/bunx specs, isolated state, and a PATH sentinel", async () => {
    const directory = await temporaryDirectory();
    const log = path.join(directory, "calls.ndjson");
    const body = `
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  args: process.argv.slice(2),
  path: process.env.PATH,
  npmCache: process.env.npm_config_cache,
  bunCache: process.env.BUN_INSTALL_CACHE_DIR,
  hasHome: Object.hasOwn(process.env, "HOME"),
  hasToken: Object.hasOwn(process.env, "NODE_AUTH_TOKEN") || Object.hasOwn(process.env, "NPM_TOKEN")
}) + "\\n");
process.stdout.write(${JSON.stringify(`${response()}\n`)});`;
    const npx = await fakeManager(directory, "npx-fake", body);
    const bunx = await fakeManager(directory, "bunx-fake", body);

    await expect(
      verifyPublishedCli({
        version: "0.1.0",
        commands: { npx, bunx },
        pathValue: process.env.PATH,
        timeoutMs: 5_000
      })
    ).resolves.toEqual({ package: "@utsu-ri/cli", version: "0.1.0", protocols: 2 });

    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toEqual([
      "--yes",
      "--package",
      "@utsu-ri/cli@0.1.0",
      "--",
      "utsuri",
      "--version",
      "--json"
    ]);
    expect(calls[1]?.args).toEqual(["--bun", "@utsu-ri/cli@0.1.0", "--version", "--json"]);
    for (const call of calls) {
      expect(String(call.path).split(path.delimiter)[0]).toEndWith("path-sentinel");
      expect(String(call.npmCache)).toContain("utsuri-published-smoke-");
      expect(String(call.bunCache)).toContain("utsuri-published-smoke-");
      expect(call.hasHome).toBeFalse();
      expect(call.hasToken).toBeFalse();
      expect(JSON.stringify(call)).not.toContain("@latest");
    }
  });

  test("rejects package-manager notices instead of filtering stdout or stderr", async () => {
    const directory = await temporaryDirectory();
    const noisy = await fakeManager(
      directory,
      "noisy",
      `process.stderr.write("package manager notice\\n"); process.stdout.write(${JSON.stringify(`${response()}\n`)});`
    );
    const valid = await fakeManager(
      directory,
      "valid",
      `process.stdout.write(${JSON.stringify(`${response()}\n`)});`
    );
    await expect(
      verifyPublishedCli({
        version: "0.1.0",
        commands: { npx: noisy, bunx: valid },
        pathValue: process.env.PATH,
        timeoutMs: 5_000
      })
    ).rejects.toThrow("wrote to stderr");
  });

  test("times out and terminates the complete package-manager process group", async () => {
    if (process.platform === "win32") return;
    const directory = await temporaryDirectory();
    const childPidFile = path.join(directory, "child.pid");
    const hanging = await fakeManager(
      directory,
      "hanging",
      `
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(childPidFile)}, String(child.pid));
setInterval(() => {}, 1000);`
    );
    await expect(
      verifyPublishedCli({
        version: "0.1.0",
        commands: { npx: hanging, bunx: hanging },
        pathValue: process.env.PATH,
        timeoutMs: 1_000
      })
    ).rejects.toThrow("timed out");

    const childPid = Number(await readFile(childPidFile, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => process.kill(childPid, 0)).toThrow();
  });

  test("rejects tags and version ranges before invoking a package manager", async () => {
    await expect(verifyPublishedCli({ version: "latest" })).rejects.toThrow("exact SemVer");
    await expect(verifyPublishedCli({ version: "^0.1.0" })).rejects.toThrow("exact SemVer");
  });
});
