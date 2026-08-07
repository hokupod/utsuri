import {
  type ReviewEvent,
  type ReviewState,
  type ReviewThread,
  type UtsuriReport
} from "@utsu-ri/report-model";
import {
  validateBrowserReviewArtifact,
  validateBrowserReviewBundle
} from "@utsu-ri/report-model/browser-validator";
import { anchorKey, buildAnchorCatalog, classifyAnchor } from "./anchors";
import { canonicalReviewJson } from "./canonical";
import { browserReviewDigest } from "./browser-digest";
import type {
  HumanJudgment,
  ReviewAnchor,
  ReviewBundleDocument,
  ReviewImportConflict,
  ReviewImportResult,
  ReviewSourceIdentity,
  ReviewStore,
  ReviewThreadKind,
  ViewedState
} from "./types";

const maximumStorageBytes = 4 * 1024 * 1024;

interface BrowserStoredReview {
  schemaVersion: "1.0";
  reportFingerprint: string;
  state: ReviewState;
  threads: ReviewThread[];
  events: ReviewEvent[];
}

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => T | Promise<T>
  ): Promise<T>;
}

function browserError(id: string, message: string): Error {
  const error = new Error(message);
  error.name = id;
  return error;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function storageKey(reportId: string): string {
  return `utsuri:review:v1:${encodeURIComponent(reportId)}`;
}

function safeParse(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > maximumStorageBytes) {
    throw browserError("REVIEW_BROWSER_LIMIT", "Stored review state exceeds 4 MiB");
  }
  const value = JSON.parse(text) as unknown;
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) pending.push(...current);
    else {
      for (const [key, child] of Object.entries(current)) {
        if (new Set(["__proto__", "constructor", "prototype"]).has(key)) {
          throw browserError("REVIEW_BROWSER_KEY", "Stored review state has a forbidden key");
        }
        pending.push(child);
      }
    }
  }
  return value;
}

function isStoredReview(value: unknown): value is BrowserStoredReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<BrowserStoredReview>;
  return (
    item.schemaVersion === "1.0" &&
    typeof item.reportFingerprint === "string" &&
    Boolean(item.state && typeof item.state === "object") &&
    Array.isArray(item.threads) &&
    Array.isArray(item.events)
  );
}

function assertBrowserArtifact(
  name: "review-state" | "review-thread" | "review-event",
  value: unknown
): void {
  const result = validateBrowserReviewArtifact(name, value);
  if (!result.ok) {
    throw browserError("REVIEW_BROWSER_INVALID", `${name}: ${result.errors.join("; ")}`);
  }
}

function assertMessageBodies(threads: readonly ReviewThread[]): void {
  for (const thread of threads) {
    for (const message of thread.messages) {
      if (!message.body.trim()) {
        throw browserError("REVIEW_BROWSER_INVALID", "Stored review comment body is empty");
      }
      if (new TextEncoder().encode(message.body).byteLength > 16 * 1024) {
        throw browserError("REVIEW_BROWSER_INVALID", "Stored review comment exceeds 16 KiB");
      }
    }
  }
}

function validateStore(store: ReviewStore): void {
  assertBrowserArtifact("review-state", store.state);
  for (const thread of store.threads) assertBrowserArtifact("review-thread", thread);
  for (const event of store.events) assertBrowserArtifact("review-event", event);
  assertMessageBodies(store.threads);
  if (
    store.state.schemaVersion !== "1.3" ||
    store.state.reportId !== store.report.reportId ||
    store.state.reportFingerprint.length !== 64 ||
    store.state.revision !== store.events.length
  ) {
    throw browserError("REVIEW_BROWSER_INVALID", "Stored review state is inconsistent");
  }
  if (new Set(store.state.threadIds).size !== store.state.threadIds.length) {
    throw browserError("REVIEW_BROWSER_INVALID", "Stored review threads are duplicated");
  }
  const threadIds = new Set(store.threads.map((thread) => thread.id));
  if (
    threadIds.size !== store.threads.length ||
    store.state.threadIds.length !== store.threads.length ||
    store.state.threadIds.some((id) => !threadIds.has(id))
  ) {
    throw browserError("REVIEW_BROWSER_INVALID", "Stored review thread inventory is inconsistent");
  }
  const orphaned = new Set(store.state.orphanedThreadIds);
  for (const thread of store.threads) {
    if (
      thread.reportId !== store.report.reportId ||
      (thread.state === "orphaned") !== orphaned.has(thread.id)
    ) {
      throw browserError("REVIEW_BROWSER_INVALID", "Stored review thread identity is inconsistent");
    }
  }
  const eventIds = new Set<string>();
  for (const [index, event] of store.events.entries()) {
    if (
      eventIds.has(event.id) ||
      event.sequence !== index + 1 ||
      event.reportId !== store.report.reportId
    ) {
      throw browserError("REVIEW_BROWSER_INVALID", "Stored review event sequence is invalid");
    }
    eventIds.add(event.id);
  }
}

