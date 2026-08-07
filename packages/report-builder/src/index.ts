import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { access, lstat, mkdir, open, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, ExitCode, stableHash, stableId, UtsuriError } from "@utsu-ri/core";
import type { ComparisonManifest } from "@utsu-ri/compare";
import type { DiscoveryManifest } from "@utsu-ri/discovery";
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
import {
  assertPngBytes,
  assertRasterImageReference,
  assertSafeReportAssetReference,
  interactiveReportCsp,
  parseBoundedJson,
  resolveContainedPath,
  staticReportCsp
} from "@utsu-ri/security";
import { reportUiCss, reportUiJavaScript } from "./generated-ui-assets";
import { publishDirectoryNoReplace } from "./native-publish";
import { reportSchemaAssets, reportSchemaFiles } from "./schema-assets";

export const reportCsp = staticReportCsp;
export { interactiveReportCsp, staticReportCsp };

const reportArtifactPaths = new Set([
  "assets/app.css",
  "assets/app.js",
  "context-pack.schema.json",
  "diagnostics/summary.json",
  "index.html",
  "report.json",
  "review-answer.schema.json",
  "review-bundle.schema.json",
  "review-event.schema.json",
  "review-state.schema.json",
  "review-thread.schema.json"
]);

const maximumArtifactBytes = 16 * 1024 * 1024;
const reportSourceArtifactNames = [
  "input.json",
  "diff.json",
  "evidence-index.json",
  "review-plan.json",
  "capture.json",
  "comparison.json",
  "discovery.json"
] as const;

type ReportSourceArtifactName = (typeof reportSourceArtifactNames)[number];
type ReportSourceDigests = Record<ReportSourceArtifactName, string | null>;
type ReportSourceValues = Record<ReportSourceArtifactName, unknown | null>;

interface ReportSourceSnapshot {
  values: ReportSourceValues;
  digests: ReportSourceDigests;
}

export interface ReportManifest {
  schemaVersion: "1.0";
  reportId: string;
  toolVersion: string;
  generatedAt: string;
  sourceSnapshotHash: string;
  semanticHash: string;
  assetHashes: Record<string, string>;
  privacy: {
    includesAbsolutePaths: false;
    includesCookies: false;
    includesRawEnvironment: false;
    includesRawDom: false;
    includesRawHeaders: false;
    includesTraces: false;
  };
  incompleteReasons: string[];
}

export interface BuildReportOptions {
  now?: Date;
  toolVersion?: string;
  annotations?: unknown | null;
}

function deepFreezeJson<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeJson(child, seen);
  return Object.freeze(value);
}

function immutableJsonSnapshot<T>(value: T): T {
  return deepFreezeJson(structuredClone(value));
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
      return parseBoundedJson(content, {
        label: path.basename(filename),
        maximumBytes: maximumArtifactBytes
      });
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

async function readReportSourceSnapshot(runDirectory: string): Promise<ReportSourceSnapshot> {
  const entries = await Promise.all(
    reportSourceArtifactNames.map(async (name) => {
      try {
        const bytes = await readRegularBytes(path.join(runDirectory, name));
        let value: unknown;
        try {
          value = parseBoundedJson(bytes.toString("utf8"), {
            label: name,
            maximumBytes: maximumArtifactBytes
          });
        } catch {
          throw new UtsuriError(
            "ARTIFACT_JSON_INVALID",
            `${name} is not valid JSON`,
            ExitCode.Artifact
          );
        }
        return { name, value, digest: sha256(bytes) } as const;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { name, value: null, digest: null } as const;
        }
        throw error;
      }
    })
  );
  return immutableJsonSnapshot({
    values: Object.fromEntries(
      entries.map(({ name, value }) => [name, value])
    ) as ReportSourceValues,
    digests: Object.fromEntries(
      entries.map(({ name, digest }) => [name, digest])
    ) as ReportSourceDigests
  });
}

async function readReportSourceDigests(runDirectory: string): Promise<ReportSourceDigests> {
  const entries = await Promise.all(
    reportSourceArtifactNames.map(async (name) => {
      try {
        return [name, sha256(await readRegularBytes(path.join(runDirectory, name)))] as const;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [name, null] as const;
        throw error;
      }
    })
  );
  return Object.fromEntries(entries) as ReportSourceDigests;
}

async function assertReportSourcesUnchanged(
  runDirectory: string,
  expected: ReportSourceDigests
): Promise<void> {
  const current = await readReportSourceDigests(runDirectory);
  if (canonicalJson(current) !== canonicalJson(expected)) {
    throw new UtsuriError(
      "REPORT_SOURCE_CHANGED",
      "Run report source artifacts changed during publication",
      ExitCode.Artifact
    );
  }
}

async function assertArtifactDigests(
  runDirectory: string,
  references: readonly string[],
  artifactDigests: Readonly<Record<string, string>>
): Promise<void> {
  for (const reference of references) {
    const filename = await resolveContainedPath(runDirectory, reference);
    if (sha256(await readRegularBytes(filename)) !== artifactDigests[reference]) {
      throw new UtsuriError(
        "REPORT_ARTIFACT_DIGEST_MISMATCH",
        `Evidence artifact changed before publication: ${reference}`,
        ExitCode.Artifact
      );
    }
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

interface CaptureArtifactResult {
  status: "success" | "failed" | "skipped";
  url?: string;
  screenshotRefs: string[];
  domRef?: string;
  ariaRef?: string;
  styleRef?: string;
  axeRef?: string;
  consoleRef?: string;
  networkRef?: string;
  metadataRef?: string;
  failureRef?: string;
  failure?: {
    code: string;
    message: string;
    stage: string;
  };
}

interface CaptureArtifact {
  schemaVersion: "1.0";
  configurationHash: string;
  blockedRequestCount: number;
  artifactDigests: Record<string, string>;
  captureHash: string;
  targets: Array<{
    id: string;
    routeOrStory: string;
    viewport: string;
    state: string;
    roots: string[];
    discovery: {
      source: "explicit";
      confidence: "explicit";
      reason: string;
    };
    before: CaptureArtifactResult;
    after: CaptureArtifactResult;
  }>;
}

function captureArtifactError(message: string): never {
  throw new UtsuriError("CAPTURE_ARTIFACT_INVALID", message, ExitCode.Artifact);
}

function validCaptureLimits(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "maxDiffLines",
      "maxImagePixels",
      "maxTimeMs",
      "maxMemoryMiB",
      "maxArtifactBytes"
    ])
  ) {
    return false;
  }
  return [
    [value.maxDiffLines, 1, 2_000_000],
    [value.maxImagePixels, 1, 100_000_000],
    [value.maxTimeMs, 1, 900_000],
    [value.maxMemoryMiB, 128, 4_096],
    [value.maxArtifactBytes, 1_024, 67_108_864]
  ].every(
    ([candidate, minimum, maximum]) =>
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      (candidate as number) >= (minimum as number) &&
      (candidate as number) <= (maximum as number)
  );
}

