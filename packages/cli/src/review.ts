import { realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { GitDiffDocument, UtsuriReport } from "@utsu-ri/report-model";
import {
  assertArtifact,
  validateReportReferences,
  validateReviewBundle
} from "@utsu-ri/report-model";
import { validateReportDirectory } from "@utsu-ri/report-builder";
import {
  createReviewBundle,
  importReviewBundle,
  loadReviewStore,
  persistReviewStore,
  writeReviewDiagnostic,
  type ReviewBundleDocument,
  type ReviewSourceIdentity
} from "@utsu-ri/review-state";
import {
  parseBoundedJson,
  readContainedRegularFile,
  resolveContainedPath
} from "@utsu-ri/security";

async function optionalContainedFile(
  root: string,
  relative: string,
  maximumBytes: number
): Promise<Buffer | null> {
  try {
    return await readContainedRegularFile(root, relative, { maximumBytes });
  } catch (error) {
    if (error instanceof UtsuriError && error.diagnosticId === "SEC_PATH_MISSING") return null;
    throw error;
  }
}

async function loadReport(runDirectory: string): Promise<UtsuriReport> {
  const reportDirectory = path.join(runDirectory, "report");
  const validation = await validateReportDirectory(reportDirectory, { strict: true });
  if (!validation.ok) {
    throw new UtsuriError("REVIEW_REPORT_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const bytes = await readContainedRegularFile(runDirectory, "report/report.json", {
    maximumBytes: 16 * 1024 * 1024
  });
  const value = parseBoundedJson(bytes.toString("utf8"), {
    label: "review report",
    maximumBytes: 16 * 1024 * 1024
  });
  assertArtifact("report", value);
  const references = validateReportReferences(value as UtsuriReport);
  if (!references.ok) {
    throw new UtsuriError(
      "REVIEW_REPORT_REFERENCES",
      references.errors.join("; "),
      ExitCode.Artifact
    );
  }
  return value as UtsuriReport;
}

async function loadSourceIdentity(runDirectory: string): Promise<ReviewSourceIdentity> {
  const bytes = await optionalContainedFile(runDirectory, "diff.json", 16 * 1024 * 1024);
  if (!bytes) return { base: null, head: null };
  const value = parseBoundedJson(bytes.toString("utf8"), {
    label: "review diff",
    maximumBytes: 16 * 1024 * 1024
  });
  assertArtifact("diff", value);
  const diff = value as GitDiffDocument;
  return { base: diff.input.base, head: diff.input.head };
}

async function writeExclusiveJson(cwd: string, output: string, value: unknown): Promise<string> {
  const filename = await resolveContainedPath(cwd, output, { allowMissing: true });
  await resolveContainedPath(cwd, path.dirname(output));
  try {
    await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UtsuriError(
        "REVIEW_OUTPUT_EXISTS",
        "Review export output already exists and will not be replaced",
        ExitCode.Arguments
      );
    }
    throw error;
  }
  return path.relative(cwd, filename).replaceAll(path.sep, "/");
}

async function readBundle(cwd: string, input: string): Promise<ReviewBundleDocument> {
  const filename = await resolveContainedPath(cwd, input);
  const relative = path.relative(await realpath(cwd), filename).replaceAll(path.sep, "/");
  const bytes = await readContainedRegularFile(cwd, relative, { maximumBytes: 16 * 1024 * 1024 });
  const value = parseBoundedJson(bytes.toString("utf8"), {
    label: "review bundle",
    maximumBytes: 16 * 1024 * 1024
  });
  const validation = validateReviewBundle(value);
  if (!validation.ok) {
    throw new UtsuriError("REVIEW_BUNDLE_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  return value as ReviewBundleDocument;
}

export interface ReviewCommandResult {
  data: Record<string, unknown>;
  human: string;
}

export async function reviewExport(
  cwd: string,
  runValue: string,
  output: string,
  now = new Date()
): Promise<ReviewCommandResult> {
  const runDirectory = await resolveContainedPath(cwd, runValue);
  const report = await loadReport(runDirectory);
  const store = await loadReviewStore(runDirectory, report, now.toISOString());
  const bundle = createReviewBundle(
    store,
    await loadSourceIdentity(runDirectory),
    now.toISOString()
  );
  const relativeOutput = await writeExclusiveJson(cwd, output, bundle);
  return {
    data: {
      ok: true,
      command: "review export",
      reportId: report.reportId,
      revision: store.state.revision,
      threads: store.threads.length,
      events: store.events.length,
      output: relativeOutput
    },
    human: `Review state exported: ${relativeOutput}`
  };
}

export async function reviewImport(
  cwd: string,
  runValue: string,
  input: string,
  reanchor: boolean,
  now = new Date()
): Promise<ReviewCommandResult> {
  const runDirectory = await resolveContainedPath(cwd, runValue);
  const report = await loadReport(runDirectory);
  const source = await loadSourceIdentity(runDirectory);
  const bundle = await readBundle(cwd, input);
  if (!reanchor && (bundle.source.base !== source.base || bundle.source.head !== source.head)) {
    throw new UtsuriError(
      "REVIEW_SOURCE_MISMATCH",
      "Review bundle base/head differs from the target run; pass --reanchor to classify anchors",
      ExitCode.Artifact
    );
  }
  const current = await loadReviewStore(runDirectory, report, now.toISOString());
  const imported = await importReviewBundle(current, bundle, {
    reanchor,
    importedAt: now.toISOString()
  });
  await persistReviewStore(runDirectory, imported.store, current.state.revision);
  let conflictReport: string | null = null;
  if (imported.conflicts.length > 0) {
    const eventId = imported.store.events.at(-1)?.id.replace(/^event:/u, "") ?? "unknown";
    const filename = `import-conflicts-${eventId}.json`;
    const absolute = await writeReviewDiagnostic(runDirectory, filename, {
      schemaVersion: "1.0",
      sourceReportId: bundle.source.reportId,
      targetReportId: report.reportId,
      importedAt: now.toISOString(),
      conflicts: imported.conflicts
    });
    conflictReport = path.relative(cwd, absolute).replaceAll(path.sep, "/");
  }
  const counts = imported.reanchored.reduce(
    (result, entry) => {
      result[entry.disposition] += 1;
      return result;
    },
    { matched: 0, stale: 0, orphaned: 0 }
  );
  return {
    data: {
      ok: true,
      command: "review import",
      reportId: report.reportId,
      revision: imported.store.state.revision,
      reanchor,
      ...counts,
      conflicts: imported.conflicts.length,
      conflictReport
    },
    human: `Review state imported: ${counts.matched} matched, ${counts.stale} stale, ${counts.orphaned} orphaned`
  };
}
