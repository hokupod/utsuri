import { createHash } from "node:crypto";
import { ExitCode, UtsuriError, type ExitCodeValue } from "@utsu-ri/core";
import type {
  ContextPack,
  FeedbackBatch,
  OriginSessionBinding,
  ReviewAnswer,
  ReviewThread
} from "@utsu-ri/report-model";
import { assertArtifact } from "@utsu-ri/report-model";
import {
  appendReviewEvent,
  canonicalReviewJson,
  nodeReviewDigest,
  type ReviewDigest,
  type ReviewStore
} from "@utsu-ri/review-state";
import { parseBoundedJson } from "@utsu-ri/security";
import { assertOriginSessionMatch, type CurrentSessionIdentity } from "@utsu-ri/session-binding";
import { buildContextPack, type ContextPackBuildResult } from "@utsu-ri/context-pack";

const maximumInboxBytes = 2 * 1024 * 1024;
const maximumInboxEntries = 1000;

export type FeedbackBatchState = FeedbackBatch["state"];
export type FeedbackDeliveryMode = FeedbackBatch["deliveryMode"];

export interface ReviewInboxEntry {
  batchId: string;
  batchFile: string;
  itemIds: string[];
  state: FeedbackBatchState;
  createdAt: string;
  updatedAt: string;
  claimedBySessionRef?: string;
  unreadAnswerItemIds: string[];
}

export interface ReviewInboxDocument {
  schemaVersion: "1.0";
  reportId: string;
  entries: ReviewInboxEntry[];
  idempotency: Record<string, string>;
}

export interface FeedbackBatchPreview {
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
    deliveryMode: FeedbackDeliveryMode;
  };
}

export interface PreviewFeedbackOptions {
  createdAt: string;
  deliveryMode?: FeedbackDeliveryMode;
  directBridgeAvailable?: boolean;
  baseSha?: string | null;
  headSha?: string | null;
  digest?: ReviewDigest;
}

export interface StoreFeedbackOptions extends PreviewFeedbackOptions {
  idempotencyKey: string;
}

function inboxError(
  id: string,
  message: string,
  exitCode: ExitCodeValue = ExitCode.Artifact
): never {
  throw new UtsuriError(id, message, exitCode);
}

function sidecarPath(directory: "batches" | "contexts" | "answers", id: string): string {
  return `${directory}/${createHash("sha256").update(id).digest("hex")}.json`;
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    inboxError("REVIEW_INBOX_INVALID", "Review Inbox contains an invalid object shape");
  }
}

function assertInbox(value: unknown, reportId: string): asserts value is ReviewInboxDocument {
  if (!isRecord(value)) inboxError("REVIEW_INBOX_INVALID", "Review Inbox is invalid");
  assertExactKeys(value, ["schemaVersion", "reportId", "entries", "idempotency"]);
  if (
    value.schemaVersion !== "1.0" ||
    value.reportId !== reportId ||
    !Array.isArray(value.entries) ||
    value.entries.length > maximumInboxEntries ||
    !isRecord(value.idempotency)
  ) {
    inboxError("REVIEW_INBOX_INVALID", "Review Inbox identity or limits are invalid");
  }
  const batchIds = new Set<string>();
  for (const raw of value.entries) {
    if (!isRecord(raw)) inboxError("REVIEW_INBOX_INVALID", "Review Inbox entry is invalid");
    assertExactKeys(
      raw,
      ["batchId", "batchFile", "itemIds", "state", "createdAt", "updatedAt", "unreadAnswerItemIds"],
      ["claimedBySessionRef"]
    );
    const itemIds = raw.itemIds;
    if (
      typeof raw.batchId !== "string" ||
      !/^fb[-:]/u.test(raw.batchId) ||
      batchIds.has(raw.batchId) ||
      raw.batchFile !== sidecarPath("batches", raw.batchId) ||
      !Array.isArray(itemIds) ||
      itemIds.length < 1 ||
      itemIds.length > 20 ||
      itemIds.some((id) => typeof id !== "string" || !/^item[-:]/u.test(id)) ||
      new Set(itemIds).size !== itemIds.length ||
      !new Set(["draft", "ready", "submitted", "consumed", "answered", "stale"]).has(
        String(raw.state)
      ) ||
      typeof raw.createdAt !== "string" ||
      !Number.isFinite(Date.parse(raw.createdAt)) ||
      typeof raw.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(raw.updatedAt)) ||
      (raw.claimedBySessionRef !== undefined &&
        (typeof raw.claimedBySessionRef !== "string" ||
          !/^session:[a-f0-9]{64}$/u.test(raw.claimedBySessionRef))) ||
      !Array.isArray(raw.unreadAnswerItemIds) ||
      raw.unreadAnswerItemIds.some((id) => typeof id !== "string" || !itemIds.includes(id)) ||
      new Set(raw.unreadAnswerItemIds).size !== raw.unreadAnswerItemIds.length ||
      (raw.state === "consumed" || raw.state === "answered") !==
        (raw.claimedBySessionRef !== undefined) ||
      (raw.state === "answered"
        ? raw.unreadAnswerItemIds.length !== itemIds.length
        : raw.unreadAnswerItemIds.length !== 0)
    ) {
      inboxError("REVIEW_INBOX_INVALID", "Review Inbox entry fields are invalid");
    }
    batchIds.add(raw.batchId);
  }
  for (const [key, batchId] of Object.entries(value.idempotency)) {
    if (!/^[a-f0-9]{64}$/u.test(key) || typeof batchId !== "string" || !batchIds.has(batchId)) {
      inboxError("REVIEW_INBOX_INVALID", "Review Inbox idempotency index is invalid");
    }
  }
}

