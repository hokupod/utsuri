import type {
  ContextPack,
  FeedbackBatch,
  OriginSessionBinding,
  ReviewThread,
  UtsuriReport
} from "../../report-model/src";
import { browserReviewDigest, type ReviewStore } from "../../review-state/src/browser";

const maximumContextPackBytes = 512 * 1024;

export interface BrowserFeedbackPreview {
  batch: FeedbackBatch;
  contexts: ContextPack[];
  shared: {
    comments: number;
    codeRanges: number;
    imageCrops: number;
    evidenceReferences: number;
  };
  excluded: string[];
  redactionCount: number;
  contextBytes: number;
  warnings: string[];
  destination: {
    host: OriginSessionBinding["host"];
    bound: boolean;
    deliveryMode: "export-only";
  };
}

function redact(value: string, reference: string, redactions: ContextPack["redactions"]): string {
  const patterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|secret)\b\s*[:=]\s*[^\s,;]+/giu,
    /\bAKIA[0-9A-Z]{16}\b/gu,
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,})\b/gu
  ];
  let output = value;
  for (const pattern of patterns) {
    if (pattern.test(output)) {
      redactions.push({ category: "secret-pattern", ref: reference });
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
  return report.changes.find((change) => anchor.ref.startsWith(`${change.id}:gap:`));
}

function relevantHunks(
  report: UtsuriReport,
  thread: ReviewThread,
  change: UtsuriReport["changes"][number] | undefined
): UtsuriReport["hunks"] {
  if (thread.anchor.type === "hunk" || thread.anchor.type === "line-range") {
    return report.hunks.filter(
      (hunk) => thread.anchor.ref === hunk.id || thread.anchor.ref.startsWith(`${hunk.id}:`)
    );
  }
  return change ? report.hunks.filter((hunk) => change.hunkRefs.includes(hunk.id)) : [];
}

function relevantImages(report: UtsuriReport, thread: ReviewThread): ContextPack["images"] {
  const targetRef =
    thread.anchor.targetRef ??
    (thread.anchor.type === "visual-target" ? thread.anchor.ref : undefined);
  if (!targetRef) return [];
  const crop = thread.anchor.type === "visual-region" ? thread.anchor.region : undefined;
  return report.comparisons
    .filter((comparison) => comparison.targetRef === targetRef)
    .flatMap((comparison) =>
      comparison.images.flatMap((image) => [
        { role: "before" as const, assetRef: image.beforeRef, ...(crop ? { crop } : {}) },
        { role: "after" as const, assetRef: image.afterRef, ...(crop ? { crop } : {}) },
        { role: "diff" as const, assetRef: image.diffRef, ...(crop ? { crop } : {}) }
      ])
    )
    .slice(0, 10);
}

export async function createBrowserFeedbackPreview(
  store: ReviewStore,
  createdAt = new Date().toISOString()
): Promise<BrowserFeedbackPreview> {
  const threads = store.threads.filter(
    (thread) =>
      thread.agentAttention.state === "requested" &&
      !new Set(["stale", "orphaned", "resolved"]).has(thread.state)
  );
  if (threads.length === 0) throw new Error("No current comments request Agent attention");
  if (threads.length > 20) throw new Error("Feedback Batch exceeds 20 items");
  const batchId = `fb:${(
    await browserReviewDigest({
      reportId: store.report.reportId,
      threads: threads.map((thread) => thread.id),
      createdAt
    })
  ).slice(0, 24)}`;
  const items = (await Promise.all(
    threads.map(async (thread) => {
      const message = [...thread.messages].reverse().find((entry) => entry.author.type === "human");
      if (!message) throw new Error("Feedback thread has no human source message");
      const visual =
        thread.anchor.type === "visual-target" || thread.anchor.type === "visual-region";
      return {
        id: `item:${(
          await browserReviewDigest({ batchId, threadId: thread.id, messageId: message.id })
        ).slice(0, 24)}`,
        threadId: thread.id,
        anchor: structuredClone(thread.anchor),
        sourceMessageId: message.id,
        requestKind: thread.kind === "question" ? ("explain" as const) : ("freeform" as const),
        question: message.body,
        contextSelection: {
          includeCodeDiff: !visual,
          includeVisualCrop: visual,
          includeComputedStyle: false,
          includeDomAria: false,
          includeRelatedTests: false
        },
        state: "ready" as const
      };
    })
  )) as FeedbackBatch["items"];
  const origin: OriginSessionBinding = structuredClone(store.report.origin);
  const contexts: ContextPack[] = [];
  for (const [index, item] of items.entries()) {
    const thread = threads[index]!;
    const change = changeForThread(store.report, thread);
    const redactions: ContextPack["redactions"] = [];
    const hunks = relevantHunks(store.report, thread, change);
    const withoutHash = {
      schemaVersion: "1.1" as const,
      reportId: store.report.reportId,
      batchId,
      itemId: item.id,
      baseSha: "",
      headSha: "",
      anchor: structuredClone(item.anchor),
      question: redact(item.question, `item:${item.id}:question`, redactions),
      ...(change
        ? {
            semanticChange: {
              id: change.id,
              title: redact(change.title, `change:${change.id}:title`, redactions),
              summary: redact(change.summary, `change:${change.id}:summary`, redactions),
              intent: {
                text: redact(change.intent.text, `change:${change.id}:intent`, redactions),
                source: change.intent.source,
                evidenceRefs: [...change.intent.evidenceRefs]
              },
              risk: structuredClone(change.risk)
            }
          }
        : {}),
      code: item.contextSelection.includeCodeDiff
        ? hunks.map((hunk) => ({
            path: hunk.path,
            startLine: Math.max(1, hunk.newStart || hunk.oldStart),
            endLine: Math.max(
              1,
              (hunk.newStart || hunk.oldStart) + Math.max(hunk.newLines, hunk.oldLines) - 1
            ),
            textRef: hunk.id
          }))
        : [],
      images: item.contextSelection.includeVisualCrop ? relevantImages(store.report, thread) : [],
      evidenceRefs: change ? [...change.intent.evidenceRefs] : [],
      priorThreadMessages: thread.messages.map((message) => ({
        role: message.author.type === "agent" ? ("agent" as const) : ("human" as const),
        text: redact(message.body, `message:${message.id}`, redactions)
      })),
      redactions
    };
    const context = { ...withoutHash, contextHash: await browserReviewDigest(withoutHash) };
    if (new TextEncoder().encode(JSON.stringify(context)).byteLength > maximumContextPackBytes) {
      throw new Error("Context Pack exceeds 512 KiB");
    }
    contexts.push(context);
  }
  const batch: FeedbackBatch = {
    id: batchId,
    reportId: store.report.reportId,
    origin,
    items: items.map((item, index) => ({
      ...item,
      question: contexts[index]!.question
    })) as FeedbackBatch["items"],
    state: "ready",
    deliveryMode: "export-only",
    contextHash: await browserReviewDigest(contexts.map((context) => context.contextHash)),
    createdAt
  };
  return {
    batch,
    contexts,
    shared: {
      comments: items.length,
      codeRanges: contexts.reduce((count, context) => count + context.code.length, 0),
      imageCrops: contexts.reduce((count, context) => count + context.images.length, 0),
      evidenceReferences: contexts.reduce(
        (count, context) => count + context.evidenceRefs.length,
        0
      )
    },
    excluded: [
      "raw DOM and ARIA artifacts",
      "environment variables",
      "files outside the report",
      "related tests"
    ],
    redactionCount: contexts.reduce((count, context) => count + context.redactions.length, 0),
    contextBytes: contexts.reduce(
      (count, context) => count + new TextEncoder().encode(JSON.stringify(context)).byteLength,
      0
    ),
    warnings: ["Static mode exports files; it cannot submit to an Origin Session"],
    destination: {
      host: origin.host,
      bound: Boolean(origin.sessionRef),
      deliveryMode: "export-only"
    }
  };
}
