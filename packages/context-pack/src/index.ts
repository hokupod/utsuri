import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { ContextPack, FeedbackBatch, ReviewThread, UtsuriReport } from "@utsu-ri/report-model";
import { assertArtifact } from "@utsu-ri/report-model";
import { canonicalReviewJson, nodeReviewDigest, type ReviewDigest } from "@utsu-ri/review-state";
import { assertRasterImageReference } from "@utsu-ri/security";

export const maximumContextPackBytes = 512 * 1024;
export const maximumContextImages = 10;

export interface ContextPackBuildResult {
  pack: ContextPack;
  bytes: number;
  shared: {
    comments: number;
    codeRanges: number;
    imageCrops: number;
    evidenceReferences: number;
  };
  excluded: string[];
}

interface BuildContextPackInput {
  report: UtsuriReport;
  thread: ReviewThread;
  item: FeedbackBatch["items"][number];
  batchId: string;
  baseSha?: string | null;
  headSha?: string | null;
  digest?: ReviewDigest;
}

function contextError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}

function assertReportPath(value: string): string {
  if (
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.posix.normalize(value) !== value ||
    value.startsWith("../")
  ) {
    contextError("CONTEXT_PATH_INVALID", "Context Pack contains an unsafe report path");
  }
  return value;
}

function redactText(value: string, ref: string, redactions: ContextPack["redactions"]): string {
  const patterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|secret)\b\s*[:=]\s*[^\s,;]+/giu,
    /\bAKIA[0-9A-Z]{16}\b/gu,
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,})\b/gu
  ];
  let output = value;
  for (const pattern of patterns) {
    if (pattern.test(output)) {
      redactions.push({ category: "secret-pattern", ref });
      output = output.replace(pattern, "[REDACTED]");
    }
    pattern.lastIndex = 0;
  }
  return output;
}

function changeForThread(
  report: UtsuriReport,
  thread: ReviewThread
): UtsuriReport["changes"][number] | undefined {
  const anchor = thread.anchor;
  if (anchor.type === "change") return report.changes.find((change) => change.id === anchor.ref);
  if (anchor.type === "hunk" || anchor.type === "line-range") {
    return report.changes.find((change) =>
      change.hunkRefs.some(
        (reference) => anchor.ref === reference || anchor.ref.startsWith(`${reference}:`)
      )
    );
  }
  if (anchor.type === "visual-target" || anchor.type === "visual-region") {
    return report.changes.find((change) =>
      change.targetRefs.includes(anchor.targetRef ?? anchor.ref)
    );
  }
  if (anchor.type === "finding") {
    return report.changes.find((change) => change.findingRefs.includes(anchor.ref));
  }
  if (anchor.type === "verification-gap") {
    return report.changes.find((change) => anchor.ref.startsWith(`${change.id}:gap:`));
  }
  return undefined;
}

function selectedHunks(
  report: UtsuriReport,
  thread: ReviewThread,
  change: UtsuriReport["changes"][number] | undefined
): UtsuriReport["hunks"] {
  if (thread.anchor.type === "hunk" || thread.anchor.type === "line-range") {
    return report.hunks.filter(
      (hunk) => thread.anchor.ref === hunk.id || thread.anchor.ref.startsWith(`${hunk.id}:`)
    );
  }
  if (change) return report.hunks.filter((hunk) => change.hunkRefs.includes(hunk.id));
  return [];
}

function selectedImages(report: UtsuriReport, thread: ReviewThread): ContextPack["images"] {
  const targetRef =
    thread.anchor.targetRef ??
    (thread.anchor.type === "visual-target" ? thread.anchor.ref : undefined);
  if (!targetRef) return [];
  const comparisons = report.comparisons.filter((comparison) => comparison.targetRef === targetRef);
  const images: ContextPack["images"] = [];
  for (const comparison of comparisons) {
    for (const image of comparison.images) {
      const crop = thread.anchor.type === "visual-region" ? thread.anchor.region : undefined;
      for (const [role, assetRef] of [
        ["before", image.beforeRef],
        ["after", image.afterRef],
        ["diff", image.diffRef]
      ] as const) {
        assertRasterImageReference(assetRef);
        images.push({ role, assetRef, ...(crop ? { crop } : {}) });
      }
    }
  }
  return images.slice(0, maximumContextImages);
}

