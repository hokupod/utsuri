import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UtsuriReport } from "../../packages/report-model/src";
import {
  buildAnchorCatalog,
  classifyAnchor,
  nodeReviewDigest,
  type ReviewAnchor
} from "../../packages/review-state/src";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

test("classifies exact, probable, changed, and missing anchors", () => {
  const source: ReviewAnchor = { type: "hunk", ref: "hunk:old", fingerprint: "a".repeat(64) };
  expect(classifyAnchor(source, [source])).toMatchObject({
    result: "exact",
    disposition: "matched"
  });
  expect(
    classifyAnchor(source, [{ type: "hunk", ref: "hunk:new", fingerprint: source.fingerprint }])
  ).toMatchObject({ result: "probable", disposition: "stale" });
  expect(
    classifyAnchor(source, [{ type: "hunk", ref: source.ref, fingerprint: "b".repeat(64) }])
  ).toMatchObject({ result: "changed", disposition: "stale" });
  expect(classifyAnchor(source, [])).toMatchObject({
    result: "missing",
    disposition: "orphaned"
  });
});

test("normalizes visual regions and marks changed screenshot evidence stale", async () => {
  const report = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "fixtures/code-only-review/expected/report/report.json"),
      "utf8"
    )
  ) as UtsuriReport;
  report.targets = [
    {
      id: "target:button",
      before: {},
      after: {}
    }
  ] as UtsuriReport["targets"];
  report.comparisons = [
    {
      id: "comparison:button",
      targetRef: "target:button",
      images: [
        {
          id: "image:desktop",
          label: "desktop",
          width: 200,
          height: 100,
          beforeRef: "visual/before.png",
          afterRef: "visual/after.png",
          diffRef: "visual/diff.png",
          regions: [{ id: "region:1", x: 50, y: 25, width: 100, height: 50, pixels: 5000 }]
        }
      ]
    }
  ] as UtsuriReport["comparisons"];
  const original = (await buildAnchorCatalog(report, nodeReviewDigest)).find(
    (anchor) => anchor.type === "visual-region"
  )!;
  expect(original.region).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });

  const changed = structuredClone(report);
  changed.comparisons[0]!.images[0]!.afterRef = "visual/after-v2.png";
  const current = await buildAnchorCatalog(changed, nodeReviewDigest);
  expect(classifyAnchor(original, current)).toMatchObject({
    result: "changed",
    disposition: "stale"
  });
});
