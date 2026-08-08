import type { UtsuriReport } from "@utsu-ri/report-model";
import type { AnchorReanchorResult, ReviewAnchor, ReviewDigest } from "./types";

async function anchor(
  digest: ReviewDigest,
  value: Omit<ReviewAnchor, "fingerprint">,
  fingerprintSource: unknown
): Promise<ReviewAnchor> {
  return { ...value, fingerprint: await digest(fingerprintSource) };
}

export async function reportFingerprint(
  report: UtsuriReport,
  digest: ReviewDigest
): Promise<string> {
  return digest(report);
}

export async function buildAnchorCatalog(
  report: UtsuriReport,
  digest: ReviewDigest
): Promise<ReviewAnchor[]> {
  const pending: Array<Promise<ReviewAnchor>> = [];
  for (const change of report.changes) {
    pending.push(anchor(digest, { type: "change", ref: change.id }, change));
    for (const [index, gap] of change.verification.gaps.entries()) {
      pending.push(
        anchor(
          digest,
          { type: "verification-gap", ref: `${change.id}:gap:${index}` },
          { changeId: change.id, index, gap }
        )
      );
    }
  }
  for (const file of report.files) {
    pending.push(
      anchor(
        digest,
        { type: "file", ref: file.id, path: file.newPath ?? file.oldPath ?? undefined },
        file
      )
    );
  }
  for (const hunk of report.hunks) {
    pending.push(anchor(digest, { type: "hunk", ref: hunk.id, path: hunk.path }, hunk));
    for (const [index, line] of hunk.lines.entries()) {
      if (line.kind === "no-newline") continue;
      const side =
        line.kind === "addition" ? "after" : line.kind === "deletion" ? "before" : "diff";
      const lineNumber = side === "before" ? line.oldLine : (line.newLine ?? line.oldLine);
      if (!lineNumber || lineNumber < 1) continue;
      pending.push(
        anchor(
          digest,
          {
            type: "line-range",
            ref: `${hunk.id}:${side}:${lineNumber}:${index}`,
            path: hunk.path,
            side,
            startLine: lineNumber,
            endLine: lineNumber
          },
          { path: hunk.path, side, lineNumber, content: line.content }
        )
      );
    }
  }
  for (const target of report.targets) {
    pending.push(anchor(digest, { type: "visual-target", ref: target.id }, target));
  }
  for (const comparison of report.comparisons) {
    const target = report.targets.find((entry) => entry.id === comparison.targetRef);
    for (const image of comparison.images) {
      for (const region of image.regions) {
        pending.push(
          anchor(
            digest,
            {
              type: "visual-region",
              ref: `${comparison.id}:${image.id}:${region.id}`,
              targetRef: comparison.targetRef,
              region: {
                x: region.x / image.width,
                y: region.y / image.height,
                width: region.width / image.width,
                height: region.height / image.height
              }
            },
            { target, comparison, image, region }
          )
        );
      }
    }
  }
  for (const finding of report.findings) {
    pending.push(
      anchor(digest, { type: "finding", ref: finding.id, targetRef: finding.targetRef }, finding)
    );
  }
  const catalog = await Promise.all(pending);
  return catalog.sort((left, right) =>
    `${left.type}\u0000${left.ref}`.localeCompare(`${right.type}\u0000${right.ref}`)
  );
}

export async function buildLegacyVisualAnchorCatalog(
  report: UtsuriReport,
  digest: ReviewDigest
): Promise<ReviewAnchor[]> {
  const pending: Array<Promise<ReviewAnchor>> = [];
  for (const comparison of report.comparisons) {
    for (const image of comparison.images) {
      for (const region of image.regions) {
        pending.push(
          anchor(
            digest,
            {
              type: "visual-region",
              ref: `${comparison.id}:${image.id}:${region.id}`,
              targetRef: comparison.targetRef,
              region: {
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height
              }
            },
            { comparisonId: comparison.id, imageId: image.id, region }
          )
        );
      }
    }
  }
  return Promise.all(pending);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasLegacyRegionShape(value: unknown): value is {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 4 &&
    keys.every((key) => new Set(["x", "y", "width", "height"]).has(key)) &&
    [value.x, value.y, value.width, value.height].every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)
    )
  );
}

export function migrateLegacyVisualRegionAnchors<T>(
  value: T,
  currentCatalog: readonly ReviewAnchor[],
  legacyCatalog: readonly ReviewAnchor[],
  exactReport: boolean
): T {
  const migrated = structuredClone(value);
  if (!migrated || typeof migrated !== "object") return migrated;
  const currentByKey = new Map(currentCatalog.map((entry) => [anchorKey(entry), entry]));
  const legacyByKey = new Map(legacyCatalog.map((entry) => [anchorKey(entry), entry]));
  const pending: object[] = [migrated];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const candidate = pending.pop()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      for (const child of candidate) {
        if (child && typeof child === "object") pending.push(child);
      }
      continue;
    }
    const item = candidate as Record<string, unknown>;
    if (
      item.type === "visual-region" &&
      typeof item.ref === "string" &&
      typeof item.fingerprint === "string" &&
      hasLegacyRegionShape(item.region)
    ) {
      const key = JSON.stringify([item.type, item.ref]);
      const current = currentByKey.get(key);
      const legacy = legacyByKey.get(key);
      const pixelCoordinates = [
        item.region.x,
        item.region.y,
        item.region.width,
        item.region.height
      ].some((coordinate) => coordinate > 1);
      const legacyFingerprint = legacy?.fingerprint === item.fingerprint;
      if (legacyFingerprint && current) {
        if (current.region) item.region = structuredClone(current.region);
        else delete item.region;
        if (current.targetRef) item.targetRef = current.targetRef;
        else delete item.targetRef;
        if (exactReport) item.fingerprint = current.fingerprint;
      } else if (pixelCoordinates && !exactReport) {
        delete item.region;
      }
    }
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return migrated;
}

export function anchorKey(anchor: Pick<ReviewAnchor, "type" | "ref">): string {
  return JSON.stringify([anchor.type, anchor.ref]);
}

export function findAnchor(
  catalog: readonly ReviewAnchor[],
  type: ReviewAnchor["type"],
  ref: string
): ReviewAnchor | undefined {
  return catalog.find((entry) => entry.type === type && entry.ref === ref);
}

export function classifyAnchor(
  source: ReviewAnchor,
  currentCatalog: readonly ReviewAnchor[]
): AnchorReanchorResult {
  const sameIdentity = currentCatalog.find(
    (candidate) => candidate.type === source.type && candidate.ref === source.ref
  );
  if (sameIdentity?.fingerprint === source.fingerprint) {
    return { source, result: "exact", disposition: "matched", candidate: sameIdentity };
  }
  if (sameIdentity) {
    return { source, result: "changed", disposition: "stale", candidate: sameIdentity };
  }
  const sameFingerprint = currentCatalog.filter(
    (candidate) => candidate.type === source.type && candidate.fingerprint === source.fingerprint
  );
  if (sameFingerprint.length === 1) {
    return { source, result: "probable", disposition: "stale", candidate: sameFingerprint[0] };
  }
  return { source, result: "missing", disposition: "orphaned" };
}
