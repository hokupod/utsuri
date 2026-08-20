import type { Page, Route } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { viewerDocument } from "../../packages/interactive-server/src";
import type { UtsuriReport } from "../../packages/report-model/src";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const executeFile = promisify(execFile);

export interface Phase3ReportFixture {
  directory: string;
  report: UtsuriReport;
}

export interface Phase3ReportServeOptions {
  extraAssets?: Readonly<Record<string, string | Buffer>>;
  report?: UtsuriReport;
  reportDelayMs?: number;
}

let pendingFixture: Promise<Phase3ReportFixture> | undefined;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};
const reportOrigin = "http://127.0.0.1:4173";

async function buildFixture(): Promise<Phase3ReportFixture> {
  const fixtureRoot = path.join(repositoryRoot, `.artifacts/phase-3-e2e-${process.pid}`);
  const run = path.join(fixtureRoot, "run");
  await rm(fixtureRoot, { recursive: true, force: true });
  const cli = path.join(repositoryRoot, "packages/cli/dist/utsuri.mjs");
  const runRelative = path.relative(repositoryRoot, run);
  const config = "fixtures/global-token-change/utsuri.yml";
  const runCli = async (arguments_: string[], allowedExitCodes = [0]) => {
    try {
      const result = await executeFile(process.execPath, [cli, ...arguments_, "--json"], {
        cwd: repositoryRoot,
        maxBuffer: 16 * 1024 * 1024
      });
      return JSON.parse(result.stdout) as unknown;
    } catch (error) {
      const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
      if (typeof failure.code === "number" && allowedExitCodes.includes(failure.code)) {
        return JSON.parse(failure.stdout ?? "null") as unknown;
      }
      throw new Error(
        `Fixture CLI failed: ${arguments_.join(" ")}\n${failure.stdout ?? ""}${failure.stderr ?? ""}`
      );
    }
  };
  await runCli([
    "collect",
    "--patch",
    "fixtures/global-token-change/changes.patch",
    "--output",
    runRelative
  ]);
  await runCli(["capture", "--run", runRelative, "--config", config]);
  await runCli(["discover", "--run", runRelative, "--config", config]);
  await runCli(["compare", "--run", runRelative], [0, 4]);
  await runCli(["finalize", "--run", runRelative]);
  const directory = path.join(run, "report");
  const report = JSON.parse(
    await readFile(path.join(directory, "report.json"), "utf8")
  ) as UtsuriReport;
  return { directory, report };
}

export function phase3ReportFixture(): Promise<Phase3ReportFixture> {
  pendingFixture ??= buildFixture();
  return pendingFixture;
}

export async function servePhase3Report(
  page: Page,
  options: Phase3ReportServeOptions = {}
): Promise<Phase3ReportFixture> {
  const fixture = await phase3ReportFixture();
  await page.route(`${reportOrigin}/**`, async (route: Route) => {
    const requestPath = new URL(route.request().url()).pathname;
    const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
    if (relative.includes("..")) return route.abort("blockedbyclient");
    if (relative === "report.json" && (options.report || options.reportDelayMs)) {
      if (options.reportDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.reportDelayMs));
      }
      return route.fulfill({
        status: 200,
        contentType: contentTypes[".json"],
        body: `${JSON.stringify(options.report ?? fixture.report)}\n`
      });
    }
    if (Object.hasOwn(options.extraAssets ?? {}, relative)) {
      return route.fulfill({
        status: 200,
        contentType: contentTypes[path.extname(relative)] ?? "application/octet-stream",
        body: options.extraAssets![relative]
      });
    }
    const filename = path.join(fixture.directory, relative);
    try {
      const body = await readFile(filename);
      await route.fulfill({
        status: 200,
        contentType: contentTypes[path.extname(filename)] ?? "application/octet-stream",
        body:
          relative === "index.html" ? viewerDocument(body.toString("utf8"), "interactive") : body
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
  const firstChange = fixture.report.changes[0];
  await page.goto(
    firstChange
      ? `${reportOrigin}/index.html#change=${encodeURIComponent(firstChange.id)}`
      : `${reportOrigin}/index.html`
  );
  return fixture;
}
