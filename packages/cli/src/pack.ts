import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, ExitCode, sha256, UtsuriError } from "@utsu-ri/core";
import { validateReportDirectory, type ReportManifest } from "@utsu-ri/report-builder";
import { assertArtifact, type UtsuriConfig, type UtsuriReport } from "@utsu-ri/report-model";
import {
  parseBoundedJson,
  readContainedRegularFile,
  resolveContainedPath
} from "@utsu-ri/security";
import { zipSync, type Zippable } from "fflate";
import { parse } from "yaml";

const maximumArchiveBytes = 512 * 1024 * 1024;
const defaultSingleFileLimit = 8 * 1024 * 1024;
const policyConditions = [
  "capture-incomplete",
  "new-critical-a11y",
  "new-page-error",
  "partial-coverage",
  "security-policy-violation",
  "uncovered-ui-change",
  "weak-intent"
] as const;
type PolicyCondition = (typeof policyConditions)[number];

interface LoadedReport {
  report: UtsuriReport;
  manifest: ReportManifest;
  files: Map<string, Buffer>;
}

export interface CiPolicyResult {
  observed: PolicyCondition[];
  failures: PolicyCondition[];
  warnings: PolicyCondition[];
  exitCode: 0 | 10;
}

export interface PackReportResult {
  data: Record<string, unknown>;
  human: string;
  exitCode: 0 | 10;
}

function policyError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Arguments);
}

function assertPolicyConditions(values: readonly string[]): asserts values is PolicyCondition[] {
  const supported = new Set<string>(policyConditions);
  const unknown = values.filter((value) => !supported.has(value));
  if (unknown.length > 0) {
    policyError("CI_POLICY_UNKNOWN", `Unknown CI policy condition: ${unknown.join(", ")}`);
  }
}

export function evaluateCiPolicy(
  report: UtsuriReport,
  policy: UtsuriConfig["policy"]
): CiPolicyResult {
  assertPolicyConditions(policy.failOn);
  assertPolicyConditions(policy.warnOn);
  const overlap = policy.failOn.filter((condition) => policy.warnOn.includes(condition));
  if (overlap.length > 0) {
    policyError(
      "CI_POLICY_OVERLAP",
      `Policy conditions cannot fail and warn: ${overlap.join(", ")}`
    );
  }

  const observed = new Set<PolicyCondition>();
  if (
    report.status === "INCOMPLETE" ||
    report.diagnostics.incompleteReasons.length > 0 ||
    report.findings.some((finding) => finding.state === "incomplete")
  ) {
    observed.add("capture-incomplete");
  }
  if (
    report.findings.some(
      (finding) =>
        finding.state === "new" && finding.category === "a11y" && finding.severity === "critical"
    )
  ) {
    observed.add("new-critical-a11y");
  }
  if (
    report.findings.some((finding) => finding.state === "new" && finding.category === "page-error")
  ) {
    observed.add("new-page-error");
  }
  if (
    report.coverage.failed > 0 ||
    report.coverage.succeeded < report.coverage.planned ||
    (report.coverage.knownUsages !== null &&
      report.coverage.verifiedUsages < report.coverage.knownUsages)
  ) {
    observed.add("partial-coverage");
  }
  if (
    report.findings.some((finding) => finding.state === "new" && finding.category === "security")
  ) {
    observed.add("security-policy-violation");
  }
  if (
    report.status === "UNCOVERED" ||
    report.changes.some(
      (change) =>
        (change.kind === "visual" || change.kind === "mixed") && change.targetRefs.length === 0
    )
  ) {
    observed.add("uncovered-ui-change");
  }
  if (
    report.changes.some(
      (change) => change.intent.source === "weak-inference" || change.intent.source === "unknown"
    )
  ) {
    observed.add("weak-intent");
  }

  const sorted = [...observed].sort();
  const failures = policy.failOn.filter((condition): condition is PolicyCondition =>
    observed.has(condition as PolicyCondition)
  );
  const warnings = policy.warnOn.filter((condition): condition is PolicyCondition =>
    observed.has(condition as PolicyCondition)
  );
  return { observed: sorted, failures, warnings, exitCode: failures.length > 0 ? 10 : 0 };
}

function stripEphemeral(value: unknown, key = ""): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^https?:\/\//u.test(value)) {
      try {
        const url = new URL(value);
        url.port = "";
        return url.toString();
      } catch {
        return value;
      }
    }
    if (/^(?:\/private)?\/tmp\//u.test(value)) return "<temporary-path>";
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => stripEphemeral(entry));
  if (typeof value !== "object") return String(value);
  const omitted = new Set([
    "captureHash",
    "comparisonHash",
    "configurationHash",
    "createdAt",
    "cwd",
    "discoveryHash",
    "generatedAt",
    "outputDirectory",
    "port",
    "reportId",
    "semanticHash",
    "sourceSnapshotHash",
    "tempPath",
    "temporaryPath",
    "timestamp"
  ]);
  const result: Record<string, unknown> = {};
  for (const childKey of Object.keys(value as Record<string, unknown>).sort()) {
    if (omitted.has(childKey)) continue;
    result[childKey] = stripEphemeral((value as Record<string, unknown>)[childKey], childKey);
  }
  return key ? result : result;
}

