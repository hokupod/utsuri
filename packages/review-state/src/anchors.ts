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