export function readReviewInbox(store: ReviewStore): ReviewInboxDocument {
  const content = store.sidecarFiles["review-inbox.json"];
  if (!content) {
    return {
      schemaVersion: "1.0",
      reportId: store.report.reportId,
      entries: [],
      idempotency: {}
    };
  }
  const value = parseBoundedJson(content, {
    label: "review inbox",
    maximumBytes: maximumInboxBytes
  });
  assertInbox(value, store.report.reportId);
  return structuredClone(value);
}

function assertBatchEntry(batch: FeedbackBatch, entry: ReviewInboxEntry): void {
  if (
    batch.id !== entry.batchId ||
    batch.state !== entry.state ||
    batch.createdAt !== entry.createdAt ||
    canonicalReviewJson(batch.items.map((item) => item.id)) !== canonicalReviewJson(entry.itemIds)
  ) {
    inboxError("FEEDBACK_BATCH_INDEX_MISMATCH", "Feedback Batch and Inbox index disagree");
  }
}

function readBatch(store: ReviewStore, batchId: string, entry?: ReviewInboxEntry): FeedbackBatch {
  const content = store.sidecarFiles[sidecarPath("batches", batchId)];
  if (!content) inboxError("FEEDBACK_BATCH_MISSING", `Feedback Batch is missing: ${batchId}`);
  const value = parseBoundedJson(content, {
    label: `feedback batch ${batchId}`,
    maximumBytes: 2 * 1024 * 1024
  });
  assertArtifact("feedback-batch", value);
  const batch = value as FeedbackBatch;
  if (batch.id !== batchId || batch.reportId !== store.report.reportId) {
    inboxError("FEEDBACK_BATCH_IDENTITY", "Feedback Batch identity is invalid");
  }
  if (entry) assertBatchEntry(batch, entry);
  return structuredClone(batch);
}

export function getFeedbackBatch(store: ReviewStore, batchId: string): FeedbackBatch {
  const inbox = readReviewInbox(store);
  const entry = inbox.entries.find((candidate) => candidate.batchId === batchId);
  if (!entry) {
    inboxError("FEEDBACK_BATCH_MISSING", `Feedback Batch is missing: ${batchId}`);
  }
  return readBatch(store, batchId, entry);
}

