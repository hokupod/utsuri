import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { UtsuriReport } from "../../packages/report-model/src";
import { repositoryRoot } from "../integration/capture-helpers";
import {
  phase3ReportFixture,
  servePhase3Report,
  type Phase3ReportServeOptions
} from "./phase3-report-fixture";

const visualEvidence = path.join(repositoryRoot, ".artifacts/phase-3-ui");
type VisualState = "partial" | "long-dense" | "empty" | "loading";
interface VisualScenario {
  name: string;
  locale: string;
  colorScheme: "light" | "dark";
  width: number;
  deviceScaleFactor?: number;
  reducedMotion?: "reduce" | "no-preference";
  state: VisualState;
}
const matrix = JSON.parse(
  await readFile(path.join(repositoryRoot, "fixtures/report-ui/visual/matrix.json"), "utf8")
) as { schemaVersion: "1.0"; scenarios: VisualScenario[] };

test.setTimeout(90_000);

async function visualPage(
  browser: Browser,
  options: VisualScenario,
  serveOptions: Phase3ReportServeOptions = {}
): Promise<Page> {
  const context = await browser.newContext({
    locale: options.locale,
    colorScheme: options.colorScheme,
    viewport: { width: options.width, height: 900 },
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
    reducedMotion: options.reducedMotion ?? "no-preference"
  });
  const page = await context.newPage();
  await servePhase3Report(page, serveOptions);
  return page;
}

function denseReport(source: UtsuriReport): UtsuriReport {
  const report = structuredClone(source);
  const longPath = `src/components/checkout/payment-method-selector/${"nested/".repeat(10)}PaymentMethodSelectorWithAnIntentionallyLongName.svelte`;
  if (report.files[0]) report.files[0].newPath = longPath;
  if (report.hunks[0]) report.hunks[0].path = longPath;
  if (report.changes[0]) report.changes[0].title = longPath;
  const templates = report.findings;
  report.findings = Array.from({ length: 24 }, (_, index) => ({
    ...templates[index % templates.length]!,
    id: `visual-fixture-finding-${String(index + 1).padStart(2, "0")}`,
    title: `Measured finding ${index + 1}: ${longPath}`
  }));
  if (report.changes[0]) report.changes[0].findingRefs = report.findings.map((entry) => entry.id);
  return report;
}

test("keeps hierarchy, focus, and reflow in the visual evidence matrix", async ({
  browser
}, testInfo: TestInfo) => {
  testInfo.setTimeout(90_000);
  expect(matrix.schemaVersion).toBe("1.0");
  const fixture = await phase3ReportFixture();
  const empty = JSON.parse(
    await readFile(path.join(repositoryRoot, "fixtures/schemas/valid/report.empty.json"), "utf8")
  ) as UtsuriReport;
  await mkdir(visualEvidence, { recursive: true });

  for (const scenario of matrix.scenarios) {
    const report =
      scenario.state === "long-dense"
        ? denseReport(fixture.report)
        : scenario.state === "empty"
          ? empty
          : fixture.report;
    const page = await visualPage(browser, scenario, {
      report,
      reportDelayMs: scenario.state === "loading" ? 1200 : undefined
    });

    if (scenario.state === "loading") {
      await expect(page.getByRole("status")).toHaveText("Loading review data…");
    } else {
      await expect(page.locator("#summary-heading")).toBeVisible();
    }
    if (scenario.state === "empty") {
      await expect(page.getByRole("heading", { name: "No semantic changes" })).toBeVisible();
    } else if (scenario.state !== "loading") {
      await expect(page.locator(".visual-evidence-section")).toBeVisible();
    }
    if (scenario.locale === "ja-JP") {
      await expect(page.getByRole("heading", { name: "画面比較" })).toBeVisible();
    }
    if (scenario.state === "partial") {
      await expect(page.locator('.report-state[data-status="INCOMPLETE"]')).toBeVisible();
    }
    if (scenario.state === "long-dense") {
      await expect(page.locator(".finding-list article")).toHaveCount(24);
      await expect(
        page.getByText(/PaymentMethodSelectorWithAnIntentionallyLongName\.svelte/u).first()
      ).toBeVisible();
    }
    if (scenario.reducedMotion === "reduce") {
      const blink = page.getByRole("button", { name: "Blink", exact: true });
      await expect(blink).toBeDisabled();
      await page.keyboard.press("4");
      await expect(
        page
          .getByRole("group", { name: "Visual comparison" })
          .getByRole("button", { name: "Side by side", exact: true })
      ).toHaveAttribute("aria-pressed", "true");
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${scenario.name} page overflow`
    ).toBe(true);
    const focusedControl = page.locator(".visual-mode-control button, .queue-search input").first();
    if ((await focusedControl.count()) > 0) {
      await focusedControl.focus();
      expect(
        await focusedControl.evaluate((element) => getComputedStyle(element).outlineStyle)
      ).not.toBe("none");
    }
    const screenshot = await page.screenshot({
      fullPage: true,
      path: path.join(visualEvidence, `${scenario.name}.png`)
    });
    await testInfo.attach(`${scenario.name}.png`, { contentType: "image/png", body: screenshot });
    if (scenario.state === "loading") {
      await expect(page.locator("#summary-heading")).toBeVisible();
    }
    await page.context().close();
  }
});
