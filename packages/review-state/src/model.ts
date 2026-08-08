import { createHash } from "node:crypto";
import type { ReviewEvent, ReviewState, ReviewThread, UtsuriReport } from "@utsu-ri/report-model";
import { assertArtifact, validateReviewBundle } from "@utsu-ri/report-model";
import { UtsuriError, ExitCode } from "@utsu-ri/core";
import {
  anchorKey,
  buildAnchorCatalog,
  buildLegacyVisualAnchorCatalog,
  classifyAnchor,
  migrateLegacyVisualRegionAnchors,
  reportFingerprint
} from "./anchors";
import { canonicalReviewJson } from "./canonical";
import type {
  AnchorReanchorResult,
  HumanJudgment,
  ReviewAnchor,
  ReviewBundleDocument,
  ReviewDigest,
  ReviewImportConflict,
  ReviewImportResult,
  ReviewSourceIdentity,
  ReviewStore,
  ReviewThreadKind,
  ViewedState
} from "./types";

export const nodeReviewDigest: ReviewDigest = async (value) =>
  createHash("sha256").update(canonicalReviewJson(value)).digest("hex");

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireIsoDate(value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new UtsuriError("REVIEW_TIME_INVALID", "Review timestamp is invalid", ExitCode.Artifact);
  }
  return value;
}

function requireCommentBody(body: string): string {
  const normalized = body.trim();
  if (!normalized) {
    throw new UtsuriError(
      "REVIEW_COMMENT_EMPTY",
      "Review comments must not be empty",
      ExitCode.Arguments
    );
  }
  if (new TextEncoder().encode(normalized).byteLength > 16 * 1024) {
    throw new UtsuriError(
      "REVIEW_COMMENT_LIMIT",
      "Review comment exceeds 16384 bytes",
      ExitCode.Arguments
    );
  }
  return normalized;
}

async function eventFor(
  store: ReviewStore,
  digest: ReviewDigest,
  createdAt: string,
  fields: Omit<ReviewEvent, "schemaVersion" | "id" | "reportId" | "sequence" | "createdAt">
): Promise<ReviewEvent> {
  const sequence = store.events.length + 1;
  const base = { reportId: store.report.reportId, sequence, createdAt, ...fields };
  return {
    schemaVersion: "1.0",
    id: `event:${(await digest(base)).slice(0, 24)}`,
    ...base
  } as ReviewEvent;
}

function nextState(store: ReviewStore, updatedAt: string): ReviewState {
  return { ...clone(store.state), revision: store.state.revision + 1, updatedAt };
}

export async function appendReviewEvent(
  store: ReviewStore,
  fields: Omit<ReviewEvent, "schemaVersion" | "id" | "reportId" | "sequence" | "createdAt">,
  updatedAt: string,
  updates: {
    threads?: ReviewThread[];
    sidecarFiles?: Record<string, string>;
  } = {},
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  const state = nextState(store, updatedAt);
  const event = await eventFor(store, digest, updatedAt, fields);
  assertArtifact("review-event", event);
  return {
    ...store,
    state,
    threads: updates.threads ? clone(updates.threads) : store.threads,
    sidecarFiles: updates.sidecarFiles ? clone(updates.sidecarFiles) : store.sidecarFiles,
    events: [...store.events, event]
  };
}

export async function createReviewStore(
  report: UtsuriReport,
  updatedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  const fingerprint = await reportFingerprint(report, digest);
  const state: ReviewState = {
    schemaVersion: "1.3",
    reportId: report.reportId,
    reportFingerprint: fingerprint,
    revision: 0,
    updatedAt,
    viewed: {},
    judgments: Object.fromEntries(
      report.changes.map((change) => [
        change.id,
        { changeId: change.id, state: "unreviewed" as const, updatedAt }
      ])
    ),
    threadIds: [],
    orphanedThreadIds: []
  };
  return {
    report: clone(report),
    state,
    threads: [],
    events: [],
    anchorCatalog: await buildAnchorCatalog(report, digest),
    sidecarFiles: {}
  };
}