export function getFeedbackItemContext(store: ReviewStore, itemId: string): ContextPack {
  const inbox = readReviewInbox(store);
  const matchingEntries = inbox.entries.filter((entry) => entry.itemIds.includes(itemId));
  if (matchingEntries.length !== 1) {
    inboxError("FEEDBACK_CONTEXT_INDEX", "Feedback context is not bound to exactly one batch");
  }
  const entry = matchingEntries[0]!;
  const batch = readBatch(store, entry.batchId, entry);
  const item = batch.items.find((candidate) => candidate.id === itemId);
  if (!item)
    inboxError("FEEDBACK_CONTEXT_INDEX", "Feedback context item is missing from its batch");
  const content = store.sidecarFiles[sidecarPath("contexts", itemId)];
  if (!content) inboxError("FEEDBACK_CONTEXT_MISSING", `Feedback context is missing: ${itemId}`);
  const value = parseBoundedJson(content, {
    label: `feedback context ${itemId}`,
    maximumBytes: 512 * 1024
  });
  assertArtifact("context-pack", value);
  const context = value as ContextPack;
  const { contextHash, ...contextSource } = context;
  const computedHash = createHash("sha256")
    .update(canonicalReviewJson(contextSource))
    .digest("hex");
  if (
    context.itemId !== itemId ||
    context.batchId !== batch.id ||
    context.reportId !== store.report.reportId ||
    canonicalReviewJson(context.anchor) !== canonicalReviewJson(item.anchor) ||
    contextHash !== computedHash
  ) {
    inboxError("FEEDBACK_CONTEXT_IDENTITY", "Feedback context identity is invalid");
  }
  return structuredClone(context);
}

function contextsForBatch(store: ReviewStore, batch: FeedbackBatch): ContextPack[] {
  const contexts = batch.items.map((item) => getFeedbackItemContext(store, item.id));
  const aggregate = createHash("sha256")
    .update(canonicalReviewJson(contexts.map((context) => context.contextHash)))
    .digest("hex");
  if (aggregate !== batch.contextHash) {
    inboxError("FEEDBACK_CONTEXT_HASH", "Feedback Batch context hash is invalid");
  }
  return contexts;
}

export function listFeedbackBatches(
  store: ReviewStore,
  state?: FeedbackBatchState
): FeedbackBatch[] {
  const inbox = readReviewInbox(store);
  return inbox.entries
    .filter((entry) => !state || entry.state === state)
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.batchId.localeCompare(right.batchId)
        : right.createdAt.localeCompare(left.createdAt)
    )
    .map((entry) => readBatch(store, entry.batchId, entry));
}

function effectiveDeliveryMode(
  origin: OriginSessionBinding,
  requested: FeedbackDeliveryMode | undefined,
  directBridgeAvailable: boolean
): { mode: FeedbackDeliveryMode; warning?: string } {
  if (origin.bindingMode === "unbound") return { mode: "export-only" };
  if (requested === "export-only") return { mode: "export-only" };
  if (requested === "direct-same-session") {
    if (origin.bindingMode === "direct-same-session" && directBridgeAvailable) {
      return { mode: "direct-same-session" };
    }
    return {
      mode: "return-to-session",
      warning: "Direct same-session delivery is unavailable; using return-to-session"
    };
  }
  return { mode: "return-to-session" };
}

function defaultContextSelection(
  thread: ReviewThread
): FeedbackBatch["items"][number]["contextSelection"] {
  const visual = thread.anchor.type === "visual-target" || thread.anchor.type === "visual-region";
  return {
    includeCodeDiff: !visual,
    includeVisualCrop: visual,
    includeComputedStyle: false,
    includeDomAria: false,
    includeRelatedTests: false
  };
}

