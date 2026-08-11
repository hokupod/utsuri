import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  startInteractiveReportServer,
  type InteractiveReportServer
} from "../../packages/interactive-server/src";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import type { UtsuriReport } from "../../packages/report-model/src";
import { bindReportToCurrentSession } from "../../packages/cli/src/feedback";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

export interface Phase6ReviewFixture {
  root: string;
  run: string;
  reportDirectory: string;
  report: UtsuriReport;
  server: InteractiveReportServer;
  close(): Promise<void>;
}

export interface Phase6RunFixture {
  root: string;
  run: string;
  reportDirectory: string;
  report: UtsuriReport;
  close(): Promise<void>;
}

export async function createPhase6RunFixture(
  environment: NodeJS.ProcessEnv = { CODEX_THREAD_ID: "codex-origin-session" }
): Promise<Phase6RunFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-phase-6-e2e-"));
  const run = path.join(root, "run");
  try {
    await mkdir(run);
    const source = path.join(repositoryRoot, "fixtures/code-only-review/expected");
    for (const filename of [
      "input.json",
      "diff.json",
      "diff.patch",
      "evidence-index.json",
      "review-plan.json"
    ]) {
      await cp(path.join(source, filename), path.join(run, filename));
    }
    await mkdir(path.join(run, "logs"));
    await cp(path.join(source, "logs/collect.ndjson"), path.join(run, "logs/collect.ndjson"));
    const initial = await createInitialReport(run);
    const report = await bindReportToCurrentSession(root, initial, environment);
    const built = await buildReport(run, report, {
      toolVersion: "0.1.0",
      origin: report.origin
    });
    const reportDirectory = built.reportDirectory;
    const publishedReport = JSON.parse(
      await readFile(path.join(reportDirectory, "report.json"), "utf8")
    ) as UtsuriReport;
    return {
      root,
      run,
      reportDirectory,
      report: publishedReport,
      async close() {
        await rm(root, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function createPhase6ReviewFixture(): Promise<Phase6ReviewFixture> {
  const fixture = await createPhase6RunFixture();
  try {
    const server = await startInteractiveReportServer(fixture.reportDirectory, {
      originBinding: fixture.report.origin
    });
    return {
      ...fixture,
      server,
      async close() {
        await server.close();
        await fixture.close();
      }
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
