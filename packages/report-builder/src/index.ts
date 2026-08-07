import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { access, lstat, mkdir, open, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, ExitCode, stableHash, UtsuriError } from "@utsu-ri/core";
import {
  assertArtifact,
  validateDiffReferences,
  validateReportReferences,
  validateReviewPlanReferences,
  type Annotations,
  type EvidenceIndex,
  type GitDiffDocument,
  type ReviewPlan,
  type UtsuriReport
} from "@utsu-ri/report-model";
import { resolveContainedPath } from "@utsu-ri/security";
import { reportUiCss, reportUiJavaScript } from "./generated-ui-assets";
import { publishDirectoryNoReplace } from "./native-publish";
import { reportSchemaAssets, reportSchemaFiles } from "./schema-assets";

export const reportCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'"
].join("; ");

const statusIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="status" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/></symbol></svg>\n';

const reportArtifactPaths = new Set([
  "assets/app.css",
  "assets/app.js",
  "assets/icons.svg",
  "context-pack.schema.json",
  "diagnostics/summary.json",
  "index.html",
  "report.json",
  "review-answer.schema.json",
  "review-state.schema.json",
  "review-thread.schema.json"
]);

const maximumArtifactBytes = 16 * 1024 * 1024;

export interface ReportManifest {
  schemaVersion: "1.0";
  reportId: string;
  toolVersion: string;
  generatedAt: string;
  semanticHash: string;
  assetHashes: Record<string, string>;
  privacy: {
    includesAbsolutePaths: false;
    includesRawEnvironment: false;
    includesRawDom: false;
  };
  incompleteReasons: string[];
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function indexHtml(report: UtsuriReport): string {
  const summary = escapeHtml(report.summary.statement);
  const status = escapeHtml(report.status);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${reportCsp}">
  <title>Utsuri review — ${status}</title>
  <link rel="stylesheet" href="./assets/app.css">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to review</a>
  <main id="main-content" data-static-fallback tabindex="-1">
    <p>Utsuri review · ${status}</p>
    <h1>Review summary</h1>
    <p>${summary}</p>
    <p>Interactive data is available when this report is served locally.</p>
  </main>
  <div data-utsuri-app></div>
  <script type="module" src="./assets/app.js"></script>
</body>
</html>
`;
}

async function readRegularBytes(filename: string): Promise<Buffer> {
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw error;
    if (code === "ELOOP" || code === "ENXIO") {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Artifact is not a regular non-symlink file: ${path.basename(filename)}`,
        ExitCode.Security
      );
    }
    throw error;
  }

  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Artifact is not a regular file: ${path.basename(filename)}`,
        ExitCode.Security
      );
    }
    if (fileStat.size > maximumArtifactBytes) {
      throw new UtsuriError(
        "REPORT_FILE_TOO_LARGE",
        `Artifact exceeds ${maximumArtifactBytes} bytes: ${path.basename(filename)}`,
        ExitCode.Artifact
      );
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function readRegularText(filename: string): Promise<string> {
  return (await readRegularBytes(filename)).toString("utf8");
}

async function readOptionalJson(filename: string): Promise<unknown | null> {
  try {
    const content = await readRegularText(filename);
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new UtsuriError(
        "ARTIFACT_JSON_INVALID",
        `${path.basename(filename)} is not valid JSON`,
        ExitCode.Artifact
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assertReferenceResult(id: string, result: { ok: boolean; errors: string[] }): void {
  if (!result.ok) throw new UtsuriError(id, result.errors.join("; "), ExitCode.Artifact);
}

function inferredKind(paths: readonly string[]): UtsuriReport["changes"][number]["kind"] {
  const extensions = new Set(paths.map((entry) => path.extname(entry).toLowerCase()));
  if (
    [...extensions].some((extension) => [".css", ".scss", ".sass", ".less"].includes(extension))
  ) {
    return "visual";
  }
  if ([...extensions].every((extension) => [".md", ".txt"].includes(extension))) return "content";
  if (
    [...extensions].some((extension) =>
      [".html", ".svelte", ".vue", ".tsx", ".jsx"].includes(extension)
    )
  ) {
    return "mixed";
  }
  return "unknown";
}

function createCandidateChanges(diff: GitDiffDocument, plan: ReviewPlan): UtsuriReport["changes"] {
  const filesById = new Map(diff.files.map((file) => [file.id, file]));
  return plan.candidates.map((candidate) => {
    const paths = candidate.fileRefs
      .map((reference) => filesById.get(reference))
      .filter((file) => file !== undefined)
      .map((file) => file.newPath ?? file.oldPath ?? "unknown");
    const lowSignalOnly = candidate.hunkRefs.every(
      (reference) => diff.hunks.find((hunk) => hunk.id === reference)?.lowSignal
    );
    return {
      id: candidate.id,
      title: candidate.title,
      kind: inferredKind(paths),
      summary: `${candidate.hunkRefs.length} hunk${candidate.hunkRefs.length === 1 ? "" : "s"} across ${paths.length} file${paths.length === 1 ? "" : "s"}.`,
      intent: {
        text: "Intent has not been declared.",
        source: "unknown",
        evidenceRefs: candidate.evidenceRefs,
        missingEvidence: ["User request, specification, or commit rationale"]
      },
      implementation: `Git changes were collected for ${paths.join(", ")}.`,
      userImpact: [],
      technicalImpact: paths.map((entry) => `Changed ${entry}`),
      risk: {
        level: lowSignalOnly ? "info" : "low",
        reasons: lowSignalOnly
          ? ["Only low-signal or generated evidence is present."]
          : ["Runtime and visual effects have not been exercised."]
      },
      hunkRefs: candidate.hunkRefs,
      targetRefs: [],
      findingRefs: [],
      verification: {
        verified: ["Git patch structure and cross-references were validated."],
        gaps: ["Visual behavior was not captured.", "Runtime behavior was not executed."]
      }
    };
  });
}

function createCodeOnlyReport(
  input: unknown,
  diff: GitDiffDocument,
  evidenceIndex: EvidenceIndex,
  plan: ReviewPlan,
  annotations: Annotations | null
): UtsuriReport {
  const sourceChanges = annotations?.changes.length
    ? (annotations.changes as UtsuriReport["changes"])
    : createCandidateChanges(diff, plan);
  const changes = sourceChanges.map((change) => ({
    ...change,
    verification: {
      verified: change.verification.verified,
      gaps: [
        ...new Set([
          ...change.verification.gaps,
          "Visual behavior was not captured.",
          "Runtime behavior was not executed."
        ])
      ]
    }
  }));
  const classified = new Set(changes.flatMap((change) => change.hunkRefs));
  const unclassifiedHunkRefs = diff.hunks
    .map((hunk) => hunk.id)
    .filter((reference) => !classified.has(reference));
  const reportId = `report-${stableHash({ input, diff, evidenceIndex, plan, annotations }).slice(0, 16)}`;
  return {
    schemaVersion: "1.0",
    reportId,
    status: "UNCOVERED",
    summary: {
      statement:
        "Code changes were collected and grouped. Visual and runtime behavior remain unverified.",
      filesChanged: diff.summary.filesChanged,
      additions: diff.summary.additions,
      deletions: diff.summary.deletions
    },
    files: diff.files.map((file) => ({
      id: file.id,
      status: file.status,
      oldPath: file.oldPath,
      newPath: file.newPath,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      submodule: file.submodule,
      oldMode: file.oldMode,
      newMode: file.newMode,
      oldOid: file.oldOid,
      newOid: file.newOid,
      lowSignal: file.lowSignal,
      lowSignalReasons: file.lowSignalReasons,
      hunkRefs: file.hunkRefs
    })),
    hunks: diff.hunks,
    evidence: evidenceIndex.evidence,
    unclassifiedHunkRefs,
    changes,
    targets: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: 0,
      succeeded: 0,
      failed: 0
    },
    origin: {
      host: "unknown",
      projectFingerprint: diff.repository.fingerprint,
      reportId,
      bindingMode: "unbound",
      createdAt: new Date(0).toISOString()
    },
    diagnostics: {
      incompleteReasons: ["visual-capture-not-run", "runtime-not-executed"],
      blockedRequestCount: 0
    }
  };
}

export async function createInitialReport(
  runDirectory: string,
  annotationsValue: unknown | null = null
): Promise<UtsuriReport> {
  const input = await readOptionalJson(path.join(runDirectory, "input.json"));
  const diffValue = await readOptionalJson(path.join(runDirectory, "diff.json"));
  if (annotationsValue !== null) assertArtifact("annotations", annotationsValue);
  const annotations = annotationsValue as Annotations | null;
  if (diffValue !== null) {
    assertArtifact("diff", diffValue);
    const diff = diffValue as GitDiffDocument;
    assertReferenceResult("DIFF_REFERENCE_INVALID", validateDiffReferences(diff));
    const evidenceValue = await readOptionalJson(path.join(runDirectory, "evidence-index.json"));
    const planValue = await readOptionalJson(path.join(runDirectory, "review-plan.json"));
    if (evidenceValue === null || planValue === null) {
      throw new UtsuriError(
        "COLLECT_ARTIFACT_MISSING",
        "A collected diff requires evidence-index.json and review-plan.json",
        ExitCode.Artifact
      );
    }
    assertArtifact("evidence-index", evidenceValue);
    assertArtifact("review-plan", planValue);
    const evidenceIndex = evidenceValue as EvidenceIndex;
    const plan = planValue as ReviewPlan;
    assertReferenceResult(
      "REVIEW_PLAN_INVALID",
      validateReviewPlanReferences(plan, diff, evidenceIndex)
    );
    const report = createCodeOnlyReport(input, diff, evidenceIndex, plan, annotations);
    assertReferenceResult("REPORT_REFERENCE_INVALID", validateReportReferences(report));
    return report;
  }
  if (annotations?.changes.length) {
    throw new UtsuriError(
      "ANNOTATIONS_REQUIRE_DIFF",
      "Non-empty annotations require a collected diff",
      ExitCode.Artifact
    );
  }

  const reportId = `report-${stableHash({ input }).slice(0, 16)}`;
  return {
    schemaVersion: "1.0",
    reportId,
    status: "SKIPPED",
    summary: {
      statement: "No code diff was supplied; visual verification was skipped.",
      filesChanged: 0,
      additions: 0,
      deletions: 0
    },
    files: [],
    hunks: [],
    evidence: [],
    unclassifiedHunkRefs: [],
    changes: [],
    targets: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: 0,
      succeeded: 0,
      failed: 0
    },
    origin: {
      host: "unknown",
      projectFingerprint: stableHash({ cwd: path.basename(runDirectory), input }).slice(0, 16),
      reportId,
      bindingMode: "unbound",
      createdAt: new Date(0).toISOString()
    },
    diagnostics: {
      incompleteReasons: ["no-input"],
      blockedRequestCount: 0
    }
  };
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    const entryStat = await lstat(absolute);
    if (entryStat.isSymbolicLink()) {
      throw new UtsuriError(
        "REPORT_SYMLINK",
        `Report contains a symbolic link: ${relative}`,
        ExitCode.Security
      );
    }
    if (entryStat.isDirectory()) result.push(...(await listFiles(absolute, relative)));
    else if (entryStat.isFile()) result.push(relative);
    else {
      throw new UtsuriError(
        "REPORT_SPECIAL_FILE",
        `Report contains a non-regular file: ${relative}`,
        ExitCode.Security
      );
    }
  }
  return result;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function validateManifest(value: unknown): { manifest: ReportManifest | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { manifest: null, errors: ["manifest.json must be an object"] };
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "reportId",
      "toolVersion",
      "generatedAt",
      "semanticHash",
      "assetHashes",
      "privacy",
      "incompleteReasons"
    ])
  ) {
    errors.push("manifest.json has missing or unknown fields");
  }
  if (value.schemaVersion !== "1.0") errors.push("Manifest schemaVersion is invalid");
  if (typeof value.reportId !== "string" || !/^report-[a-f0-9]{16}$/u.test(value.reportId)) {
    errors.push("Manifest reportId is invalid");
  }
  if (typeof value.toolVersion !== "string" || value.toolVersion.length === 0) {
    errors.push("Manifest toolVersion is invalid");
  }
  if (
    typeof value.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value.generatedAt
    ) ||
    Number.isNaN(Date.parse(value.generatedAt))
  ) {
    errors.push("Manifest generatedAt is invalid");
  }
  if (typeof value.semanticHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.semanticHash)) {
    errors.push("Manifest semanticHash is invalid");
  }

  if (!isRecord(value.assetHashes)) {
    errors.push("Manifest assetHashes must be an object");
  } else {
    for (const [relative, digest] of Object.entries(value.assetHashes)) {
      if (
        !relative ||
        relative === "manifest.json" ||
        relative.startsWith("/") ||
        relative.includes("\\") ||
        path.posix.normalize(relative) !== relative ||
        relative.split("/").includes("..")
      ) {
        errors.push(`Manifest asset path is invalid: ${relative}`);
      }
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) {
        errors.push(`Manifest asset hash is invalid: ${relative}`);
      }
    }
  }

  if (
    !isRecord(value.privacy) ||
    !hasExactKeys(value.privacy, [
      "includesAbsolutePaths",
      "includesRawEnvironment",
      "includesRawDom"
    ]) ||
    value.privacy.includesAbsolutePaths !== false ||
    value.privacy.includesRawEnvironment !== false ||
    value.privacy.includesRawDom !== false
  ) {
    errors.push("Manifest privacy declaration is invalid");
  }
  if (
    !Array.isArray(value.incompleteReasons) ||
    value.incompleteReasons.some((reason) => typeof reason !== "string")
  ) {
    errors.push("Manifest incompleteReasons is invalid");
  }

  return {
    manifest: errors.length === 0 ? (value as unknown as ReportManifest) : null,
    errors
  };
}

async function optionalLstat(filename: string) {
  return lstat(filename).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

async function assertProtectedPublicationPath(
  runDirectory: string,
  runIdentity: BigIntStats
): Promise<void> {
  if (typeof process.getuid !== "function") {
    throw new UtsuriError(
      "REPORT_PUBLICATION_PLATFORM_UNSUPPORTED",
      "Secure report publication requires POSIX user ownership",
      ExitCode.Environment
    );
  }

  const currentUid = BigInt(process.getuid());
  const paths: string[] = [];
  for (let current = runDirectory; ; current = path.dirname(current)) {
    paths.push(current);
    if (current === path.dirname(current)) break;
  }

  let childIdentity: BigIntStats | undefined;
  for (const [index, current] of paths.entries()) {
    const identity = index === 0 ? runIdentity : await lstat(current, { bigint: true });
    if (!identity.isDirectory() || identity.isSymbolicLink()) {
      throw new UtsuriError(
        "REPORT_PUBLICATION_PATH_INVALID",
        "Every report publication ancestor must be a real directory",
        ExitCode.Security
      );
    }
    if (identity.uid !== currentUid && identity.uid !== 0n) {
      throw new UtsuriError(
        "REPORT_PUBLICATION_ANCESTOR_OWNER",
        "The report publication path has an ancestor controlled by another user",
        ExitCode.Security
      );
    }

    const sharedWritable = (identity.mode & 0o022n) !== 0n;
    if (index === 0 && sharedWritable) {
      throw new UtsuriError(
        "REPORT_RUN_DIRECTORY_PERMISSIONS",
        "The run directory must not be writable by group or other users",
        ExitCode.Security
      );
    }
    if (index > 0 && sharedWritable) {
      const sticky = (identity.mode & 0o1000n) !== 0n;
      if (!sticky || childIdentity?.uid !== currentUid) {
        throw new UtsuriError(
          "REPORT_PUBLICATION_ANCESTOR_PERMISSIONS",
          "The report publication path has an ancestor that another user can rename",
          ExitCode.Security
        );
      }
    }
    childIdentity = identity;
  }
}

function sameIdentity(
  left: Pick<BigIntStats, "dev" | "ino">,
  right: Pick<BigIntStats, "dev" | "ino">
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertDirectoryIdentity(
  directory: string,
  expected: Pick<BigIntStats, "dev" | "ino">,
  label: string
): Promise<void> {
  const current = await lstat(directory, { bigint: true }).catch(() => null);
  if (!current?.isDirectory() || !sameIdentity(current, expected)) {
    throw new UtsuriError(
      "REPORT_PUBLICATION_PATH_CHANGED",
      `${label} directory identity changed during publication`,
      ExitCode.Security
    );
  }
}

async function readJsonForValidation(
  filename: string,
  label: string,
  errors: string[]
): Promise<unknown | null> {
  try {
    return JSON.parse(await readRegularText(filename)) as unknown;
  } catch (error) {
    if (error instanceof UtsuriError) {
      errors.push(error.message);
      return null;
    }
    errors.push(
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? `${label} is missing`
        : `${label} is not valid JSON`
    );
    return null;
  }
}

async function populateReportDirectory(
  directory: string,
  report: UtsuriReport,
  options: { now?: Date; toolVersion?: string }
): Promise<ReportManifest> {
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await mkdir(path.join(directory, "diagnostics"), { recursive: true });
  await writeFile(path.join(directory, "index.html"), indexHtml(report), { flag: "wx" });
  await writeJson(path.join(directory, "report.json"), report);
  await writeFile(path.join(directory, "assets/app.js"), reportUiJavaScript, { flag: "wx" });
  await writeFile(path.join(directory, "assets/app.css"), reportUiCss, { flag: "wx" });
  await writeFile(path.join(directory, "assets/icons.svg"), statusIconSvg, { flag: "wx" });
  await writeJson(path.join(directory, "diagnostics/summary.json"), report.diagnostics);

  for (const schemaFile of reportSchemaFiles) {
    await writeFile(path.join(directory, schemaFile), reportSchemaAssets[schemaFile], {
      flag: "wx"
    });
  }

  const assetHashes: Record<string, string> = {};
  for (const relative of await listFiles(directory)) {
    assetHashes[relative] = sha256(await readRegularBytes(path.join(directory, relative)));
  }
  const manifest: ReportManifest = {
    schemaVersion: "1.0",
    reportId: report.reportId,
    toolVersion: options.toolVersion ?? "0.1.0",
    generatedAt: (options.now ?? new Date()).toISOString(),
    semanticHash: stableHash({ report, assetHashes }),
    assetHashes,
    privacy: {
      includesAbsolutePaths: false,
      includesRawEnvironment: false,
      includesRawDom: false
    },
    incompleteReasons: report.diagnostics.incompleteReasons
  };
  await writeJson(path.join(directory, "manifest.json"), manifest);
  return manifest;
}

export async function buildReport(
  runInput: string,
  report: UtsuriReport,
  options: { now?: Date; toolVersion?: string } = {}
): Promise<{ reportDirectory: string; manifest: ReportManifest; reused: boolean }> {
  assertArtifact("report", report);
  const references = validateReportReferences(report);
  if (!references.ok) {
    throw new UtsuriError(
      "REPORT_REFERENCE_INVALID",
      references.errors.join("; "),
      ExitCode.Artifact
    );
  }

  const runDirectory = await realpath(runInput);
  const runHandle = await open(
    runDirectory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    const runIdentity = await runHandle.stat({ bigint: true });
    if (!runIdentity.isDirectory()) {
      throw new UtsuriError(
        "REPORT_RUN_DIRECTORY_INVALID",
        "The run path must remain a directory during publication",
        ExitCode.Security
      );
    }
    await assertProtectedPublicationPath(runDirectory, runIdentity);
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");

    const reportDirectory = path.join(runDirectory, "report");
    const existingStat = await optionalLstat(reportDirectory);
    if (existingStat) {
      if (existingStat.isSymbolicLink()) {
        throw new UtsuriError(
          "REPORT_SYMLINK",
          "The immutable report destination must not be a symbolic link",
          ExitCode.Security
        );
      }
      if (!existingStat.isDirectory()) {
        throw new UtsuriError(
          "REPORT_IMMUTABLE",
          "The immutable report destination already exists and is not a directory",
          ExitCode.Artifact
        );
      }
      await listFiles(reportDirectory);
      const existing = await readOptionalJson(path.join(reportDirectory, "report.json"));
      if (existing && canonicalJson(existing) === canonicalJson(report)) {
        const validation = await validateReportDirectory(reportDirectory, { strict: true });
        if (!validation.ok) {
          throw new UtsuriError(
            "REPORT_REUSE_INVALID",
            `Existing report failed strict validation: ${validation.errors.join("; ")}`,
            ExitCode.Artifact
          );
        }
        const manifestResult = validateManifest(
          await readOptionalJson(path.join(reportDirectory, "manifest.json"))
        );
        if (manifestResult.manifest) {
          await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
          return { reportDirectory, manifest: manifestResult.manifest, reused: true };
        }
      }
      throw new UtsuriError(
        "REPORT_IMMUTABLE",
        "An immutable report destination already exists with different or incomplete content",
        ExitCode.Artifact
      );
    }

    const stagingName = `.report-${randomUUID()}.tmp`;
    const stagingDirectory = path.join(runDirectory, stagingName);
    await mkdir(stagingDirectory, { recursive: false, mode: 0o700 });
    const stagingIdentity = await lstat(stagingDirectory, { bigint: true });
    const manifest = await populateReportDirectory(stagingDirectory, report, options);
    const validation = await validateReportDirectory(stagingDirectory, { strict: true });
    if (!validation.ok) {
      throw new UtsuriError(
        "REPORT_BUILD_INVALID",
        validation.errors.join("; "),
        ExitCode.Artifact
      );
    }
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(stagingDirectory, stagingIdentity, "Staging");
    await publishDirectoryNoReplace(runHandle, runIdentity, stagingName, "report", stagingIdentity);
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(reportDirectory, stagingIdentity, "Published report");
    return { reportDirectory, manifest, reused: false };
  } finally {
    await runHandle.close();
  }
}

function validateHtml(html: string): string[] {
  const errors: string[] = [];
  if (!html.includes(`Content-Security-Policy" content="${reportCsp}`))
    errors.push("CSP is missing or changed");
  if (/<script(?![^>]*\bsrc=)[^>]*>/iu.test(html)) errors.push("Inline script is forbidden");
  if (/\son[a-z]+\s*=/iu.test(html)) errors.push("Inline event handlers are forbidden");
  if (/javascript:|data:text\/html/iu.test(html)) errors.push("Active URL scheme is forbidden");
  if (/(?:src|href)=["']https?:\/\//iu.test(html)) errors.push("External URL is forbidden");

  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gu)].map((match) => match[1]));
  for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/gu)) {
    if (!ids.has(match[1])) errors.push(`Broken anchor: #${match[1]}`);
  }
  return errors;
}