async function buildPreview(
  store: ReviewStore,
  origin: OriginSessionBinding,
  options: PreviewFeedbackOptions
): Promise<{ preview: FeedbackBatchPreview; contextResults: ContextPackBuildResult[] }> {
  assertArtifact("origin-session", origin);
  if (origin.reportId !== store.report.reportId) {
    inboxError("FEEDBACK_REPORT_MISMATCH", "Feedback destination belongs to another report");
  }
  if (!Number.isFinite(Date.parse(options.createdAt))) {
    inboxError("FEEDBACK_TIME_INVALID", "Feedback Batch timestamp is invalid", ExitCode.Arguments);
  }
  const requestedThreads = store.threads.filter(
    (thread) => thread.agentAttention.state === "requested"
  );
  const excludedThreads = requestedThreads.filter((thread) =>
    new Set(["stale", "orphaned", "resolved"]).has(thread.state)
  );
  const threads = requestedThreads.filter(
    (thread) => !new Set(["stale", "orphaned", "resolved"]).has(thread.state)
  );
  if (threads.length === 0) {
    inboxError(
      "FEEDBACK_ITEMS_EMPTY",
      "No current comments request Agent attention",
      ExitCode.Arguments
    );
  }
  if (threads.length > 20) {
    inboxError("FEEDBACK_ITEM_LIMIT", "Feedback Batch exceeds 20 items", ExitCode.Arguments);
  }
  const digest = options.digest ?? nodeReviewDigest;
  const batchId = `fb:${(
    await digest({
      reportId: store.report.reportId,
      threadIds: threads.map((thread) => thread.id),
      origin,
      createdAt: options.createdAt
    })
  ).slice(0, 24)}`;
  const items = (await Promise.all(
    threads.map(async (thread) => {
      const sourceMessage = [...thread.messages]
        .reverse()
        .find((message) => message.author.type === "human");
      if (!sourceMessage) {
        inboxError("FEEDBACK_SOURCE_MISSING", "Feedback thread has no human source message");
      }
      return {
        id: `item:${(
          await digest({ batchId, threadId: thread.id, sourceMessageId: sourceMessage.id })
        ).slice(0, 24)}`,
        threadId: thread.id,
        anchor: structuredClone(thread.anchor),
        sourceMessageId: sourceMessage.id,
        requestKind: thread.kind === "question" ? "explain" : "freeform",
        question: sourceMessage.body,
        contextSelection: defaultContextSelection(thread),
        state: "ready"
      };
    })
  )) as FeedbackBatch["items"];
  const contextResults = await Promise.all(
    items.map((item, index) =>
      buildContextPack({
        report: store.report,
        thread: threads[index]!,
        item,
        batchId,
        baseSha: options.baseSha,
        headSha: options.headSha,
        digest
      })
    )
  );
  const mode = effectiveDeliveryMode(
    origin,
    options.deliveryMode,
    options.directBridgeAvailable ?? false
  );
  const redactedItems = items.map((item, index) => ({
    ...item,
    question: contextResults[index]!.pack.question
  })) as FeedbackBatch["items"];
  const batch: FeedbackBatch = {
    id: batchId,
    reportId: store.report.reportId,
    origin: structuredClone(origin),
    items: redactedItems,
    state: "ready",
    deliveryMode: mode.mode,
    contextHash: await digest(contextResults.map((result) => result.pack.contextHash)),
    createdAt: options.createdAt
  };
  assertArtifact("feedback-batch", batch);
  const duplicateAnchors = new Set<string>();
  const seenAnchors = new Set<string>();
  for (const item of redactedItems) {
    const key = `${item.anchor.type}\0${item.anchor.ref}`;
    if (seenAnchors.has(key)) duplicateAnchors.add(key);
    seenAnchors.add(key);
  }
  const excluded = new Set(contextResults.flatMap((result) => result.excluded));
  if (excludedThreads.length > 0) excluded.add("stale, orphaned, or resolved comments");
  const warnings = [
    ...(mode.warning ? [mode.warning] : []),
    ...(duplicateAnchors.size > 0 ? ["Multiple items use the same review anchor"] : [])
  ];
  return {
    preview: {
      batch,
      contexts: contextResults.map((result) => result.pack),
      shared: contextResults.reduce(
        (total, result) => ({
          comments: total.comments + result.shared.comments,
          codeRanges: total.codeRanges + result.shared.codeRanges,
          imageCrops: total.imageCrops + result.shared.imageCrops,
          evidenceReferences: total.evidenceReferences + result.shared.evidenceReferences
        }),
        { comments: 0, codeRanges: 0, imageCrops: 0, evidenceReferences: 0 }
      ),
      excluded: [...excluded].sort(),
      redactionCount: contextResults.reduce(
        (count, result) => count + result.pack.redactions.length,
        0
      ),
      contextBytes: contextResults.reduce((count, result) => count + result.bytes, 0),
      warnings,
      destination: {
        host: origin.host,
        bound: Boolean(origin.sessionRef),
        deliveryMode: mode.mode
      }
    },
    contextResults
  };
}

export async function previewFeedbackBatch(
  store: ReviewStore,
  origin: OriginSessionBinding,
  options: PreviewFeedbackOptions
): Promise<FeedbackBatchPreview> {
  return (await buildPreview(store, origin, options)).preview;
}

function replaceInbox(
  sidecars: Record<string, string>,
  inbox: ReviewInboxDocument
): Record<string, string> {
  assertInbox(inbox, inbox.reportId);
  const content = serialized(inbox);
  if (Buffer.byteLength(content) > maximumInboxBytes) {
    inboxError("REVIEW_INBOX_LIMIT", "Review Inbox exceeds 2 MiB");
  }
  return { ...sidecars, "review-inbox.json": content };
}

