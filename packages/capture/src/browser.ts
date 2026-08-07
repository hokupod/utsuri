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
  const candidates = [
    process.env.UTSURI_BROWSER_EXECUTABLE,
    platform() === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    platform() === "darwin" ? "/Applications/Chromium.app/Contents/MacOS/Chromium" : undefined
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const resolved = await executable(candidate);
    if (resolved) return resolved;
  }
  for (const command of ["chromium", "chromium-browser", "google-chrome"]) {
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
    "No approved existing Chrome or Chromium executable was found",
    ExitCode.Environment
  );
}