export async function validateReportDirectory(
  input: string,
  options: { strict?: boolean } = {}
): Promise<{ ok: boolean; errors: string[]; reportId?: string }> {
  const errors: string[] = [];
  let directory: string;
  try {
    const inputStat = await lstat(input);
    if (inputStat.isSymbolicLink()) {
      return { ok: false, errors: ["Report directory must not be a symbolic link"] };
    }
    if (!inputStat.isDirectory()) {
      return { ok: false, errors: ["Report path must be a directory"] };
    }
    directory = await realpath(input);
  } catch {
    return { ok: false, errors: ["Report directory is missing or inaccessible"] };
  }

  let files: string[];
  try {
    files = await listFiles(directory);
    for (const relative of files) {
      await resolveContainedPath(directory, relative);
    }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const manifestRaw = await readJsonForValidation(
    path.join(directory, "manifest.json"),
    "manifest.json",
    errors
  );
  const reportRaw = await readJsonForValidation(
    path.join(directory, "report.json"),
    "report.json",
    errors
  );
  const manifestValidation = validateManifest(manifestRaw);
  errors.push(...manifestValidation.errors);
  const manifest = manifestValidation.manifest;
  let report: UtsuriReport | null = null;

  if (reportRaw !== null) {
    try {
      assertArtifact("report", reportRaw);
      report = reportRaw as UtsuriReport;
      errors.push(...validateReportReferences(report).errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (manifest) {
    const actualAssets = files.filter((relative) => relative !== "manifest.json").sort();
    const declaredAssets = Object.keys(manifest.assetHashes).sort();
    if (JSON.stringify(actualAssets) !== JSON.stringify(declaredAssets)) {
      for (const relative of actualAssets.filter((item) => !declaredAssets.includes(item))) {
        errors.push(`Unregistered asset: ${relative}`);
      }
      for (const relative of declaredAssets.filter((item) => !actualAssets.includes(item))) {
        errors.push(`Missing declared asset: ${relative}`);
      }
    }
    for (const [relative, expected] of Object.entries(manifest.assetHashes)) {
      try {
        const file = await resolveContainedPath(directory, relative);
        const actual = sha256(await readRegularBytes(file));
        if (actual !== expected) errors.push(`Hash mismatch: ${relative}`);
      } catch {
        errors.push(`Missing asset: ${relative}`);
      }
    }
    if (report) {
      if (manifest.reportId !== report.reportId) errors.push("Manifest reportId mismatch");
      if (manifest.semanticHash !== stableHash({ report, assetHashes: manifest.assetHashes })) {
        errors.push("Manifest semanticHash mismatch");
      }
      if (
        canonicalJson(manifest.incompleteReasons) !==
        canonicalJson(report.diagnostics.incompleteReasons)
      ) {
        errors.push("Manifest incompleteReasons mismatch");
      }
    }
  }

  try {
    errors.push(...validateHtml(await readRegularText(path.join(directory, "index.html"))));
  } catch {
    errors.push("index.html is missing");
  }

  if (options.strict) {
    const actualAssets = files.filter((relative) => relative !== "manifest.json").sort();
    const expectedAssets = [...reportArtifactPaths].sort();
    if (JSON.stringify(actualAssets) !== JSON.stringify(expectedAssets)) {
      errors.push("Strict report artifact inventory mismatch");
    }
    for (const [relative, expected] of [
      ["index.html", report ? indexHtml(report) : null],
      ["assets/app.js", reportUiJavaScript],
      ["assets/app.css", reportUiCss],
      ["assets/icons.svg", statusIconSvg],
      ...reportSchemaFiles.map((filename) => [filename, reportSchemaAssets[filename]] as const)
    ] as const) {
      if (expected === null) continue;
      try {
        if ((await readRegularText(path.join(directory, relative))) !== expected) {
          errors.push(`Bundled asset mismatch: ${relative}`);
        }
      } catch {
        errors.push(`Bundled asset is missing: ${relative}`);
      }
    }
    if (reportUiJavaScript.length === 0) errors.push("Report UI build asset is empty");
    if (report) {
      try {
        const diagnostics = JSON.parse(
          await readRegularText(path.join(directory, "diagnostics/summary.json"))
        ) as unknown;
        if (canonicalJson(diagnostics) !== canonicalJson(report.diagnostics)) {
          errors.push("Diagnostic summary does not match report.json");
        }
      } catch {
        errors.push("diagnostics/summary.json is invalid");
      }
    }
  }
  return { ok: errors.length === 0, errors, reportId: report?.reportId };
}

export async function isWritableDirectory(directory: string): Promise<boolean> {
  try {
    let target = path.resolve(directory);
    for (;;) {
      const current = await stat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (current) {
        if (!current.isDirectory()) return false;
        await access(target, 2);
        return true;
      }
      const parent = path.dirname(target);
      if (parent === target) return false;
      target = parent;
    }
  } catch {
    return false;
  }
}

export function capabilityToken(): string {
  return `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
}