export function computeReportCacheKey(
  report: UtsuriReport,
  manifest: Pick<ReportManifest, "toolVersion">,
  config: UtsuriConfig | null
): string {
  return sha256(
    canonicalJson(
      stripEphemeral({
        schemaVersion: "1.0",
        toolVersion: manifest.toolVersion,
        report,
        config
      })
    )
  );
}

async function readJson<T>(root: string, relative: string, label: string): Promise<T> {
  const bytes = await readContainedRegularFile(root, relative, {
    maximumBytes: 64 * 1024 * 1024
  });
  return parseBoundedJson(bytes.toString("utf8"), {
    label,
    maximumBytes: 64 * 1024 * 1024
  }) as T;
}

async function loadReport(reportDirectory: string): Promise<LoadedReport> {
  const validation = await validateReportDirectory(reportDirectory, { strict: true });
  if (!validation.ok) {
    throw new UtsuriError("PACK_REPORT_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const report = await readJson<UtsuriReport>(reportDirectory, "report.json", "report");
  const manifest = await readJson<ReportManifest>(reportDirectory, "manifest.json", "manifest");
  assertArtifact("report", report);
  const names = ["manifest.json", ...Object.keys(manifest.assetHashes).sort()];
  const files = new Map<string, Buffer>();
  let total = 0;
  for (const name of names) {
    const bytes = await readContainedRegularFile(reportDirectory, name, {
      maximumBytes: 64 * 1024 * 1024
    });
    total += bytes.byteLength;
    if (total > maximumArchiveBytes) {
      throw new UtsuriError(
        "PACK_ARCHIVE_LIMIT",
        `Report exceeds the ${maximumArchiveBytes} byte packaging limit`,
        ExitCode.Artifact
      );
    }
    files.set(name, bytes);
  }
  return { report, manifest, files };
}

async function loadConfig(
  cwd: string,
  configValue: string | undefined
): Promise<UtsuriConfig | null> {
  if (!configValue) return null;
  const filename = await resolveContainedPath(cwd, configValue);
  const root = await realpath(cwd);
  const relative = path.relative(root, filename).replaceAll(path.sep, "/");
  let value: unknown;
  try {
    value = parse(
      (await readContainedRegularFile(root, relative, { maximumBytes: 16 * 1024 * 1024 })).toString(
        "utf8"
      )
    ) as unknown;
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    throw new UtsuriError(
      "PACK_CONFIG_INVALID",
      error instanceof Error ? error.message : String(error),
      ExitCode.Arguments
    );
  }
  assertArtifact("config", value);
  return value as UtsuriConfig;
}

function dataUri(filename: string, bytes: Buffer): string {
  const contentType = path.extname(filename).toLowerCase() === ".png" ? "image/png" : null;
  if (!contentType) throw new Error(`Unsupported embedded asset: ${filename}`);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function replaceAssetReferences(
  value: unknown,
  replacements: ReadonlyMap<string, string>
): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((entry) => replaceAssetReferences(entry, replacements));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, replaceAssetReferences(entry, replacements)])
  );
}

