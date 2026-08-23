import { expect, test, type Browser, type Page, type Route, type TestInfo } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { startStaticReportServer, viewerDocument } from "../../packages/interactive-server/src";
import type { UtsuriReport } from "../../packages/report-model/src";

const root = path.resolve(import.meta.dirname, "../..");
const fixture = path.join(root, "fixtures/code-only-review/expected/report");
const visualEvidence = path.join(root, ".artifacts/phase-1-ui");
const report = JSON.parse(
  await readFile(path.join(fixture, "report.json"), "utf8")
) as UtsuriReport;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function serveReport(
  page: Page,
  reportLanguage = report.language,
  sourceReport: UtsuriReport = report
): Promise<void> {
  const overview = /^ja(?:-|$)/iu.test(reportLanguage)
    ? "ナビゲーションの実装、テスト、スタイル、安全性を意味単位でまとめたレビューです。"
    : "A semantic review of the navigation implementation, tests, styles, and safety boundary.";
  const changes = sourceReport.changes.map((change) => ({
    ...change,
    hunkExplanations: change.hunkRefs.map((hunkRef) => {
      const changedPath =
        sourceReport.hunks.find((hunk) => hunk.id === hunkRef)?.path ?? "changed file";
      return /^ja(?:-|$)/iu.test(reportLanguage)
        ? {
            hunkRef,
            purpose: `${changedPath} の変更目的を差分単位で示します。`,
            meaning: `この差分は ${changedPath} のレビュー対象となる変更を表します。`
          }
        : {
            hunkRef,
            purpose: `Explain the purpose of the change in ${changedPath}.`,
            meaning: `This hunk is the reviewable change in ${changedPath}.`
          };
    })
  }));
  await page.route("http://utsuri.test/**", async (route: Route) => {
    const requestPath = new URL(route.request().url()).pathname;
    const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
    if (relative.includes("..")) return await route.abort("blockedbyclient");
    const filename = path.join(fixture, relative);
    try {
      const body = await readFile(filename);
      await route.fulfill({
        status: 200,
        contentType: contentTypes[path.extname(filename)] ?? "application/octet-stream",
        body:
          relative === "index.html"
            ? viewerDocument(body.toString("utf8"), "interactive")
            : relative === "report.json"
              ? `${JSON.stringify({
                  ...sourceReport,
                  language: reportLanguage,
                  summary: { ...sourceReport.summary, overview },
                  changes
                })}\n`
              : body
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
  await page.goto("http://utsuri.test/index.html");
  await expect(page.locator("#summary-heading")).toBeVisible();
}

async function newFixturePage(
  browser: Browser,
  options: {
    locale: string;
    reportLanguage: string;
    colorScheme: "light" | "dark";
    width: number;
    deviceScaleFactor?: number;
  }
) {
  const context = await browser.newContext({
    locale: options.locale,
    colorScheme: options.colorScheme,
    viewport: { width: options.width, height: 900 },
    deviceScaleFactor: options.deviceScaleFactor ?? 1
  });
  const page = await context.newPage();
  await serveReport(page, options.reportLanguage);
  return { context, page };
}

test("loads the full code review from the default static server", async ({ page }) => {
  const server = await startStaticReportServer(fixture);
  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change map" })).toBeVisible();
    await expect(page.locator(".focused-change")).toHaveCount(0);
    await page.getByRole("link", { name: /src\/malicious\.ts/u }).click();
    await expect(page.getByRole("heading", { name: "Agent interpretation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Code diff" })).toBeVisible();
    await expect(page.locator(".hunk")).toHaveCount(report.changes[0]?.hunkRefs.length ?? 0);
    await expect(page.locator(".hunk-explanation")).toHaveCount(0);
  } finally {
    await server.close();
  }
});

test("prioritizes medium risk ahead of lower-risk uncertainty", async ({ page }) => {
  const priorityReport = structuredClone(report);
  const lowUnknown = priorityReport.changes[0]!;
  lowUnknown.risk.level = "low";
  lowUnknown.intent.source = "unknown";
  lowUnknown.verification.gaps = ["Runtime behavior was not executed."];
  const mediumKnown = priorityReport.changes[1]!;
  mediumKnown.risk.level = "medium";
  mediumKnown.intent.source = "declared";
  mediumKnown.verification.gaps = [];

  await serveReport(page, "en", priorityReport);

  const reviewRoute = page.locator(".review-route");
  await expect(reviewRoute.getByRole("heading", { level: 3 })).toHaveText(mediumKnown.title);
  await expect(reviewRoute.locator(".route-status")).toHaveText("Needs confirmation");
  await expect(page.locator(".review-map li").first().locator("strong")).toHaveText(
    mediumKnown.title
  );
  await expect(
    page.locator('.queue-section[data-queue="needs-confirmation"] li').first().locator("strong")
  ).toHaveText(mediumKnown.title);
  await page.keyboard.press("j");
  await expect(page.locator("article.focused-change h2")).toHaveText(mediumKnown.title);
});

test("renders every hunk from structured data without executing diff text", async ({ page }) => {
  await serveReport(page);

  await expect(page.getByRole("banner").getByText("UNCOVERED", { exact: true })).toBeVisible();
  await expect(page.locator(".review-overview")).toContainText("semantic review");
  await page.getByRole("link", { name: /src\/malicious\.ts/u }).click();
  await expect(page.getByText("Visual verification has not run")).toBeVisible();
  await expect(page.getByText(/<img src=x onerror=/u)).toBeVisible();
  await expect(page.locator(".hunk-explanation")).toHaveCount(
    report.changes[0]?.hunkRefs.length ?? 0
  );
  await expect(page.locator(".hunk-explanation").first()).toContainText("Purpose");
  await expect(page.locator(".hunk-explanation").first()).toContainText(
    "This hunk is the reviewable change"
  );
  expect(
    await page.evaluate(() => (window as unknown as { __utsuriXss?: number }).__utsuriXss)
  ).toBeUndefined();
  await expect(page.locator("img[src='x']")).toHaveCount(0);

  for (const hunk of report.hunks) {
    await page.goto(`http://utsuri.test/index.html#hunk=${encodeURIComponent(hunk.id)}`);
    await expect(
      page.locator(`[id="hunk-${hunk.id.replace(/[^a-zA-Z0-9_-]/gu, "-")}"]`)
    ).toBeFocused();
  }

  await page.getByRole("button", { name: "Side by side" }).click();
  await expect(page.locator(".split-row").first()).toBeVisible();
});

test("keeps the queue-change-hunk-queue path keyboard-only", async ({ page }, testInfo) => {
  await serveReport(page);
  const queueLink = page.locator(".queue-section a").first();
  await queueLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".focused-change")).toBeFocused();

  const anchor = page.getByRole("button", { name: /Link to hunk in/u }).first();
  await anchor.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".hunk.active-hunk")).toBeFocused();

  const backChange = page.getByRole("button", { name: /Back to focused change/u });
  await backChange.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".focused-change")).toBeFocused();
  const backQueue = page.getByRole("button", { name: /Back to review queue/u });
  await backQueue.focus();
  await page.keyboard.press("Enter");
  await expect(queueLink).toBeFocused();

  const focusRecord = `${JSON.stringify({ path: ["queue", "change", "hunk", "change", "queue"], result: "pass" }, null, 2)}\n`;
  await mkdir(visualEvidence, { recursive: true });
  await writeFile(path.join(visualEvidence, "focus-record.json"), focusRecord);
  await testInfo.attach("focus-record.json", {
    contentType: "application/json",
    body: Buffer.from(focusRecord)
  });
});