export async function storeFeedbackBatch(
  store: ReviewStore,
  origin: OriginSessionBinding,
  options: StoreFeedbackOptions
): Promise<{ store: ReviewStore; preview: FeedbackBatchPreview; created: boolean }> {
  if (!options.idempotencyKey.trim() || options.idempotencyKey.length > 4096) {
    inboxError("FEEDBACK_IDEMPOTENCY_INVALID", "Feedback idempotency key is invalid");
  }
  const digest = options.digest ?? nodeReviewDigest;
  const keyHash = await digest({ reportId: store.report.reportId, key: options.idempotencyKey });
  const inbox = readReviewInbox(store);
  const existingId = inbox.idempotency[keyHash];
  if (existingId) {
    const batch = getFeedbackBatch(store, existingId);
    const contexts = contextsForBatch(store, batch);
    return {
      store,
      created: false,
      preview: {
        batch,
        contexts,
        shared: {
          comments: batch.items.length,
          codeRanges: contexts.reduce((count, context) => count + context.code.length, 0),
          imageCrops: contexts.reduce((count, context) => count + context.images.length, 0),
          evidenceReferences: contexts.reduce(
            (count, context) => count + context.evidenceRefs.length,
            0
          )
        },
        excluded: ["environment variables", "files outside the report"],
        redactionCount: contexts.reduce((count, context) => count + context.redactions.length, 0),
        contextBytes: contexts.reduce(
          (count, context) => count + Buffer.byteLength(canonicalReviewJson(context)),
          0
        ),
        warnings: ["Existing idempotent Feedback Batch returned"],
        destination: {
          host: batch.origin.host,
          bound: Boolean(batch.origin.sessionRef),
          deliveryMode: batch.deliveryMode
        }
      }
    };
  }
  const { preview } = await buildPreview(store, origin, options);
  const batch = preview.batch;
  const sidecars = { ...store.sidecarFiles };
  sidecars[sidecarPath("batches", batch.id)] = serialized(batch);
  for (const context of preview.contexts) {
    sidecars[sidecarPath("contexts", context.itemId)] = serialized(context);
  }
  inbox.entries.push({
    batchId: batch.id,
    batchFile: sidecarPath("batches", batch.id),
    itemIds: batch.items.map((item) => item.id),
    state: batch.state,
    createdAt: batch.createdAt,
    updatedAt: options.createdAt,
    unreadAnswerItemIds: []
  });
  inbox.idempotency[keyHash] = batch.id;
  const threads = structuredClone(store.threads);
  for (const item of batch.items) {
    const index = threads.findIndex((thread) => thread.id === item.threadId);
    if (index === -1) inboxError("FEEDBACK_THREAD_MISSING", "Feedback thread is missing");
    threads[index] = {
      ...threads[index]!,
      agentAttention: { state: "batched", batchId: batch.id, updatedAt: options.createdAt },
      updatedAt: options.createdAt
    };
    assertArtifact("review-thread", threads[index]);
  }
  const next = await appendReviewEvent(
    store,
    {
      type: "feedback-batch.stored",
      batchId: batch.id,
      threadIds: batch.items.map((item) => item.threadId),
      itemCount: batch.items.length,
      deliveryMode: batch.deliveryMode
    },
    options.createdAt,
    { threads, sidecarFiles: replaceInbox(sidecars, inbox) },
    digest
  );
  return { store: next, preview, created: true };
}

function replaceBatch(
  store: ReviewStore,
  inbox: ReviewInboxDocument,
  entry: ReviewInboxEntry,
  batch: FeedbackBatch
): Record<string, string> {
  entry.state = batch.state;
  const sidecars = { ...store.sidecarFiles, [entry.batchFile]: serialized(batch) };
  return replaceInbox(sidecars, inbox);
}