function scriptData(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function cspHash(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function singleFileDocument(loaded: LoadedReport): Buffer {
  const css = loaded.files.get("assets/app.css")!.toString("utf8");
  const javascript = loaded.files.get("assets/app.js")!.toString("utf8");
  if (/<\/style/iu.test(css) || /<\/script/iu.test(javascript)) {
    throw new UtsuriError(
      "PACK_INLINE_BOUNDARY",
      "Generated UI assets contain an unsafe inline closing tag",
      ExitCode.Artifact
    );
  }
  const replacements = new Map<string, string>();
  for (const [name, bytes] of loaded.files) {
    if (/^(?:capture|comparison)\/.+\.png$/u.test(name)) {
      replacements.set(name, dataUri(name, bytes));
    }
  }
  const reportJson = scriptData(replaceAssetReferences(loaded.report, replacements));
  const manifestJson = scriptData(loaded.manifest);
  const hashes = [reportJson, manifestJson, javascript]
    .map((value) => `'sha256-${cspHash(value)}'`)
    .join(" ");
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src data: blob:",
    "object-src 'none'",
    `script-src ${hashes}`,
    `style-src 'sha256-${cspHash(css)}'`
  ].join("; ");
  return Buffer.from(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Utsuri review</title>
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to review</a>
  <main id="main-content" data-static-fallback tabindex="-1">
    <h1>Utsuri review</h1>
    <p>Loading embedded review data…</p>
  </main>
  <div data-utsuri-app></div>
  <script type="application/json" data-utsuri-report>${reportJson}</script>
  <script type="application/json" data-utsuri-manifest>${manifestJson}</script>
  <script type="module">${javascript}</script>
</body>
</html>
`);
}

function archiveBytes(files: ReadonlyMap<string, Buffer>): Uint8Array {
  const archive: Zippable = {};
  const zipEpoch = new Date("1980-01-01T00:00:00.000Z");
  for (const [name, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    archive[`report/${name}`] = [bytes, { level: 9, mtime: zipEpoch }];
  }
  return zipSync(archive, { level: 9, mtime: zipEpoch });
}

async function createOutputDirectory(
  cwd: string,
  output: string,
  reportDirectory: string
): Promise<string> {
  const parentValue = path.dirname(output);
  await resolveContainedPath(cwd, parentValue);
  const outputDirectory = await resolveContainedPath(cwd, output, { allowMissing: true });
  const relativeToReport = path.relative(reportDirectory, outputDirectory);
  if (!relativeToReport.startsWith("..") && !path.isAbsolute(relativeToReport)) {
    throw new UtsuriError(
      "PACK_OUTPUT_INSIDE_REPORT",
      "Pack output must not be created inside the immutable report",
      ExitCode.Arguments
    );
  }
  try {
    await mkdir(outputDirectory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UtsuriError(
        "PACK_OUTPUT_EXISTS",
        "Pack output directory already exists",
        ExitCode.Arguments
      );
    }
    throw error;
  }
  return outputDirectory;
}

async function writePackagedReport(
  outputDirectory: string,
  files: ReadonlyMap<string, Buffer>
): Promise<void> {
  const reportOutput = path.join(outputDirectory, "report");
  await mkdir(reportOutput, { mode: 0o700 });
  for (const [name, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const filename = path.join(reportOutput, ...name.split("/"));
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await writeFile(filename, bytes, { flag: "wx", mode: 0o600 });
  }
}

export async function packReport(
  cwd: string,
  reportValue: string,
  output: string,
  options: { config?: string; singleFile: boolean; maximumSingleFileBytes?: number }
): Promise<PackReportResult> {
  const reportDirectory = await resolveContainedPath(cwd, reportValue);
  const loaded = await loadReport(reportDirectory);
  const config = await loadConfig(cwd, options.config);
  const configuredLimit = (config?.report as { singleFileMaxBytes?: number } | undefined)
    ?.singleFileMaxBytes;
  const maximumSingleFileBytes =
    options.maximumSingleFileBytes ?? configuredLimit ?? defaultSingleFileLimit;
  if (
    !Number.isSafeInteger(maximumSingleFileBytes) ||
    maximumSingleFileBytes < 65_536 ||
    maximumSingleFileBytes > 64 * 1024 * 1024
  ) {
    throw new UtsuriError(
      "PACK_SINGLE_FILE_LIMIT",
      "Single-file limit must be an integer from 65536 through 67108864 bytes",
      ExitCode.Arguments
    );
  }
  const singleFileRequested = options.singleFile || config?.report.singleFile === true;
  const policy = evaluateCiPolicy(loaded.report, config?.policy ?? { failOn: [], warnOn: [] });
  const cacheKey = computeReportCacheKey(loaded.report, loaded.manifest, config);
  const singleFile = singleFileRequested ? singleFileDocument(loaded) : null;
  const singleFileIncluded = Boolean(singleFile && singleFile.byteLength <= maximumSingleFileBytes);
  const fallbackReason =
    singleFile && !singleFileIncluded
      ? `Single-file report is ${singleFile.byteLength} bytes, above the ${maximumSingleFileBytes} byte limit; multi-file output was preserved.`
      : null;
  const outputDirectory = await createOutputDirectory(cwd, output, reportDirectory);
  await writePackagedReport(outputDirectory, loaded.files);
  await writeFile(path.join(outputDirectory, "report.zip"), archiveBytes(loaded.files), {
    flag: "wx",
    mode: 0o600
  });
  await writeFile(path.join(outputDirectory, "report.json"), loaded.files.get("report.json")!, {
    flag: "wx",
    mode: 0o600
  });
  if (singleFileIncluded) {
    await writeFile(path.join(outputDirectory, "report.single.html"), singleFile!, {
      flag: "wx",
      mode: 0o600
    });
  }
  const summary = {
    schemaVersion: "1.0",
    reportId: loaded.report.reportId,
    status: loaded.report.status,
    cacheKey,
    semanticManifestHash: loaded.manifest.semanticHash,
    policy,
    artifacts: {
      reportDirectory: "report",
      reportZip: "report.zip",
      reportJson: "report.json",
      singleFile: singleFileIncluded ? "report.single.html" : null
    },
    singleFile: {
      requested: singleFileRequested,
      included: singleFileIncluded,
      maximumBytes: maximumSingleFileBytes,
      actualBytes: singleFile?.byteLength ?? null,
      fallbackReason
    }
  };
  await writeFile(
    path.join(outputDirectory, "ci-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    { flag: "wx", mode: 0o600 }
  );
  const relative = path.relative(cwd, outputDirectory).replaceAll(path.sep, "/");
  return {
    exitCode: policy.exitCode,
    data: {
      ok: policy.exitCode === 0,
      command: "pack",
      reportId: loaded.report.reportId,
      output: relative,
      cacheKey,
      failures: policy.failures,
      warnings: policy.warnings,
      singleFile: summary.singleFile
    },
    human:
      policy.exitCode === 10
        ? `CI policy failed: ${policy.failures.join(", ")}`
        : (fallbackReason ?? `Report package ready: ${relative}`)
  };
}
