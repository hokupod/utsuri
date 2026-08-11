import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { runReviewMcpStdio, readMcpRunRegistrations } from "@utsu-ri/review-mcp-server";
import { executeCli } from "./cli";
import {
  brokerMcpToolDefinitions,
  PluginBrokerMcpService,
  resolvePluginProjectContext
} from "./mcp";

const temporaryDirectories: string[] = [];
const session = "synthetic-plugin-session";

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "utsuri-mcp-broker-"));
  temporaryDirectories.push(root);
  return realpath(root);
}

async function finalizeBoundRun(
  root: string,
  name: string,
  environment: NodeJS.ProcessEnv = { CODEX_THREAD_ID: session }
): Promise<string> {
  const run = path.join(root, name);
  await mkdir(run);
  await writeFile(
    path.join(run, "input.json"),
    `${JSON.stringify({ mode: "empty", probe: name })}\n`
  );
  const result = await executeCli(["finalize", "--run", name, "--json"], root, environment);
  expect(result.exitCode, JSON.stringify(result.data)).toBe(0);
  const report = JSON.parse(await readFile(path.join(run, "report", "report.json"), "utf8"));
  return report.reportId;
}

function diagnostic(error: unknown): string | undefined {
  return (error as { diagnosticId?: string }).diagnosticId;
}