async function validateCaptureArtifact(
  runDirectory: string,
  value: unknown
): Promise<CaptureArtifact> {
  if (!isRecord(value) || value.schemaVersion !== "1.0" || !Array.isArray(value.targets)) {
    return captureArtifactError("capture.json has an invalid top-level structure");
  }
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "configurationHash",
      "mode",
      "capability",
      "browser",
      "environment",
      "stabilization",
      "targets",
      "blockedRequestCount",
      "artifactDigests",
      "captureHash"
    ])
  ) {
    return captureArtifactError("capture.json has missing or unknown top-level fields");
  }
  if (
    !Number.isInteger(value.blockedRequestCount) ||
    (value.blockedRequestCount as number) < 0 ||
    typeof value.configurationHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.configurationHash) ||
    !isRecord(value.artifactDigests) ||
    typeof value.captureHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.captureHash)
  ) {
    return captureArtifactError("capture.json has invalid diagnostics or hash metadata");
  }
  if (!new Set(["dual-url", "static-fragment", "worktree", "container"]).has(String(value.mode))) {
    return captureArtifactError("capture.json mode is invalid");
  }
  if (
    !isRecord(value.capability) ||
    !Object.keys(value.capability).every((key) =>
      new Set([
        "supported",
        "startsProjectCode",
        "requiresExplicitCommand",
        "availablePhase",
        "engine",
        "reason"
      ]).has(key)
    ) ||
    typeof value.capability.supported !== "boolean" ||
    typeof value.capability.startsProjectCode !== "boolean" ||
    typeof value.capability.requiresExplicitCommand !== "boolean" ||
    (value.capability.engine !== undefined &&
      !new Set(["docker", "podman"]).has(String(value.capability.engine))) ||
    (value.capability.reason !== undefined && typeof value.capability.reason !== "string")
  ) {
    return captureArtifactError("capture.json capability is invalid");
  }
  if (
    !isRecord(value.environment) ||
    !hasExactKeys(value.environment, ["os", "arch", "limits"]) ||
    typeof value.environment.os !== "string" ||
    typeof value.environment.arch !== "string" ||
    !validCaptureLimits(value.environment.limits)
  ) {
    return captureArtifactError("capture.json environment or limits are invalid");
  }
  const artifactDigests = value.artifactDigests as Record<string, unknown>;
  for (const [reference, digest] of Object.entries(artifactDigests)) {
    if (
      !reference.startsWith("capture/") ||
      reference.includes("\\") ||
      path.posix.normalize(reference) !== reference ||
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/u.test(digest)
    ) {
      return captureArtifactError(`Capture artifact digest is invalid: ${reference}`);
    }
  }
  const targets = value.targets as Array<Record<string, unknown>>;
  if (targets.length === 0) {
    return captureArtifactError("capture.json must contain at least one target");
  }
  const ids = targets.map((target) => target.id);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
    return captureArtifactError("capture.json target IDs must be unique strings");
  }
  const referencedArtifacts = new Set<string>();
  for (const target of targets) {
    for (const side of ["before", "after"] as const) {
      const result = target[side];
      if (
        !isRecord(result) ||
        !new Set(["success", "failed", "skipped"]).has(String(result.status)) ||
        !Array.isArray(result.screenshotRefs) ||
        result.screenshotRefs.some((reference) => typeof reference !== "string")
      ) {
        return captureArtifactError(`${String(target.id)}.${side} is invalid`);
      }
      const references = [
        ...result.screenshotRefs,
        result.domRef,
        result.ariaRef,
        result.styleRef,
        result.axeRef,
        result.consoleRef,
        result.networkRef,
        result.metadataRef,
        result.failureRef
      ].filter((reference): reference is string => typeof reference === "string");
      for (const reference of references) {
        if (
          !reference.startsWith("capture/") ||
          reference.includes("\\") ||
          path.posix.normalize(reference) !== reference
        ) {
          return captureArtifactError(`Capture reference is unsafe: ${reference}`);
        }
        referencedArtifacts.add(reference);
        const expected = artifactDigests[reference];
        if (typeof expected !== "string") {
          return captureArtifactError(`Capture artifact digest is missing: ${reference}`);
        }
        const filename = await resolveContainedPath(runDirectory, reference);
        if (sha256(await readRegularBytes(filename)) !== expected) {
          return captureArtifactError(`Capture artifact digest mismatch: ${reference}`);
        }
      }
    }
  }
  const declaredArtifacts = Object.keys(artifactDigests).sort();
  const actualArtifacts = [...referencedArtifacts].sort();
  if (canonicalJson(declaredArtifacts) !== canonicalJson(actualArtifacts)) {
    return captureArtifactError("capture.json artifact digest inventory does not match references");
  }
  const { captureHash, ...manifestBase } = value;
  if (stableHash(manifestBase) !== captureHash) {
    return captureArtifactError("capture.json captureHash does not match its manifest content");
  }
  return value as unknown as CaptureArtifact;
}

