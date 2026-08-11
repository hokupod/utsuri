import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");

describe("Plugin runtime probe fixture", () => {
  test("records only the requested synthetic host inputs", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "utsuri-probe-fixture-test-"));
    const observation = path.join(directory, "observation.json");
    try {
      const child = spawnSync(
        process.execPath,
        [path.join(root, "fixtures/plugin-runtime/probe-server.mjs"), observation],
        {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            CODEX_THREAD_ID: "synthetic-codex",
            UTSURI_PROBE_DENIED_SENTINEL: "synthetic-denied"
          },
          input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
          encoding: "utf8"
        }
      );
      expect(child.status).toBe(0);
      const response = JSON.parse(child.stdout.trim());
      expect(response.result.tools[0].name).toBe("probe_environment");
      const observed = JSON.parse(readFileSync(observation, "utf8"));
      expect(observed.cwd).toBe(realpathSync(directory));
      expect(observed.env).toEqual({
        CODEX_THREAD_ID: "synthetic-codex",
        CLAUDE_PROJECT_DIR: null,
        CLAUDE_CODE_SESSION_ID: null,
        UTSURI_PROBE_DENIED_SENTINEL: "synthetic-denied"
      });
      expect(observed.methods).toEqual(["tools/list"]);
      expect(JSON.stringify(observed)).not.toContain("HOME");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("rejects floating host versions before launching a host", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts/plugin-runtime-probe.mjs"),
        "--host",
        "codex",
        "--version",
        "latest"
      ],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exact complete SemVer");
  });
});
