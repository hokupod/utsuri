import { expect, test, type Locator } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  claimFeedbackBatch,
  getFeedbackItemContext,
  listFeedbackBatches,
  postFeedbackAnswers,
  readReviewInbox
} from "../../packages/review-inbox/src";
import { loadReviewStore } from "../../packages/review-state/src";
import type { ReviewAnswer } from "../../packages/report-model/src";
import { prepareFeedbackRuntime } from "../../packages/cli/src/feedback";
import { persistReviewStore } from "../../packages/review-state/src";
import { startInteractiveReportServer } from "../../packages/interactive-server/src";
import { capabilityStorageKey } from "../../packages/report-ui/src/interactive-capability";
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
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    await page.getByRole("button", { name: "Start with highest attention" }).click();
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
    await page.getByRole("button", { name: "Export review" }).focus();
    await page.keyboard.press("Enter");
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

test("keeps preview, Inbox and answers synchronized without losing a draft; read state survives tabs", async ({
  page,
  context
}) => {
  const fixture = await createPhase6ReviewFixture();
  try {
    await page.goto(fixture.server.url);
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await addFeedbackComment(page.locator(".line-comment").first(), "Question one");
    await addFeedbackComment(page.locator(".line-comment").first(), "Question two");
    await page.getByRole("button", { name: "Review items" }).click();
    await expect(page.locator(".feedback-preview li")).toHaveCount(2);
    await mkdir(path.resolve(".artifacts/issue-ui"), { recursive: true });
    await page
      .locator(".feedback-dock")
      .screenshot({ path: ".artifacts/issue-ui/feedback-expanded.png" });
    await page.getByRole("button", { name: "Collapse Feedback Batch" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback-preview")).toHaveCount(0);
    await page
      .locator(".feedback-dock")
      .screenshot({ path: ".artifacts/issue-ui/feedback-collapsed.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
    await page
      .locator(".feedback-dock")
      .screenshot({ path: ".artifacts/issue-ui/feedback-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator(".feedback-dock")).toContainText("Items for Agent review: 2");
    await page.getByRole("button", { name: "Expand Feedback Batch" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback-preview")).toBeVisible();
    await page.getByRole("button", { name: "Collapse Feedback Batch" }).click();
    await expect(page.locator(".feedback-dock")).toHaveClass(/collapsed/u);
    await page.getByRole("button", { name: "Expand Feedback Batch" }).click();
    await expect(page.locator(".feedback-preview")).toBeVisible();
    await page.getByRole("button", { name: "Return to current conversation" }).click();
    await expect(page.locator(".feedback-preview pre")).toContainText(
      "Process the pending Utsuri review items"
    );
    await page.locator(".line-comment").first().click();
    await page
      .getByRole("textbox", { name: "Review note" })
      .fill("Unsaved draft survives answer arrival");
    const runtime = await prepareFeedbackRuntime(fixture.root, "run", {
      CODEX_THREAD_ID: "codex-origin-session"
    });
    let store = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
    const batch = listFeedbackBatches(store)[0]!;
    const claimed = await claimFeedbackBatch(
      store,
      batch.id,
      runtime.currentSession,
      new Date().toISOString()
    );
    await persistReviewStore(fixture.run, claimed.store, store.state.revision);
    await expect(page.locator(".feedback-preview li > span")).toHaveText([
      "acknowledged",
      "acknowledged"
    ]);
    await expect(page.locator(".feedback-batch-state")).toHaveText("consumed");
    await expect(page.getByRole("button", { name: "Return to current conversation" })).toHaveCount(
      0
    );
    const answers: ReviewAnswer[] = batch.items.map((item, index) => ({
      schemaVersion: "1.0",
      batchId: batch.id,
      itemId: item.id,
      directAnswer: `Saved answer ${index + 1}`,
      evidence: [],
      uncertainty: [],
      suggestedNextActions: [],
      metadata: {
        host: "codex",
        originSessionRef: runtime.currentSession.sessionRef!,
        contextHash: getFeedbackItemContext(claimed.store, item.id).contextHash
      }
    }));
    store = await postFeedbackAnswers(
      claimed.store,
      batch.id,
      answers,
      runtime.currentSession,
      new Date().toISOString()
    );
    await persistReviewStore(fixture.run, store, claimed.store.state.revision);
    await expect(page.locator(".feedback-preview li > span")).toHaveText(["answered", "answered"]);
    await expect(page.getByRole("button", { name: "Copy handoff" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Review note" })).toHaveValue(
      "Unsaved draft survives answer arrival"
    );
    await expect(page.locator(".thread-list")).toContainText("Saved answer 1");
    await page.getByRole("button", { name: "View comment and answer" }).first().click();
    await expect(page.locator(".feedback-dock")).toHaveClass(/collapsed/u);
    await expect(page.locator(".thread-list li").first()).toBeFocused();
    await expect(page.getByRole("button", { name: "Mark as unread" }).first()).toBeVisible();
    const answer = page.locator(".answer-message").first();
    await answer.getByRole("button", { name: "Mark as unread" }).click();
    await expect(answer).toHaveAttribute("data-unread", "true");
    await page.waitForTimeout(1000); // Longer than the automatic read dwell.
    await expect(answer).toHaveAttribute("data-unread", "true");
    const other = await context.newPage();
    await other.goto(fixture.server.url);
    await expect(other.locator(".feedback-dock")).toContainText("Unread answers:");
    await answer.getByRole("button", { name: "Mark as read" }).focus();
    await page.keyboard.press("Enter");
    await expect(answer).toHaveAttribute("data-unread", "false");
    await expect
      .poll(async () => {
        const saved = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
        return readReviewInbox(saved).entries[0]!.unreadAnswerItemIds.includes(batch.items[0]!.id);
      })
      .toBe(false);
    await expect(other.locator(".feedback-dock")).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await expect(page.locator(".answer-message")).toHaveCount(2);
    await expect(page.locator('.answer-message[data-unread="true"]')).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    const final = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
    expect(final.threads).toEqual(store.threads);
    expect(final.state.judgments).toEqual(store.state.judgments);
    expect(final.state.viewed).toEqual(store.state.viewed);
  } finally {
    await fixture.close();
  }
});

for (const mode of ["Unified", "Side by side"]) {
  test(`persists before/after range selection in ${mode}`, async ({ page }) => {
    const fixture = await createPhase6ReviewFixture();
    try {
      await page.goto(fixture.server.url);
      await page.getByRole("link", { name: /navigation and related files/u }).click();
      await page.getByRole("button", { name: mode, exact: true }).click();
      for (const side of ["before", "after"]) {
        await page
          .getByRole("button", { name: `Select ${side} line 4 in src/navigation.ts`, exact: true })
          .click();
        await page
          .getByRole("button", { name: `Select ${side} line 6 in src/navigation.ts`, exact: true })
          .click({ modifiers: ["Shift"] });
        await expect(page.locator('.range-line[aria-pressed="true"]')).toHaveCount(3);
        await expect(page.locator(".range-selected")).toHaveCount(3);
        await mkdir(path.resolve(".artifacts/issue-ui"), { recursive: true });
        const selectedHunk = page.locator(".hunk").filter({ has: page.locator(".range-selected") });
        await selectedHunk.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await selectedHunk.screenshot({
          path: `.artifacts/issue-ui/range-${mode.replaceAll(" ", "-")}-${side}.png`
        });
        await page.getByRole("button", { name: "Comment on selected range" }).click();
        await expect(page.locator(".comment-composer")).toContainText(`${side} · 4–6`);
        await page.getByRole("textbox", { name: "Review note" }).fill(`Range ${side}`);
        await page
          .locator(".comment-composer")
          .getByRole("checkbox", { name: "Ask the current Agent" })
          .check();
        await page.getByRole("button", { name: "Save comment" }).click();
      }
      await page.getByRole("button", { name: "Review items" }).click();
      await expect(page.locator(".feedback-preview")).toContainText("before · 4–6");
      await expect(page.locator(".feedback-preview")).toContainText("after · 4–6");
      await page.getByRole("button", { name: "Return to current conversation" }).click();
      await expect(page.locator(".feedback-preview pre")).toContainText(
        "Process the pending Utsuri review items"
      );
      const store = await loadReviewStore(fixture.run, fixture.report, new Date().toISOString());
      expect(
        store.threads.map((thread) => [
          thread.anchor.side,
          thread.anchor.startLine,
          thread.anchor.endLine
        ])
      ).toEqual([
        ["before", 4, 6],
        ["after", 4, 6]
      ]);
      await page.reload();
      await page.getByRole("link", { name: /navigation and related files/u }).click();
      await expect(page.locator(".thread-list")).toContainText("before · 4–6");
      await expect(page.locator(".thread-list")).toContainText("after · 4–6");
    } finally {
      await fixture.close();
    }
  });
}

test("reload resumes the scoped capability; expiry fails closed without changing server validity", async ({
  page
}) => {
  const fixture = await createPhase6ReviewFixture();
  try {
    await page.goto(fixture.server.url);
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await addFeedbackComment(page.locator(".line-comment").first(), "Reload retains review");
    await page.reload();
    await expect(page.locator(".thread-list")).toContainText("Reload retains review");
    await page.getByRole("button", { name: "Review items" }).click();
    await page.getByRole("button", { name: "Return to current conversation" }).click();
    const key = capabilityStorageKey(
      new URL(page.url()).origin,
      new URL(page.url()).pathname,
      fixture.report.reportId
    );
    await page.evaluate((storageKey) => {
      const value = JSON.parse(sessionStorage.getItem(storageKey)!);
      value.expiresAt = Date.now() - 1;
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    }, key);
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("Reopen the current server");
    expect(
      await page.evaluate((storageKey) => sessionStorage.getItem(storageKey) === null, key)
    ).toBe(true);
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await expect(page.getByRole("button", { name: "Save comment", exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Human judgment" })).toHaveCount(0);
    await page.goto(fixture.server.url);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".feedback-dock")).toContainText("Unread answers: 0");
  } finally {
    await fixture.close();
  }
});

test("tab duplication copies session storage; 401/403 clears only the rejected tab copy", async ({
  page
}) => {
  const fixture = await createPhase6ReviewFixture();
  try {
    await page.goto(fixture.server.url);
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    const key = capabilityStorageKey(
      new URL(page.url()).origin,
      new URL(page.url()).pathname,
      fixture.report.reportId
    );
    for (const status of [401, 403]) {
      const popupPromise = page.waitForEvent("popup");
      await page.evaluate(() => window.open(location.href, "_blank"));
      const popup = await popupPromise;
      await expect(popup.getByRole("heading", { name: "Review brief" })).toBeVisible();
      expect(
        await popup.evaluate((storageKey) => sessionStorage.getItem(storageKey) !== null, key)
      ).toBe(true);
      await popup.route("**/api/v1/review-state", (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Capability rejected" } })
        })
      );
      await popup.reload();
      await expect(popup.getByRole("alert")).toContainText("Reopen the current server");
      expect(
        await popup.evaluate((storageKey) => sessionStorage.getItem(storageKey) === null, key)
      ).toBe(true);
      expect(
        await page.evaluate((storageKey) => sessionStorage.getItem(storageKey) !== null, key)
      ).toBe(true);
      await popup.close();
    }
    await page.reload();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

test("server restart rejects its predecessor capability and accepts the fresh interactive link", async ({
  page
}) => {
  const fixture = await createPhase6ReviewFixture();
  let restarted: Awaited<ReturnType<typeof startInteractiveReportServer>> | undefined;
  try {
    await page.goto(fixture.server.url);
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    const oldKey = capabilityStorageKey(
      new URL(page.url()).origin,
      new URL(page.url()).pathname,
      fixture.report.reportId
    );
    const oldCache = await page.evaluate((key) => sessionStorage.getItem(key), oldKey);
    await fixture.server.close();
    restarted = await startInteractiveReportServer(fixture.reportDirectory, {
      originBinding: fixture.report.origin
    });
    const cleanUrl = new URL(restarted.url);
    cleanUrl.hash = "";
    const key = capabilityStorageKey(cleanUrl.origin, cleanUrl.pathname, fixture.report.reportId);
    // Simulate restoration at a reused endpoint, even when the random restart port differs.
    await page.addInitScript(
      ({ storageKey, cache }) => {
        sessionStorage.setItem(storageKey, cache!);
      },
      { storageKey: key, cache: oldCache }
    );
    await page.goto(cleanUrl.href);
    await expect(page.getByRole("alert")).toContainText("Reopen the current server");
    expect(
      await page.evaluate((storageKey) => sessionStorage.getItem(storageKey) === null, key)
    ).toBe(true);
    await page.goto(restarted.url);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await addFeedbackComment(page.locator(".line-comment").first(), "Fresh server capability");
    await expect(page.locator(".thread-list")).toContainText("Fresh server capability");
    await expect(page.getByRole("button", { name: "Save comment", exact: true })).toHaveCount(0);
  } finally {
    await restarted?.close();
    await fixture.close();
  }
});

test("a different report on the same origin does not inherit the previous capability", async ({
  page
}) => {
  const fixture = await createPhase6ReviewFixture();
  try {
    await page.goto(fixture.server.url);
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    const otherReport = structuredClone(fixture.report);
    otherReport.reportId = "report-independent";
    otherReport.origin.reportId = otherReport.reportId;
    let apiRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/")) apiRequests += 1;
    });
    await page.route("**/report.json", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(otherReport) })
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    await page.getByRole("button", { name: "Start with highest attention" }).click();
    await expect(page.getByRole("button", { name: "Import review" })).toBeEnabled();
    expect(apiRequests).toBe(0);
  } finally {
    await fixture.close();
  }
});
