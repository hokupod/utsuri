import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OriginSessionBinding, ReviewAnswer, UtsuriReport } from "@utsu-ri/report-model";
import {
  createHumanComment,
  createReviewStore,
  loadReviewStore,
  persistReviewStore,
  setAgentAttention
} from "@utsu-ri/review-state";
import {
  claimFeedbackBatch,
  getFeedbackItemContext,
  listFeedbackBatches,
  postFeedbackAnswers,
  previewFeedbackBatch,
  readReviewInbox,
  storeFeedbackBatch
} from "./index";
import { createBrowserFeedbackPreview } from "./browser";

const root = path.resolve(import.meta.dir, "../../..");
const origin: OriginSessionBinding = {
  host: "codex",
  sessionRef: `session:${"1".repeat(64)}`,
  projectFingerprint: "2".repeat(64),
  reportId: "",
  bindingMode: "return-to-session",
  createdAt: "2026-08-08T00:00:00.000Z"
};

async function fixture(): Promise<{
  report: UtsuriReport;
  store: Awaited<ReturnType<typeof createReviewStore>>;
}> {
  const report = JSON.parse(
    await readFile(path.join(root, "fixtures/code-only-review/expected/report/report.json"), "utf8")
  ) as UtsuriReport;
  let store = await createReviewStore(report, "2026-08-08T00:00:00.000Z");
  for (const [index, anchor] of store.anchorCatalog
    .filter((entry) => entry.type === "hunk")
    .slice(0, 3)
    .entries()) {
    store = await createHumanComment(
      store,
      anchor,
      index === 0 ? "Keep @codex as ordinary text." : `Question ${index + 1}`,
      "question",
      `2026-08-08T00:00:0${index + 1}.000Z`
    );
    store = await setAgentAttention(
      store,
      store.threads.at(-1)!.id,
      true,
      `2026-08-08T00:00:1${index + 1}.000Z`
    );
  }
  return { report, store };
}

