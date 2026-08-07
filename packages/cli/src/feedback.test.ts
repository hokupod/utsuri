import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ContextPack, ReviewAnswer, UtsuriReport } from "@utsu-ri/report-model";
import { buildReport, createInitialReport } from "@utsu-ri/report-builder";
import { storeFeedbackBatch } from "@utsu-ri/review-inbox";
import {
  createHumanComment,
  loadReviewStore,
  persistReviewStore,
  setAgentAttention
} from "@utsu-ri/review-state";
import {
  bindReportToCurrentSession,
  createRuntimeSessionContext,
  feedbackAnswer,
  feedbackGet,
  feedbackHandoff,
  feedbackList,
  prepareFeedbackRuntime
} from "./feedback";
import { assertOriginSessionMatch } from "@utsu-ri/session-binding";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createRun(
  environment?: NodeJS.ProcessEnv
): Promise<{ root: string; run: string; report: UtsuriReport }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-feedback-cli-"));
  temporaryDirectories.push(root);
  const run = path.join(root, "run");
  await mkdir(run);
  const source = path.join(repositoryRoot, "fixtures/code-only-review/expected");
  for (const filename of [
    "input.json",
    "diff.json",
    "diff.patch",
    "evidence-index.json",
    "review-plan.json"
  ]) {
    await cp(path.join(source, filename), path.join(run, filename));
  }
  await mkdir(path.join(run, "logs"));
  await cp(path.join(source, "logs/collect.ndjson"), path.join(run, "logs/collect.ndjson"));
  const initial = await createInitialReport(run);
  const report = environment
    ? await bindReportToCurrentSession(root, initial, environment)
    : initial;
  await buildReport(run, report, {
    toolVersion: "0.1.0",
    ...(report.origin.bindingMode === "unbound" ? {} : { origin: report.origin })
  });
  return { root, run, report };
}

describe("return-to-session CLI", () => {
  test("fixes an opaque Origin Session at report generation and detects a later mismatch", async () => {
    const { root, report } = await createRun();
    const unboundRuntime = await createRuntimeSessionContext(root, report, {
      UTSURI_CODEX_SESSION_ID: "late-session"
    });
    expect(unboundRuntime.binding.bindingMode).toBe("unbound");
    expect(unboundRuntime.binding.host).toBe("unknown");
    expect(unboundRuntime.binding.sessionRef).toBeUndefined();
    expect(unboundRuntime.currentSession.host).toBe("codex");

    const bound = await bindReportToCurrentSession(root, report, {
      UTSURI_CODEX_SESSION_ID: "origin-session"
    });
    expect(bound.origin.bindingMode).toBe("return-to-session");
    expect(bound.origin.sessionRef).toMatch(/^session:[a-f0-9]{64}$/u);
    expect(JSON.stringify(bound.origin)).not.toContain("origin-session");

    const same = await createRuntimeSessionContext(root, bound, {
      UTSURI_CODEX_SESSION_ID: "origin-session"
    });
    expect(() => assertOriginSessionMatch(same.binding, same.currentSession)).not.toThrow();
    const other = await createRuntimeSessionContext(root, bound, {
      UTSURI_CODEX_SESSION_ID: "different-session"
    });
    expect(() => assertOriginSessionMatch(other.binding, other.currentSession)).toThrow(
      "Current conversation does not match"
    );
  });

  test("bounds answer-file reads before parsing", async () => {
    const { root } = await createRun();
    await writeFile(path.join(root, "oversized-answers.json"), Buffer.alloc(2 * 1024 * 1024 + 1));
    const runtime = await prepareFeedbackRuntime(root, "run");

    await expect(
      feedbackAnswer(root, runtime, undefined, "oversized-answers.json")
    ).rejects.toMatchObject({ diagnosticId: "SEC_FILE_SIZE_LIMIT" });
  });

  for (const [host, environment] of [
    ["codex", { UTSURI_CODEX_SESSION_ID: "codex-origin-session" }],
    ["claude-code", { CLAUDE_SESSION_ID: "claude-origin-session" }]
  ] as const) {
    test(`processes itemized answers in the bound ${host} conversation`, async () => {
      const { root, run, report } = await createRun(environment);
      const runtime = await prepareFeedbackRuntime(root, "run", environment);
      let store = await loadReviewStore(run, report, "2026-08-08T00:00:00.000Z");
      const anchor = store.anchorCatalog.find((entry) => entry.type === "hunk")!;
      store = await createHumanComment(
        store,
        anchor,
        "Explain this change.",
        "question",
        "2026-08-08T00:00:01.000Z"
      );
      await persistReviewStore(run, store, 0);
      store = await loadReviewStore(run, report, "2026-08-08T00:00:02.000Z");
      store = await setAgentAttention(
        store,
        store.threads[0]!.id,
        true,
        "2026-08-08T00:00:03.000Z"
      );
      await persistReviewStore(run, store, 1);
      store = await loadReviewStore(run, report, "2026-08-08T00:00:04.000Z");
      const stored = await storeFeedbackBatch(store, runtime.binding, {
        idempotencyKey: `${host}-batch`,
        createdAt: "2026-08-08T00:00:05.000Z"
      });
      await persistReviewStore(run, stored.store, 2);

      const resumed = await prepareFeedbackRuntime(root, "run", environment);
      const listed = await feedbackList(resumed, "ready");
      expect((listed.data.batches as unknown[]).length).toBe(1);
      const claimed = await feedbackGet(resumed, stored.preview.batch.id);
      const claimedData = claimed.data as {
        batch: { id: string; items: Array<{ id: string; anchor: { ref: string } }> };
        contexts: ContextPack[];
      };
      const answers: ReviewAnswer[] = claimedData.batch.items.map((item, index) => ({
        schemaVersion: "1.0",
        batchId: claimedData.batch.id,
        itemId: item.id,
        directAnswer: `Bound ${host} answer ${index + 1}`,
        evidence: [{ ref: item.anchor.ref, explanation: "Report-bound evidence" }],
        uncertainty: [],
        suggestedNextActions: [{ type: "none", label: "No automatic change" }],
        metadata: {
          host,
          originSessionRef: resumed.currentSession.sessionRef,
          contextHash: claimedData.contexts[index]!.contextHash
        }
      }));
      await writeFile(path.join(root, "answers.json"), `${JSON.stringify(answers)}\n`);
      const answered = await feedbackAnswer(root, resumed, claimedData.batch.id, "answers.json");
      expect((answered.data.batch as { state: string }).state).toBe("answered");
      const handoff = await feedbackHandoff(resumed, claimedData.batch.id);
      expect(handoff.human).toContain(`Batch: ${claimedData.batch.id}`);
      const finalStore = await loadReviewStore(run, report, "2026-08-08T00:00:06.000Z");
      expect(finalStore.threads[0]?.state).toBe("answered");
      expect(finalStore.state.judgments[report.changes[0]!.id]?.state).toBe("unreviewed");
    });
  }
});
