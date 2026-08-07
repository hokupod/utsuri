import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { servePhase3Report } from "./phase3-report-fixture";

test("previews and exports selected feedback without sending on checkbox", async ({
  context,
  page
}) => {
  const fixture = await servePhase3Report(page);
  const openPages = context.pages().length;

  await page.locator(".line-comment").first().click();
  await page.getByRole("textbox", { name: "Review note" }).fill("Keep @codex as literal text.");
  await page.getByRole("checkbox", { name: "Ask the current Agent" }).check();
  await page.getByRole("button", { name: "Save comment" }).click();

  await page.locator(".region-actions button").filter({ hasText: "Comment" }).first().click();
  const visualComposer = page.locator(".comment-composer");
  await visualComposer.getByRole("textbox", { name: "Review note" }).fill("Check visual crop.");
  await visualComposer.getByRole("checkbox", { name: "Ask the current Agent" }).check();
  await visualComposer.getByRole("button", { name: "Save comment" }).click();

  await expect(page.locator(".thread-list")).toContainText("Keep @codex as literal text.");
  await expect(page.locator(".thread-list")).toContainText("Check visual crop.");
  await expect(page.getByText("Items for Agent review: 2")).toBeVisible();
  await expect(page.locator(".visual-comment-pin")).toHaveCount(1);
  await page
    .locator(".visual-mode-control")
    .getByRole("button", { name: "Wipe", exact: true })
    .click();
  await expect(page.locator(".visual-comment-pin")).toBeVisible();
  await page.locator(".visual-mode-control").getByRole("button", { name: "Pixel diff" }).click();
  await expect(page.locator(".visual-comment-pin")).toBeVisible();
  await page.locator(".visual-comment-pin").click();
  await expect(
    page.locator(".thread-list li").filter({ hasText: "Check visual crop." })
  ).toBeFocused();
  await expect(page.locator(".feedback-preview")).toHaveCount(0);
  expect(context.pages()).toHaveLength(openPages);

  await page.getByRole("button", { name: "Review items" }).click();
  await expect(page.locator(".feedback-preview")).toContainText("Keep @codex as literal text.");
  await expect(page.locator(".feedback-preview")).toContainText("Not shared");
  await expect(page.locator(".feedback-preview")).toContainText("export-only");
  await expect(page.locator('label:has-text("Provider"), label:has-text("Model")')).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare review request" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    batch: {
      reportId: string;
      deliveryMode: string;
      origin: unknown;
      items: Array<{ question: string }>;
    };
    contexts: Array<{ question: string }>;
  };
  expect(exported.batch.reportId).toBe(fixture.report.reportId);
  expect(exported.batch.origin).toEqual(fixture.report.origin);
  expect(exported.batch.deliveryMode).toBe("export-only");
  expect(exported.batch.items.map((item) => item.question)).toEqual([
    "Keep @codex as literal text.",
    "Check visual crop."
  ]);
  expect(exported.contexts[0]?.question).toBe("Keep @codex as literal text.");
  expect(
    (exported.contexts[1] as { images?: unknown[] } | undefined)?.images?.length
  ).toBeGreaterThan(0);
  expect(context.pages()).toHaveLength(openPages);
});
