import { expect, test } from "@playwright/test";
import { servePhase3Report } from "./phase3-report-fixture";

test.setTimeout(90_000);

test("navigates visual modes, regions, findings, and linked code by keyboard", async ({ page }) => {
  await servePhase3Report(page);
  await expect(page.getByRole("heading", { name: "Visual comparison" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent interpretation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Measured evidence" })).toBeVisible();
  const controls = page.locator(".visual-mode-control");
  await expect(controls.getByRole("button", { name: "Side by side" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".visual-panes figure")).toHaveCount(2);

  await controls.getByRole("button", { name: "Wipe", exact: true }).click();
  const wipe = page.getByLabel(/Wipe position/u);
  await wipe.focus();
  await page.keyboard.press("ArrowRight");
  await expect(wipe).toHaveValue("51");

  await controls.getByRole("button", { name: "Pixel diff" }).click();
  await expect(page.locator(".pixel-diff-view img")).toBeVisible();
  await controls.getByRole("button", { name: "After only" }).click();
  await expect(page.getByAltText(/After capture/u)).toBeVisible();

  await controls.getByRole("button", { name: "Blink" }).click();
  await expect(controls.getByRole("button", { name: "Stop blink" })).toBeVisible();
  await controls.getByRole("button", { name: "Stop blink" }).click();
  await expect(controls.getByRole("button", { name: "Blink" })).toBeVisible();

  const region = page.locator(".region-list button").first();
  await region.focus();
  await page.keyboard.press("Enter");
  await expect(region).toHaveAttribute("aria-current", "true");

  const finding = page.locator(".finding-list article").first();
  await expect(finding.locator(".finding-badges")).toContainText(/new|incomplete/u);
  const viewCode = page.getByRole("button", { name: "View linked code" }).first();
  await viewCode.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".hunk.active-hunk")).toBeFocused();
  await page.getByRole("button", { name: "View visual evidence" }).first().click();
  await expect(page.getByRole("heading", { name: "Visual comparison" })).toBeFocused();

  await page.keyboard.press("1");
  await expect(page.locator('[data-visual-mode="side-by-side"]')).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.getByLabel(/Wipe position/u)).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.locator(".pixel-diff-view")).toBeVisible();
});
