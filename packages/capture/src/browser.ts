import { execFileSync } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { platform } from "node:os";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

async function executable(filename: string): Promise<string | null> {
  if (!path.isAbsolute(filename)) return null;
  try {
    await access(filename, constants.X_OK);
    return await realpath(filename);
  } catch {
    return null;
  }
}

export async function resolveBrowserExecutable(): Promise<string> {
  const explicit = process.env.UTSURI_BROWSER_EXECUTABLE;
  if (explicit) {
    const resolved = await executable(explicit);
    if (resolved) return resolved;
    throw new UtsuriError(
      "CAPTURE_BROWSER_EXPLICIT_INVALID",
      "UTSURI_BROWSER_EXECUTABLE must name an existing executable absolute path",
      ExitCode.Environment
    );
  }

  try {
    const { chromium } = await import("playwright-core");
    const managed = await executable(chromium.executablePath());
    if (managed) return managed;
  } catch {
    // Continue to an existing headless-compatible executable on PATH.
  }

  for (const command of ["chrome-headless-shell", "chromium", "chromium-browser"]) {
    try {
      const candidate = execFileSync("which", [command], {
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      const resolved = await executable(candidate);
      if (resolved) return resolved;
    } catch {
      // Try the next standard executable name.
    }
  }
  throw new UtsuriError(
    "CAPTURE_BROWSER_UNAVAILABLE",
    platform() === "darwin"
      ? "No version-matched Playwright browser or approved headless Chromium was found; set UTSURI_BROWSER_EXECUTABLE to explicitly authorize another executable"
      : "No version-matched Playwright browser or approved headless Chromium executable was found",
    ExitCode.Environment
  );
}