test("preserves hierarchy across language, theme, viewport, and 200% zoom", async ({
  browser
}, testInfo: TestInfo) => {
  const scenarios = [
    {
      name: "english-light-1024",
      locale: "en-US",
      reportLanguage: "en",
      colorScheme: "light" as const,
      width: 1024
    },
    {
      name: "japanese-dark-1280",
      locale: "en-US",
      reportLanguage: "ja",
      colorScheme: "dark" as const,
      width: 1280
    },
    {
      name: "english-light-1440",
      locale: "ja-JP",
      reportLanguage: "en",
      colorScheme: "light" as const,
      width: 1440
    }
  ];
  await mkdir(visualEvidence, { recursive: true });
  for (const scenario of scenarios) {
    const { context, page } = await newFixturePage(browser, scenario);
    if (scenario.reportLanguage === "ja") {
      await expect(page.getByRole("heading", { name: "レビュー要旨" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("ja");
      await expect(
        page.getByLabel("レビュー経路").getByText("確認が必要", { exact: true })
      ).toBeVisible();
      await expect(
        page
          .getByText(
            "0件を検証済み、既知の利用件数は不明。ほかの利用箇所が存在する可能性があります",
            {
              exact: true
            }
          )
          .first()
      ).toBeVisible();
      await expect(page.locator(".map-meta").first()).toContainText(/\d+ファイル/u);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${scenario.name} page overflow`
    ).toBe(true);
    const screenshot = await page.screenshot({
      fullPage: true,
      path: path.join(visualEvidence, `${scenario.name}.png`)
    });
    await testInfo.attach(`${scenario.name}.png`, {
      contentType: "image/png",
      body: screenshot
    });
    await context.close();
  }

  const { context, page } = await newFixturePage(browser, {
    locale: "en-US",
    reportLanguage: "en",
    colorScheme: "light",
    width: 512,
    deviceScaleFactor: 2
  });
  await expect(page.getByRole("heading", { name: "Review brief" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
  const zoomScreenshot = await page.screenshot({
    fullPage: true,
    path: path.join(visualEvidence, "english-light-1024-zoom-200.png")
  });
  await testInfo.attach("english-light-1024-zoom-200.png", {
    contentType: "image/png",
    body: zoomScreenshot
  });
  await context.close();
});
