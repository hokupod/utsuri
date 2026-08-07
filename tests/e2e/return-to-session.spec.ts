import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContextPack, ReviewAnswer } from "../../packages/report-model/src";
import { storeFeedbackBatch } from "../../packages/review-inbox/src";
import {
  createHumanComment,
  loadReviewStore,
  persistReviewStore,
  setAgentAttention
} from "../../packages/review-state/src";
import {
  feedbackAnswer,
  feedbackGet,
  feedbackList,
  prepareFeedbackRuntime
} from "../../packages/cli/src/feedback";
import { createPhase6RunFixture } from "./phase6-review-fixture";

for (const [host, environment] of [
  ["codex", { UTSURI_CODEX_SESSION_ID: "codex-origin-session" }],
  ["claude-code", { CLAUDE_SESSION_ID: "claude-origin-session" }]
] as const) {
  test(`returns three itemized answers to the originating ${host} conversation`, async () => {
    const fixture = await createPhase6RunFixture(environment);
    try {
      const runtime = await prepareFeedbackRuntime(fixture.root, "run", environment);
      let store = await loadReviewStore(fixture.run, fixture.report, "2026-08-08T00:00:00.000Z");
      const anchors = store.anchorCatalog
        .filter((anchor) => anchor.type === "hunk" || anchor.type === "line-range")
        .slice(0, 3);
      expect(anchors).toHaveLength(3);
      for (const [index, anchor] of anchors.entries()) {
        let expectedRevision = store.state.revision;
        store = await createHumanComment(
          store,
          anchor,
          ["Explain the Button change.", "Confirm focus restoration.", "Verify the aria-label."][
            index
          ]!,
          "question",
          `2026-08-08T00:00:0${index + 1}.000Z`
        );
        await persistReviewStore(fixture.run, store, expectedRevision);
        expectedRevision = store.state.revision;
        store = await setAgentAttention(
          store,
          store.threads.at(-1)!.id,
          true,
          `2026-08-08T00:00:1${index + 1}.000Z`
        );
        await persistReviewStore(fixture.run, store, expectedRevision);
      }
      const stored = await storeFeedbackBatch(store, runtime.binding, {
        idempotencyKey: `${host}-three-item-batch`,
        createdAt: "2026-08-08T00:01:00.000Z"
      });
      await persistReviewStore(fixture.run, stored.store, store.state.revision);

      const listed = await feedbackList(runtime, "ready");
      expect(listed.data.batches as unknown[]).toHaveLength(1);
      const claimed = await feedbackGet(runtime);
      const data = claimed.data as {
        batch: { id: string; items: Array<{ id: string; anchor: { ref: string } }> };
        contexts: ContextPack[];
      };
      expect(data.batch.items).toHaveLength(3);
      const answers: ReviewAnswer[] = data.batch.items.map((item, index) => ({
        schemaVersion: "1.0",
        batchId: data.batch.id,
        itemId: item.id,
        directAnswer: `Answer ${index + 1} from ${host}`,
        evidence: [{ ref: item.anchor.ref, explanation: "Bound report evidence" }],
        uncertainty: [],
        suggestedNextActions: [{ type: "none", label: "No automatic change" }],
        metadata: {
          host,
          originSessionRef: runtime.currentSession.sessionRef!,
          contextHash: data.contexts[index]!.contextHash
        }
      }));
      const answersFile = path.join(fixture.root, `${host}-answers.json`);
      await writeFile(answersFile, `${JSON.stringify(answers)}\n`);
      await feedbackAnswer(fixture.root, runtime, data.batch.id, path.basename(answersFile));

      const finalStore = await loadReviewStore(
        fixture.run,
        fixture.report,
        "2026-08-08T00:02:00.000Z"
      );
      expect(finalStore.threads.map((thread) => thread.messages.at(-1)?.body)).toEqual([
        `Answer 1 from ${host}`,
        `Answer 2 from ${host}`,
        `Answer 3 from ${host}`
      ]);
      expect(finalStore.threads.every((thread) => thread.state === "answered")).toBe(true);
      expect(finalStore.threads.every((thread) => thread.state !== "resolved")).toBe(true);
      expect(
        Object.values(finalStore.state.judgments).every(
          (judgment) => judgment.state === "unreviewed"
        )
      ).toBe(true);
    } finally {
      await fixture.close();
    }
  });
}
