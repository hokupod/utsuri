import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import type { UtsuriReport } from "@utsu-ri/report-model";
import { ReviewMcpService, reviewMcpToolDefinitions, runReviewMcpStdio } from "./index";

const root = path.resolve(import.meta.dir, "../../..");

describe("Review Inbox MCP", () => {
  test("exposes only fixed-run review tools without arbitrary path or session arguments", () => {
    expect(reviewMcpToolDefinitions.map((tool) => tool.name)).toEqual([
      "review_list_batches",
      "review_get_batch",
      "review_claim_batch",
      "review_get_item_context",
      "review_post_answers",
      "review_release_batch"
    ]);
    const serialized = JSON.stringify(reviewMcpToolDefinitions);
    expect(serialized).not.toMatch(/command|cwd|provider|model|session_id|path/iu);
  });

  test("speaks strict JSON-RPC over stdio and rejects unknown tool fields", async () => {
    const report = JSON.parse(
      await readFile(
        path.join(root, "fixtures/code-only-review/expected/report/report.json"),
        "utf8"
      )
    ) as UtsuriReport;
    const service = new ReviewMcpService({
      runDirectory: root,
      report,
      currentSession: {
        host: "codex",
        sessionRef: `session:${"1".repeat(64)}`,
        projectFingerprint: "2".repeat(64),
        reportId: report.reportId
      }
    });
    const input = Readable.from([
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
      `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "review_list_batches", arguments: { path: "../other-run" } }
      })}\n`,
      `${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping", cwd: "/tmp" })}\n`,
      `${JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "review_list_batches" } })}\n`
    ]);
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    await runReviewMcpStdio(service, { input, output: destination });
    const responses = output
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            id: number | null;
            result?: unknown;
            error?: { code: number };
          }
      );
    expect(responses.map((response) => response.id)).toEqual([1, 2, 3, null]);
    expect(responses[0]?.result).toBeDefined();
    expect(responses[1]?.result).toBeDefined();
    expect(responses[2]?.error?.code).toBe(-32602);
    expect(responses[3]?.error?.code).toBe(-32600);
  });

  test("bounds each NDJSON request before parsing and resumes at the next line", async () => {
    const report = JSON.parse(
      await readFile(
        path.join(root, "fixtures/code-only-review/expected/report/report.json"),
        "utf8"
      )
    ) as UtsuriReport;
    const service = new ReviewMcpService({
      runDirectory: root,
      report,
      currentSession: {
        host: "unknown",
        projectFingerprint: "2".repeat(64),
        reportId: report.reportId
      }
    });
    const input = Readable.from([
      Buffer.alloc(2 * 1024 * 1024 + 1, 0x78),
      "\n",
      `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`
    ]);
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });

    await runReviewMcpStdio(service, { input, output: destination });
    const responses = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: number | null; result?: unknown; error?: unknown });

    expect(responses).toHaveLength(2);
    expect(responses[0]?.id).toBeNull();
    expect(responses[0]?.error).toBeDefined();
    expect(responses[1]).toMatchObject({ id: 2, result: {} });
  });
});
