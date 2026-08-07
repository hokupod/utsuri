import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CaptureManifest, CaptureSideResult, CaptureTargetResult } from "@utsu-ri/capture";
import { ExitCode, sha256, stableHash, stableId, UtsuriError } from "@utsu-ri/core";
import { resolveContainedPath } from "@utsu-ri/security";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { extractChangedRegions } from "./regions";
import type {
  CompareRunResult,
  ComparisonFinding,
  ComparisonManifest,
  FindingCategory,
  FindingSeverity,
  FindingState,
  ImageComparison,
  StructuralComparison,
  TargetComparison
} from "./types";

const engine = {
  name: "utsu-ri-compare" as const,
  version: "1" as const,
  pixelThreshold: 0.1,
  minimumRegionPixels: 2,
  mergeDistance: 4
};
const maximumArtifactBytes = 64 * 1024 * 1024;
const maximumPixels = 100_000_000;

function artifactError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeReference(reference: string, prefix: "capture/" | "comparison/"): boolean {
  return (
    reference.startsWith(prefix) &&
    !reference.includes("\\") &&
    path.posix.normalize(reference) === reference
  );
}

async function readBoundArtifact(
  runDirectory: string,
  reference: string,
  digests: Readonly<Record<string, string>>
): Promise<Buffer> {
  if (!safeReference(reference, "capture/")) {
    return artifactError("COMPARE_CAPTURE_REFERENCE", `Unsafe capture reference: ${reference}`);
  }
  const expected = digests[reference];
  if (!expected || !/^[a-f0-9]{64}$/u.test(expected)) {
    return artifactError("COMPARE_CAPTURE_DIGEST", `Missing capture digest: ${reference}`);
  }
  const filename = await resolveContainedPath(runDirectory, reference);
  const fileStat = await lstat(filename);
  if (!fileStat.isFile() || fileStat.size > maximumArtifactBytes) {
    return artifactError("COMPARE_CAPTURE_FILE", `Invalid capture artifact: ${reference}`);
  }
  const bytes = await readFile(filename);
  if (sha256(bytes) !== expected) {
    return artifactError("COMPARE_CAPTURE_DIGEST", `Capture digest mismatch: ${reference}`);
  }
  return bytes;
}

async function readBoundJson(
  runDirectory: string,
  reference: string | undefined,
  digests: Readonly<Record<string, string>>
): Promise<unknown> {
  if (!reference)
    return artifactError("COMPARE_CAPTURE_REFERENCE", "Capture JSON reference missing");
  try {
    return JSON.parse(
      (await readBoundArtifact(runDirectory, reference, digests)).toString("utf8")
    ) as unknown;
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    return artifactError("COMPARE_CAPTURE_JSON", `Capture artifact is not JSON: ${reference}`);
  }
}

function assertCaptureManifest(value: unknown): asserts value is CaptureManifest {
  if (!isRecord(value)) return artifactError("COMPARE_CAPTURE_INVALID", "capture.json is invalid");
  const keys = Object.keys(value).sort();
  const required = [
    "artifactDigests",
    "blockedRequestCount",
    "browser",
    "capability",
    "captureHash",
    "configurationHash",
    "environment",
    "mode",
    "schemaVersion",
    "stabilization",
    "targets"
  ].sort();
  if (keys.length !== required.length || keys.some((key, index) => key !== required[index])) {
    return artifactError("COMPARE_CAPTURE_INVALID", "capture.json fields are invalid");
  }
  if (
    value.schemaVersion !== "1.0" ||
    !Array.isArray(value.targets) ||
    value.targets.length === 0 ||
    !isRecord(value.artifactDigests) ||
    typeof value.captureHash !== "string"
  ) {
    return artifactError("COMPARE_CAPTURE_INVALID", "capture.json shape is invalid");
  }
  const { captureHash, ...base } = value;
  if (stableHash(base) !== captureHash) {
    return artifactError("COMPARE_CAPTURE_HASH", "capture.json semantic hash does not match");
  }
}

function padded(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image;
  const output = new PNG({ width, height, fill: true });
  output.data.fill(0);
  for (let row = 0; row < image.height; row += 1) {
    const sourceStart = row * image.width * 4;
    const targetStart = row * width * 4;
    image.data.copy(output.data, targetStart, sourceStart, sourceStart + image.width * 4);
  }
  return output;
}

