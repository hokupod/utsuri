import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
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
    protocolVersion: "1.1"
  });
}

function mcpResponse(version = "0.1.0"): string {
  const reportId = {
    type: "string",
    pattern: "^report[-:][A-Za-z0-9._:-]+$",
    maxLength: 256
  };
  const tools = [
    {
      name: "review_list_batches",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          report_id: reportId,
          state: { enum: ["draft", "ready", "submitted", "consumed", "answered", "stale"] }
        }
      }
    },
    {
      name: "review_get_batch",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          batch_id: { type: "string", pattern: "^fb[-:]" },
          report_id: reportId
        }
      }
    },
    {
      name: "review_claim_batch",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          batch_id: { type: "string", pattern: "^fb[-:]" },
          report_id: reportId
        }
      }
    },
    {
      name: "review_get_item_context",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["item_id"],
        properties: {
          item_id: { type: "string", pattern: "^item[-:]" },
          report_id: reportId
        }
      }
    },
    {
      name: "review_post_answers",
      inputSchema: {
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
          report_id: reportId
        }
      }
    },
    {
      name: "review_release_batch",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["batch_id"],
        properties: {
          batch_id: { type: "string", pattern: "^fb[-:]" },
          report_id: reportId
        }
      }
    }
  ].map((tool) => ({ ...tool, description: tool.name }));
  return [
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "utsu-ri-plugin-broker", version }
      }
    }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools } })
  ].join("\n");
}

function mutateMcpResponse(
  mutate: (tools: Array<Record<string, unknown>>) => void,
  version = "0.1.0"
): string {
  const lines = mcpResponse(version).split("\n");
  const listed = JSON.parse(lines[1]!) as {
    result: { tools: Array<Record<string, unknown>> };
  };
  mutate(listed.result.tools);
  return `${lines[0]}\n${JSON.stringify(listed)}`;
}

function managerBody(log?: string): string {
  const append = log
    ? `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  args,
  cwd: process.cwd(),
  cwdCanonical: fs.realpathSync(process.cwd()) === process.cwd(),
  path: process.env.PATH,
  npmCache: process.env.npm_config_cache,
  bunCache: process.env.BUN_INSTALL_CACHE_DIR,
  hasHome: Object.hasOwn(process.env, "HOME"),
  hasToken: Object.hasOwn(process.env, "NODE_AUTH_TOKEN") || Object.hasOwn(process.env, "NPM_TOKEN"),
  hasSyntheticCodexThread: typeof process.env.CODEX_THREAD_ID === "string" && process.env.CODEX_THREAD_ID.startsWith("published-smoke-"),
  inputLines: input.trim() ? input.trim().split("\\n").length : 0
}) + "\\n");`
    : "";
  return `
const fs = require("node:fs");
const args = process.argv.slice(2);
const isMcp = args.at(-1) === "mcp";
let input = "";
const finish = () => {
  ${append}
  process.stdout.write(isMcp ? ${JSON.stringify(`${mcpResponse()}\n`)} : ${JSON.stringify(`${response()}\n`)});
};
if (isMcp) {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", finish);
} else finish();`;
}

