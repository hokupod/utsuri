import { describe, expect, test } from "bun:test";
import type { UtsuriConfig } from "@utsu-ri/report-model";
import { normalizeCaptureConfig } from "./config";

function baseConfig(): UtsuriConfig {
  return {
    version: 1,
    project: { name: "config-test" },
    diff: { base: "HEAD", head: "worktree" },
    execution: {
      mode: "dual-url",
      trust: "configured",
      install: "never",
      shell: false,
      timeoutMs: 1000
    },
    servers: {
      before: { readyUrl: "http://127.0.0.1:4173/" },
      after: { readyUrl: "http://127.0.0.1:4174/" }
    },
    viewports: { test: { width: 320, height: 240, deviceScaleFactor: 1 } },
    targets: [{ id: "home", path: "/", viewports: ["test"], states: [{ name: "default" }] }],
    report: { outputDirectory: "run", singleFile: false, includeAbsolutePaths: false },
    review: { enabled: true, autoResolveAgentAnswer: false },
    feedback: {
      target: "origin-session",
      delivery: "return-to-session",
      neverCreateNewSession: true
    },
    policy: { failOn: [], warnOn: [] }
  };
}

describe("capture configuration", () => {
  test("uses bounded deterministic defaults", () => {
    const config = normalizeCaptureConfig(baseConfig());
    expect(config.mode).toBe("dual-url");
    expect(config.stabilization.maxRetries).toBe(1);
    expect(config.network.blockMethods).toEqual(["POST", "PUT", "PATCH", "DELETE"]);
    expect(config.browser).toMatchObject({ locale: "en-US", timezone: "UTC" });
  });

  test("rejects forbidden actions before a browser can start", () => {
    const value = baseConfig();
    value.targets![0]!.states[0]!.steps = [{ evaluate: { script: "document.body.remove()" } }];
    try {
      normalizeCaptureConfig(value);
      throw new Error("forbidden action unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({ diagnosticId: "CAPTURE_ACTION_INVALID", exitCode: 2 });
    }
  });

  test("publishes container mode as an unavailable machine capability", () => {
    const value = baseConfig();
    value.execution.mode = "container";
    try {
      normalizeCaptureConfig(value);
      throw new Error("container unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({
        diagnosticId: "CAPTURE_MODE_UNAVAILABLE",
        details: {
          mode: "container",
          capability: { supported: false, availablePhase: 4 }
        }
      });
    }
  });

  test("does not execute commands in dual-url mode", () => {
    const value = baseConfig();
    value.servers!.before!.command = ["bun", "run", "dev"];
    expect(() => normalizeCaptureConfig(value)).toThrow("dual-url never starts");
  });

  test("limits untrusted input to static-fragment", () => {
    const value = baseConfig();
    value.execution.trust = "untrusted";
    expect(() => normalizeCaptureConfig(value)).toThrow("untrusted capture is limited");
  });

  test("rejects duplicate target viewports before capture", () => {
    const value = baseConfig();
    value.targets![0]!.viewports = ["test", "test"];
    expect(() => normalizeCaptureConfig(value)).toThrow("viewports must be unique");
  });
});