function comparisonArtifactError(message: string): never {
  throw new UtsuriError("COMPARISON_ARTIFACT_INVALID", message, ExitCode.Artifact);
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function safeArtifactReference(
  reference: unknown,
  prefix: "capture/" | "comparison/"
): reference is string {
  return (
    typeof reference === "string" &&
    reference.startsWith(prefix) &&
    !reference.includes("\\") &&
    path.posix.normalize(reference) === reference
  );
}

async function validateComparisonArtifact(
  runDirectory: string,
  capture: CaptureArtifact,
  value: unknown
): Promise<ComparisonManifest> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "captureHash",
      "engine",
      "targets",
      "artifactDigests",
      "comparisonHash"
    ]) ||
    value.schemaVersion !== "1.0" ||
    value.captureHash !== capture.captureHash ||
    !isRecord(value.engine) ||
    !Array.isArray(value.targets) ||
    !isRecord(value.artifactDigests) ||
    !validDigest(value.comparisonHash)
  ) {
    return comparisonArtifactError("comparison.json has an invalid top-level structure");
  }
  if (
    !hasExactKeys(value.engine, [
      "name",
      "version",
      "pixelThreshold",
      "minimumRegionPixels",
      "mergeDistance"
    ]) ||
    value.engine.name !== "utsu-ri-compare" ||
    value.engine.version !== "1" ||
    typeof value.engine.pixelThreshold !== "number" ||
    !Number.isInteger(value.engine.minimumRegionPixels) ||
    !Number.isInteger(value.engine.mergeDistance)
  ) {
    return comparisonArtifactError("comparison engine metadata is invalid");
  }
  const captureTargetIds = new Set(capture.targets.map((target) => target.id));
  const targetRefs: string[] = [];
  const comparisonIds: string[] = [];
  const referencedDiffs = new Set<string>();
  const categories = new Set([
    "visual",
    "layout",
    "dom",
    "aria",
    "style",
    "a11y",
    "console",
    "page-error",
    "network",
    "coverage",
    "security"
  ]);
  const states = new Set(["new", "resolved", "unchanged", "incomplete"]);
  const severities = new Set(["critical", "high", "medium", "low", "info"]);
  for (const rawTarget of value.targets) {
    if (
      !isRecord(rawTarget) ||
      !hasExactKeys(rawTarget, [
        "id",
        "targetRef",
        "status",
        "images",
        "structural",
        "findings",
        "incompleteReasons"
      ]) ||
      typeof rawTarget.id !== "string" ||
      !rawTarget.id.startsWith("comparison:") ||
      typeof rawTarget.targetRef !== "string" ||
      !captureTargetIds.has(rawTarget.targetRef) ||
      !new Set(["compared", "incomplete"]).has(String(rawTarget.status)) ||
      !Array.isArray(rawTarget.images) ||
      !Array.isArray(rawTarget.findings) ||
      !Array.isArray(rawTarget.incompleteReasons) ||
      rawTarget.incompleteReasons.some((reason) => typeof reason !== "string")
    ) {
      return comparisonArtifactError("comparison target is invalid");
    }
    targetRefs.push(rawTarget.targetRef);
    comparisonIds.push(rawTarget.id);
    if (rawTarget.structural !== null) {
      if (
        !isRecord(rawTarget.structural) ||
        !hasExactKeys(rawTarget.structural, ["dom", "aria", "style"])
      ) {
        return comparisonArtifactError(`${rawTarget.id} structural comparison is invalid`);
      }
      for (const name of ["dom", "aria", "style"] as const) {
        const fingerprint = rawTarget.structural[name];
        if (
          !isRecord(fingerprint) ||
          !hasExactKeys(fingerprint, ["beforeHash", "afterHash", "changed"]) ||
          !validDigest(fingerprint.beforeHash) ||
          !validDigest(fingerprint.afterHash) ||
          typeof fingerprint.changed !== "boolean"
        ) {
          return comparisonArtifactError(`${rawTarget.id}.${name} fingerprint is invalid`);
        }
      }
    }
    for (const rawImage of rawTarget.images) {
      if (
        !isRecord(rawImage) ||
        !hasExactKeys(rawImage, [
          "id",
          "kind",
          "label",
          "beforeRef",
          "afterRef",
          "diffRef",
          "width",
          "height",
          "diffPixelCount",
          "diffRatio",
          "regions"
        ]) ||
        typeof rawImage.id !== "string" ||
        !rawImage.id.startsWith("image-comparison:") ||
        !new Set(["full-page", "crop", "viewport"]).has(String(rawImage.kind)) ||
        typeof rawImage.label !== "string" ||
        !safeArtifactReference(rawImage.beforeRef, "capture/") ||
        !safeArtifactReference(rawImage.afterRef, "capture/") ||
        !safeArtifactReference(rawImage.diffRef, "comparison/") ||
        typeof capture.artifactDigests[rawImage.beforeRef] !== "string" ||
        typeof capture.artifactDigests[rawImage.afterRef] !== "string" ||
        !Number.isInteger(rawImage.width) ||
        (rawImage.width as number) < 1 ||
        !Number.isInteger(rawImage.height) ||
        (rawImage.height as number) < 1 ||
        !Number.isInteger(rawImage.diffPixelCount) ||
        (rawImage.diffPixelCount as number) < 0 ||
        typeof rawImage.diffRatio !== "number" ||
        rawImage.diffRatio < 0 ||
        rawImage.diffRatio > 1 ||
        !Array.isArray(rawImage.regions)
      ) {
        return comparisonArtifactError(`${rawTarget.id} image comparison is invalid`);
      }
      referencedDiffs.add(rawImage.diffRef);
      const expected = value.artifactDigests[rawImage.diffRef];
      if (!validDigest(expected)) {
        return comparisonArtifactError(
          `Comparison artifact digest is missing: ${rawImage.diffRef}`
        );
      }
      const filename = await resolveContainedPath(runDirectory, rawImage.diffRef);
      if (sha256(await readRegularBytes(filename)) !== expected) {
        return comparisonArtifactError(`Comparison artifact digest mismatch: ${rawImage.diffRef}`);
      }
      for (const rawRegion of rawImage.regions) {
        if (
          !isRecord(rawRegion) ||
          !hasExactKeys(rawRegion, ["id", "x", "y", "width", "height", "pixels"]) ||
          typeof rawRegion.id !== "string" ||
          !rawRegion.id.startsWith("region:") ||
          ![rawRegion.x, rawRegion.y, rawRegion.width, rawRegion.height, rawRegion.pixels].every(
            Number.isInteger
          ) ||
          (rawRegion.x as number) < 0 ||
          (rawRegion.y as number) < 0 ||
          (rawRegion.width as number) < 1 ||
          (rawRegion.height as number) < 1 ||
          (rawRegion.pixels as number) < 1
        ) {
          return comparisonArtifactError(`${rawImage.id} changed region is invalid`);
        }
      }
    }
    for (const rawFinding of rawTarget.findings) {
      if (
        !isRecord(rawFinding) ||
        !hasExactKeys(rawFinding, [
          "id",
          "fingerprint",
          "category",
          "state",
          "severity",
          "title",
          "description",
          "targetRef",
          "evidencePaths"
        ]) ||
        typeof rawFinding.id !== "string" ||
        !rawFinding.id.startsWith("finding:") ||
        typeof rawFinding.fingerprint !== "string" ||
        !categories.has(String(rawFinding.category)) ||
        !states.has(String(rawFinding.state)) ||
        !severities.has(String(rawFinding.severity)) ||
        typeof rawFinding.title !== "string" ||
        typeof rawFinding.description !== "string" ||
        rawFinding.targetRef !== rawTarget.targetRef ||
        !Array.isArray(rawFinding.evidencePaths)
      ) {
        return comparisonArtifactError(`${rawTarget.id} finding is invalid`);
      }
      for (const reference of rawFinding.evidencePaths) {
        const captureReference = safeArtifactReference(reference, "capture/");
        const comparisonReference = safeArtifactReference(reference, "comparison/");
        if (
          (!captureReference && !comparisonReference) ||
          (captureReference && typeof capture.artifactDigests[reference as string] !== "string") ||
          (comparisonReference && typeof value.artifactDigests[reference as string] !== "string")
        ) {
          return comparisonArtifactError(
            `Finding evidence reference is invalid: ${String(reference)}`
          );
        }
      }
    }
  }
  if (
    new Set(targetRefs).size !== targetRefs.length ||
    new Set(comparisonIds).size !== comparisonIds.length ||
    canonicalJson([...targetRefs].sort()) !== canonicalJson([...captureTargetIds].sort()) ||
    canonicalJson([...referencedDiffs].sort()) !==
      canonicalJson(Object.keys(value.artifactDigests).sort())
  ) {
    return comparisonArtifactError("Comparison target or artifact inventory is inconsistent");
  }
  for (const [reference, digest] of Object.entries(value.artifactDigests)) {
    if (!safeArtifactReference(reference, "comparison/") || !validDigest(digest)) {
      return comparisonArtifactError(`Comparison digest is invalid: ${reference}`);
    }
  }
  const { comparisonHash, ...base } = value;
  if (stableHash(base) !== comparisonHash) {
    return comparisonArtifactError("comparison.json semantic hash does not match");
  }
  return value as unknown as ComparisonManifest;
}

function discoveryArtifactError(message: string): never {
  throw new UtsuriError("DISCOVERY_ARTIFACT_INVALID", message, ExitCode.Artifact);
}