function screenshotKind(reference: string): ImageComparison["kind"] {
  const name = path.posix.basename(reference);
  if (name.startsWith("crop-")) return "crop";
  if (name === "full-page.png") return "full-page";
  return "viewport";
}

function screenshotLabel(reference: string, index: number): string {
  const kind = screenshotKind(reference);
  if (kind === "crop") return `Component crop ${index}`;
  return kind === "full-page" ? "Full page" : "Viewport";
}

function targetDirectoryName(targetRef: string): string {
  return `${targetRef.replace(/[^a-zA-Z0-9_-]+/gu, "-").slice(0, 48)}-${stableHash(targetRef).slice(0, 8)}`;
}

async function writeBoundOutput(
  runDirectory: string,
  reference: string,
  bytes: Uint8Array
): Promise<void> {
  if (!safeReference(reference, "comparison/")) {
    return artifactError("COMPARE_OUTPUT_REFERENCE", `Unsafe comparison reference: ${reference}`);
  }
  const filename = await resolveContainedPath(runDirectory, reference, { allowMissing: true });
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  try {
    await writeFile(filename, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(filename);
    if (sha256(existing) !== sha256(bytes)) {
      return artifactError(
        "COMPARE_OUTPUT_COLLISION",
        `Content-addressed comparison artifact differs: ${reference}`
      );
    }
  }
}

async function compareImage(
  runDirectory: string,
  outputRoot: string,
  targetRef: string,
  index: number,
  beforeRef: string,
  afterRef: string,
  captureDigests: Readonly<Record<string, string>>
): Promise<ImageComparison> {
  let before: PNG;
  let after: PNG;
  try {
    before = PNG.sync.read(await readBoundArtifact(runDirectory, beforeRef, captureDigests));
    after = PNG.sync.read(await readBoundArtifact(runDirectory, afterRef, captureDigests));
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    return artifactError("COMPARE_PNG_INVALID", `Screenshot is not a valid PNG for ${targetRef}`);
  }
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  if (width < 1 || height < 1 || width * height > maximumPixels) {
    return artifactError("COMPARE_PNG_LIMIT", `Screenshot dimensions are unsafe for ${targetRef}`);
  }
  before = padded(before, width, height);
  after = padded(after, width, height);
  const diff = new PNG({ width, height, fill: true });
  const diffPixelCount = pixelmatch(before.data, after.data, diff.data, width, height, {
    threshold: engine.pixelThreshold,
    includeAA: false,
    diffColor: [220, 38, 38],
    diffMask: true
  });
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    mask[pixel] = diff.data[pixel * 4 + 3] === 0 ? 0 : 1;
  }
  const regions = extractChangedRegions(mask, width, height, {
    minimumPixels: engine.minimumRegionPixels,
    mergeDistance: engine.mergeDistance
  });
  const diffRef = `${outputRoot}/targets/${targetDirectoryName(targetRef)}/image-${String(index).padStart(2, "0")}-diff.png`;
  await writeBoundOutput(runDirectory, diffRef, PNG.sync.write(diff));
  return {
    id: stableId("image-comparison", { targetRef, index, beforeRef, afterRef }, 16),
    kind: screenshotKind(beforeRef),
    label: screenshotLabel(beforeRef, index),
    beforeRef,
    afterRef,
    diffRef,
    width,
    height,
    diffPixelCount,
    diffRatio: Number((diffPixelCount / (width * height)).toFixed(8)),
    regions
  };
}

function comparisonFinding(
  targetRef: string,
  input: Omit<ComparisonFinding, "id" | "targetRef">
): ComparisonFinding {
  return {
    id: stableId("finding", { targetRef, fingerprint: input.fingerprint, state: input.state }, 16),
    targetRef,
    ...input,
    evidencePaths: [...new Set(input.evidencePaths)].sort()
  };
}

interface FingerprintValue {
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  evidencePaths: string[];
}

function classifyFingerprints(
  targetRef: string,
  before: ReadonlyMap<string, FingerprintValue> | null,
  after: ReadonlyMap<string, FingerprintValue> | null,
  incomplete: FingerprintValue
): ComparisonFinding[] {
  if (!before || !after) {
    return [
      comparisonFinding(targetRef, {
        fingerprint: `incomplete:${incomplete.category}`,
        category: incomplete.category,
        state: "incomplete",
        severity: "info",
        title: incomplete.title,
        description: incomplete.description,
        evidencePaths: incomplete.evidencePaths
      })
    ];
  }
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((fingerprint) => {
    const previous = before.get(fingerprint);
    const current = after.get(fingerprint);
    const value = current ?? previous!;
    const state: FindingState = previous ? (current ? "unchanged" : "resolved") : "new";
    return comparisonFinding(targetRef, { fingerprint, state, ...value });
  });
}