export async function claimFeedbackBatch(
  store: ReviewStore,
  batchId: string,
  current: CurrentSessionIdentity,
  claimedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<{
  store: ReviewStore;
  batch: FeedbackBatch;
  contexts: ContextPack[];
  claimed: boolean;
}> {
  const inbox = readReviewInbox(store);
  const entry = inbox.entries.find((candidate) => candidate.batchId === batchId);
  if (!entry) inboxError("FEEDBACK_BATCH_MISSING", `Feedback Batch is missing: ${batchId}`);
  const batch = readBatch(store, batchId, entry);
  assertOriginSessionMatch(batch.origin, current);
  if (batch.state === "consumed") {
    if (entry.claimedBySessionRef === current.sessionRef) {
      return {
        store,
        batch,
        contexts: contextsForBatch(store, batch),
        claimed: false
      };
    }
    inboxError("FEEDBACK_BATCH_LOCKED", "Feedback Batch is claimed by another conversation");
  }
  if (!new Set(["ready", "submitted"]).has(batch.state)) {
    inboxError("FEEDBACK_BATCH_STATE", `Feedback Batch cannot be claimed from ${batch.state}`);
  }
  batch.state = "consumed";
  batch.consumedAt = claimedAt;
  batch.items = batch.items.map((item) => ({
    ...item,
    state: "acknowledged"
  })) as FeedbackBatch["items"];
  assertArtifact("feedback-batch", batch);
  entry.updatedAt = claimedAt;
  entry.claimedBySessionRef = current.sessionRef;
  const threads = structuredClone(store.threads);
  for (const item of batch.items) {
    const index = threads.findIndex((thread) => thread.id === item.threadId);
    if (index === -1) inboxError("FEEDBACK_THREAD_MISSING", "Feedback thread is missing");
    threads[index] = {
      ...threads[index]!,
      agentAttention: { state: "acknowledged", batchId, updatedAt: claimedAt },
      updatedAt: claimedAt
    };
  }
  const next = await appendReviewEvent(
    store,
    { type: "feedback-batch.claimed", batchId, originSessionMatched: true },
    claimedAt,
    { threads, sidecarFiles: replaceBatch(store, inbox, entry, batch) },
    digest
  );
  return {
    store: next,
    batch,
    contexts: contextsForBatch(next, batch),
    claimed: true
  };
}

export async function releaseFeedbackBatch(
  store: ReviewStore,
  batchId: string,
  current: CurrentSessionIdentity,
  releasedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  const inbox = readReviewInbox(store);
  const entry = inbox.entries.find((candidate) => candidate.batchId === batchId);
  if (!entry) inboxError("FEEDBACK_BATCH_MISSING", `Feedback Batch is missing: ${batchId}`);
  const batch = readBatch(store, batchId, entry);
  assertOriginSessionMatch(batch.origin, current);
  if (batch.state !== "consumed" || entry.claimedBySessionRef !== current.sessionRef) {
    inboxError("FEEDBACK_BATCH_LOCK", "Only the claiming conversation can release this batch");
  }
  batch.state = "ready";
  delete batch.consumedAt;
  batch.items = batch.items.map((item) => ({ ...item, state: "ready" })) as FeedbackBatch["items"];
  delete entry.claimedBySessionRef;
  entry.updatedAt = releasedAt;
  const threads = structuredClone(store.threads);
  for (const item of batch.items) {
    const index = threads.findIndex((thread) => thread.id === item.threadId);
    if (index === -1) inboxError("FEEDBACK_THREAD_MISSING", "Feedback thread is missing");
    threads[index] = {
      ...threads[index]!,
      agentAttention: { state: "batched", batchId, updatedAt: releasedAt },
      updatedAt: releasedAt
    };
  }
  return appendReviewEvent(
    store,
    { type: "feedback-batch.released", batchId },
    releasedAt,
    { threads, sidecarFiles: replaceBatch(store, inbox, entry, batch) },
    digest
  );
}

export async function postFeedbackAnswers(
  store: ReviewStore,
  batchId: string,
  answers: ReviewAnswer[],
  current: CurrentSessionIdentity,
  answeredAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  const inbox = readReviewInbox(store);
  const entry = inbox.entries.find((candidate) => candidate.batchId === batchId);
  if (!entry) inboxError("FEEDBACK_BATCH_MISSING", `Feedback Batch is missing: ${batchId}`);
  const batch = readBatch(store, batchId, entry);
  assertOriginSessionMatch(batch.origin, current);
  const expectedIds = batch.items.map((item) => item.id).sort();
  const answerIds = answers.map((answer) => answer.itemId).sort();
  if (
    answers.length !== batch.items.length ||
    new Set(answerIds).size !== answerIds.length ||
    canonicalReviewJson(expectedIds) !== canonicalReviewJson(answerIds)
  ) {
    inboxError("FEEDBACK_ANSWER_CARDINALITY", "Write exactly one answer for every batch item");
  }
  const contexts = contextsForBatch(store, batch);
  const contextsByItem = new Map(contexts.map((context) => [context.itemId, context] as const));
  for (const answer of answers) {
    assertArtifact("review-answer", answer);
    const context = contextsByItem.get(answer.itemId);
    if (
      !context ||
      answer.batchId !== batchId ||
      answer.metadata.contextHash !== context.contextHash ||
      answer.metadata.host !== current.host ||
      answer.metadata.originSessionRef !== current.sessionRef
    ) {
      inboxError(
        "FEEDBACK_ANSWER_BINDING",
        "Review answer is not bound to its item and Origin Session"
      );
    }
  }
  if (batch.state === "answered") {
    const answersByItem = new Map(answers.map((answer) => [answer.itemId, answer] as const));
    const existing = batch.items.map((item) => {
      const content = store.sidecarFiles[sidecarPath("answers", item.id)];
      if (!content) return null;
      const value = parseBoundedJson(content, {
        label: `review answer ${item.id}`,
        maximumBytes: 1024 * 1024
      });
      assertArtifact("review-answer", value);
      return value;
    });
    if (
      existing.every(Boolean) &&
      batch.items.every(
        (item, index) =>
          canonicalReviewJson(existing[index]) === canonicalReviewJson(answersByItem.get(item.id))
      )
    ) {
      return store;
    }
    if (existing.every(Boolean)) {
      inboxError("FEEDBACK_ANSWER_CONFLICT", "Different answers already exist for this batch");
    }
    inboxError("FEEDBACK_ANSWER_INCOMPLETE", "Answered batch has missing answer sidecars");
  }
  if (batch.state !== "consumed" || entry.claimedBySessionRef !== current.sessionRef) {
    inboxError("FEEDBACK_BATCH_LOCK", "Only the claiming conversation can answer this batch");
  }
  const answersByItem = new Map(answers.map((answer) => [answer.itemId, answer] as const));
  const sidecars = { ...store.sidecarFiles };
  const threads = structuredClone(store.threads);
  for (const item of batch.items) {
    const answer = answersByItem.get(item.id)!;
    sidecars[sidecarPath("answers", item.id)] = serialized(answer);
    const index = threads.findIndex((thread) => thread.id === item.threadId);
    if (index === -1) inboxError("FEEDBACK_THREAD_MISSING", "Feedback thread is missing");
    const thread = threads[index]!;
    const messageId = `message:${(
      await digest({ threadId: thread.id, itemId: item.id, answer, answeredAt })
    ).slice(0, 24)}`;
    threads[index] = {
      ...thread,
      state: thread.state === "stale" || thread.state === "orphaned" ? thread.state : "answered",
      messages: [
        ...thread.messages,
        {
          id: messageId,
          kind: "agent-answer",
          author: { type: "agent", label: "Origin Session" },
          body: answer.directAnswer,
          feedbackItemId: item.id,
          evidenceRefs: [...new Set(answer.evidence.map((evidence) => evidence.ref))],
          createdAt: answeredAt
        }
      ],
      agentAttention: {
        state: thread.state === "stale" || thread.state === "orphaned" ? "stale" : "answered",
        batchId,
        updatedAt: answeredAt
      },
      updatedAt: answeredAt
    };
    assertArtifact("review-thread", threads[index]);
  }
  batch.state = "answered";
  batch.answeredAt = answeredAt;
  batch.items = batch.items.map((item) => ({
    ...item,
    state: "answered"
  })) as FeedbackBatch["items"];
  assertArtifact("feedback-batch", batch);
  entry.updatedAt = answeredAt;
  entry.unreadAnswerItemIds = [...expectedIds];
  const nextSidecars = replaceBatch({ ...store, sidecarFiles: sidecars }, inbox, entry, batch);
  return appendReviewEvent(
    store,
    { type: "feedback-batch.answered", batchId, itemIds: expectedIds },
    answeredAt,
    { threads, sidecarFiles: nextSidecars },
    digest
  );
}
