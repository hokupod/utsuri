import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

function browserExecutable(): string | undefined {
  const explicit = process.env.UTSURI_BROWSER_EXECUTABLE;
  if (explicit) {
    if (!path.isAbsolute(explicit) || !existsSync(explicit)) {
      throw new Error("UTSURI_BROWSER_EXECUTABLE must name an existing absolute path");
    }
    return realpathSync(explicit);
  }

  for (const command of ["chrome-headless-shell", "chromium", "chromium-browser"]) {
    try {
      const candidate = execFileSync("which", [command], { encoding: "utf8" }).trim();
      if (candidate && existsSync(candidate)) return realpathSync(candidate);
    } catch {
      // Try the next standard executable name.
    }
  }
  // Leaving executablePath unset selects Playwright's managed, version-matched browser.
  return undefined;
}

const executablePath = browserExecutable();

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
    launchOptions: executablePath ? { executablePath } : undefined,
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
      name: "review-state",
      testMatch: /e2e\/review-state\.spec\.ts/u
    },
    {
      name: "a11y",
      testMatch: /a11y\/.*\.spec\.ts/u
    }
  ]
});
