import { expect, test } from "@playwright/test";
import { servePhase3Report } from "./phase3-report-fixture";

test.setTimeout(90_000);

test("shows known, verified, unknown, planned, succeeded, and failed coverage separately", async ({
  page
}) => {
  const fixture = await servePhase3Report(page);
  expect(fixture.report.coverage).toEqual({
    knownUsages: 12,
    verifiedUsages: 7,
    unknownPossible: true,
    planned: 1,
    succeeded: 1,
    failed: 0
  });
  const coverage = page.locator(".coverage-overview");
  await expect(coverage).toContainText("7 of 12 known usages verified");
  await expect(coverage).toContainText("additional usage may exist");
  await expect(coverage).toContainText("Planned targets");
  await expect(coverage).toContainText("Captured targets");
  await expect(coverage).toContainText("Failed targets");
  expect((await coverage.innerText()).includes("%")).toBe(false);
});
