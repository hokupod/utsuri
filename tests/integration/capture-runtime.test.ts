import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import {
  assertPortReleased,
  captureConfig,
  freePort,
  repositoryRoot,
  startFixtureServer,
  stopFixtureServer
} from "./capture-helpers";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true })));
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

describe("capture-runtime", () => {
  test("captures dual-url evidence in isolated contexts with a stable hash", async () => {
    const root = await temporaryRoot("utsuri-dual-url-");
    const beforePort = await freePort();
    const afterPort = await freePort();
    const beforeServer = await startFixtureServer(beforePort, "before");
    const afterServer = await startFixtureServer(afterPort, "after");
    try {
      const config = normalizeCaptureConfig(
        captureConfig({ mode: "dual-url", beforePort, afterPort })
      );
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      const first = await captureRun(root, run, config);
      const second = await captureRun(root, run, config);
      expect(first.complete).toBeTrue();
      expect(first.manifest.targets[0]?.before.status).toBe("success");
      expect(first.manifest.targets[0]?.after.status).toBe("success");
      expect(second.reusedSides).toBe(2);
      expect(first.manifest.captureHash).toBe(second.manifest.captureHash);
      const beforeResult = first.manifest.targets[0]!.before;
      for (const reference of [beforeResult.domRef, beforeResult.consoleRef]) {
        const evidence = await readFile(path.join(run, reference!), "utf8");
        expect(evidence).not.toMatch(
          /user:password|token=(?:secret|relative|root|filename|parenthesized)|code=bare|access_token=|#fragment/u
        );
        expect(evidence).toContain("https://example.test/private");
        expect(evidence).toContain("//example.test/protocol");
        expect(evidence).toContain("/callback");
      }

      const report = await createInitialReport(run);
      const built = await buildReport(run, report, {
        now: new Date(0),
        toolVersion: "0.1.0"
      });
      for (const reference of [
        report.targets[0]?.before.domRef,
        report.targets[0]?.before.consoleRef
      ]) {
        expect(reference).toBeString();
        const persistedEvidence = await readFile(
          path.join(built.reportDirectory, reference!),
          "utf8"
        );
        expect(persistedEvidence).not.toMatch(
          /user:password|token=(?:secret|relative|root|filename|parenthesized)|code=bare|access_token=|#fragment/u
        );
      }

      const beforeDom = first.manifest.targets[0]?.before.domRef;
      expect(beforeDom).toBeString();
      await writeFile(path.join(run, beforeDom!), '{"tampered":true}\n');
      const repaired = await captureRun(root, run, config);
      expect(repaired.reusedSides).toBe(1);

      const changedConfig = normalizeCaptureConfig(
        captureConfig({ mode: "dual-url", beforePort, afterPort })
      );
      changedConfig.stabilization.waitAfterReadyMs += 1;
      const invalidated = await captureRun(root, run, changedConfig);
      expect(invalidated.reusedSides).toBe(0);
    } finally {
      await Promise.all([stopFixtureServer(beforeServer), stopFixtureServer(afterServer)]);
    }
  }, 60_000);

  test("captures sanitized static fragments with JavaScript disabled", async () => {
    const root = await temporaryRoot("utsuri-static-fragment-");
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await Promise.all([
      copyFile(
        path.join(repositoryRoot, "fixtures/dynamic-content/before.html"),
        path.join(root, "before.html")
      ),
      copyFile(
        path.join(repositoryRoot, "fixtures/dynamic-content/after.html"),
        path.join(root, "after.html")
      )
    ]);
    const config = normalizeCaptureConfig(
      captureConfig({
        mode: "static-fragment",
        fragments: { before: "before.html", after: "after.html" }
      })
    );
    const result = await captureRun(root, run, config);
    expect(result.complete).toBeTrue();
    const axeRef = result.manifest.targets[0]?.before.axeRef;
    expect(axeRef).toBeString();
    const axe = JSON.parse(await readFile(path.join(run, axeRef!), "utf8")) as {
      status: string;
      reason?: string;
    };
    expect(axe).toEqual({ status: "skipped", reason: "javascript-disabled-static-fragment" });
    const domRef = result.manifest.targets[0]?.before.domRef;
    const dom = await readFile(path.join(run, domRef!), "utf8");
    expect(dom).not.toContain("utsuriUnsafeScriptExecuted");
  }, 30_000);

  test("starts only explicit worktree commands and cleans both process groups", async () => {
    const root = await temporaryRoot("utsuri-worktree-");
    const run = path.join(root, "run");
    const before = path.join(root, "before");
    const after = path.join(root, "after");
    await Promise.all([mkdir(run, { mode: 0o700 }), mkdir(before), mkdir(after)]);
    const fixture = path.join(repositoryRoot, "fixtures/dynamic-content/server.mjs");
    await Promise.all([
      copyFile(fixture, path.join(before, "server.mjs")),
      copyFile(fixture, path.join(after, "server.mjs"))
    ]);
    const beforePort = await freePort();
    const afterPort = await freePort();
    const config = normalizeCaptureConfig(
      captureConfig({
        mode: "worktree",
        beforePort,
        afterPort,
        beforeCommand: [process.execPath, "server.mjs", String(beforePort), "before.pid", "before"],
        afterCommand: [process.execPath, "server.mjs", String(afterPort), "after.pid", "after"],
        beforeCwd: "before",
        afterCwd: "after"
      })
    );
    await expect(captureRun(root, run, config)).rejects.toMatchObject({
      diagnosticId: "CAPTURE_WORKTREE_CONSENT_REQUIRED"
    });
    const result = await captureRun(root, run, config, { allowProjectCode: true });
    expect(result.complete).toBeTrue();
    await Promise.all([assertPortReleased(beforePort), assertPortReleased(afterPort)]);
    for (const [directory, filename] of [
      [before, "before.pid"],
      [after, "after.pid"]
    ] as const) {
      const pid = Number((await readFile(path.join(directory, filename), "utf8")).trim());
      expect(() => process.kill(pid, 0)).toThrow();
    }
  }, 60_000);
});
