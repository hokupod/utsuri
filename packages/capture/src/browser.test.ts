import { afterEach, describe, expect, test } from "bun:test";
import { resolveBrowserExecutable } from "./browser";

const originalExplicitBrowser = process.env.UTSURI_BROWSER_EXECUTABLE;

afterEach(() => {
  if (originalExplicitBrowser === undefined) delete process.env.UTSURI_BROWSER_EXECUTABLE;
  else process.env.UTSURI_BROWSER_EXECUTABLE = originalExplicitBrowser;
});

describe("browser executable authorization", () => {
  test("rejects an invalid explicit executable without falling back", async () => {
    process.env.UTSURI_BROWSER_EXECUTABLE = "/nonexistent/utsuri-browser";

    await expect(resolveBrowserExecutable()).rejects.toMatchObject({
      diagnosticId: "CAPTURE_BROWSER_EXPLICIT_INVALID",
      exitCode: 3
    });
  });
});
