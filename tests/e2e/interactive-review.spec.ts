import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readReviewInbox } from "../../packages/review-inbox/src";
import { loadReviewStore } from "../../packages/review-state/src";
import { createPhase6ReviewFixture } from "./phase6-review-fixture";

async function addFeedbackComment(pageTrigger: Locator, body: string): Promise<void> {
  const page = pageTrigger.page();
  await pageTrigger.click();
  const composer = page.locator(".comment-composer");
  await composer.getByRole("textbox", { name: "Review note" }).fill(body);
  await composer.getByRole("checkbox", { name: "Ask the current Agent" }).check();
  await composer.getByRole("button", { name: "Save comment" }).click();
}

test("stores a three-item batch through the capability-bound interactive UI", async ({ page }) => {
  const fixture = await createPhase6ReviewFixture();
  try {
    const immutableReport = await readFile(
      path.join(fixture.reportDirectory, "report.json"),
      "utf8"
    );
    await page.goto(fixture.server.url);
    await expect(page.getByRole("heading", { name: "Human review" })).toBeVisible();
    expect(page.url()).not.toContain("token=");

    await addFeedbackComment(
      page.locator(".review-controls > button"),
      "Explain the Button change."
    );
    await addFeedbackComment(
      page.locator(".hunk .hunk-actions button").filter({ hasText: "Comment" }).first(),
      "Confirm focus restoration."
    );
    await addFeedbackComment(page.locator(".line-comment").first(), "Verify the aria-label.");

    await expect(page.getByText("Items for Agent review: 3")).toBeVisible();
    await expect(page.locator(".feedback-preview")).toHaveCount(0);
    let store = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
    expect(readReviewInbox(store).entries).toHaveLength(0);
    expect(store.sidecarFiles).toEqual({});

    await page.getByRole("button", { name: "Review items" }).click();
    await expect(page.locator(".feedback-preview li")).toHaveCount(3);
    await expect(page.locator(".feedback-preview")).toContainText("files outside the report");
    await expect(page.locator('label:has-text("Provider"), label:has-text("Model")')).toHaveCount(
      0
    );

    await page.getByRole("button", { name: "Return to current conversation" }).click();
    await expect(page.locator(".feedback-preview pre")).toContainText(
      "Process the pending Utsuri review items"
    );
    await expect(page.getByRole("button", { name: "Copy handoff" })).toBeVisible();

    store = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
    const inbox = readReviewInbox(store);
    expect(inbox.entries).toHaveLength(1);
    expect(inbox.entries[0]?.itemIds).toHaveLength(3);
    expect(store.threads.map((thread) => thread.agentAttention.state)).toEqual([
      "batched",
      "batched",
      "batched"
    ]);
    expect(await readFile(path.join(fixture.reportDirectory, "report.json"), "utf8")).toBe(
      immutableReport
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export review" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const bundle = JSON.parse(await readFile(downloadPath!, "utf8")) as {
      events: Array<{ type: string }>;
    };
    expect(bundle.events.filter((event) => event.type === "thread.created")).toHaveLength(3);
    expect(bundle.events.at(-1)?.type).toBe("feedback-batch.stored");
    await expect(page.getByRole("button", { name: "Import review" })).toBeDisabled();
  } finally {
    await fixture.close();
  }
});
