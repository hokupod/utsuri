import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { phase3ReportFixture, servePhase3Report } from "../e2e/phase3-report-fixture";

test.setTimeout(90_000);

test("has no serious or critical automated accessibility violations", async ({ page }) => {
  await servePhase3Report(page, { extraAssets: { "axe.js": axe.source } });
  await page.addScriptTag({ url: new URL("axe.js", page.url()).href });
  const violations = await page.evaluate(async () => {
    const runner = (globalThis as typeof globalThis & { axe: typeof axe }).axe;
    const result = await runner.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target)
    }));
  });
  expect(
    violations.filter((violation) => new Set(["critical", "serious"]).has(violation.impact ?? ""))
  ).toEqual([]);
});

test("keeps overlapping visual markers presentational and region controls interactive", async ({
  page
}) => {
  const fixture = await phase3ReportFixture();
  const report = structuredClone(fixture.report);
  const activeImage = report.comparisons[0]?.images[0];
  const seedRegion = activeImage?.regions[0];
  if (!activeImage || !seedRegion) throw new Error("Phase 3 fixture must contain a visual region");
  activeImage.regions = Array.from({ length: 3 }, (_, index) => ({
    ...seedRegion,
    id: `region:a11y-overlap-${index + 1}`
  }));

  await servePhase3Report(page, { report });
  const markers = page.locator(".region-marker");
  await expect(markers).toHaveCount(3);
  expect(
    await markers.evaluateAll((elements) =>
      elements.map((element) => ({
        ariaHidden: element.getAttribute("aria-hidden"),
        tagName: element.tagName
      }))
    )
  ).toEqual(Array.from({ length: 3 }, () => ({ ariaHidden: "true", tagName: "SPAN" })));

  const secondRegion = page.getByRole("button", { name: /^Region 2 ·/u });
  await secondRegion.click();
  await expect(secondRegion).toHaveAttribute("aria-current", "true");
  await expect(markers.nth(1)).toHaveClass(/active-region/u);
});