function structural(
  before: unknown,
  after: unknown
): { beforeHash: string; afterHash: string; changed: boolean } {
  const beforeHash = stableHash(before);
  const afterHash = stableHash(after);
  return { beforeHash, afterHash, changed: beforeHash !== afterHash };
}

function axeFingerprints(
  value: unknown,
  targetRef: string,
  evidencePaths: string[]
): Map<string, FingerprintValue> | null {
  if (!isRecord(value) || !Array.isArray(value.violations)) return null;
  const output = new Map<string, FingerprintValue>();
  for (const rawRule of value.violations) {
    if (!isRecord(rawRule) || typeof rawRule.id !== "string" || !Array.isArray(rawRule.nodes)) {
      continue;
    }
    const impact = typeof rawRule.impact === "string" ? rawRule.impact : "unknown";
    const severity: FindingSeverity =
      impact === "critical"
        ? "critical"
        : impact === "serious"
          ? "high"
          : impact === "moderate"
            ? "medium"
            : impact === "minor"
              ? "low"
              : "info";
    for (const rawNode of rawRule.nodes) {
      if (!isRecord(rawNode) || !Array.isArray(rawNode.target)) continue;
      const selector = rawNode.target
        .flatMap((part) => (Array.isArray(part) ? part : [part]))
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
      const fingerprint = `${rawRule.id}:${selector || "unknown-target"}:${targetRef}`;
      output.set(fingerprint, {
        title: `Accessibility rule ${rawRule.id}`,
        description:
          typeof rawRule.help === "string"
            ? rawRule.help
            : "Automated accessibility inspection reported this rule.",
        severity,
        category: "a11y",
        evidencePaths
      });
    }
  }
  return output;
}

function runtimeFingerprints(
  value: unknown,
  evidencePaths: string[]
): Map<string, FingerprintValue> | null {
  if (!Array.isArray(value)) return null;
  const output = new Map<string, FingerprintValue>();
  for (const rawEntry of value) {
    if (
      !isRecord(rawEntry) ||
      typeof rawEntry.type !== "string" ||
      typeof rawEntry.text !== "string"
    ) {
      continue;
    }
    if (!new Set(["error", "assert", "pageerror"]).has(rawEntry.type)) continue;
    const category: FindingCategory = rawEntry.type === "pageerror" ? "page-error" : "console";
    const fingerprint = `${rawEntry.type}:${rawEntry.text}`;
    output.set(fingerprint, {
      title: rawEntry.type === "pageerror" ? "Page error" : "Console error",
      description: rawEntry.text,
      severity: "high",
      category,
      evidencePaths
    });
  }
  return output;
}

function networkFingerprints(
  value: unknown,
  evidencePaths: string[]
): Map<string, FingerprintValue> | null {
  if (!Array.isArray(value)) return null;
  const output = new Map<string, FingerprintValue>();
  for (const rawEntry of value) {
    if (!isRecord(rawEntry) || typeof rawEntry.url !== "string") continue;
    const status = typeof rawEntry.status === "number" ? rawEntry.status : null;
    const disposition = typeof rawEntry.disposition === "string" ? rawEntry.disposition : "unknown";
    if (disposition === "allowed" && (status === null || status < 400)) continue;
    const reason = typeof rawEntry.reason === "string" ? rawEntry.reason : disposition;
    const fingerprint = `${disposition}:${status ?? "none"}:${rawEntry.url}:${reason}`;
    output.set(fingerprint, {
      title: disposition === "blocked" ? "Blocked request" : "Failed request",
      description: `${rawEntry.url} (${reason}${status === null ? "" : `, HTTP ${status}`})`,
      severity:
        disposition === "blocked" ? "info" : status !== null && status >= 500 ? "high" : "medium",
      category: "network",
      evidencePaths
    });
  }
  return output;
}

