import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
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
  environmentInput?: NodeJS.ProcessEnv | ((root: string) => NodeJS.ProcessEnv)
): Promise<{ root: string; run: string; report: UtsuriReport; environment?: NodeJS.ProcessEnv }> {
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
  const environment =
    typeof environmentInput === "function"
      ? environmentInput(await realpath(root))
      : environmentInput;
  const initial = await createInitialReport(run);
  const report = environment
    ? await bindReportToCurrentSession(root, initial, environment)
    : initial;
  await buildReport(run, report, {
    toolVersion: "0.1.0",
    ...(report.origin.bindingMode === "unbound" ? {} : { origin: report.origin })
  });
  return { root, run, report, environment };
}

describe("return-to-session CLI", () => {
  test("fixes an opaque Origin Session at report generation and detects a later mismatch", async () => {
    const { root, report } = await createRun();
    const unboundRuntime = await createRuntimeSessionContext(root, report, {
      CODEX_THREAD_ID: "late-session"
    });
    expect(unboundRuntime.binding.bindingMode).toBe("unbound");
    expect(unboundRuntime.binding.host).toBe("unknown");
    expect(unboundRuntime.binding.sessionRef).toBeUndefined();
    expect(unboundRuntime.currentSession.host).toBe("codex");

    const bound = await bindReportToCurrentSession(root, report, {
      CODEX_THREAD_ID: "origin-session"
    });
    expect(bound.origin.bindingMode).toBe("return-to-session");
    expect(bound.origin.sessionRef).toMatch(/^session:[a-f0-9]{64}$/u);
    expect(JSON.stringify(bound.origin)).not.toContain("origin-session");

    const same = await createRuntimeSessionContext(root, bound, {
      CODEX_THREAD_ID: "origin-session"
    });
    expect(() => assertOriginSessionMatch(same.binding, same.currentSession)).not.toThrow();
    const other = await createRuntimeSessionContext(root, bound, {
      CODEX_THREAD_ID: "different-session"
    });
    expect(() => assertOriginSessionMatch(other.binding, other.currentSession)).toThrow(
      "Current conversation does not match"
    );
  });

  test("bounds answer-file reads before parsing", async () => {
    const environment = { CODEX_THREAD_ID: "bounded-answer-session" };
    const { root } = await createRun(environment);
    await writeFile(path.join(root, "oversized-answers.json"), Buffer.alloc(2 * 1024 * 1024 + 1));
    const runtime = await prepareFeedbackRuntime(root, "run", environment);

    await expect(
      feedbackAnswer(root, runtime, undefined, "oversized-answers.json")
    ).rejects.toMatchObject({ diagnosticId: "SEC_FILE_SIZE_LIMIT" });
  });

  test("fails closed before opening a bound inbox without the raw host session ID", async () => {
    const environment = { CODEX_THREAD_ID: "origin-session" };
    const { root, report } = await createRun(environment);
    await expect(prepareFeedbackRuntime(root, "run", {})).rejects.toMatchObject({
      diagnosticId: "ORIGIN_SESSION_MISMATCH"
    });
    await expect(
      prepareFeedbackRuntime(root, "run", {
        UTSURI_CODEX_SESSION_REF: report.origin.sessionRef
      })
    ).rejects.toMatchObject({ diagnosticId: "ORIGIN_SESSION_MISMATCH" });
  });

  test("keeps legacy fixed-run identities compatible and rejects conflicting aliases", async () => {
    for (const environment of [
      { UTSURI_CODEX_SESSION_ID: "legacy-codex-session" },
      { CLAUDE_SESSION_ID: "legacy-claude-session" }
    ]) {
      const { root, report } = await createRun(environment);
      const runtime = await prepareFeedbackRuntime(root, "run", environment);
      expect(runtime.currentSession.host).toBe(report.origin.host);
      expect(runtime.currentSession.sessionRef).toBe(report.origin.sessionRef);
    }

    const { root, report } = await createRun();
    await expect(
      bindReportToCurrentSession(root, report, {
        CODEX_THREAD_ID: "new-codex",
        UTSURI_CODEX_SESSION_ID: "legacy-codex"
      })
    ).rejects.toMatchObject({ diagnosticId: "ORIGIN_SESSION_IDENTITY_CONFLICT" });
    await expect(
      bindReportToCurrentSession(root, report, {
        CLAUDE_CODE_SESSION_ID: "new-claude",
        CLAUDE_SESSION_ID: "legacy-claude",
        CLAUDE_PROJECT_DIR: root
      })
    ).rejects.toMatchObject({ diagnosticId: "ORIGIN_SESSION_IDENTITY_CONFLICT" });
    await expect(
      bindReportToCurrentSession(root, report, {
        CODEX_THREAD_ID: "same-codex",
        UTSURI_CODEX_SESSION_ID: "same-codex"
      })
    ).resolves.toMatchObject({ origin: { host: "codex" } });
  });

  for (const [host, environmentForRoot] of [
    ["codex", () => ({ CODEX_THREAD_ID: "codex-origin-session" })],
    [
      "claude-code",
      (root: string) => ({
        CLAUDE_CODE_SESSION_ID: "claude-origin-session",
        CLAUDE_PROJECT_DIR: root
      })
    ]
  ] as const) {
    test(`processes itemized answers in the bound ${host} conversation`, async () => {
      const { root, run, report, environment } = await createRun(environmentForRoot);
      if (!environment) throw new Error("Expected host environment");
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