function parseStoredReview(store: ReviewStore, serialized: string): BrowserStoredReview {
  const stored = safeParse(serialized);
  if (!isStoredReview(stored)) {
    throw browserError("REVIEW_BROWSER_INVALID", "Stored review state has an invalid shape");
  }
  if (
    stored.reportFingerprint !== store.state.reportFingerprint ||
    stored.state.reportFingerprint !== stored.reportFingerprint
  ) {
    throw browserError(
      "REVIEW_BROWSER_STALE",
      "Stored review state belongs to an older report; export it before re-anchoring"
    );
  }
  validateStore({
    ...store,
    state: clone(stored.state),
    threads: clone(stored.threads),
    events: clone(stored.events)
  });
  return stored;
}

function lockManager(): BrowserLockManager {
  const manager = (globalThis.navigator as (Navigator & { locks?: BrowserLockManager }) | undefined)
    ?.locks;
  if (!manager) {
    throw browserError(
      "REVIEW_BROWSER_LOCK_UNAVAILABLE",
      "Concurrent-safe review storage requires utsuri serve in a browser with Web Locks support"
    );
  }
  return manager;
}

function nextState(store: ReviewStore, updatedAt: string): ReviewState {
  return { ...clone(store.state), revision: store.state.revision + 1, updatedAt };
}

async function eventFor(
  store: ReviewStore,
  createdAt: string,
  fields: Omit<ReviewEvent, "schemaVersion" | "id" | "reportId" | "sequence" | "createdAt">
): Promise<ReviewEvent> {
  const sequence = store.events.length + 1;
  const base = { reportId: store.report.reportId, sequence, createdAt, ...fields };
  return {
    schemaVersion: "1.0",
    id: `event:${(await browserReviewDigest(base)).slice(0, 24)}`,
    ...base
  } as ReviewEvent;
}

export async function createBrowserReviewStore(
  report: UtsuriReport,
  updatedAt: string
): Promise<ReviewStore> {
  const fingerprint = await browserReviewDigest(report);
  return {
    report: clone(report),
    state: {
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
    },
    threads: [],
    events: [],
    anchorCatalog: await buildAnchorCatalog(report, browserReviewDigest),
    sidecarFiles: {}
  };
}

export async function loadBrowserReviewStore(report: UtsuriReport): Promise<ReviewStore> {
  const current = await createBrowserReviewStore(report, new Date().toISOString());
  const serialized = localStorage.getItem(storageKey(report.reportId));
  if (!serialized) return current;
  const stored = parseStoredReview(current, serialized);
  const store: ReviewStore = {
    ...current,
    state: clone(stored.state),
    threads: clone(stored.threads),
    events: clone(stored.events)
  };
  validateStore(store);
  return store;
}

export async function saveBrowserReviewStore(
  store: ReviewStore,
  expectedRevision = store.state.revision - 1
): Promise<void> {
  validateStore(store);
  if (expectedRevision < 0 || store.state.revision !== expectedRevision + 1) {
    throw browserError("REVIEW_REVISION_INVALID", "Review mutation must advance one revision");
  }
  const value: BrowserStoredReview = {
    schemaVersion: "1.0",
    reportFingerprint: store.state.reportFingerprint,
    state: clone(store.state),
    threads: clone(store.threads),
    events: clone(store.events)
  };
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > maximumStorageBytes) {
    throw browserError(
      "REVIEW_BROWSER_LIMIT",
      "Review state is near browser-storage limits; export it before adding more comments"
    );
  }
  const key = storageKey(store.report.reportId);
  await lockManager().request(`${key}:write`, { mode: "exclusive" }, () => {
    const current = localStorage.getItem(key);
    const currentRevision = current ? parseStoredReview(store, current).state.revision : 0;
    if (currentRevision !== expectedRevision) {
      throw browserError(
        "REVIEW_REVISION_CONFLICT",
        "Review state changed in another tab; reload before retrying this edit"
      );
    }
    localStorage.setItem(key, serialized);
  });
}

export async function browserSetViewed(
  store: ReviewStore,
  anchor: ReviewAnchor,
  viewState: Exclude<ViewedState, "stale">,
  updatedAt = new Date().toISOString()
): Promise<ReviewStore> {
  const state = nextState(store, updatedAt);
  state.viewed[anchorKey(anchor)] = { anchor: clone(anchor), state: viewState, updatedAt };
  const event = await eventFor(store, updatedAt, {
    type: "viewed.changed",
    anchor: clone(anchor),
    viewState
  });
  return { ...store, state, events: [...store.events, event] };
}