function overflowFingerprints(
  styles: unknown,
  metadata: unknown,
  evidencePaths: string[]
): Map<string, FingerprintValue> | null {
  if (!Array.isArray(styles) || !isRecord(metadata)) return null;
  const viewport = isRecord(metadata.viewport) ? metadata.viewport : null;
  const dimensions = isRecord(metadata.dimensions) ? metadata.dimensions : null;
  const viewportWidth = typeof viewport?.width === "number" ? viewport.width : null;
  const viewportHeight = typeof viewport?.height === "number" ? viewport.height : null;
  const documentWidth = typeof dimensions?.width === "number" ? dimensions.width : null;
  const output = new Map<string, FingerprintValue>();
  if (viewportWidth !== null && documentWidth !== null && documentWidth > viewportWidth + 1) {
    output.set("document-horizontal-overflow", {
      title: "Document horizontal overflow",
      description: `Document width ${documentWidth}px exceeds the ${viewportWidth}px viewport.`,
      severity: "medium",
      category: "layout",
      evidencePaths
    });
  }
  if (viewportWidth === null || viewportHeight === null) return output;
  for (const rawEntry of styles) {
    if (!isRecord(rawEntry) || !isRecord(rawEntry.rectangle) || !isRecord(rawEntry.values))
      continue;
    const rectangle = rawEntry.rectangle;
    const x = typeof rectangle.x === "number" ? rectangle.x : 0;
    const y = typeof rectangle.y === "number" ? rectangle.y : 0;
    const width = typeof rectangle.width === "number" ? rectangle.width : 0;
    const height = typeof rectangle.height === "number" ? rectangle.height : 0;
    const index = typeof rawEntry.index === "number" ? rawEntry.index : -1;
    const identity =
      (typeof rawEntry.testId === "string" && rawEntry.testId) ||
      (typeof rawEntry.id === "string" && rawEntry.id) ||
      `${typeof rawEntry.tag === "string" ? rawEntry.tag : "element"}:${index}`;
    if (rawEntry.root === true && isRecord(rawEntry.scroll)) {
      const scrollWidth = typeof rawEntry.scroll.width === "number" ? rawEntry.scroll.width : width;
      const clientWidth =
        typeof rawEntry.scroll.clientWidth === "number" ? rawEntry.scroll.clientWidth : width;
      if (clientWidth > 0 && scrollWidth > clientWidth + 1) {
        output.set(`target-root-overflow:${identity}`, {
          title: "Target root horizontal overflow",
          description: `${identity} scroll width ${scrollWidth}px exceeds its ${clientWidth}px client width.`,
          severity: "medium",
          category: "layout",
          evidencePaths
        });
      }
    }
    if (width > 0 && (x < -1 || x + width > viewportWidth + 1)) {
      output.set(`viewport-overflow:${identity}`, {
        title: "Element extends outside the viewport",
        description: `${identity} spans x=${x} to ${x + width} in a ${viewportWidth}px viewport.`,
        severity: "medium",
        category: "layout",
        evidencePaths
      });
    }
    const position = rawEntry.values.position;
    if (
      position === "fixed" &&
      width * height > viewportWidth * viewportHeight * 0.2 &&
      x < viewportWidth &&
      y < viewportHeight
    ) {
      output.set(`fixed-obstruction:${identity}`, {
        title: "Potential fixed-element obstruction",
        description: `${identity} is fixed and covers more than 20% of the viewport.`,
        severity: "low",
        category: "layout",
        evidencePaths
      });
    }
  }
  return output;
}

