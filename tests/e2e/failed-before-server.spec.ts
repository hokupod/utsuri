import { expect, test } from "@playwright/test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { captureConfig, freePort, repositoryRoot } from "../integration/capture-helpers";

const bundledCli = path.join(repositoryRoot, "skills/utsuri-review/scripts/utsuri.mjs");

function runCli(cwd: string, arguments_: string[]) {
  const result = spawnSync(process.execPath, [bundledCli, ...arguments_, "--json"], {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return { ...result, json: JSON.parse(result.stdout) as Record<string, unknown> };
}

test("failed before server remains incomplete while after evidence survives", async () => {
  test.setTimeout(60_000);
  const root = await mkdtemp(path.join(tmpdir(), "utsuri-failed-before-e2e-"));
  try {
    const run = path.join(root, "run");
    const before = path.join(root, "before");
    const after = path.join(root, "after");
    await Promise.all([
      mkdir(run, { mode: 0o700 }),
      mkdir(before, { mode: 0o700 }),
      mkdir(after, { mode: 0o700 })
    ]);
    await writeFile(path.join(run, "input.json"), '{"mode":"failure-fixture"}\n');
    await Promise.all([
      copyFile(
        path.join(repositoryRoot, "fixtures/failed-before-server/exit.mjs"),
        path.join(before, "exit.mjs")
      ),
      copyFile(
        path.join(repositoryRoot, "fixtures/dynamic-content/server.mjs"),
        path.join(after, "server.mjs")
      )
    ]);
    const beforePort = await freePort();
    const afterPort = await freePort();
    const config = captureConfig({
      mode: "worktree",
      beforePort,
      afterPort,
      beforeCommand: [process.execPath, "exit.mjs"],
      afterCommand: [process.execPath, "server.mjs", String(afterPort)],
      beforeCwd: "before",
      afterCwd: "after"
    });
    await writeFile(path.join(root, "utsuri.yml"), stringify(config));
    const denied = runCli(root, ["capture", "--run", "run", "--config", "utsuri.yml"]);
    expect(denied.status, denied.stderr).toBe(6);
    expect((denied.json.error as { id: string }).id).toBe("CAPTURE_WORKTREE_CONSENT_REQUIRED");
    const execution = runCli(root, [
      "capture",
      "--run",
      "run",
      "--config",
      "utsuri.yml",
      "--allow-project-code"
    ]);
    expect(execution.status, execution.stderr).toBe(4);
    expect(execution.json.ok).toBe(false);
    const finalized = runCli(root, ["finalize", "--run", "run"]);
    expect(finalized.status, finalized.stderr).toBe(0);
    const captured = JSON.parse(await readFile(path.join(run, "capture.json"), "utf8")) as {
      targets: Array<{ before: { status: string }; after: { status: string } }>;
    };
    const report = JSON.parse(await readFile(path.join(run, "report/report.json"), "utf8")) as {
      status: string;
      summary: { statement: string };
      targets: Array<{ after: { screenshotRefs: string[] } }>;
    };
    expect(captured.targets[0]?.before.status).toBe("failed");
    expect(captured.targets[0]?.after.status).toBe("success");
    expect(report.status).toBe("INCOMPLETE");
    expect(report.targets[0]?.after.screenshotRefs.length).toBeGreaterThan(0);
    expect(report.summary.statement.toLowerCase()).not.toContain("no visual diff");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