function validateDiscoveryArtifact(
  capture: CaptureArtifact,
  diff: GitDiffDocument,
  plan: ReviewPlan,
  value: unknown
): DiscoveryManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "captureHash",
      "diffHash",
      "candidates",
      "unmappedChangeRefs",
      "coverage",
      "discoveryHash"
    ]) ||
    value.schemaVersion !== "1.0" ||
    value.captureHash !== capture.captureHash ||
    value.diffHash !== stableHash(diff) ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.unmappedChangeRefs) ||
    !isRecord(value.coverage) ||
    !validDigest(value.discoveryHash)
  ) {
    return discoveryArtifactError("discovery.json has an invalid top-level structure");
  }
  const captureTargets = new Set(capture.targets.map((target) => target.id));
  const changeIds = new Set(plan.candidates.map((candidate) => candidate.id));
  const hunkIds = new Set(diff.hunks.map((hunk) => hunk.id));
  const mappedChanges = new Set<string>();
  const candidateIds: string[] = [];
  const assignedTargets = new Set<string>();
  for (const rawCandidate of value.candidates) {
    if (
      !isRecord(rawCandidate) ||
      !hasExactKeys(rawCandidate, [
        "id",
        "targetId",
        "targetRefs",
        "source",
        "confidence",
        "reason",
        "knownUsageCount",
        "changeRefs",
        "hunkRefs"
      ]) ||
      typeof rawCandidate.id !== "string" ||
      !rawCandidate.id.startsWith("discovery:") ||
      typeof rawCandidate.targetId !== "string" ||
      !new Set(["explicit", "storybook", "test", "route", "import", "selector", "fallback"]).has(
        String(rawCandidate.source)
      ) ||
      !new Set(["explicit", "strong", "medium", "weak", "unknown"]).has(
        String(rawCandidate.confidence)
      ) ||
      typeof rawCandidate.reason !== "string" ||
      !Number.isInteger(rawCandidate.knownUsageCount) ||
      (rawCandidate.knownUsageCount as number) < 0 ||
      !Array.isArray(rawCandidate.targetRefs) ||
      !Array.isArray(rawCandidate.changeRefs) ||
      !Array.isArray(rawCandidate.hunkRefs)
    ) {
      return discoveryArtifactError("Discovery candidate is invalid");
    }
    candidateIds.push(rawCandidate.id);
    for (const reference of rawCandidate.targetRefs) {
      if (
        typeof reference !== "string" ||
        !captureTargets.has(reference) ||
        assignedTargets.has(reference)
      ) {
        return discoveryArtifactError(
          `Discovery target reference is invalid: ${String(reference)}`
        );
      }
      if (!reference.startsWith(`target:${rawCandidate.targetId}:`)) {
        return discoveryArtifactError(`Discovery target ID does not match ${reference}`);
      }
      assignedTargets.add(reference);
    }
    for (const reference of rawCandidate.changeRefs) {
      if (typeof reference !== "string" || !changeIds.has(reference)) {
        return discoveryArtifactError(
          `Discovery change reference is invalid: ${String(reference)}`
        );
      }
      mappedChanges.add(reference);
    }
    for (const reference of rawCandidate.hunkRefs) {
      if (typeof reference !== "string" || !hunkIds.has(reference)) {
        return discoveryArtifactError(`Discovery hunk reference is invalid: ${String(reference)}`);
      }
    }
  }
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    canonicalJson([...assignedTargets].sort()) !== canonicalJson([...captureTargets].sort())
  ) {
    return discoveryArtifactError("Discovery candidate inventory is inconsistent");
  }
  const expectedUnmapped = [...changeIds]
    .filter((reference) => !mappedChanges.has(reference))
    .sort();
  if (
    value.unmappedChangeRefs.some(
      (reference) => typeof reference !== "string" || !changeIds.has(reference)
    ) ||
    canonicalJson([...value.unmappedChangeRefs].sort()) !== canonicalJson(expectedUnmapped)
  ) {
    return discoveryArtifactError("Discovery unmapped-change inventory is inconsistent");
  }
  if (
    !hasExactKeys(value.coverage, [
      "knownUsages",
      "verifiedUsages",
      "unknownPossible",
      "planned",
      "succeeded",
      "failed"
    ]) ||
    !(value.coverage.knownUsages === null || Number.isInteger(value.coverage.knownUsages)) ||
    (typeof value.coverage.knownUsages === "number" && value.coverage.knownUsages < 0) ||
    !Number.isInteger(value.coverage.verifiedUsages) ||
    (value.coverage.verifiedUsages as number) < 0 ||
    typeof value.coverage.unknownPossible !== "boolean" ||
    !Number.isInteger(value.coverage.planned) ||
    !Number.isInteger(value.coverage.succeeded) ||
    !Number.isInteger(value.coverage.failed)
  ) {
    return discoveryArtifactError("Discovery coverage is invalid");
  }
  const succeeded = capture.targets.filter(
    (target) => target.before.status === "success" && target.after.status === "success"
  ).length;
  if (
    value.coverage.planned !== capture.targets.length ||
    value.coverage.succeeded !== succeeded ||
    value.coverage.failed !== capture.targets.length - succeeded ||
    (typeof value.coverage.knownUsages === "number" &&
      (value.coverage.verifiedUsages as number) > value.coverage.knownUsages)
  ) {
    return discoveryArtifactError("Discovery coverage does not match capture results");
  }
  const { discoveryHash, ...base } = value;
  if (stableHash(base) !== discoveryHash) {
    return discoveryArtifactError("discovery.json semantic hash does not match");
  }
  return value as unknown as DiscoveryManifest;
}

function reportCaptureResult(
  result: CaptureArtifactResult
): UtsuriReport["targets"][number]["before"] {
  return {
    status: result.status,
    screenshotRefs: result.screenshotRefs,
    ...(result.url ? { url: result.url } : {}),
    ...(result.domRef ? { domRef: result.domRef } : {}),
    ...(result.ariaRef ? { ariaRef: result.ariaRef } : {}),
    ...(result.styleRef ? { styleRef: result.styleRef } : {}),
    ...(result.axeRef ? { axeRef: result.axeRef } : {}),
    ...(result.consoleRef ? { consoleRef: result.consoleRef } : {}),
    ...(result.networkRef ? { networkRef: result.networkRef } : {}),
    ...(result.metadataRef ? { metadataRef: result.metadataRef } : {}),
    ...(result.failure
      ? {
          failure: {
            code: result.failure.code,
            message: result.failure.message,
            stage: result.failure.stage
          }
        }
      : {})
  };
}

function reportCaptureTargets(
  capture: CaptureArtifact | null,
  discovery: DiscoveryManifest | null = null,
  comparison: ComparisonManifest | null = null
): UtsuriReport["targets"] {
  return (
    capture?.targets.map((target) => {
      const discovered = discovery?.candidates.find((candidate) =>
        candidate.targetRefs.includes(target.id)
      );
      const compared = comparison?.targets.find((entry) => entry.targetRef === target.id);
      return {
        id: target.id,
        routeOrStory: target.routeOrStory,
        viewport: target.viewport,
        state: target.state,
        roots: target.roots,
        discovery: discovered
          ? {
              source: discovered.source,
              confidence: discovered.confidence,
              reason: discovered.reason
            }
          : target.discovery,
        before: reportCaptureResult(target.before),
        after: reportCaptureResult(target.after),
        ...(compared ? { comparisonRef: compared.id } : {})
      };
    }) ?? []
  );
}