async function compareSuccessfulTarget(
  runDirectory: string,
  outputRoot: string,
  capture: CaptureManifest,
  target: CaptureTargetResult
): Promise<TargetComparison> {
  const incompleteReasons: string[] = [];
  if (target.before.screenshotRefs.length !== target.after.screenshotRefs.length) {
    incompleteReasons.push("screenshot-count-mismatch");
  }
  const pairCount = Math.min(
    target.before.screenshotRefs.length,
    target.after.screenshotRefs.length
  );
  if (pairCount === 0) incompleteReasons.push("screenshots-missing");
  const images: ImageComparison[] = [];
  for (let index = 0; index < pairCount; index += 1) {
    images.push(
      await compareImage(
        runDirectory,
        outputRoot,
        target.id,
        index + 1,
        target.before.screenshotRefs[index]!,
        target.after.screenshotRefs[index]!,
        capture.artifactDigests
      )
    );
  }

  const beforeDom = await readBoundJson(
    runDirectory,
    target.before.domRef,
    capture.artifactDigests
  );
  const afterDom = await readBoundJson(runDirectory, target.after.domRef, capture.artifactDigests);
  const beforeAria = await readBoundJson(
    runDirectory,
    target.before.ariaRef,
    capture.artifactDigests
  );
  const afterAria = await readBoundJson(
    runDirectory,
    target.after.ariaRef,
    capture.artifactDigests
  );
  const beforeStyles = await readBoundJson(
    runDirectory,
    target.before.styleRef,
    capture.artifactDigests
  );
  const afterStyles = await readBoundJson(
    runDirectory,
    target.after.styleRef,
    capture.artifactDigests
  );
  const structuralResult: StructuralComparison = {
    dom: structural(beforeDom, afterDom),
    aria: structural(beforeAria, afterAria),
    style: structural(beforeStyles, afterStyles)
  };
  const primaryImages = [
    target.before.screenshotRefs[0],
    target.after.screenshotRefs[0],
    images[0]?.diffRef
  ].filter((entry): entry is string => Boolean(entry));
  const findings: ComparisonFinding[] = [];
  const changedPixels = images.reduce((sum, image) => sum + image.diffPixelCount, 0);
  if (changedPixels > 0) {
    findings.push(
      comparisonFinding(target.id, {
        fingerprint: `pixel-change:${images.map((image) => image.diffPixelCount).join(":")}`,
        category: "visual",
        state: "new",
        severity: "info",
        title: "Rendered pixels changed",
        description: `${changedPixels} pixels differ across ${images.length} image comparison${images.length === 1 ? "" : "s"}. Pixel change alone does not establish a regression.`,
        evidencePaths: primaryImages
      })
    );
  }
  for (const [category, result, references] of [
    ["dom", structuralResult.dom, [target.before.domRef, target.after.domRef]],
    ["aria", structuralResult.aria, [target.before.ariaRef, target.after.ariaRef]],
    ["style", structuralResult.style, [target.before.styleRef, target.after.styleRef]]
  ] as const) {
    if (!result.changed) continue;
    findings.push(
      comparisonFinding(target.id, {
        fingerprint: `${category}:${result.beforeHash}:${result.afterHash}`,
        category,
        state: "new",
        severity: "info",
        title: `${category.toUpperCase()} evidence changed`,
        description: `Normalized ${category} fingerprints differ between before and after.`,
        evidencePaths: references.filter((entry): entry is string => Boolean(entry))
      })
    );
  }

  const [beforeAxe, afterAxe, beforeConsole, afterConsole, beforeNetwork, afterNetwork] =
    await Promise.all([
      readBoundJson(runDirectory, target.before.axeRef, capture.artifactDigests),
      readBoundJson(runDirectory, target.after.axeRef, capture.artifactDigests),
      readBoundJson(runDirectory, target.before.consoleRef, capture.artifactDigests),
      readBoundJson(runDirectory, target.after.consoleRef, capture.artifactDigests),
      readBoundJson(runDirectory, target.before.networkRef, capture.artifactDigests),
      readBoundJson(runDirectory, target.after.networkRef, capture.artifactDigests)
    ]);
  findings.push(
    ...classifyFingerprints(
      target.id,
      axeFingerprints(beforeAxe, target.id, [target.before.axeRef!]),
      axeFingerprints(afterAxe, target.id, [target.after.axeRef!, ...primaryImages]),
      {
        title: "Accessibility comparison incomplete",
        description: "Axe evidence was disabled, skipped, or malformed on at least one side.",
        severity: "info",
        category: "a11y",
        evidencePaths: [target.before.axeRef!, target.after.axeRef!]
      }
    ),
    ...classifyFingerprints(
      target.id,
      runtimeFingerprints(beforeConsole, [target.before.consoleRef!]),
      runtimeFingerprints(afterConsole, [target.after.consoleRef!, ...primaryImages]),
      {
        title: "Runtime comparison incomplete",
        description: "Console evidence was malformed on at least one side.",
        severity: "info",
        category: "console",
        evidencePaths: [target.before.consoleRef!, target.after.consoleRef!]
      }
    ),
    ...classifyFingerprints(
      target.id,
      networkFingerprints(beforeNetwork, [target.before.networkRef!]),
      networkFingerprints(afterNetwork, [target.after.networkRef!, ...primaryImages]),
      {
        title: "Network comparison incomplete",
        description: "Network evidence was malformed on at least one side.",
        severity: "info",
        category: "network",
        evidencePaths: [target.before.networkRef!, target.after.networkRef!]
      }
    )
  );

  const [beforeMetadata, afterMetadata] = await Promise.all([
    readBoundJson(runDirectory, target.before.metadataRef, capture.artifactDigests),
    readBoundJson(runDirectory, target.after.metadataRef, capture.artifactDigests)
  ]);
  findings.push(
    ...classifyFingerprints(
      target.id,
      overflowFingerprints(beforeStyles, beforeMetadata, [
        target.before.styleRef!,
        target.before.metadataRef!,
        target.before.screenshotRefs[0]!
      ]),
      overflowFingerprints(afterStyles, afterMetadata, [
        target.after.styleRef!,
        target.after.metadataRef!,
        target.after.screenshotRefs[0]!
      ]),
      {
        title: "Overflow comparison incomplete",
        description: "Layout or metadata evidence was malformed on at least one side.",
        severity: "info",
        category: "layout",
        evidencePaths: [target.before.styleRef!, target.after.styleRef!]
      }
    )
  );

  return {
    id: stableId("comparison", { targetRef: target.id, captureHash: capture.captureHash }, 16),
    targetRef: target.id,
    status: incompleteReasons.length > 0 ? "incomplete" : "compared",
    images,
    structural: structuralResult,
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    incompleteReasons
  };
}

