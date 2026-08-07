import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeedbackBatch, UtsuriReport } from "@utsu-ri/report-model";
import { createHumanComment, createReviewStore } from "@utsu-ri/review-state";
import { buildContextPack } from "./index";

const root = path.resolve(import.meta.dir, "../../..");

describe("Context Pack", () => {
  test("collects bounded report references and redacts secrets", async () => {
    const report = JSON.parse(
      await readFile(
        path.join(root, "fixtures/code-only-review/expected/report/report.json"),
        "utf8"
      )
    ) as UtsuriReport;
    let store = await createReviewStore(report, "2026-08-08T00:00:00.000Z");
    const anchor = store.anchorCatalog.find((entry) => entry.type === "hunk")!;
    store = await createHumanComment(
      store,
      anchor,
      "Check token=super-secret-value and keep @codex literal.",
      "question",
      "2026-08-08T00:00:01.000Z"
    );
    const thread = store.threads[0]!;
    const item: FeedbackBatch["items"][number] = {
      id: "item:12345678",
      threadId: thread.id,
      anchor,
      sourceMessageId: thread.messages[0]!.id,
      requestKind: "freeform",
      question: thread.messages[0]!.body,
      contextSelection: {
        includeCodeDiff: true,
        includeVisualCrop: false,
        includeComputedStyle: false,
        includeDomAria: false,
        includeRelatedTests: false
      },
      state: "ready"
    };
    const result = await buildContextPack({ report, thread, item, batchId: "fb:12345678" });
    expect(result.pack.question).toContain("[REDACTED]");
    expect(result.pack.question).toContain("@codex");
    expect(result.pack.code.length).toBeGreaterThan(0);
    expect(result.excluded).toContain("files outside the report");
    expect(result.pack.contextHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