export async function browserSetJudgment(
  store: ReviewStore,
  changeId: string,
  judgmentState: Exclude<HumanJudgment, "stale">,
  updatedAt = new Date().toISOString()
): Promise<ReviewStore> {
  if (!store.report.changes.some((change) => change.id === changeId)) {
    throw browserError("REVIEW_CHANGE_MISSING", "Review change does not exist");
  }
  const state = nextState(store, updatedAt);
  state.judgments[changeId] = { changeId, state: judgmentState, updatedAt };
  const event = await eventFor(store, updatedAt, {
    type: "judgment.changed",
    changeId,
    judgmentState
  });
  return { ...store, state, events: [...store.events, event] };
}

export async function browserCreateComment(
  store: ReviewStore,
  anchor: ReviewAnchor,
  body: string,
  kind: ReviewThreadKind,
  createdAt = new Date().toISOString(),
  requestAgentAttention = false
): Promise<ReviewStore> {
  const normalized = body.trim();
  if (!normalized) throw browserError("REVIEW_COMMENT_EMPTY", "Review comments must not be empty");
  if (new TextEncoder().encode(normalized).byteLength > 16 * 1024) {
    throw browserError("REVIEW_COMMENT_LIMIT", "Review comment exceeds 16 KiB");
  }
  const threadId = `thread:${(
    await browserReviewDigest({
      reportId: store.report.reportId,
      anchor,
      kind,
      normalized,
      createdAt
    })
  ).slice(0, 24)}`;
  const messageId = `message:${(
    await browserReviewDigest({ threadId, normalized, createdAt })
  ).slice(0, 24)}`;
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
        body: normalized,
        createdAt
      }
    ],
    agentAttention: requestAgentAttention
      ? { state: "requested", updatedAt: createdAt }
      : { state: "none" },
    createdAt,
    updatedAt: createdAt
  };
  const state = nextState(store, createdAt);
  state.threadIds = [...state.threadIds, threadId];
  const event = await eventFor(store, createdAt, {
    type: "thread.created",
    anchor: clone(anchor),
    threadId,
    messageId,
    attentionState: requestAgentAttention ? "requested" : "none"
  });
  return { ...store, state, threads: [...store.threads, thread], events: [...store.events, event] };
}

export async function browserSetAgentAttention(
  store: ReviewStore,
  threadId: string,
  requested: boolean,
  updatedAt = new Date().toISOString()
): Promise<ReviewStore> {
  const index = store.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) throw browserError("REVIEW_THREAD_MISSING", "Review thread does not exist");
  const existing = store.threads[index]!;
  if (new Set(["stale", "orphaned", "resolved"]).has(existing.state)) {
    throw browserError(
      "REVIEW_THREAD_NOT_CURRENT",
      "Stale, orphaned, or resolved comments cannot request Agent attention"
    );
  }
  const nextAttention = requested ? "requested" : "none";
  if (existing.agentAttention.state !== "none" && existing.agentAttention.state !== "requested") {
    throw browserError("REVIEW_ATTENTION_SUBMITTED", "Submitted Agent attention cannot be changed");
  }
  if (existing.agentAttention.state === nextAttention) return store;
  const threads = clone(store.threads);
  threads[index] = {
    ...threads[index]!,
    agentAttention: { state: nextAttention, updatedAt },
    updatedAt
  };
  const state = nextState(store, updatedAt);
  const event = await eventFor(store, updatedAt, {
    type: "agent-attention.changed",
    threadId,
    attentionState: nextAttention
  });
  return { ...store, state, threads, events: [...store.events, event] };
}

export async function browserResolveThread(
  store: ReviewStore,
  threadId: string,
  updatedAt = new Date().toISOString()
): Promise<ReviewStore> {
  const index = store.threads.findIndex((thread) => thread.id === threadId);
  if (index === -1) throw browserError("REVIEW_THREAD_MISSING", "Review thread does not exist");
  const thread = store.threads[index]!;
  if (thread.state === "stale" || thread.state === "orphaned") {
    throw browserError(
      "REVIEW_THREAD_NOT_CURRENT",
      "Stale or orphaned comments cannot be resolved"
    );
  }
  const threads = clone(store.threads);
  threads[index] = { ...threads[index]!, state: "resolved", updatedAt };
  const state = nextState(store, updatedAt);
  const event = await eventFor(store, updatedAt, { type: "thread.resolved", threadId });
  return { ...store, state, threads, events: [...store.events, event] };
}

