import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { servePhase3Report } from "./phase3-report-fixture";

test("persists and transfers independent human review state", async ({ page }) => {
  const fixture = await servePhase3Report(page);
  const selectedChange = fixture.report.changes[0]!;

  const judgment = page.getByRole("combobox", { name: "Human judgment" });
  const changeViewed = page.locator(".review-workspace .viewed-control input");
  await expect(judgment).toHaveValue("unreviewed");
  await expect(changeViewed).not.toBeChecked();

  await judgment.selectOption("reviewed");
  await expect(changeViewed).not.toBeChecked();
  await changeViewed.check();
  await expect(judgment).toHaveValue("reviewed");

  const hunkViewed = page.locator(".hunk .viewed-control input").first();
  await hunkViewed.check();
  await page.locator(".line-comment").first().click();
  await page.getByRole("textbox", { name: "Review note" }).fill("Verify this exact line.");
  await page.getByRole("button", { name: "Save comment" }).click();
  await expect(page.locator(".thread-list")).toContainText("Verify this exact line.");
  await expect(page.getByRole("button", { name: /send|agent attention/iu })).toHaveCount(0);

  await page.reload();
  await expect(judgment).toHaveValue("reviewed");
  await expect(changeViewed).toBeChecked();
  await expect(hunkViewed).toBeChecked();
  await expect(page.locator(".thread-list")).toContainText("Verify this exact line.");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${fixture.report.reportId}-review.json`);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bundle = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    source: { reportId: string };
    state: { judgments: Record<string, { state: string }> };
    threads: Array<{ anchor: { type: string }; agentAttention: { state: string } }>;
  };
  expect(bundle.source.reportId).toBe(fixture.report.reportId);
  expect(bundle.state.judgments[selectedChange.id]?.state).toBe("reviewed");
  expect(bundle.threads).toEqual([
    expect.objectContaining({
      anchor: expect.objectContaining({ type: "line-range" }),
      agentAttention: { state: "none" }
    })
  ]);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(judgment).toHaveValue("unreviewed");
  await expect(changeViewed).not.toBeChecked();

  await page.locator('.review-workspace input[type="file"]').setInputFiles({
    name: "review-bundle.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle))
  });
  await expect(page.getByRole("status")).toContainText("matched");
  await expect(judgment).toHaveValue("reviewed");
  await expect(changeViewed).toBeChecked();
  await expect(page.locator(".thread-list")).toContainText("Verify this exact line.");
});
