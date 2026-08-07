import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import {
  buildReport,
  createInitialReport,
  validateReportDirectory
} from "../../packages/report-builder/src";
import {
  approvedBrowserAvailable,
  captureConfig,
  freePort,
  repositoryRoot
} from "./capture-helpers";

const temporaryDirectories: string[] = [];
const browserTest = (await approvedBrowserAvailable()) ? test : test.skip;

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true })));
});

describe("failed-before-server", () => {
  browserTest(
    "preserves the successful after side in an INCOMPLETE partial report",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "utsuri-failed-before-"));
      temporaryDirectories.push(root);
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
      const config = normalizeCaptureConfig(
        captureConfig({
          mode: "worktree",
          beforePort,
          afterPort,
          beforeCommand: [process.execPath, "exit.mjs", "before.pid"],
          afterCommand: [process.execPath, "server.mjs", String(afterPort), "after.pid", "after"],
          beforeCwd: "before",
          afterCwd: "after"
        })
      );

      const captured = await captureRun(root, run, config, { allowProjectCode: true });
      expect(captured.complete).toBeFalse();
      expect(captured.manifest.targets[0]?.before.status).toBe("failed");
      expect(captured.manifest.targets[0]?.before.failure?.stage).toBe("server");
      expect(captured.manifest.targets[0]?.after.status).toBe("success");

      const report = await createInitialReport(run);
      expect(report.status).toBe("INCOMPLETE");
      expect(report.targets[0]?.before.status).toBe("failed");
      expect(report.targets[0]?.after.status).toBe("success");
      expect(report.summary.statement).not.toContain("no visual diff");
      const capturedScreenshot = captured.manifest.targets[0]?.after.screenshotRefs[0];
      expect(capturedScreenshot).toBeString();
      const originalScreenshot = await readFile(path.join(run, capturedScreenshot!));
      await writeFile(path.join(run, capturedScreenshot!), "tampered capture evidence\n");
      await expect(
        buildReport(run, report, { now: new Date(0), toolVersion: "0.1.0" })
      ).rejects.toMatchObject({ diagnosticId: "CAPTURE_ARTIFACT_INVALID" });
      await writeFile(path.join(run, capturedScreenshot!), originalScreenshot);
      const built = await buildReport(run, report, { now: new Date(0), toolVersion: "0.1.0" });
      const validated = await validateReportDirectory(built.reportDirectory, { strict: true });
      expect(validated.errors).toEqual([]);
      const persisted = JSON.parse(
        await readFile(path.join(built.reportDirectory, "report.json"), "utf8")
      ) as { status: string; targets: Array<{ after: { screenshotRefs: string[] } }> };
      expect(persisted.status).toBe("INCOMPLETE");
      const afterScreenshot = persisted.targets[0]?.after.screenshotRefs[0];
      expect(afterScreenshot).toBeString();
      expect(
        (await readFile(path.join(built.reportDirectory, afterScreenshot!))).byteLength
      ).toBeGreaterThan(0);

      await copyFile(
        path.join(repositoryRoot, "fixtures/failed-before-server/exit.mjs"),
        path.join(after, "exit.mjs")
      );
      const failedRun = path.join(root, "run-both-failed");
      await mkdir(failedRun, { mode: 0o700 });
      const failedConfig = normalizeCaptureConfig(
        captureConfig({
          mode: "worktree",
          beforePort: await freePort(),
          afterPort: await freePort(),
          beforeCommand: [process.execPath, "exit.mjs", "before-failed.pid"],
          afterCommand: [process.execPath, "exit.mjs", "after-failed.pid"],
          beforeCwd: "before",
          afterCwd: "after"
        })
      );
      const failedCapture = await captureRun(root, failedRun, failedConfig, {
        allowProjectCode: true
      });
      expect(
        failedCapture.manifest.targets.every(
          (target) => target.before.status === "failed" && target.after.status === "failed"
        )
      ).toBeTrue();
      const failedReport = await createInitialReport(failedRun);
      await writeFile(path.join(failedRun, "capture.json"), "{}\n");
      await expect(
        buildReport(failedRun, failedReport, { now: new Date(0), toolVersion: "0.1.0" })
      ).rejects.toMatchObject({ diagnosticId: "CAPTURE_ARTIFACT_INVALID" });
    },
    60_000
  );
});