describe("Review Inbox", () => {
  test("keeps static export bound to the report origin without enabling delivery", async () => {
    const { report, store } = await fixture();
    const preview = await createBrowserFeedbackPreview(store, "2026-08-08T00:01:00.000Z");
    expect(preview.batch.origin).toEqual(report.origin);
    expect(preview.batch.deliveryMode).toBe("export-only");
    expect(preview.contexts).toHaveLength(3);
  });

  test("redacts bare provider tokens from Node and static Feedback Batches", async () => {
    const { report, store } = await fixture();
    const awsToken = `AKIA${"ABCDEFGHIJKLMNOP"}`;
    const githubToken = `ghp_${"1234567890abcdefghijklmn"}`;
    const openAiToken = `sk-${"1234567890abcdefghijkl"}`;
    const secretQuestion = `Check ${awsToken} ${githubToken} and ${openAiToken}`;
    store.threads[0]!.messages.at(-1)!.body = secretQuestion;
    const binding = { ...origin, reportId: report.reportId };
    const nodePreview = await previewFeedbackBatch(store, binding, {
      createdAt: "2026-08-08T00:01:00.000Z"
    });
    const browserPreview = await createBrowserFeedbackPreview(store, "2026-08-08T00:01:00.000Z");
    for (const preview of [nodePreview, browserPreview]) {
      expect(preview.batch.items[0]!.question).not.toContain(awsToken);
      expect(preview.batch.items[0]!.question).not.toContain(githubToken);
      expect(preview.batch.items[0]!.question).not.toContain(openAiToken);
      expect(preview.contexts[0]!.question).toBe(preview.batch.items[0]!.question);
      expect(preview.redactionCount).toBeGreaterThanOrEqual(3);
    }
  });

  test("keeps checkbox selection separate from Context Pack creation", async () => {
    const { report, store } = await fixture();
    expect(store.sidecarFiles).toEqual({});
    const preview = await previewFeedbackBatch(
      store,
      { ...origin, reportId: report.reportId },
      {
        createdAt: "2026-08-08T00:01:00.000Z"
      }
    );
    expect(store.sidecarFiles).toEqual({});
    expect(preview.batch.items[0]?.question).toContain("@codex");
    expect(preview.excluded).toContain("files outside the report");
    expect(preview.destination.deliveryMode).toBe("return-to-session");
  });

  test("excludes stale feedback instead of submitting it as current", async () => {
    const { report, store } = await fixture();
    const stale = structuredClone(store);
    stale.threads[0] = {
      ...stale.threads[0]!,
      state: "stale",
      updatedAt: "2026-08-08T00:00:30.000Z"
    };
    const preview = await previewFeedbackBatch(
      stale,
      { ...origin, reportId: report.reportId },
      {
        createdAt: "2026-08-08T00:01:00.000Z"
      }
    );
    expect(preview.batch.items).toHaveLength(2);
    expect(preview.batch.items.some((item) => item.threadId === stale.threads[0]!.id)).toBe(false);
    expect(preview.excluded).toContain("stale, orphaned, or resolved comments");
  });

  test("stores idempotently, rejects another session, and writes one answer per item", async () => {
    const { report, store } = await fixture();
    const binding = { ...origin, reportId: report.reportId };
    const stored = await storeFeedbackBatch(store, binding, {
      idempotencyKey: "submit-1",
      createdAt: "2026-08-08T00:01:00.000Z"
    });
    expect(stored.created).toBe(true);
    expect(readReviewInbox(stored.store).entries).toHaveLength(1);
    const duplicate = await storeFeedbackBatch(stored.store, binding, {
      idempotencyKey: "submit-1",
      createdAt: "2026-08-08T00:02:00.000Z"
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.store.state.revision).toBe(stored.store.state.revision);

    const batchId = stored.preview.batch.id;
    await expect(
      claimFeedbackBatch(
        stored.store,
        batchId,
        {
          host: "codex",
          sessionRef: `session:${"9".repeat(64)}`,
          projectFingerprint: binding.projectFingerprint,
          reportId: report.reportId
        },
        "2026-08-08T00:03:00.000Z"
      )
    ).rejects.toMatchObject({ diagnosticId: "ORIGIN_SESSION_MISMATCH" });

    const current = {
      host: "codex" as const,
      sessionRef: binding.sessionRef,
      projectFingerprint: binding.projectFingerprint,
      reportId: report.reportId
    };
    const claimed = await claimFeedbackBatch(
      stored.store,
      batchId,
      current,
      "2026-08-08T00:03:00.000Z"
    );
    const judgmentsBefore = structuredClone(claimed.store.state.judgments);
    const answers: ReviewAnswer[] = claimed.batch.items.map((item, index) => ({
      schemaVersion: "1.0",
      batchId,
      itemId: item.id,
      directAnswer: `Answer ${index + 1}`,
      evidence: [{ ref: item.anchor.ref, explanation: "Bound report evidence" }],
      uncertainty: [],
      suggestedNextActions: [{ type: "none", label: "No automatic change" }],
      metadata: {
        host: "codex",
        originSessionRef: binding.sessionRef,
        contextHash: getFeedbackItemContext(claimed.store, item.id).contextHash
      }
    }));
    const answered = await postFeedbackAnswers(
      claimed.store,
      batchId,
      answers,
      current,
      "2026-08-08T00:04:00.000Z"
    );
    expect(listFeedbackBatches(answered, "answered")).toHaveLength(1);
    expect(answered.state.judgments).toEqual(judgmentsBefore);
    expect(answered.threads.every((thread) => thread.state === "answered")).toBe(true);
    expect(answered.threads.map((thread) => thread.messages.at(-1)?.body)).toEqual([
      "Answer 1",
      "Answer 2",
      "Answer 3"
    ]);
  });

  test("rejects tampered Inbox and Context Pack sidecars", async () => {
    const { report, store } = await fixture();
    const binding = { ...origin, reportId: report.reportId };
    const stored = await storeFeedbackBatch(store, binding, {
      idempotencyKey: "tamper-1",
      createdAt: "2026-08-08T00:01:00.000Z"
    });

    const tamperedInboxStore = structuredClone(stored.store);
    const inbox = JSON.parse(tamperedInboxStore.sidecarFiles["review-inbox.json"]!) as {
      entries: Array<{ createdAt: string }>;
    };
    inbox.entries[0]!.createdAt = "2026-08-08T00:01:01.000Z";
    tamperedInboxStore.sidecarFiles["review-inbox.json"] = JSON.stringify(inbox);
    expect(() => listFeedbackBatches(tamperedInboxStore)).toThrow(
      expect.objectContaining({ diagnosticId: "FEEDBACK_BATCH_INDEX_MISMATCH" })
    );

    const tamperedContextStore = structuredClone(stored.store);
    const itemId = stored.preview.batch.items[0]!.id;
    const contextKey = Object.entries(tamperedContextStore.sidecarFiles).find(
      ([key, content]) =>
        key.startsWith("contexts/") &&
        (JSON.parse(content) as { itemId?: string }).itemId === itemId
    )![0];
    const context = JSON.parse(tamperedContextStore.sidecarFiles[contextKey]!) as {
      question: string;
    };
    context.question = "Tampered question";
    tamperedContextStore.sidecarFiles[contextKey] = JSON.stringify(context);
    expect(() => getFeedbackItemContext(tamperedContextStore, itemId)).toThrow(
      expect.objectContaining({ diagnosticId: "FEEDBACK_CONTEXT_IDENTITY" })
    );
  });

  test("persists Inbox sidecars in the same committed generation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "utsuri-review-inbox-"));
    try {
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
        "Atomic question",
        "question",
        "2026-08-08T00:00:01.000Z"
      );
      await persistReviewStore(directory, store, 0);
      store = await loadReviewStore(directory, report, "2026-08-08T00:00:02.000Z");
      store = await setAgentAttention(
        store,
        store.threads[0]!.id,
        true,
        "2026-08-08T00:00:03.000Z"
      );
      await persistReviewStore(directory, store, 1);
      store = await loadReviewStore(directory, report, "2026-08-08T00:00:04.000Z");
      const binding = { ...origin, reportId: report.reportId };
      const stored = await storeFeedbackBatch(store, binding, {
        idempotencyKey: "atomic-1",
        createdAt: "2026-08-08T00:01:00.000Z"
      });
      await persistReviewStore(directory, stored.store, 2);
      const loaded = await loadReviewStore(directory, report, "2026-08-08T00:02:00.000Z");
      expect(readReviewInbox(loaded).entries).toHaveLength(1);
      expect(listFeedbackBatches(loaded)).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