export async function setViewed(
  store: ReviewStore,
  anchor: ReviewAnchor,
  viewState: Exclude<ViewedState, "stale">,
  updatedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  const state = nextState(store, updatedAt);
  state.viewed[anchorKey(anchor)] = { anchor: clone(anchor), state: viewState, updatedAt };
  const event = await eventFor(store, digest, updatedAt, {
    type: "viewed.changed",
    anchor: clone(anchor),
    viewState
  });
  return { ...store, state, events: [...store.events, event] };
}

export async function setJudgment(
  store: ReviewStore,
  changeId: string,
  judgmentState: Exclude<HumanJudgment, "stale">,
  updatedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  if (!store.report.changes.some((change) => change.id === changeId)) {
    throw new UtsuriError(
      "REVIEW_CHANGE_MISSING",
      "Review change does not exist",
      ExitCode.Artifact
    );
  }
  const state = nextState(store, updatedAt);
  state.judgments[changeId] = { changeId, state: judgmentState, updatedAt };
  const event = await eventFor(store, digest, updatedAt, {
    type: "judgment.changed",
    changeId,
    judgmentState
  });
  return { ...store, state, events: [...store.events, event] };
}

export async function createHumanComment(
  store: ReviewStore,
  anchor: ReviewAnchor,
  body: string,
  kind: ReviewThreadKind,
  createdAt: string,
  digest: ReviewDigest = nodeReviewDigest,
  requestAgentAttention = false
): Promise<ReviewStore> {
  requireIsoDate(createdAt);
  const normalizedBody = requireCommentBody(body);
  const identity = { reportId: store.report.reportId, anchor, kind, normalizedBody, createdAt };
  const threadId = `thread:${(await digest(identity)).slice(0, 24)}`;
  if (store.threads.some((thread) => thread.id === threadId)) {
    throw new UtsuriError(
      "REVIEW_THREAD_DUPLICATE",
      "Review thread already exists",
      ExitCode.Artifact
    );
  }
  const messageId = `message:${(await digest({ threadId, normalizedBody, createdAt })).slice(0, 24)}`;
  const thread: ReviewThread = {
    id: threadId,
    reportId: store.report.reportId,
    anchor: clone(anchor),
    kind,
    state: "open",
    messages: [
      {
        id: messageId,
        kind: "human-note",
        author: { type: "human", label: "Reviewer" },
        body: normalizedBody,
        createdAt
      }
    ],
    agentAttention: requestAgentAttention
      ? { state: "requested", updatedAt: createdAt }
      : { state: "none" },
    createdAt,
    updatedAt: createdAt
  };
  assertArtifact("review-thread", thread);
  const state = nextState(store, createdAt);
  state.threadIds = [...state.threadIds, threadId];
  const event = await eventFor(store, digest, createdAt, {
    type: "thread.created",
    anchor: clone(anchor),
    threadId,
    messageId,
    attentionState: requestAgentAttention ? "requested" : "none"
  });
  return { ...store, state, threads: [...store.threads, thread], events: [...store.events, event] };
}

export async function setAgentAttention(
  store: ReviewStore,
  threadId: string,
  requested: boolean,
  updatedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  const index = store.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) {
    throw new UtsuriError(
      "REVIEW_THREAD_MISSING",
      "Review thread does not exist",
      ExitCode.Artifact
    );
  }
  const existing = store.threads[index]!;
  if (new Set(["stale", "orphaned", "resolved"]).has(existing.state)) {
    throw new UtsuriError(
      "REVIEW_THREAD_NOT_CURRENT",
      "Stale, orphaned, or resolved threads cannot request Agent attention",
      ExitCode.Artifact
    );
  }
  const nextAttention = requested ? "requested" : "none";
  if (existing.agentAttention.state !== "none" && existing.agentAttention.state !== "requested") {
    throw new UtsuriError(
      "REVIEW_ATTENTION_SUBMITTED",
      "Submitted Agent attention cannot be cleared or requested again",
      ExitCode.Artifact
    );
  }
  if (existing.agentAttention.state === nextAttention) return store;
  const threads = clone(store.threads);
  threads[index] = {
    ...threads[index]!,
    agentAttention: { state: nextAttention, updatedAt },
    updatedAt
  };
  assertArtifact("review-thread", threads[index]);
  return appendReviewEvent(
    store,
    { type: "agent-attention.changed", threadId, attentionState: nextAttention },
    updatedAt,
    { threads },
    digest
  );
}

