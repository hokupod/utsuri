import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { servePhase3Report } from "../e2e/phase3-report-fixture";

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
