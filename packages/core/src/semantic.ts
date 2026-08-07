import path from "node:path";
import { stableId } from "./hash";
import {
  displayPath,
  fileStem,
  type EvidenceIndex,
  type EvidenceRecord,
  type GitDiffDocument,
  type GitDiffFile,
  type ReviewPlan,
  type SemanticChangeCandidate
} from "./git";

function evidenceType(file: GitDiffFile): EvidenceRecord["type"] {
  const selected = file.newPath ?? file.oldPath ?? "";
  if (file.binary) return "binary";
  if (file.lowSignal) return "generated";
  if (/(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[^.]+$/iu.test(selected)) {
    return "test";
  }
  if (/\.(?:css|scss|sass|less|styl)$/iu.test(selected)) return "style";
  if (/(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|[^/]+\.config\.[^/]+)$/iu.test(selected)) {
    return "configuration";
  }
  return "code";
}

function candidateKey(file: GitDiffFile): string {
  const selected = file.newPath ?? file.oldPath ?? "unknown";
  const stem = fileStem(selected);
  const basename = path.posix.basename(stem);
  const directory = path.posix.dirname(stem);
  return basename ? `${directory}/${basename}` : selected;
}

function candidateTitle(files: readonly GitDiffFile[]): string {
  if (files.length === 1) return displayPath(files[0]!);
  const paths = files.map(displayPath);
  const sharedStem = path.posix.basename(fileStem(paths[0] ?? "change"));
  return sharedStem ? `${sharedStem} and related files` : `${files.length} related files`;
}

export function createEvidenceIndex(diff: GitDiffDocument): EvidenceIndex {
  const evidence = diff.files.flatMap((file) => {
    const selected = file.newPath ?? file.oldPath ?? "unknown";
    const hunks = file.hunkRefs
      .map((reference) => diff.hunks.find((hunk) => hunk.id === reference))
      .filter((hunk) => hunk !== undefined);
    if (hunks.length === 0) {
      return [
        {
          id: stableId("evidence", { file: file.id, kind: evidenceType(file) }),
          type: evidenceType(file),
          path: selected,
          range: null,
          summary: `${file.status} ${displayPath(file)}`,
          hunkRefs: []
        } satisfies EvidenceRecord
      ];
    }
    return hunks.map((hunk): EvidenceRecord => {
      const usesNewRange = hunk.newLines > 0;
      const start = usesNewRange ? hunk.newStart : hunk.oldStart;
      const count = usesNewRange ? hunk.newLines : hunk.oldLines;
      return {
        id: stableId("evidence", { hunk: hunk.id }),
        type: evidenceType(file),
        path: selected,
        range: { start, end: start + Math.max(count - 1, 0) },
        summary: `${file.status} hunk in ${displayPath(file)}`,
        hunkRefs: [hunk.id]
      };
    });
  });
  return { schemaVersion: "1.0", evidence };
}

export function createReviewPlan(
  diff: GitDiffDocument,
  evidenceIndex = createEvidenceIndex(diff)
): ReviewPlan {
  const grouped = new Map<string, GitDiffFile[]>();
  for (const file of diff.files) {
    if (file.hunkRefs.length === 0) continue;
    const key = candidateKey(file);
    grouped.set(key, [...(grouped.get(key) ?? []), file]);
  }

  const candidates: SemanticChangeCandidate[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, files]) => {
      const fileRefs = files.map((file) => file.id).sort();
      const sortedHunkRefs = files.flatMap((file) => file.hunkRefs).sort();
      const hunkRefs = sortedHunkRefs as [string, ...string[]];
      const hunkSet = new Set(hunkRefs);
      const evidenceRefs = evidenceIndex.evidence
        .filter((evidence) => evidence.hunkRefs.some((reference) => hunkSet.has(reference)))
        .map((evidence) => evidence.id)
        .sort();
      return {
        id: stableId("change", { key, hunkRefs }),
        title: candidateTitle(files),
        reason:
          files.length === 1
            ? "Hunks are close within one file."
            : "Implementation, test, style, or companion files share a stable path stem.",
        fileRefs,
        hunkRefs,
        evidenceRefs
      };
    });

  const classified = new Set(candidates.flatMap((candidate) => candidate.hunkRefs));
  const unclassifiedHunkRefs = diff.hunks
    .map((hunk) => hunk.id)
    .filter((reference) => !classified.has(reference))
    .sort();
  return { schemaVersion: "1.0", candidates, unclassifiedHunkRefs };
}

export function assertReviewPlanCoverage(diff: GitDiffDocument, plan: ReviewPlan): void {
  const known = new Set(diff.hunks.map((hunk) => hunk.id));
  const assigned = new Map<string, string>();
  const errors: string[] = [];
  for (const candidate of plan.candidates) {
    for (const reference of candidate.hunkRefs) {
      if (!known.has(reference))
        errors.push(`${candidate.id} references missing hunk ${reference}`);
      const previous = assigned.get(reference);
      if (previous) errors.push(`${reference} is assigned to both ${previous} and ${candidate.id}`);
      assigned.set(reference, candidate.id);
    }
  }
  for (const reference of plan.unclassifiedHunkRefs) {
    if (!known.has(reference)) errors.push(`unclassified references missing hunk ${reference}`);
    const previous = assigned.get(reference);
    if (previous) errors.push(`${reference} is both ${previous} and unclassified`);
    assigned.set(reference, "unclassified");
  }
  for (const reference of known) {
    if (!assigned.has(reference)) errors.push(`${reference} is missing from the review plan`);
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
}