describe("published CLI verification boundary", () => {
  test("uses exact native runners, strict JSON/NDJSON, isolated state, and a PATH sentinel", async () => {
    const directory = await temporaryDirectory();
    const log = path.join(directory, "calls.ndjson");
    const npx = await fakeManager(directory, "npx-fake", managerBody(log));
    const bunx = await fakeManager(directory, "bunx-fake", managerBody(log));

    await expect(
      verifyPublishedCli({
        version: "0.1.0",
        commands: { npx, bunx },
        pathValue: process.env.PATH,
        timeoutMs: 5_000
      })
    ).resolves.toEqual({ package: "@utsu-ri/cli", version: "0.1.0", protocols: 4 });

    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.args).toEqual([
      "--yes",
      "--package",
      "@utsu-ri/cli@0.1.0",
      "--",
      "utsuri",
      "--version",
      "--json"
    ]);
    expect(calls[1]?.args).toEqual([
      "--silent",
      "--bun",
      "@utsu-ri/cli@0.1.0",
      "--version",
      "--json"
    ]);
    expect(calls[2]?.args).toEqual([
      "--yes",
      "--package",
      "@utsu-ri/cli@0.1.0",
      "--",
      "utsuri",
      "mcp"
    ]);
    expect(calls[3]?.args).toEqual(["--silent", "--bun", "@utsu-ri/cli@0.1.0", "mcp"]);
    for (const call of calls) {
      expect(String(call.path).split(path.delimiter)[0]).toEndWith("path-sentinel");
      expect(String(call.npmCache)).toContain("utsuri-published-smoke-");
      expect(String(call.bunCache)).toContain("utsuri-published-smoke-");
      expect(call.hasHome).toBeFalse();
      expect(call.hasToken).toBeFalse();
      expect(JSON.stringify(call)).not.toContain("@latest");
    }
    expect(calls[0]?.hasSyntheticCodexThread).toBeFalse();
    expect(calls[1]?.hasSyntheticCodexThread).toBeFalse();
    expect(calls[2]?.hasSyntheticCodexThread).toBeTrue();
    expect(calls[3]?.hasSyntheticCodexThread).toBeTrue();
    expect(calls[2]?.inputLines).toBe(2);
    expect(calls[3]?.inputLines).toBe(2);
  });

  test("preserves the bunx invocation path when it resolves to a shared runtime", async () => {
    if (process.platform === "win32") return;
    const directory = await temporaryDirectory();
    await fakeManager(directory, "npx", managerBody());
    const runtime = await fakeManager(
      directory,
      "bun-runtime",
      `
const path = require("node:path");
if (path.basename(process.argv[1]) !== "bunx") process.exit(87);
${managerBody()}`
    );
    await symlink(runtime, path.join(directory, "bunx"));

    await expect(
      verifyPublishedCli({
        version: "0.1.0",
        pathValue: `${directory}${path.delimiter}${process.env.PATH ?? ""}`,
        timeoutMs: 5_000
      })
    ).resolves.toEqual({ package: "@utsu-ri/cli", version: "0.1.0", protocols: 4 });
  });

  test("canonicalizes a symlinked scratch parent before invoking the Plugin MCP", async () => {
    const directory = await temporaryDirectory();
    const actual = path.join(directory, "scratch-actual");
    const alias = path.join(directory, "scratch-alias");
    await mkdir(actual);
    await symlink(actual, alias);
    const log = path.join(directory, "canonical-calls.ndjson");
    const npx = await fakeManager(directory, "canonical-npx", managerBody(log));
    const bunx = await fakeManager(directory, "canonical-bunx", managerBody(log));

    await verifyPublishedCli({
      version: "0.1.0",
      commands: { npx, bunx },
      pathValue: process.env.PATH,
      scratchParent: alias,
      timeoutMs: 5_000
    });

    const canonicalParent = await realpath(actual);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { cwd: string; cwdCanonical: boolean });
    for (const call of calls) {
      expect(call.cwd).toStartWith(`${canonicalParent}${path.sep}`);
      expect(call.cwdCanonical).toBeTrue();
    }
  });

  test("rejects package-manager notices instead of filtering stdout or stderr", async () => {
    const directory = await temporaryDirectory();
    const noisy = await fakeManager(
      directory,
      "noisy",
      `process.stderr.write("package manager notice\\n"); process.stdout.write(${JSON.stringify(`${response()}\n`)});`
    );
    const valid = await fakeManager(directory, "valid", managerBody());
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

  test("rejects permissive and unexpected MCP schema fields", async () => {
    const directory = await temporaryDirectory();
    const invalidResponses = [
      mutateMcpResponse((tools) => {
        const schema = tools[0]!.inputSchema as Record<string, unknown>;
        schema.additionalProperties = true;
      }),
      mutateMcpResponse((tools) => {
        const schema = tools[0]!.inputSchema as {
          properties: Record<string, unknown>;
        };
        schema.properties.path = { type: "string" };
      })
    ];
    for (const [index, invalidMcp] of invalidResponses.entries()) {
      const unsafe = await fakeManager(
        directory,
        `unsafe-${index}`,
        `
const isMcp = process.argv.at(-1) === "mcp";
if (!isMcp) process.stdout.write(${JSON.stringify(`${response()}\n`)});
else {
  process.stdin.resume();
  process.stdin.on("end", () => process.stdout.write(${JSON.stringify(`${invalidMcp}\n`)}));
}`
      );
      await expect(
        verifyPublishedCli({
          version: "0.1.0",
          commands: { npx: unsafe, bunx: unsafe },
          pathValue: process.env.PATH,
          timeoutMs: 5_000
        })
      ).rejects.toThrow("non-canonical MCP tool schema");
    }
  });

  test("rejects tags and version ranges before invoking a package manager", async () => {
    await expect(verifyPublishedCli({ version: "latest" })).rejects.toThrow("exact SemVer");
    await expect(verifyPublishedCli({ version: "^0.1.0" })).rejects.toThrow("exact SemVer");
  });
});
