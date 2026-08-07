import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { UtsuriReport } from "@utsu-ri/report-model";
import {
  createHumanComment,
  createReviewBundle,
  createReviewStore,
  importReviewBundle,
  nodeReviewDigest,
  setJudgment,
  setViewed
} from "./model";
import { classifyAnchor } from "./anchors";
import { browserReviewDigest } from "./browser";
import { loadReviewStore, persistReviewStore } from "./persistence";

const root = path.resolve(import.meta.dir, "../../..");
const now = "2026-08-07T00:00:00.000Z";

async function report(): Promise<UtsuriReport> {
  return JSON.parse(
    await readFile(path.join(root, "fixtures/code-only-review/expected/report/report.json"), "utf8")
  ) as UtsuriReport;
}

describe("review state", () => {
  test("keeps viewed and human judgment independent", async () => {
    const source = await report();
    let store = await createReviewStore(source, now);
    const change = store.anchorCatalog.find((anchor) => anchor.type === "change")!;
    store = await setViewed(store, change, "viewed", "2026-08-07T00:00:01.000Z");
    expect(store.state.judgments[change.ref]?.state).toBe("unreviewed");
    store = await setJudgment(store, change.ref, "reviewed", "2026-08-07T00:00:02.000Z");
    expect(Object.values(store.state.viewed)[0]?.state).toBe("viewed");
    expect(store.state.judgments[change.ref]?.state).toBe("reviewed");
    expect(store.events.map((event) => event.type)).toEqual(["viewed.changed", "judgment.changed"]);
  });

  test("persists plain comments without requesting Agent attention", async () => {
    const source = await report();
    let store = await createReviewStore(source, now);
    const hunk = store.anchorCatalog.find((anchor) => anchor.type === "line-range")!;
    store = await createHumanComment(
      store,
      hunk,
      "Check the renamed label.",
      "note",
      "2026-08-07T00:00:01.000Z"
    );
    expect(store.threads).toHaveLength(1);
    expect(store.threads[0]?.agentAttention.state).toBe("none");
    expect(store.threads[0]?.messages[0]?.body).toBe("Check the renamed label.");
    expect(store.state.threadIds).toEqual([store.threads[0]!.id]);
  });

  test("classifies exact, probable, changed, and missing anchors conservatively", async () => {
    const source = await report();
    const store = await createReviewStore(source, now);
    const exact = store.anchorCatalog[0]!;
    expect(classifyAnchor(exact, store.anchorCatalog).result).toBe("exact");
    expect(
      classifyAnchor({ ...exact, ref: `${exact.ref}:renamed` }, store.anchorCatalog).result
    ).toBe("probable");
    expect(
      classifyAnchor({ ...exact, fingerprint: "f".repeat(64) }, store.anchorCatalog).result
    ).toBe("changed");
    expect(
      classifyAnchor(
        { ...exact, ref: `${exact.ref}:missing`, fingerprint: "e".repeat(64) },
        store.anchorCatalog
      ).result
    ).toBe("missing");
  });

  test("imports probable anchors as stale and missing threads as orphaned", async () => {
    const source = await report();
    let oldStore = await createReviewStore(source, now);
    const anchor = oldStore.anchorCatalog.find((entry) => entry.type === "hunk")!;
    oldStore = await setViewed(oldStore, anchor, "viewed", "2026-08-07T00:00:01.000Z");
    oldStore = await createHumanComment(
      oldStore,
      anchor,
      "Retain this note.",
      "note",
      "2026-08-07T00:00:02.000Z"
    );
    const bundle = createReviewBundle(oldStore, { base: "base", head: "head" }, now);
    const changedReport = structuredClone(source);
    changedReport.reportId = "report-import-target";
    changedReport.origin.reportId = changedReport.reportId;
    changedReport.hunks = [];
    changedReport.files = changedReport.files.map((file) => ({ ...file, hunkRefs: [] }));
    changedReport.changes = changedReport.changes.map((change) => ({ ...change, hunkRefs: [] }));
    changedReport.unclassifiedHunkRefs = [];
    const current = await createReviewStore(changedReport, now);
    const imported = await importReviewBundle(current, bundle, {
      reanchor: true,
      importedAt: "2026-08-07T00:00:03.000Z"
    });
    expect(imported.store.threads[0]?.state).toBe("orphaned");
    expect(imported.store.state.orphanedThreadIds).toEqual([oldStore.threads[0]!.id]);
    expect(Object.values(imported.store.state.viewed)[0]?.state).toBe("stale");
    expect(() =>
      createReviewBundle(imported.store, { base: "base", head: "head" }, now)
    ).not.toThrow();
  });

  test("rejects bundle anchors that are not bound to the anchor catalog", async () => {
    const source = await report();
    let store = await createReviewStore(source, now);
    const anchor = store.anchorCatalog.find((entry) => entry.type === "hunk")!;
    store = await setViewed(store, anchor, "viewed", "2026-08-07T00:00:01.000Z");
    const bundle = createReviewBundle(store, { base: null, head: null }, now);
    bundle.anchorCatalog = bundle.anchorCatalog.filter(
      (entry) => entry.type !== anchor.type || entry.ref !== anchor.ref
    );

    await expect(
      importReviewBundle(store, bundle, {
        reanchor: false,
        importedAt: "2026-08-07T00:00:02.000Z"
      })
    ).rejects.toMatchObject({ diagnosticId: "REVIEW_BUNDLE_INVALID" });
  });

  test("uses identical SHA-256 fingerprints in Node and browsers", async () => {
    const value = { z: [3, 2, 1], a: { y: true, x: "value" } };
    expect(await browserReviewDigest(value)).toBe(await nodeReviewDigest(value));
  });

  test("commits a complete generation and ignores an uncommitted generation after a crash", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "utsuri-review-state-"));
    try {
      const source = await report();
      let store = await createReviewStore(source, now);
      const anchor = store.anchorCatalog.find((entry) => entry.type === "hunk")!;
      store = await setViewed(store, anchor, "viewed", "2026-08-07T00:00:01.000Z");
      await persistReviewStore(directory, store, 0);
      const loaded = await loadReviewStore(directory, source, "2026-08-07T00:00:02.000Z");
      expect(loaded.state.revision).toBe(1);
      expect(loaded.events.map((event) => event.sequence)).toEqual([1]);
      expect(Object.values(loaded.state.viewed)[0]?.state).toBe("viewed");

      const changeId = loaded.report.changes[0]!.id;
      const second = await setJudgment(loaded, changeId, "reviewed", "2026-08-07T00:00:03.000Z");
      await expect(
        persistReviewStore(directory, second, 1, nodeReviewDigest, {
          beforeCommit: async () => {
            throw new Error("simulated crash before pointer commit");
          }
        })
      ).rejects.toThrow("simulated crash");

      const recovered = await loadReviewStore(directory, source, "2026-08-07T00:00:04.000Z");
      expect(recovered.state.revision).toBe(1);
      expect(recovered.state.judgments[changeId]?.state).toBe("unreviewed");

      await persistReviewStore(directory, second, 1);
      const retried = await loadReviewStore(directory, source, "2026-08-07T00:00:05.000Z");
      expect(retried.state.revision).toBe(2);
      expect(retried.state.judgments[changeId]?.state).toBe("reviewed");

      const left = await setJudgment(retried, changeId, "follow-up", "2026-08-07T00:00:06.000Z");
      const right = await setViewed(retried, anchor, "unseen", "2026-08-07T00:00:07.000Z");
      const commits = await Promise.allSettled([
        persistReviewStore(directory, left, 2),
        persistReviewStore(directory, right, 2)
      ]);
      expect(commits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(commits.filter((result) => result.status === "rejected")).toHaveLength(1);
      const concurrent = await loadReviewStore(directory, source, "2026-08-07T00:00:08.000Z");
      expect(concurrent.state.revision).toBe(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