function reportArtifactReferences(report: UtsuriReport): string[] {
  const captureReferences = report.targets.flatMap((target) =>
    ([target.before, target.after] as const).flatMap((result) => [
      result.domRef,
      result.ariaRef,
      result.styleRef,
      result.axeRef,
      result.consoleRef,
      result.networkRef,
      result.metadataRef
    ])
  );
  const rasterReferences = [
    ...report.targets.flatMap((target) => [
      ...target.before.screenshotRefs,
      ...target.after.screenshotRefs
    ]),
    ...report.comparisons.flatMap((comparison) =>
      comparison.images.flatMap((image) => [image.beforeRef, image.afterRef, image.diffRef])
    ),
    ...report.evidence
      .filter((evidence) => evidence.type === "visual")
      .map((evidence) => evidence.path)
      .filter(
        (reference) => reference.startsWith("capture/") || reference.startsWith("comparison/")
      )
  ];
  const references = [
    ...captureReferences,
    ...rasterReferences,
    ...report.evidence
      .filter((evidence) => evidence.type !== "visual")
      .map((evidence) => evidence.path)
      .filter(
        (reference) => reference.startsWith("capture/") || reference.startsWith("comparison/")
      )
  ].filter((reference): reference is string => Boolean(reference));
  for (const reference of references) {
    try {
      if (rasterReferences.includes(reference)) assertRasterImageReference(reference);
      else assertSafeReportAssetReference(reference);
    } catch (error) {
      throw new UtsuriError(
        "REPORT_ARTIFACT_REFERENCE_INVALID",
        error instanceof Error
          ? error.message
          : `Report artifact reference is unsafe: ${reference}`,
        ExitCode.Artifact
      );
    }
  }
  return [...new Set(references)].sort();
}

function reportRasterReferences(report: UtsuriReport): Set<string> {
  return new Set([
    ...report.targets.flatMap((target) => [
      ...target.before.screenshotRefs,
      ...target.after.screenshotRefs
    ]),
    ...report.comparisons.flatMap((comparison) =>
      comparison.images.flatMap((image) => [image.beforeRef, image.afterRef, image.diffRef])
    ),
    ...report.evidence
      .filter((evidence) => evidence.type === "visual")
      .map((evidence) => evidence.path)
      .filter(
        (reference) => reference.startsWith("capture/") || reference.startsWith("comparison/")
      )
  ]);
}

function captureReportState(capture: CaptureArtifact | null) {
  const targets = reportCaptureTargets(capture);
  const succeeded = targets.filter(
    (target) => target.before.status === "success" && target.after.status === "success"
  ).length;
  const failed = targets.length - succeeded;
  const blockedRequestCount = capture?.blockedRequestCount ?? 0;
  const incompleteReasons = capture
    ? [
        ...capture.targets.flatMap((target) =>
          (["before", "after"] as const).flatMap((side) => {
            const result = target[side];
            return result.status === "success"
              ? []
              : [`capture:${target.id}:${side}:${result.failure?.code ?? result.status}`];
          })
        ),
        ...(blockedRequestCount > 0 ? ["blocked-network-requests"] : []),
        ...(failed === 0 && blockedRequestCount === 0
          ? ["comparison-not-run", "capture-target-mapping-not-run"]
          : [])
      ]
    : ["visual-capture-not-run", "runtime-not-executed"];
  return { targets, succeeded, failed, blockedRequestCount, incompleteReasons };
}

function evidenceType(reference: string): UtsuriReport["evidence"][number]["type"] {
  const name = path.posix.basename(reference);
  if (name.endsWith(".png")) return "visual";
  if (name === "dom.json") return "dom";
  if (name === "aria.json") return "aria";
  if (name === "styles.json") return "style";
  if (name === "axe.json") return "a11y";
  return "runtime";
}

function evidenceSummary(reference: string): string {
  const type = evidenceType(reference);
  if (type === "visual") {
    return reference.includes("-diff.png")
      ? "Measured pixel-difference bitmap."
      : "Captured browser screenshot.";
  }
  if (type === "dom") return "Normalized DOM evidence.";
  if (type === "aria") return "ARIA snapshot evidence.";
  if (type === "style") return "Selected computed-style and layout evidence.";
  if (type === "a11y") return "Automated accessibility inspection evidence.";
  return "Captured runtime, network, or layout metadata evidence.";
}

function comparisonEvidence(
  report: UtsuriReport,
  comparison: ComparisonManifest,
  discovery: DiscoveryManifest
): {
  evidence: UtsuriReport["evidence"];
  idsByPath: Map<string, string>;
} {
  const targetsByPath = new Map<string, Set<string>>();
  for (const target of comparison.targets) {
    const references = [
      ...target.images.flatMap((image) => [image.beforeRef, image.afterRef, image.diffRef]),
      ...target.findings.flatMap((finding) => finding.evidencePaths)
    ];
    for (const reference of references) {
      const values = targetsByPath.get(reference) ?? new Set<string>();
      values.add(target.targetRef);
      targetsByPath.set(reference, values);
    }
  }
  const existingIds = new Set(report.evidence.map((entry) => entry.id));
  const idsByPath = new Map<string, string>();
  const evidence = [...targetsByPath.keys()].sort().map((reference) => {
    let id = stableId("evidence", { phase: 3, path: reference }, 16);
    if (existingIds.has(id)) id = stableId("evidence", { phase: 3, path: reference, retry: 1 }, 24);
    existingIds.add(id);
    idsByPath.set(reference, id);
    const targetRefs = targetsByPath.get(reference) ?? new Set<string>();
    const hunkRefs = discovery.candidates
      .filter((candidate) => candidate.targetRefs.some((targetRef) => targetRefs.has(targetRef)))
      .flatMap((candidate) => candidate.hunkRefs);
    return {
      id,
      type: evidenceType(reference),
      path: reference,
      range: null,
      summary: evidenceSummary(reference),
      hunkRefs: [...new Set(hunkRefs)].sort()
    };
  });
  return { evidence, idsByPath };
}

function riskRank(level: UtsuriReport["changes"][number]["risk"]["level"]): number {
  return ["info", "low", "medium", "high", "critical"].indexOf(level);
}

function reportComparisons(comparison: ComparisonManifest | null): UtsuriReport["comparisons"] {
  return (
    comparison?.targets.map((target) => ({
      id: target.id,
      targetRef: target.targetRef,
      status: target.status,
      images: target.images,
      structural: target.structural,
      incompleteReasons: [...new Set(target.incompleteReasons)]
    })) ?? []
  );
}

