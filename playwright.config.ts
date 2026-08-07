import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

function browserExecutable(): string {
  const candidates = [
    process.env.UTSURI_BROWSER_EXECUTABLE,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    process.platform === "darwin" ? "/Applications/Chromium.app/Contents/MacOS/Chromium" : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return realpathSync(candidate);
  }
  for (const command of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      const candidate = execFileSync("which", [command], { encoding: "utf8" }).trim();
      if (candidate && existsSync(candidate)) return realpathSync(candidate);
    } catch {
      // Try the next standard executable name.
    }
  }
  throw new Error(
    "No approved system Chrome/Chromium was found; set UTSURI_BROWSER_EXECUTABLE to an executable file"
  );
}

export default defineConfig({
  testDir: "tests",
  outputDir: ".artifacts/playwright",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    browserName: "chromium",
    headless: true,
    locale: "en-US",
    colorScheme: "light",
    launchOptions: { executablePath: browserExecutable() },
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "code-only",
      testMatch: /e2e\/code-only\.spec\.ts/u
    },
    {
      name: "capture",
      testMatch: /e2e\/capture\.spec\.ts/u
    },
    {
      name: "failed-before-server",
      testMatch: /e2e\/failed-before-server\.spec\.ts/u
    },
    {
      name: "comparison",
      testMatch: /e2e\/comparison\.spec\.ts/u
    },
    {
      name: "global-token-change",
      testMatch: /e2e\/global-token-change\.spec\.ts/u
    },
    {
      name: "report-visual",
      testMatch: /e2e\/report-visual\.spec\.ts/u
    },
    {
      name: "a11y",
      testMatch: /a11y\/.*\.spec\.ts/u
    }
  ]
});