async function rpc(service: PluginBrokerMcpService, messages: unknown[]) {
  let output = "";
  await runReviewMcpStdio(service, {
    input: Readable.from(messages.map((message) => `${JSON.stringify(message)}\n`)),
    output: {
      write(chunk: string | Uint8Array) {
        output += chunk.toString();
        return true;
      }
    } as NodeJS.WritableStream
  });
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("Plugin MCP project context", () => {
  test("uses verified Codex cwd and Claude project/session contracts", async () => {
    const root = await project();
    await expect(resolvePluginProjectContext(root, { CODEX_THREAD_ID: session })).resolves.toEqual({
      host: "codex",
      projectRoot: root
    });
    await expect(
      resolvePluginProjectContext(root, {
        CODEX_THREAD_ID: "",
        CLAUDE_PROJECT_DIR: root,
        CLAUDE_CODE_SESSION_ID: session
      })
    ).resolves.toEqual({ host: "claude-code", projectRoot: root });
  });

  test("rejects missing, partial, ambiguous, and symlinked host contexts", async () => {
    const root = await project();
    const linked = `${root}-link`;
    temporaryDirectories.push(linked);
    await symlink(root, linked);
    for (const environment of [
      {},
      { UTSURI_CODEX_SESSION_ID: session },
      { CLAUDE_SESSION_ID: session, CLAUDE_PROJECT_DIR: root },
      { CLAUDE_PROJECT_DIR: root },
      { CLAUDE_CODE_SESSION_ID: session },
      {
        CODEX_THREAD_ID: session,
        CLAUDE_PROJECT_DIR: root,
        CLAUDE_CODE_SESSION_ID: session
      }
    ]) {
      await expect(resolvePluginProjectContext(root, environment)).rejects.toBeInstanceOf(Error);
    }
    await expect(
      resolvePluginProjectContext(root, {
        CLAUDE_PROJECT_DIR: linked,
        CLAUDE_CODE_SESSION_ID: session
      })
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("Plugin MCP broker", () => {
  test("lists tools without registrations and returns a structured unavailable error", async () => {
    const root = await project();
    const responses = await rpc(new PluginBrokerMcpService(root, { CODEX_THREAD_ID: session }), [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "ping" },
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "review_list_batches", arguments: {} }
      }
    ]);
    expect(responses).toHaveLength(4);
    expect(responses[2].result.tools).toHaveLength(6);
    expect(responses[3].result).toMatchObject({
      isError: true,
      structuredContent: { error: { id: "MCP_RUN_UNAVAILABLE" } }
    });
  });

  test("selects one registered same-session report without a path argument", async () => {
    const root = await project();
    const reportId = await finalizeBoundRun(root, "one");
    const service = new PluginBrokerMcpService(root, {
      CODEX_THREAD_ID: session,
      UTSURI_CODEX_SESSION_ID: "ignored-fixed-run-alias",
      UTSURI_PROBE_DENIED_SENTINEL: "synthetic-ambient-value"
    });
    const result = await service.callTool("review_list_batches", {});
    expect(result).toMatchObject({ reportId, batches: [] });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain(session);
    expect(JSON.stringify(result)).not.toContain("synthetic-ambient-value");
    await expect(service.callTool("review_list_batches", { path: "one" })).rejects.toMatchObject({
      diagnosticId: "MCP_ARGUMENTS_INVALID"
    });
  });

  test("finalizes and selects a bound run whose contained POSIX path has spaces and Japanese", async () => {
    const root = await project();
    const name = "レビュー run";
    const reportId = await finalizeBoundRun(root, name);
    const registrations = await readMcpRunRegistrations(root);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.runPath).toBe(name);
    const result = await new PluginBrokerMcpService(root, {
      CODEX_THREAD_ID: session
    }).callTool("review_list_batches", {});
    expect(result).toMatchObject({ reportId, batches: [] });
  });

  test("requires an exact opaque report_id when multiple reports are registered", async () => {
    const root = await project();
    const first = await finalizeBoundRun(root, "first");
    const second = await finalizeBoundRun(root, "second");
    expect(first).not.toBe(second);
    const service = new PluginBrokerMcpService(root, { CODEX_THREAD_ID: session });
    const ambiguous = await service.callTool("review_list_batches", {}).catch((error) => error);
    expect(diagnostic(ambiguous)).toBe("MCP_RUN_AMBIGUOUS");
    expect((ambiguous as Error).message).toContain(first);
    expect((ambiguous as Error).message).toContain(second);
    const selected = await service.callTool("review_list_batches", { report_id: second });
    expect(selected).toMatchObject({ reportId: second });
    await expect(
      service.callTool("review_list_batches", { report_id: "report-unknown" })
    ).rejects.toMatchObject({ diagnosticId: "MCP_RUN_UNKNOWN" });
  });

  test("hides old-session registrations and does not expose their identifiers", async () => {
    const root = await project();
    const foreignReport = await finalizeBoundRun(root, "bound");
    const registrations = await readMcpRunRegistrations(root);
    expect(registrations).toHaveLength(1);
    const service = new PluginBrokerMcpService(root, { CODEX_THREAD_ID: "different-session" });
    await expect(service.callTool("review_list_batches", {})).rejects.toMatchObject({
      diagnosticId: "MCP_RUN_UNAVAILABLE"
    });
    const responses = await rpc(service, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "review_list_batches", arguments: {} }
      }
    ]);
    expect(responses[0].result.structuredContent.error.id).toBe("MCP_RUN_UNAVAILABLE");
    expect(JSON.stringify(responses)).not.toContain(foreignReport);
    expect(JSON.stringify(responses)).not.toContain(session);
  });

  test("selects a current registration while an old-session registration stays invisible", async () => {
    const root = await project();
    const oldReport = await finalizeBoundRun(root, "old", {
      CODEX_THREAD_ID: "old-plugin-session"
    });
    const currentReport = await finalizeBoundRun(root, "current");
    const service = new PluginBrokerMcpService(root, { CODEX_THREAD_ID: session });
    const result = await service.callTool("review_list_batches", {});
    expect(result).toMatchObject({ reportId: currentReport });
    expect(JSON.stringify(result)).not.toContain(oldReport);
    expect(JSON.stringify(result)).not.toContain("old-plugin-session");
  });

  test("hides valid cross-host and cross-project registrations", async () => {
    const claudeRoot = await project();
    await finalizeBoundRun(claudeRoot, "claude", {
      CODEX_THREAD_ID: "",
      CLAUDE_CODE_SESSION_ID: session,
      CLAUDE_PROJECT_DIR: claudeRoot
    });
    await expect(
      new PluginBrokerMcpService(claudeRoot, { CODEX_THREAD_ID: session }).callTool(
        "review_list_batches",
        {}
      )
    ).rejects.toMatchObject({ diagnosticId: "MCP_RUN_UNAVAILABLE" });

    const source = await project();
    await finalizeBoundRun(source, "foreign");
    const destination = await project();
    await cp(path.join(source, "foreign"), path.join(destination, "foreign"), {
      recursive: true
    });
    await cp(path.join(source, ".artifacts"), path.join(destination, ".artifacts"), {
      recursive: true
    });
    await expect(
      new PluginBrokerMcpService(destination, { CODEX_THREAD_ID: session }).callTool(
        "review_list_batches",
        {}
      )
    ).rejects.toMatchObject({ diagnosticId: "MCP_RUN_UNAVAILABLE" });
  });

  test("sanitizes injected filesystem failures in structured MCP output", async () => {
    const root = await project();
    const raw = `${root}/registration.json ${session} ambient-secret`;
    const service = new PluginBrokerMcpService(
      root,
      { CODEX_THREAD_ID: session },
      {
        readRegistrations: async () => {
          const error = new Error(raw) as NodeJS.ErrnoException;
          error.code = "ENOENT";
          error.path = raw;
          throw error;
        }
      }
    );
    const responses = await rpc(service, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "review_list_batches", arguments: {} }
      }
    ]);
    expect(responses[0].result.structuredContent.error.id).toBe("MCP_BROKER_FILESYSTEM");
    expect(JSON.stringify(responses)).not.toContain(root);
    expect(JSON.stringify(responses)).not.toContain(session);
    expect(JSON.stringify(responses)).not.toContain("ambient-secret");
  });

  test("exposes only report_id in addition to existing fixed-run tool inputs", () => {
    const forbidden = new Set([
      "path",
      "cwd",
      "command",
      "provider",
      "model",
      "destination",
      "session_id"
    ]);
    for (const definition of brokerMcpToolDefinitions) {
      const properties = Object.keys(definition.inputSchema.properties);
      expect(properties).toContain("report_id");
      expect(properties.some((name) => forbidden.has(name))).toBeFalse();
      expect(definition.inputSchema.additionalProperties).toBeFalse();
    }
  });
});