function integratePhase3(
  source: UtsuriReport,
  capture: CaptureArtifact | null,
  comparison: ComparisonManifest | null,
  discovery: DiscoveryManifest | null
): UtsuriReport {
  if (!capture || !comparison || !discovery) return source;
  const targets = reportCaptureTargets(capture, discovery, comparison);
  const comparisons = reportComparisons(comparison);
  const phase3Evidence = comparisonEvidence(source, comparison, discovery);
  const findings: UtsuriReport["findings"] = comparison.targets.flatMap((target) => {
    const candidate = discovery.candidates.find((entry) =>
      entry.targetRefs.includes(target.targetRef)
    );
    return target.findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      state: finding.state,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      targetRef: finding.targetRef,
      evidenceRefs: finding.evidencePaths
        .map((reference) => phase3Evidence.idsByPath.get(reference))
        .filter((reference): reference is string => Boolean(reference)),
      hunkRefs: candidate?.hunkRefs ?? []
    }));
  });
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const changes = source.changes.map((change) => {
    const candidates = discovery.candidates.filter((candidate) =>
      candidate.changeRefs.includes(change.id)
    );
    const targetRefs = [...new Set(candidates.flatMap((candidate) => candidate.targetRefs))].sort();
    const findingRefs = findings
      .filter((finding) => finding.targetRef && targetRefs.includes(finding.targetRef))
      .map((finding) => finding.id)
      .sort();
    const linkedFindings = findingRefs
      .map((reference) => findingsById.get(reference))
      .filter((finding): finding is UtsuriReport["findings"][number] => Boolean(finding));
    const severeNewFinding = linkedFindings
      .filter((finding) => finding.state === "new")
      .sort((left, right) => riskRank(right.severity) - riskRank(left.severity))[0];
    const riskLevel =
      severeNewFinding && riskRank(severeNewFinding.severity) > riskRank(change.risk.level)
        ? severeNewFinding.severity
        : change.risk.level;
    const compared = targetRefs.filter(
      (reference) =>
        comparison.targets.find((target) => target.targetRef === reference)?.status === "compared"
    ).length;
    const knownGap =
      discovery.coverage.knownUsages === null
        ? null
        : Math.max(0, discovery.coverage.knownUsages - discovery.coverage.verifiedUsages);
    const gaps = [
      ...change.verification.gaps.filter(
        (gap) =>
          !new Set([
            "Visual behavior was not captured.",
            "Runtime behavior was not executed.",
            "Captured evidence has not been compared or mapped to this change."
          ]).has(gap)
      ),
      ...(targetRefs.length === 0 ? ["No visual target was mapped to this change."] : []),
      ...(targetRefs.length > compared
        ? [`${targetRefs.length - compared} mapped target comparison is incomplete.`]
        : []),
      ...(knownGap && knownGap > 0 ? [`${knownGap} known usages were not verified.`] : []),
      ...(discovery.coverage.unknownPossible
        ? ["Additional unmapped usages may exist; coverage is not a percentage."]
        : [])
    ];
    return {
      ...change,
      targetRefs,
      findingRefs,
      risk: {
        level: riskLevel,
        reasons: [
          ...change.risk.reasons,
          ...(severeNewFinding
            ? [`New ${severeNewFinding.severity} ${severeNewFinding.category} finding.`]
            : [])
        ]
      },
      verification: {
        verified: [
          ...new Set([
            ...change.verification.verified,
            ...(compared > 0
              ? [`${compared} mapped browser target${compared === 1 ? " was" : "s were"} compared.`]
              : [])
          ])
        ],
        gaps: [...new Set(gaps)]
      }
    };
  });
  const captureIncomplete =
    capture.blockedRequestCount > 0 ||
    capture.targets.some(
      (target) => target.before.status !== "success" || target.after.status !== "success"
    );
  const comparisonIncomplete = comparison.targets.some(
    (target) =>
      target.status === "incomplete" ||
      target.findings.some((finding) => finding.state === "incomplete")
  );
  const newFindings = findings.filter((finding) => finding.state === "new");
  const regression = newFindings.some(
    (finding) =>
      new Set(["critical", "high", "medium"]).has(finding.severity) &&
      new Set(["layout", "a11y", "console", "page-error", "network", "security"]).has(
        finding.category
      )
  );
  const changed = findings.some((finding) => new Set(["new", "resolved"]).has(finding.state));
  const status: UtsuriReport["status"] =
    captureIncomplete || comparisonIncomplete
      ? "INCOMPLETE"
      : discovery.unmappedChangeRefs.length > 0
        ? "UNCOVERED"
        : regression
          ? "REGRESSION"
          : changed
            ? "CHANGED"
            : "PASS";
  const statement =
    status === "INCOMPLETE"
      ? "Browser comparison is incomplete; inspect failed targets before making a visual judgment."
      : status === "UNCOVERED"
        ? "Comparison completed, but at least one code change has no mapped visual target."
        : status === "REGRESSION"
          ? `Comparison found ${newFindings.length} new finding${newFindings.length === 1 ? "" : "s"}, including a likely regression.`
          : status === "CHANGED"
            ? "Measured visual or structural evidence changed without a regression being established by pixels alone."
            : "Compared targets have no new measured difference; coverage remains visible below.";
  const incompleteReasons = [
    ...source.diagnostics.incompleteReasons.filter(
      (reason) =>
        !new Set([
          "comparison-not-run",
          "capture-target-mapping-not-run",
          "visual-capture-not-run",
          "runtime-not-executed"
        ]).has(reason)
    ),
    ...comparison.targets.flatMap((target) => [
      ...target.incompleteReasons.map((reason) => `comparison:${target.targetRef}:${reason}`),
      ...target.findings
        .filter((finding) => finding.state === "incomplete")
        .map((finding) => `comparison:${target.targetRef}:incomplete-${finding.category}`)
    ]),
    ...discovery.unmappedChangeRefs.map((reference) => `coverage:unmapped:${reference}`)
  ];
  const reportId = `report-${stableHash({
    sourceReportId: source.reportId,
    comparisonHash: comparison.comparisonHash,
    discoveryHash: discovery.discoveryHash
  }).slice(0, 16)}`;
  return {
    ...source,
    reportId,
    status,
    summary: { ...source.summary, statement },
    evidence: [...source.evidence, ...phase3Evidence.evidence],
    changes,
    targets,
    comparisons,
    findings,
    coverage: discovery.coverage,
    origin: { ...source.origin, reportId },
    diagnostics: {
      incompleteReasons: [...new Set(incompleteReasons)],
      blockedRequestCount: capture.blockedRequestCount
    }
  };
}