export async function resolveThread(
  store: ReviewStore,
  threadId: string,
  updatedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  requireIsoDate(updatedAt);
  const index = store.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) {
    throw new UtsuriError(
      "REVIEW_THREAD_MISSING",
      "Review thread does not exist",
      ExitCode.Artifact
    );
  }
  const existing = store.threads[index]!;
  if (existing.state === "stale" || existing.state === "orphaned") {
    throw new UtsuriError(
      "REVIEW_THREAD_NOT_CURRENT",
      "Stale or orphaned threads cannot be resolved as current",
      ExitCode.Artifact
    );
  }
  const threads = clone(store.threads);
  threads[index] = { ...threads[index]!, state: "resolved", updatedAt };
  const state = nextState(store, updatedAt);
  const event = await eventFor(store, digest, updatedAt, {
    type: "thread.resolved",
    threadId
  });
  return { ...store, state, threads, events: [...store.events, event] };
}

export function createReviewBundle(
  store: ReviewStore,
  source: ReviewSourceIdentity,
  exportedAt: string
): ReviewBundleDocument {
  requireIsoDate(exportedAt);
  const catalog = new Map(
    store.anchorCatalog.map((anchor) => [anchorKey(anchor), clone(anchor)] as const)
  );
  for (const entry of Object.values(store.state.viewed)) {
    catalog.set(anchorKey(entry.anchor), clone(entry.anchor));
  }
  for (const thread of store.threads) {
    catalog.set(anchorKey(thread.anchor), clone(thread.anchor));
  }
  const bundle: ReviewBundleDocument = {
    schemaVersion: "1.0",
    source: {
      reportId: store.report.reportId,
      reportFingerprint: store.state.reportFingerprint,
      base: source.base,
      head: source.head
    },
    state: clone(store.state),
    threads: clone(store.threads),
    events: clone(store.events),
    anchorCatalog: [...catalog.values()].sort((left, right) =>
      anchorKey(left).localeCompare(anchorKey(right))
    ),
    exportedAt
  };
  const validation = validateReviewBundle(bundle);
  if (!validation.ok) {
    throw new UtsuriError("REVIEW_BUNDLE_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  return bundle;
}

function conflict(
  conflicts: ReviewImportConflict[],
  kind: ReviewImportConflict["kind"],
  id: string,
  current: unknown,
  incoming: unknown
): void {
  if (canonicalReviewJson(current) !== canonicalReviewJson(incoming)) {
    conflicts.push({ kind, id, current: clone(current), incoming: clone(incoming) });
  }
}

export async function importReviewBundle(
  current: ReviewStore,
  bundle: ReviewBundleDocument,
  options: { reanchor: boolean; importedAt: string; digest?: ReviewDigest }
): Promise<ReviewImportResult> {
  requireIsoDate(options.importedAt);
  const digest = options.digest ?? nodeReviewDigest;
  const source =
    bundle && typeof bundle === "object" && !Array.isArray(bundle) && "source" in bundle
      ? bundle.source
      : null;
  const exactReport = Boolean(
    source &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    "reportId" in source &&
    "reportFingerprint" in source &&
    source.reportId === current.report.reportId &&
    source.reportFingerprint === current.state.reportFingerprint
  );
  const migratedBundle = migrateLegacyVisualRegionAnchors(
    bundle,
    current.anchorCatalog,
    await buildLegacyVisualAnchorCatalog(current.report, digest),
    exactReport
  );
  const validation = validateReviewBundle(migratedBundle);
  if (!validation.ok) {
    throw new UtsuriError("REVIEW_BUNDLE_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const sourceBundle = migratedBundle as ReviewBundleDocument;
  if (!exactReport && !options.reanchor) {
    throw new UtsuriError(
      "REVIEW_REPORT_MISMATCH",
      "Review bundle belongs to a different report; pass --reanchor to classify anchors",
      ExitCode.Artifact
    );
  }
  const reanchored: AnchorReanchorResult[] = [];
  const conflicts: ReviewImportConflict[] = [];
  const state = nextState(current, options.importedAt);

  for (const [key, entry] of Object.entries(sourceBundle.state.viewed)) {
    const match = classifyAnchor(entry.anchor, current.anchorCatalog);
    reanchored.push(match);
    const targetAnchor = match.result === "exact" ? match.candidate! : entry.anchor;
    const targetKey = match.result === "exact" ? anchorKey(targetAnchor) : key;
    const incoming = {
      anchor: clone(targetAnchor),
      state: match.result === "exact" ? entry.state : ("stale" as const),
      updatedAt: options.importedAt
    };
    const existing = state.viewed[targetKey];
    if (existing) conflict(conflicts, "viewed", targetKey, existing, incoming);
    else state.viewed[targetKey] = incoming;
  }

  const sourceChanges = new Map(
    sourceBundle.anchorCatalog
      .filter((entry) => entry.type === "change")
      .map((entry) => [entry.ref, entry] as const)
  );
  for (const [changeId, entry] of Object.entries(sourceBundle.state.judgments)) {
    const sourceAnchor = sourceChanges.get(changeId);
    const match = sourceAnchor ? classifyAnchor(sourceAnchor, current.anchorCatalog) : undefined;
    if (match) reanchored.push(match);
    const candidateId = match?.result === "exact" ? match.candidate!.ref : changeId;
    const incoming = {
      changeId: candidateId,
      state: match?.result === "exact" ? entry.state : ("stale" as const),
      updatedAt: options.importedAt
    };
    const existing = state.judgments[candidateId];
    if (existing && existing.state !== "unreviewed") {
      conflict(conflicts, "judgment", candidateId, existing, incoming);
    } else {
      state.judgments[candidateId] = incoming;
    }
  }

  const threads = clone(current.threads);
  for (const sourceThread of sourceBundle.threads) {
    const match = classifyAnchor(sourceThread.anchor, current.anchorCatalog);
    reanchored.push(match);
    const incoming: ReviewThread = {
      ...clone(sourceThread),
      reportId: current.report.reportId,
      anchor: match.result === "exact" ? clone(match.candidate!) : clone(sourceThread.anchor),
      state:
        match.result === "exact"
          ? sourceThread.state
          : match.result === "missing"
            ? "orphaned"
            : "stale",
      updatedAt: options.importedAt
    };
    const existing = threads.find((thread) => thread.id === incoming.id);
    if (existing) conflict(conflicts, "thread", incoming.id, existing, incoming);
    else threads.push(incoming);
  }
  state.threadIds = threads.map((thread) => thread.id);
  state.orphanedThreadIds = threads
    .filter((thread) => thread.state === "orphaned")
    .map((thread) => thread.id);
  const event = await eventFor(current, digest, options.importedAt, {
    type: "state.imported",
    sourceReportId: sourceBundle.source.reportId
  });
  const store: ReviewStore = {
    ...current,
    state,
    threads,
    events: [...current.events, event]
  };
  assertArtifact("review-state", state);
  for (const thread of threads) assertArtifact("review-thread", thread);
  return { store, reanchored, conflicts };
}