function bundleCatalog(store: ReviewStore): ReviewAnchor[] {
  const catalog = new Map(store.anchorCatalog.map((anchor) => [anchorKey(anchor), clone(anchor)]));
  for (const entry of Object.values(store.state.viewed)) {
    catalog.set(anchorKey(entry.anchor), clone(entry.anchor));
  }
  for (const thread of store.threads) catalog.set(anchorKey(thread.anchor), clone(thread.anchor));
  return [...catalog.values()].sort((left, right) =>
    anchorKey(left).localeCompare(anchorKey(right))
  );
}

export function createBrowserReviewBundle(
  store: ReviewStore,
  source: ReviewSourceIdentity,
  exportedAt = new Date().toISOString()
): ReviewBundleDocument {
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
    anchorCatalog: bundleCatalog(store),
    exportedAt
  };
  const validation = validateBrowserReviewBundle(bundle);
  if (!validation.ok) {
    throw browserError("REVIEW_BUNDLE_INVALID", validation.errors.join("; "));
  }
  return bundle;
}

export async function importBrowserReviewBundle(
  current: ReviewStore,
  input: unknown,
  options: { reanchor?: boolean; importedAt?: string } = {}
): Promise<ReviewImportResult> {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const serialized = JSON.stringify(input);
  const parsed = safeParse(serialized);
  const validation = validateBrowserReviewBundle(parsed);
  if (!validation.ok) {
    throw browserError("REVIEW_BUNDLE_INVALID", validation.errors.join("; "));
  }
  const bundle = parsed as ReviewBundleDocument;
  const exactReport =
    bundle.source.reportId === current.report.reportId &&
    bundle.source.reportFingerprint === current.state.reportFingerprint;
  if (!exactReport && !options.reanchor) {
    throw browserError(
      "REVIEW_REPORT_MISMATCH",
      "Review bundle belongs to another report; explicitly enable re-anchoring to import it"
    );
  }
  const conflicts: ReviewImportConflict[] = [];
  const reanchored = [];
  const state = nextState(current, importedAt);
  for (const [key, entry] of Object.entries(bundle.state.viewed)) {
    const match = classifyAnchor(entry.anchor, current.anchorCatalog);
    reanchored.push(match);
    const target = match.result === "exact" ? match.candidate! : entry.anchor;
    const targetKey = match.result === "exact" ? anchorKey(target) : key;
    const incoming = {
      anchor: clone(target),
      state: match.result === "exact" ? entry.state : ("stale" as const),
      updatedAt: importedAt
    };
    const existing = state.viewed[targetKey];
    if (existing && canonicalReviewJson(existing) !== canonicalReviewJson(incoming)) {
      conflicts.push({ kind: "viewed", id: targetKey, current: existing, incoming });
    } else state.viewed[targetKey] = incoming;
  }
  const sourceChanges = new Map(
    bundle.anchorCatalog
      .filter((anchor) => anchor.type === "change")
      .map((anchor) => [anchor.ref, anchor] as const)
  );
  for (const [changeId, entry] of Object.entries(bundle.state.judgments)) {
    const source = sourceChanges.get(changeId);
    const match = source ? classifyAnchor(source, current.anchorCatalog) : undefined;
    if (match) reanchored.push(match);
    const targetId = match?.result === "exact" ? match.candidate!.ref : changeId;
    const incoming = {
      changeId: targetId,
      state: match?.result === "exact" ? entry.state : ("stale" as const),
      updatedAt: importedAt
    };
    const existing = state.judgments[targetId];
    if (
      existing &&
      existing.state !== "unreviewed" &&
      canonicalReviewJson(existing) !== canonicalReviewJson(incoming)
    ) {
      conflicts.push({ kind: "judgment", id: targetId, current: existing, incoming });
    } else state.judgments[targetId] = incoming;
  }
  const threads = clone(current.threads);
  for (const sourceThread of bundle.threads) {
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
      updatedAt: importedAt
    };
    const existing = threads.find((thread) => thread.id === incoming.id);
    if (existing && canonicalReviewJson(existing) !== canonicalReviewJson(incoming)) {
      conflicts.push({ kind: "thread", id: incoming.id, current: existing, incoming });
    } else if (!existing) threads.push(incoming);
  }
  state.threadIds = threads.map((thread) => thread.id);
  state.orphanedThreadIds = threads
    .filter((thread) => thread.state === "orphaned")
    .map((thread) => thread.id);
  const event = await eventFor(current, importedAt, {
    type: "state.imported",
    sourceReportId: bundle.source.reportId
  });
  const store = { ...current, state, threads, events: [...current.events, event] };
  validateStore(store);
  return { store, reanchored, conflicts };
}