export async function buildContextPack(
  input: BuildContextPackInput
): Promise<ContextPackBuildResult> {
  const { report, thread, item } = input;
  if (
    thread.reportId !== report.reportId ||
    item.threadId !== thread.id ||
    item.anchor.fingerprint !== thread.anchor.fingerprint
  ) {
    contextError("CONTEXT_BINDING_INVALID", "Context Pack input is not bound to its review thread");
  }
  const redactions: ContextPack["redactions"] = [];
  const change = changeForThread(report, thread);
  const hunks = item.contextSelection.includeCodeDiff ? selectedHunks(report, thread, change) : [];
  const images = item.contextSelection.includeVisualCrop ? selectedImages(report, thread) : [];
  const evidenceRefs = new Set<string>();
  if (change) {
    for (const reference of change.intent.evidenceRefs) evidenceRefs.add(reference);
  }
  if (thread.anchor.type === "finding") {
    const finding = report.findings.find((entry) => entry.id === thread.anchor.ref);
    for (const reference of finding?.evidenceRefs ?? []) evidenceRefs.add(reference);
  }
  if (item.contextSelection.includeComputedStyle || item.contextSelection.includeDomAria) {
    const targetRef = thread.anchor.targetRef;
    const target = report.targets.find((entry) => entry.id === targetRef);
    if (item.contextSelection.includeComputedStyle) {
      if (target?.before.styleRef) evidenceRefs.add(target.before.styleRef);
      if (target?.after.styleRef) evidenceRefs.add(target.after.styleRef);
    }
    if (item.contextSelection.includeDomAria) {
      if (target?.before.ariaRef) evidenceRefs.add(target.before.ariaRef);
      if (target?.after.ariaRef) evidenceRefs.add(target.after.ariaRef);
      if (target?.before.domRef) evidenceRefs.add(target.before.domRef);
      if (target?.after.domRef) evidenceRefs.add(target.after.domRef);
    }
  }
  const question = redactText(item.question, `item:${item.id}:question`, redactions);
  const priorThreadMessages = thread.messages.map((message) => ({
    role: message.author.type === "agent" ? ("agent" as const) : ("human" as const),
    text: redactText(message.body, `message:${message.id}`, redactions)
  }));
  const semanticChange = change
    ? {
        id: change.id,
        title: redactText(change.title, `change:${change.id}:title`, redactions),
        summary: redactText(change.summary, `change:${change.id}:summary`, redactions),
        intent: {
          text: redactText(change.intent.text, `change:${change.id}:intent`, redactions),
          source: change.intent.source,
          evidenceRefs: [...change.intent.evidenceRefs]
        },
        risk: structuredClone(change.risk)
      }
    : undefined;
  const withoutHash = {
    schemaVersion: "1.1" as const,
    reportId: report.reportId,
    batchId: input.batchId,
    itemId: item.id,
    baseSha: input.baseSha ?? "",
    headSha: input.headSha ?? "",
    anchor: structuredClone(item.anchor),
    question,
    ...(semanticChange ? { semanticChange } : {}),
    code: hunks.map((hunk) => ({
      path: assertReportPath(hunk.path),
      startLine: Math.max(1, hunk.newStart || hunk.oldStart),
      endLine: Math.max(
        1,
        (hunk.newStart || hunk.oldStart) + Math.max(hunk.newLines, hunk.oldLines) - 1
      ),
      textRef: hunk.id
    })),
    images,
    evidenceRefs: [...evidenceRefs].sort(),
    priorThreadMessages,
    redactions
  };
  const digest = input.digest ?? nodeReviewDigest;
  const pack: ContextPack = {
    ...withoutHash,
    contextHash: await digest(withoutHash)
  };
  assertArtifact("context-pack", pack);
  const bytes = Buffer.byteLength(canonicalReviewJson(pack));
  if (bytes > maximumContextPackBytes) {
    contextError("CONTEXT_PACK_LIMIT", "Context Pack exceeds 512 KiB");
  }
  const excluded = ["environment variables", "files outside the report"];
  if (!item.contextSelection.includeDomAria) excluded.push("raw DOM and ARIA artifacts");
  if (!item.contextSelection.includeRelatedTests) excluded.push("related tests");
  if (redactions.length > 0) excluded.push("secret-pattern matches");
  return {
    pack,
    bytes,
    shared: {
      comments: 1,
      codeRanges: pack.code.length,
      imageCrops: pack.images.length,
      evidenceReferences: pack.evidenceRefs.length
    },
    excluded
  };
}
