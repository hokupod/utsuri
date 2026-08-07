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

  test("normalizes container mode with non-weakening isolation defaults", () => {
    const value = baseConfig();
    value.execution.mode = "container";
    value.execution.trust = "untrusted";
    value.servers!.before = {
      command: ["node", "server.mjs"],
      cwd: "before",
      readyUrl: "http://127.0.0.1:4173/"
    };
    value.servers!.after = {
      command: ["node", "server.mjs"],
      cwd: "after",
      readyUrl: "http://127.0.0.1:4174/"
    };
    value.container = {
      engine: "docker",
      image: `example.invalid/utsuri@sha256:${"a".repeat(64)}`,
      network: "none",
      readOnlyRoot: true,
      noNewPrivileges: true,
      capDrop: ["ALL"],
      mountProjectReadOnly: true
    };
    const normalized = normalizeCaptureConfig(value);
    expect(normalized.mode).toBe("container");
    expect(normalized.container).toMatchObject({ pidsLimit: 64, cpus: 1, tmpfsMiB: 64 });
    expect(normalized.limits).toEqual({
      maxDiffLines: 2_000_000,
      maxImagePixels: 80_000_000,
      maxTimeMs: 1000,
      maxMemoryMiB: 512,
      maxArtifactBytes: 16 * 1024 * 1024
    });
  });

  test("rejects weakened container controls and host-side origins", () => {
    const containerConfig = () => {
      const value = baseConfig();
      value.execution.mode = "container";
      value.execution.trust = "untrusted";
      value.servers!.before = {
        command: ["node", "server.mjs"],
        cwd: "before",
        readyUrl: "http://127.0.0.1:4173/"
      };
      value.servers!.after = {
        command: ["node", "server.mjs"],
        cwd: "after",
        readyUrl: "http://127.0.0.1:4174/"
      };
      value.container = {
        engine: "docker",
        image: `example.invalid/utsuri@sha256:${"a".repeat(64)}`,
        network: "none",
        readOnlyRoot: true,
        noNewPrivileges: true,
        capDrop: ["ALL"],
        mountProjectReadOnly: true
      };
      return value;
    };
    const weakened = containerConfig();
    weakened.container!.capDrop = [] as unknown as ["ALL"];
    expect(() => normalizeCaptureConfig(weakened)).toThrow(
      "container isolation controls cannot be weakened"
    );

    const withEnvironment = containerConfig();
    withEnvironment.security = { envAllowlist: ["NODE_ENV"] };
    expect(() => normalizeCaptureConfig(withEnvironment)).toThrow(
      "never passes host environment allowlist"
    );

    const withHostOrigin = containerConfig();
    withHostOrigin.network = { allowedOrigins: ["http://127.0.0.1:9999"] };
    expect(() => normalizeCaptureConfig(withHostOrigin)).toThrow(
      "only through its identity-bound proxy"
    );
  });

  test("does not execute commands in dual-url mode", () => {
    const value = baseConfig();
    value.servers!.before!.command = ["bun", "run", "dev"];
    expect(() => normalizeCaptureConfig(value)).toThrow("dual-url never starts");
  });

  test("limits untrusted input to isolated modes", () => {
    const value = baseConfig();
    value.execution.trust = "untrusted";
    expect(() => normalizeCaptureConfig(value)).toThrow(
      "untrusted capture requires static-fragment or container isolation"
    );
  });

  test("rejects duplicate target viewports before capture", () => {
    const value = baseConfig();
    value.targets![0]!.viewports = ["test", "test"];
    expect(() => normalizeCaptureConfig(value)).toThrow("viewports must be unique");
  });
});
