import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UtsuriReport } from "@utsu-ri/report-model";
import {
  buildLineRangeAnchor,
  createHumanComment,
  createReviewBundle,
  createReviewStore,
  importReviewBundle,
  nodeReviewDigest
} from "./index";
import {
  browserCreateComment,
  createBrowserReviewBundle,
  createBrowserReviewStore,
  importBrowserReviewBundle
} from "./browser";
import { createBrowserFeedbackPreview } from "../../review-inbox/src/browser";
import { previewFeedbackBatch } from "../../review-inbox/src";

const report = JSON.parse(
  await readFile(
    path.resolve(import.meta.dir, "../../../fixtures/code-only-review/expected/report/report.json"),
    "utf8"
  )
) as UtsuriReport;

test("preserves a continuous before/after range through bundles and feedback contexts", async () => {
  const hunk = report.hunks.find((entry) => entry.path === "src/navigation.ts")!;
  for (const side of ["before", "after"] as const) {
    const anchor = await buildLineRangeAnchor(report, hunk.id, side, 4, 6, nodeReviewDigest);
    expect(anchor).toMatchObject({ path: hunk.path, side, startLine: 4, endLine: 6 });
    const store = await createHumanComment(
      await createReviewStore(report, "2026-10-02T00:00:00Z"),
      anchor!,
      "Explain this range",
      "question",
      "2026-10-02T00:00:01Z",
      undefined,
      true
    );
    const bundle = createReviewBundle(store, { base: null, head: null }, "2026-10-02T00:00:02Z");
    const imported = await importReviewBundle(
      await createReviewStore(report, "2026-10-02T00:00:00Z"),
      bundle,
      { importedAt: "2026-10-02T00:00:03Z", reanchor: false }
    );
    expect(imported.store.threads[0]!.anchor).toEqual(anchor!);
    expect(imported.store.threads[0]!.state).toBe("open");
    const preview = await previewFeedbackBatch(store, report.origin, {
      createdAt: "2026-10-02T00:00:04Z"
    });
    expect(preview.batch.items[0]!.anchor).toEqual(anchor!);
    expect(preview.contexts[0]!.code[0]).toMatchObject({
      path: hunk.path,
      startLine: 4,
      endLine: 6
    });
    const browser = await browserCreateComment(
      await createBrowserReviewStore(report, "2026-10-02T00:00:00Z"),
      anchor!,
      "Explain browser range",
      "question",
      "2026-10-02T00:00:01Z",
      true
    );
    const browserBundle = createBrowserReviewBundle(
      browser,
      { base: null, head: null },
      "2026-10-02T00:00:02Z"
    );
    const browserImported = await importBrowserReviewBundle(
      await createBrowserReviewStore(report, "2026-10-02T00:00:00Z"),
      browserBundle,
      { importedAt: "2026-10-02T00:00:03Z", reanchor: false }
    );
    expect(browserImported.store.threads[0]!.anchor).toEqual(anchor!);
    expect(browserImported.store.threads[0]!.state).toBe("open");
    const browserPreview = await createBrowserFeedbackPreview(browser);
    expect(browserPreview.contexts[0]!.code[0]).toMatchObject({ startLine: 4, endLine: 6 });
  }
});

test("rejects missing, reversed, discontinuous or forged ranges", async () => {
  const hunk = report.hunks[0]!;
  expect(
    await buildLineRangeAnchor(report, "hunk:missing", "after", 1, 2, nodeReviewDigest)
  ).toBeUndefined();
  expect(
    await buildLineRangeAnchor(report, hunk.id, "after", 6, 4, nodeReviewDigest)
  ).toBeUndefined();
  expect(
    await buildLineRangeAnchor(report, hunk.id, "after", 1, 1001, nodeReviewDigest)
  ).toBeUndefined();
  const anchor = (await buildLineRangeAnchor(report, hunk.id, "after", 1, 2, nodeReviewDigest))!;
  const store = await createReviewStore(report, "2026-10-02T00:00:00Z");
  await expect(
    createHumanComment(
      store,
      { ...anchor, path: "another.ts" },
      "Forged",
      "question",
      "2026-10-02T00:00:01Z"
    )
  ).rejects.toMatchObject({ diagnosticId: "REVIEW_RANGE_INVALID" });
  const changed = structuredClone(report);
  changed.hunks[0]!.lines[0]!.content += " changed";
  const original = await createHumanComment(
    store,
    anchor,
    "Original",
    "question",
    "2026-10-02T00:00:01Z"
  );
  const imported = await importReviewBundle(
    await createReviewStore(changed, "2026-10-02T00:00:00Z"),
    createReviewBundle(original, { base: null, head: null }, "2026-10-02T00:00:02Z"),
    { importedAt: "2026-10-02T00:00:03Z", reanchor: true }
  );
  expect(imported.store.threads[0]!.state).toBe("stale");
});