function createCodeOnlyReport(
  input: unknown,
  diff: GitDiffDocument,
  evidenceIndex: EvidenceIndex,
  plan: ReviewPlan,
  annotations: Annotations | null,
  capture: CaptureArtifact | null
): UtsuriReport {
  const sourceChanges = annotations?.changes.length
    ? (annotations.changes as UtsuriReport["changes"])
    : createCandidateChanges(diff, plan);
  const captureState = captureReportState(capture);
  const captureComplete =
    capture !== null &&
    captureState.targets.length > 0 &&
    captureState.failed === 0 &&
    captureState.blockedRequestCount === 0;
  const changes = sourceChanges.map((change) => ({
    ...change,
    verification: {
      verified: [
        ...new Set([
          ...change.verification.verified,
          ...(captureComplete ? ["Configured before/after browser evidence was captured."] : [])
        ])
      ],
      gaps: capture
        ? [
            ...new Set([
              ...change.verification.gaps.filter(
                (gap) =>
                  gap !== "Visual behavior was not captured." &&
                  gap !== "Runtime behavior was not executed."
              ),
              captureComplete
                ? "Captured evidence has not been compared or mapped to this change."
                : "Browser capture is incomplete."
            ])
          ]
        : [
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
  const reportId = `report-${stableHash({ input, diff, evidenceIndex, plan, annotations, ...(capture ? { capture } : {}) }).slice(0, 16)}`;
  return {
    schemaVersion: "1.0",
    reportId,
    status: capture && !captureComplete ? "INCOMPLETE" : "UNCOVERED",
    summary: {
      statement: capture
        ? captureComplete
          ? "Code changes and browser evidence were collected. Comparison and target mapping remain unverified."
          : "Code changes were collected, but browser evidence is incomplete."
        : "Code changes were collected and grouped. Visual and runtime behavior remain unverified.",
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
    targets: captureState.targets,
    comparisons: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: captureState.targets.length,
      succeeded: captureState.succeeded,
      failed: captureState.failed
    },
    origin: {
      host: "unknown",
      projectFingerprint: diff.repository.fingerprint,
      reportId,
      bindingMode: "unbound",
      createdAt: new Date(0).toISOString()
    },
    diagnostics: {
      incompleteReasons: captureState.incompleteReasons,
      blockedRequestCount: captureState.blockedRequestCount
    }
  };
}

interface ValidatedReportSnapshot {
  report: UtsuriReport;
  artifactDigests: Readonly<Record<string, string>>;
  sourceSnapshotHash: string;
}

async function reconstructReportFromSourceSnapshot(
  runDirectory: string,
  source: ReportSourceSnapshot,
  annotations: Annotations | null
): Promise<ValidatedReportSnapshot> {
  const input = source.values["input.json"];
  const diffValue = source.values["diff.json"];
  const captureValue = source.values["capture.json"];
  const capture =
    captureValue === null ? null : await validateCaptureArtifact(runDirectory, captureValue);
  const comparisonValue = source.values["comparison.json"];
  if (comparisonValue !== null && capture === null) {
    throw new UtsuriError(
      "COMPARISON_REQUIRES_CAPTURE",
      "comparison.json requires a validated capture.json",
      ExitCode.Artifact
    );
  }
  const comparison =
    comparisonValue === null || capture === null
      ? null
      : await validateComparisonArtifact(runDirectory, capture, comparisonValue);
  const discoveryValue = source.values["discovery.json"];
  const artifactDigests = immutableJsonSnapshot({
    ...(capture?.artifactDigests ?? {}),
    ...(comparison?.artifactDigests ?? {})
  });
  const sourceSnapshotHash = stableHash(source.digests);
  if (diffValue !== null) {
    assertArtifact("diff", diffValue);
    const diff = diffValue as GitDiffDocument;
    assertReferenceResult("DIFF_REFERENCE_INVALID", validateDiffReferences(diff));
    const evidenceValue = source.values["evidence-index.json"];
    const planValue = source.values["review-plan.json"];
    if ((comparison === null) !== (discoveryValue === null)) {
      throw new UtsuriError(
        "PHASE3_ARTIFACT_MISSING",
        "Phase 3 evidence requires comparison.json and discovery.json together",
        ExitCode.Artifact
      );
    }
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
    const discovery =
      discoveryValue === null || capture === null
        ? null
        : validateDiscoveryArtifact(capture, diff, plan, discoveryValue);
    const report = integratePhase3(
      createCodeOnlyReport(input, diff, evidenceIndex, plan, annotations, capture),
      capture,
      comparison,
      discovery
    );
    assertReferenceResult("REPORT_REFERENCE_INVALID", validateReportReferences(report));
    return { report, artifactDigests, sourceSnapshotHash };
  }
  if (annotations?.changes.length) {
    throw new UtsuriError(
      "ANNOTATIONS_REQUIRE_DIFF",
      "Non-empty annotations require a collected diff",
      ExitCode.Artifact
    );
  }
  if (discoveryValue !== null) {
    throw new UtsuriError(
      "DISCOVERY_REQUIRES_DIFF",
      "discovery.json requires a collected diff",
      ExitCode.Artifact
    );
  }
  if (comparisonValue !== null) {
    throw new UtsuriError(
      "PHASE3_ARTIFACT_MISSING",
      "comparison.json requires a collected diff and discovery.json",
      ExitCode.Artifact
    );
  }

  const captureState = captureReportState(capture);
  const captureComplete =
    capture !== null &&
    captureState.targets.length > 0 &&
    captureState.failed === 0 &&
    captureState.blockedRequestCount === 0;
  const reportId = `report-${stableHash({ input, ...(capture ? { capture } : {}) }).slice(0, 16)}`;
  const report: UtsuriReport = {
    schemaVersion: "1.0",
    reportId,
    status: capture ? (captureComplete ? "UNCOVERED" : "INCOMPLETE") : "SKIPPED",
    summary: {
      statement: capture
        ? captureComplete
          ? "Browser evidence was captured without a code diff; comparison remains unverified."
          : "Browser evidence is incomplete and no code diff was supplied."
        : "No code diff was supplied; visual verification was skipped.",
      filesChanged: 0,
      additions: 0,
      deletions: 0
    },
    files: [],
    hunks: [],
    evidence: [],
    unclassifiedHunkRefs: [],
    changes: [],
    targets: captureState.targets,
    comparisons: [],
    findings: [],
    coverage: {
      knownUsages: null,
      verifiedUsages: 0,
      unknownPossible: true,
      planned: captureState.targets.length,
      succeeded: captureState.succeeded,
      failed: captureState.failed
    },
    origin: {
      host: "unknown",
      projectFingerprint: stableHash({ cwd: path.basename(runDirectory), input }).slice(0, 16),
      reportId,
      bindingMode: "unbound",
      createdAt: new Date(0).toISOString()
    },
    diagnostics: {
      incompleteReasons: capture
        ? [...captureState.incompleteReasons, "no-code-diff"]
        : ["no-input"],
      blockedRequestCount: captureState.blockedRequestCount
    }
  };
  assertReferenceResult("REPORT_REFERENCE_INVALID", validateReportReferences(report));
  return { report, artifactDigests, sourceSnapshotHash };
}

export async function createInitialReport(
  runDirectory: string,
  annotationsValue: unknown | null = null
): Promise<UtsuriReport> {
  let annotations: Annotations | null = null;
  if (annotationsValue !== null) {
    assertArtifact("annotations", annotationsValue);
    annotations = immutableJsonSnapshot(annotationsValue as Annotations);
  }
  const source = await readReportSourceSnapshot(runDirectory);
  return (await reconstructReportFromSourceSnapshot(runDirectory, source, annotations)).report;
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
      "sourceSnapshotHash",
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
  if (
    typeof value.sourceSnapshotHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sourceSnapshotHash)
  ) {
    errors.push("Manifest sourceSnapshotHash is invalid");
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
      "includesCookies",
      "includesRawEnvironment",
      "includesRawDom",
      "includesRawHeaders",
      "includesTraces"
    ]) ||
    value.privacy.includesAbsolutePaths !== false ||
    value.privacy.includesCookies !== false ||
    value.privacy.includesRawEnvironment !== false ||
    value.privacy.includesRawDom !== false ||
    value.privacy.includesRawHeaders !== false ||
    value.privacy.includesTraces !== false
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
    return parseBoundedJson(await readRegularText(filename), {
      label,
      maximumBytes: maximumArtifactBytes
    });
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
  runDirectory: string,
  report: UtsuriReport,
  artifactDigests: Readonly<Record<string, string>>,
  sourceSnapshotHash: string,
  options: BuildReportOptions
): Promise<ReportManifest> {
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await mkdir(path.join(directory, "diagnostics"), { recursive: true });
  await writeFile(path.join(directory, "index.html"), indexHtml(report), { flag: "wx" });
  await writeJson(path.join(directory, "report.json"), report);
  await writeFile(path.join(directory, "assets/app.js"), reportUiJavaScript, { flag: "wx" });
  await writeFile(path.join(directory, "assets/app.css"), reportUiCss, { flag: "wx" });
  await writeJson(path.join(directory, "diagnostics/summary.json"), report.diagnostics);

  const rasterReferences = reportRasterReferences(report);
  for (const reference of reportArtifactReferences(report)) {
    const source = await resolveContainedPath(runDirectory, reference);
    const destination = path.join(directory, reference);
    const bytes = await readRegularBytes(source);
    if (sha256(bytes) !== artifactDigests[reference]) {
      throw new UtsuriError(
        "REPORT_ARTIFACT_DIGEST_MISMATCH",
        `Evidence artifact changed before publication: ${reference}`,
        ExitCode.Artifact
      );
    }
    if (rasterReferences.has(reference)) {
      try {
        assertPngBytes(bytes, { maximumBytes: maximumArtifactBytes });
      } catch (error) {
        throw new UtsuriError(
          "REPORT_PNG_INVALID",
          error instanceof Error ? error.message : `Invalid PNG evidence: ${reference}`,
          ExitCode.Artifact
        );
      }
    }
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  }

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
    sourceSnapshotHash,
    semanticHash: stableHash({ report, sourceSnapshotHash, assetHashes }),
    assetHashes,
    privacy: {
      includesAbsolutePaths: false,
      includesCookies: false,
      includesRawEnvironment: false,
      includesRawDom: false,
      includesRawHeaders: false,
      includesTraces: false
    },
    incompleteReasons: report.diagnostics.incompleteReasons
  };
  await writeJson(path.join(directory, "manifest.json"), manifest);
  return manifest;
}

export async function buildReport(
  runInput: string,
  report: UtsuriReport,
  options: BuildReportOptions = {}
): Promise<{ reportDirectory: string; manifest: ReportManifest; reused: boolean }> {
  assertArtifact("report", report);
  const suppliedReport = immutableJsonSnapshot(report);
  const references = validateReportReferences(suppliedReport);
  if (!references.ok) {
    throw new UtsuriError(
      "REPORT_REFERENCE_INVALID",
      references.errors.join("; "),
      ExitCode.Artifact
    );
  }
  let annotations: Annotations | null = null;
  if (options.annotations !== undefined && options.annotations !== null) {
    assertArtifact("annotations", options.annotations);
    annotations = immutableJsonSnapshot(options.annotations as Annotations);
  }
  const publicationOptions: BuildReportOptions = {
    ...(options.now ? { now: new Date(options.now.getTime()) } : {}),
    ...(options.toolVersion !== undefined ? { toolVersion: options.toolVersion } : {})
  };

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

    const source = await readReportSourceSnapshot(runDirectory);
    if (
      suppliedReport.comparisons.length > 0 ||
      source.digests["comparison.json"] !== null ||
      source.digests["discovery.json"] !== null
    ) {
      if (
        source.digests["comparison.json"] === null ||
        source.digests["discovery.json"] === null ||
        source.digests["diff.json"] === null ||
        source.digests["review-plan.json"] === null
      ) {
        throw new UtsuriError(
          "PHASE3_ARTIFACT_MISSING",
          "Phase 3 publication requires comparison.json, discovery.json, diff.json, and review-plan.json",
          ExitCode.Artifact
        );
      }
    }

    const reconstructed = await reconstructReportFromSourceSnapshot(
      runDirectory,
      source,
      annotations
    );
    await assertReportSourcesUnchanged(runDirectory, source.digests);

    const publicationReport = immutableJsonSnapshot(reconstructed.report);
    const artifactDigests = reconstructed.artifactDigests;
    if (canonicalJson(publicationReport) !== canonicalJson(suppliedReport)) {
      throw new UtsuriError(
        "REPORT_SOURCE_MISMATCH",
        "The report does not match the report reconstructed from validated run artifacts",
        ExitCode.Artifact
      );
    }
    const artifactReferences = reportArtifactReferences(publicationReport);
    for (const reference of artifactReferences) {
      if (!validDigest(artifactDigests[reference])) {
        throw new UtsuriError(
          "REPORT_ARTIFACT_DIGEST_MISSING",
          `No independently validated digest exists for ${reference}`,
          ExitCode.Artifact
        );
      }
    }

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
      if (existing && canonicalJson(existing) === canonicalJson(publicationReport)) {
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
          if (manifestResult.manifest.sourceSnapshotHash !== reconstructed.sourceSnapshotHash) {
            throw new UtsuriError(
              "REPORT_SOURCE_SNAPSHOT_MISMATCH",
              "The immutable report was built from different source artifact bytes",
              ExitCode.Artifact
            );
          }
          await assertReportSourcesUnchanged(runDirectory, source.digests);
          await assertArtifactDigests(runDirectory, artifactReferences, artifactDigests);
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
    const manifest = await populateReportDirectory(
      stagingDirectory,
      runDirectory,
      publicationReport,
      artifactDigests,
      reconstructed.sourceSnapshotHash,
      publicationOptions
    );
    const validation = await validateReportDirectory(stagingDirectory, { strict: true });
    if (!validation.ok) {
      throw new UtsuriError(
        "REPORT_BUILD_INVALID",
        validation.errors.join("; "),
        ExitCode.Artifact
      );
    }
    await assertReportSourcesUnchanged(runDirectory, source.digests);
    await assertArtifactDigests(runDirectory, artifactReferences, artifactDigests);
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(stagingDirectory, stagingIdentity, "Staging");
    await publishDirectoryNoReplace(
      runDirectory,
      runHandle,
      runIdentity,
      stagingName,
      "report",
      stagingIdentity
    );
    await assertDirectoryIdentity(runDirectory, runIdentity, "Run");
    await assertDirectoryIdentity(reportDirectory, stagingIdentity, "Published report");
    return { reportDirectory, manifest, reused: false };
  } finally {
    await closeRunDirectoryHandle(runHandle);
  }
}

async function closeRunDirectoryHandle(runHandle: Awaited<ReturnType<typeof open>>): Promise<void> {
  try {
    await runHandle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
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
      for (const reference of reportArtifactReferences(report)) {
        if (!files.includes(reference)) errors.push(`Missing capture evidence: ${reference}`);
      }
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
        const bytes = await readRegularBytes(file);
        if (/^(?:capture|comparison)\/.+\.png$/iu.test(relative)) {
          try {
            assertPngBytes(bytes, { maximumBytes: maximumArtifactBytes });
          } catch {
            errors.push(`Invalid PNG asset: ${relative}`);
          }
        }
        const actual = sha256(bytes);
        if (actual !== expected) errors.push(`Hash mismatch: ${relative}`);
      } catch {
        errors.push(`Missing asset: ${relative}`);
      }
    }
    if (report) {
      if (manifest.reportId !== report.reportId) errors.push("Manifest reportId mismatch");
      if (
        manifest.semanticHash !==
        stableHash({
          report,
          sourceSnapshotHash: manifest.sourceSnapshotHash,
          assetHashes: manifest.assetHashes
        })
      ) {
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
    const expectedAssets = [
      ...reportArtifactPaths,
      ...(report ? reportArtifactReferences(report) : [])
    ].sort();
    if (JSON.stringify(actualAssets) !== JSON.stringify(expectedAssets)) {
      errors.push("Strict report artifact inventory mismatch");
    }
    for (const [relative, expected] of [
      ["index.html", report ? indexHtml(report) : null],
      ["assets/app.js", reportUiJavaScript],
      ["assets/app.css", reportUiCss],
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
        const diagnostics = parseBoundedJson(
          await readRegularText(path.join(directory, "diagnostics/summary.json")),
          { label: "diagnostics/summary.json", maximumBytes: maximumArtifactBytes }
        );
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