function incompleteTarget(target: CaptureTargetResult, captureHash: string): TargetComparison {
  const reasons = (["before", "after"] as const).flatMap((side) => {
    const result: CaptureSideResult = target[side];
    return result.status === "success" ? [] : [`${side}:${result.failure?.code ?? result.status}`];
  });
  return {
    id: stableId("comparison", { targetRef: target.id, captureHash }, 16),
    targetRef: target.id,
    status: "incomplete",
    images: [],
    structural: null,
    findings: [
      comparisonFinding(target.id, {
        fingerprint: `capture-incomplete:${reasons.join(":")}`,
        category: "visual",
        state: "incomplete",
        severity: "info",
        title: "Comparison incomplete",
        description: `Capture did not succeed on both sides: ${reasons.join(", ")}.`,
        evidencePaths: [target.before.failureRef, target.after.failureRef].filter(
          (entry): entry is string => Boolean(entry)
        )
      })
    ],
    incompleteReasons: reasons
  };
}

async function publishManifest(
  runDirectory: string,
  manifest: ComparisonManifest
): Promise<string> {
  const filename = path.join(runDirectory, "comparison.json");
  const temporary = path.join(runDirectory, `.comparison-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
    try {
      const destination = await lstat(filename);
      if (!destination.isFile()) {
        return artifactError("COMPARE_MANIFEST_PATH", "comparison.json is not a regular file");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, filename);
    return filename;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function compareRun(runInput: string): Promise<CompareRunResult> {
  const runDirectory = await realpath(runInput);
  const captureValue = JSON.parse(
    await readFile(path.join(runDirectory, "capture.json"), "utf8")
  ) as unknown;
  assertCaptureManifest(captureValue);
  const capture = captureValue;
  const outputRoot = `comparison/${stableHash({ captureHash: capture.captureHash, engine }).slice(0, 16)}`;
  const targets: TargetComparison[] = [];
  for (const target of capture.targets) {
    targets.push(
      target.before.status === "success" && target.after.status === "success"
        ? await compareSuccessfulTarget(runDirectory, outputRoot, capture, target)
        : incompleteTarget(target, capture.captureHash)
    );
  }
  const diffReferences = targets.flatMap((target) => target.images.map((image) => image.diffRef));
  const artifactDigests = Object.fromEntries(
    await Promise.all(
      [...new Set(diffReferences)].sort().map(async (reference) => {
        const filename = await resolveContainedPath(runDirectory, reference);
        return [reference, sha256(await readFile(filename))] as const;
      })
    )
  );
  const base = {
    schemaVersion: "1.0" as const,
    captureHash: capture.captureHash,
    engine,
    targets,
    artifactDigests
  };
  const manifest: ComparisonManifest = { ...base, comparisonHash: stableHash(base) };
  const manifestPath = await publishManifest(runDirectory, manifest);
  return {
    manifest,
    manifestPath,
    complete: targets.every(
      (target) =>
        target.status === "compared" &&
        target.findings.every((finding) => finding.state !== "incomplete")
    )
  };
}
