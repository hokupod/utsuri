import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import annotationsSchema from "../../../schemas/annotations.schema.json" with { type: "json" };
import captureActionSchema from "../../../schemas/capture-action.schema.json" with { type: "json" };
import configSchema from "../../../schemas/config.schema.json" with { type: "json" };
import contextPackSchema from "../../../schemas/context-pack.schema.json" with { type: "json" };
import diffSchema from "../../../schemas/diff.schema.json" with { type: "json" };
import evidenceIndexSchema from "../../../schemas/evidence-index.schema.json" with { type: "json" };
import feedbackBatchSchema from "../../../schemas/feedback-batch.schema.json" with { type: "json" };
import originSessionSchema from "../../../schemas/origin-session.schema.json" with { type: "json" };
import reportSchema from "../../../schemas/report.schema.json" with { type: "json" };
import reviewAnswerSchema from "../../../schemas/review-answer.schema.json" with { type: "json" };
import reviewBundleSchema from "../../../schemas/review-bundle.schema.json" with { type: "json" };
import reviewEventSchema from "../../../schemas/review-event.schema.json" with { type: "json" };
import reviewPlanSchema from "../../../schemas/review-plan.schema.json" with { type: "json" };
import reviewStateSchema from "../../../schemas/review-state.schema.json" with { type: "json" };
import reviewThreadSchema from "../../../schemas/review-thread.schema.json" with { type: "json" };
import type { UtsuriReport } from "./generated/report.schema";
import type { GitDiffDocument } from "./generated/diff.schema";
import type { EvidenceIndex } from "./generated/evidence-index.schema";
import type { ReviewPlan } from "./generated/review-plan.schema";

const schemaMap = {
  annotations: annotationsSchema,
  "capture-action": captureActionSchema,
  config: configSchema,
  "context-pack": contextPackSchema,
  diff: diffSchema,
  "evidence-index": evidenceIndexSchema,
  "feedback-batch": feedbackBatchSchema,
  "origin-session": originSessionSchema,
  report: reportSchema,
  "review-answer": reviewAnswerSchema,
  "review-bundle": reviewBundleSchema,
  "review-event": reviewEventSchema,
  "review-plan": reviewPlanSchema,
  "review-state": reviewStateSchema,
  "review-thread": reviewThreadSchema
} as const;

export type SchemaName = keyof typeof schemaMap;
export const schemaNames = Object.freeze(Object.keys(schemaMap) as SchemaName[]);

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);
const validators = new Map<SchemaName, ValidateFunction>();
for (const name of schemaNames) validators.set(name, ajv.compile(schemaMap[name]));

export interface ArtifactValidationResult {
  ok: boolean;
  errors: string[];
}

interface StructuredHunkForValidation {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{
    kind: "context" | "addition" | "deletion" | "no-newline";
    oldLine: number | null;
    newLine: number | null;
  }>;
}

function validateStructuredHunks(hunks: StructuredHunkForValidation[]): string[] {
  const errors: string[] = [];
  for (const hunk of hunks) {
    let oldCursor = hunk.oldStart;
    let newCursor = hunk.newStart;
    let oldObserved = 0;
    let newObserved = 0;
    for (const line of hunk.lines) {
      const expectedOld = line.kind === "context" || line.kind === "deletion" ? oldCursor++ : null;
      const expectedNew = line.kind === "context" || line.kind === "addition" ? newCursor++ : null;
      if (expectedOld !== null) oldObserved += 1;
      if (expectedNew !== null) newObserved += 1;
      if (line.oldLine !== expectedOld || line.newLine !== expectedNew) {
        errors.push(`${hunk.id} contains inconsistent line numbers`);
        break;
      }
    }
    if (oldObserved !== hunk.oldLines || newObserved !== hunk.newLines) {
      errors.push(`${hunk.id} contains inconsistent range counts`);
    }
  }
  return errors;
}

function formatError(error: ErrorObject): string {
  const location = error.instancePath || "/";
  return `${location} ${error.message ?? "is invalid"}`;
}

export function validateArtifact(name: SchemaName, value: unknown): ArtifactValidationResult {
  const validator = validators.get(name);
  if (!validator) return { ok: false, errors: [`Unknown schema: ${name}`] };
  const valid = validator(value);
  return { ok: Boolean(valid), errors: valid ? [] : (validator.errors ?? []).map(formatError) };
}

export function assertArtifact(name: SchemaName, value: unknown): void {
  const result = validateArtifact(name, value);
  if (!result.ok) {
    throw new UtsuriError(
      "SCHEMA_INVALID",
      `${name}: ${result.errors.join("; ")}`,
      ExitCode.Artifact,
      { schema: name, errors: result.errors }
    );
  }
}

interface ReviewBundleForValidation {
  source: {
    reportId: string;
    reportFingerprint: string;
  };
  state: {
    reportId: string;
    reportFingerprint: string;
    threadIds: string[];
    orphanedThreadIds: string[];
    viewed: Record<string, { anchor: ReviewAnchorForValidation }>;
  };
  threads: Array<{
    id: string;
    reportId: string;
    state: string;
    anchor: ReviewAnchorForValidation;
    messages: Array<{ body: string }>;
  }>;
  events: Array<{
    id: string;
    reportId: string;
    sequence: number;
    anchor?: ReviewAnchorForValidation;
  }>;
  anchorCatalog: ReviewAnchorForValidation[];
}

interface ReviewAnchorForValidation {
  type: string;
  ref: string;
  [key: string]: unknown;
}

function canonicalValidationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValidationJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalValidationJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function validateReviewBundle(value: unknown): ArtifactValidationResult {
  const schema = validateArtifact("review-bundle", value);
  if (!schema.ok) return schema;
  const bundle = value as ReviewBundleForValidation;
  const errors: string[] = [];
  const state = validateArtifact("review-state", bundle.state);
  errors.push(...state.errors.map((error) => `state${error}`));
  for (const [index, thread] of bundle.threads.entries()) {
    const result = validateArtifact("review-thread", thread);
    errors.push(...result.errors.map((error) => `threads/${index}${error}`));
  }
  for (const [index, event] of bundle.events.entries()) {
    const result = validateArtifact("review-event", event);
    errors.push(...result.errors.map((error) => `events/${index}${error}`));
  }
  if (errors.length > 0) return { ok: false, errors };
  if (bundle.state.reportId !== bundle.source.reportId) {
    errors.push("state.reportId does not match source.reportId");
  }
  if (bundle.state.reportFingerprint !== bundle.source.reportFingerprint) {
    errors.push("state.reportFingerprint does not match source.reportFingerprint");
  }
  const threadIds = bundle.threads.map((thread) => thread.id);
  if (new Set(threadIds).size !== threadIds.length) errors.push("threads contains duplicate IDs");
  if (
    [...new Set(bundle.state.threadIds)].sort().join("\n") !==
    [...new Set(threadIds)].sort().join("\n")
  ) {
    errors.push("state.threadIds does not match bundled threads");
  }
  const orphaned = new Set(bundle.state.orphanedThreadIds);
  for (const thread of bundle.threads) {
    if (thread.reportId !== bundle.source.reportId) {
      errors.push(`${thread.id} reportId does not match source.reportId`);
    }
    if ((thread.state === "orphaned") !== orphaned.has(thread.id)) {
      errors.push(`${thread.id} orphaned state is inconsistent`);
    }
    for (const [index, message] of thread.messages.entries()) {
      const bodyBytes = new TextEncoder().encode(message.body).byteLength;
      if (!message.body.trim()) errors.push(`${thread.id}.messages/${index} body is empty`);
      if (bodyBytes > 16 * 1024) {
        errors.push(`${thread.id}.messages/${index} body exceeds 16 KiB`);
      }
    }
  }
  for (const id of orphaned) {
    if (!threadIds.includes(id)) errors.push(`orphaned thread is missing: ${id}`);
  }
  const eventIds = bundle.events.map((event) => event.id);
  if (new Set(eventIds).size !== eventIds.length) errors.push("events contains duplicate IDs");
  for (const [index, event] of bundle.events.entries()) {
    if (event.sequence !== index + 1) errors.push(`events/${index} sequence is not contiguous`);
    if (event.reportId !== bundle.source.reportId) {
      errors.push(`events/${index} reportId does not match source.reportId`);
    }
  }
  const anchorKeys = bundle.anchorCatalog.map((anchor) => `${anchor.type}\u0000${anchor.ref}`);
  if (new Set(anchorKeys).size !== anchorKeys.length) {
    errors.push("anchorCatalog contains duplicate type/ref pairs");
  }
  const anchors = new Map(
    bundle.anchorCatalog.map((anchor) => [`${anchor.type}\u0000${anchor.ref}`, anchor] as const)
  );
  const requireCatalogAnchor = (label: string, anchor: ReviewAnchorForValidation): void => {
    const catalogAnchor = anchors.get(`${anchor.type}\u0000${anchor.ref}`);
    if (
      !catalogAnchor ||
      canonicalValidationJson(catalogAnchor) !== canonicalValidationJson(anchor)
    ) {
      errors.push(`${label} does not match anchorCatalog`);
    }
  };
  for (const [key, entry] of Object.entries(bundle.state.viewed)) {
    if (key !== JSON.stringify([entry.anchor.type, entry.anchor.ref])) {
      errors.push(`state.viewed key does not match its anchor: ${key}`);
    }
    requireCatalogAnchor(`state.viewed/${key}.anchor`, entry.anchor);
  }
  for (const [index, thread] of bundle.threads.entries()) {
    requireCatalogAnchor(`threads/${index}.anchor`, thread.anchor);
  }
  for (const [index, event] of bundle.events.entries()) {
    if (event.anchor) requireCatalogAnchor(`events/${index}.anchor`, event.anchor);
  }
  return { ok: errors.length === 0, errors };
}

export function validateReportReferences(report: UtsuriReport): ArtifactValidationResult {
  const schema = validateArtifact("report", report);
  if (!schema.ok) return schema;
  const errors: string[] = [];
  const hunkIds = new Set(report.hunks.map((hunk) => hunk.id));
  const hunksById = new Map(report.hunks.map((hunk) => [hunk.id, hunk]));
  const evidenceIds = new Set(report.evidence.map((evidence) => evidence.id));
  const targetIds = new Set(report.targets.map((target) => target.id));
  const comparisonIds = new Set(report.comparisons.map((comparison) => comparison.id));
  const findingIds = new Set(report.findings.map((finding) => finding.id));
  const assigned = new Map<string, string>();
  errors.push(...validateStructuredHunks(report.hunks));

  const requireUniqueIds = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length) errors.push(`${label} contains duplicate IDs`);
  };
  requireUniqueIds(
    "files",
    report.files.map((file) => file.id)
  );
  requireUniqueIds(
    "hunks",
    report.hunks.map((hunk) => hunk.id)
  );
  requireUniqueIds(
    "evidence",
    report.evidence.map((evidence) => evidence.id)
  );
  requireUniqueIds(
    "changes",
    report.changes.map((change) => change.id)
  );
  requireUniqueIds(
    "targets",
    report.targets.map((target) => target.id)
  );
  requireUniqueIds(
    "comparisons",
    report.comparisons.map((comparison) => comparison.id)
  );
  requireUniqueIds(
    "findings",
    report.findings.map((finding) => finding.id)
  );

  const unique = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length)
      errors.push(`${label} contains duplicate references`);
  };

  for (const change of report.changes) {
    unique(`${change.id}.hunkRefs`, change.hunkRefs);
    unique(`${change.id}.targetRefs`, change.targetRefs);
    unique(`${change.id}.findingRefs`, change.findingRefs);
    for (const ref of change.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${change.id} references missing hunk ${ref}`);
      const previous = assigned.get(ref);
      if (previous) errors.push(`${ref} is assigned to both ${previous} and ${change.id}`);
      assigned.set(ref, change.id);
    }
    for (const ref of change.targetRefs) {
      if (!targetIds.has(ref)) errors.push(`${change.id} references missing target ${ref}`);
    }
    for (const ref of change.findingRefs) {
      if (!findingIds.has(ref)) errors.push(`${change.id} references missing finding ${ref}`);
    }
    for (const ref of change.intent.evidenceRefs) {
      if (!evidenceIds.has(ref)) errors.push(`${change.id} references missing evidence ${ref}`);
    }
  }

  const fileAssignments = new Map<string, string>();
  for (const file of report.files) {
    unique(`${file.id}.hunkRefs`, file.hunkRefs);
    for (const ref of file.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${file.id} references missing hunk ${ref}`);
      const previous = fileAssignments.get(ref);
      if (previous) errors.push(`${ref} belongs to both ${previous} and ${file.id}`);
      fileAssignments.set(ref, file.id);
      const hunk = hunksById.get(ref);
      const selectedPath = file.newPath ?? file.oldPath;
      if (
        hunk &&
        (hunk.path !== selectedPath ||
          hunk.oldPath !== file.oldPath ||
          hunk.newPath !== file.newPath)
      ) {
        errors.push(`${ref} path metadata does not match ${file.id}`);
      }
      if (hunk && hunk.lowSignal !== file.lowSignal) {
        errors.push(`${ref} low-signal classification does not match ${file.id}`);
      }
    }
    if (file.lowSignal !== file.lowSignalReasons.length > 0) {
      errors.push(`${file.id} low-signal reasons are inconsistent`);
    }
  }
  for (const hunkId of hunkIds) {
    if (!fileAssignments.has(hunkId)) errors.push(`${hunkId} does not belong to a file`);
  }

  for (const evidence of report.evidence) {
    unique(`${evidence.id}.hunkRefs`, evidence.hunkRefs);
    for (const ref of evidence.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${evidence.id} references missing hunk ${ref}`);
    }
  }

  const comparedTargets = new Set<string>();
  for (const comparison of report.comparisons) {
    if (!targetIds.has(comparison.targetRef)) {
      errors.push(`${comparison.id} references missing target ${comparison.targetRef}`);
    }
    if (comparedTargets.has(comparison.targetRef)) {
      errors.push(`${comparison.targetRef} has more than one comparison`);
    }
    comparedTargets.add(comparison.targetRef);
  }
  for (const target of report.targets) {
    if (target.comparisonRef && !comparisonIds.has(target.comparisonRef)) {
      errors.push(`${target.id} references missing comparison ${target.comparisonRef}`);
    }
    if (target.comparisonRef) {
      const comparison = report.comparisons.find((entry) => entry.id === target.comparisonRef);
      if (comparison?.targetRef !== target.id) {
        errors.push(`${target.id} comparison does not point back to the target`);
      }
    }
  }

  unique("unclassifiedHunkRefs", report.unclassifiedHunkRefs);
  for (const ref of report.unclassifiedHunkRefs) {
    if (!hunkIds.has(ref)) errors.push(`unclassifiedHunkRefs references missing hunk ${ref}`);
    const previous = assigned.get(ref);
    if (previous) errors.push(`${ref} is both ${previous} and unclassified`);
    assigned.set(ref, "unclassified");
  }

  for (const hunkId of hunkIds) {
    if (!assigned.has(hunkId)) errors.push(`${hunkId} is neither classified nor unclassified`);
  }

  for (const finding of report.findings) {
    if (finding.targetRef && !targetIds.has(finding.targetRef)) {
      errors.push(`${finding.id} references missing target ${finding.targetRef}`);
    }
    for (const ref of finding.hunkRefs) {
      if (!hunkIds.has(ref)) errors.push(`${finding.id} references missing hunk ${ref}`);
    }
    for (const ref of finding.evidenceRefs) {
      if (!evidenceIds.has(ref)) errors.push(`${finding.id} references missing evidence ${ref}`);
    }
  }

  if (report.origin.reportId !== report.reportId)
    errors.push("origin.reportId does not match reportId");
  if (report.summary.filesChanged !== report.files.length)
    errors.push("summary.filesChanged is inconsistent");
  if (
    report.summary.additions !== report.files.reduce((sum, file) => sum + (file.additions ?? 0), 0)
  ) {
    errors.push("summary.additions is inconsistent");
  }
  if (
    report.summary.deletions !== report.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0)
  ) {
    errors.push("summary.deletions is inconsistent");
  }
  return { ok: errors.length === 0, errors };
}

export function validateDiffReferences(diff: GitDiffDocument): ArtifactValidationResult {
  const errors: string[] = [];
  const hunkIds = new Set(diff.hunks.map((hunk) => hunk.id));
  const hunksById = new Map(diff.hunks.map((hunk) => [hunk.id, hunk]));
  errors.push(...validateStructuredHunks(diff.hunks));
  if (hunkIds.size !== diff.hunks.length) errors.push("hunks contains duplicate IDs");
  const fileIds = new Set(diff.files.map((file) => file.id));
  if (fileIds.size !== diff.files.length) errors.push("files contains duplicate IDs");
  const assigned = new Map<string, string>();
  for (const file of diff.files) {
    if (new Set(file.hunkRefs).size !== file.hunkRefs.length) {
      errors.push(`${file.id}.hunkRefs contains duplicate references`);
    }
    for (const reference of file.hunkRefs) {
      if (!hunkIds.has(reference)) errors.push(`${file.id} references missing hunk ${reference}`);
      const previous = assigned.get(reference);
      if (previous) errors.push(`${reference} belongs to both ${previous} and ${file.id}`);
      assigned.set(reference, file.id);
      const hunk = hunksById.get(reference);
      const selectedPath = file.newPath ?? file.oldPath;
      if (
        hunk &&
        (hunk.path !== selectedPath ||
          hunk.oldPath !== file.oldPath ||
          hunk.newPath !== file.newPath)
      ) {
        errors.push(`${reference} path metadata does not match ${file.id}`);
      }
      if (hunk && hunk.lowSignal !== file.lowSignal) {
        errors.push(`${reference} low-signal classification does not match ${file.id}`);
      }
    }
    if (file.lowSignal !== file.lowSignalReasons.length > 0) {
      errors.push(`${file.id} low-signal reasons are inconsistent`);
    }
  }
  for (const reference of hunkIds) {
    if (!assigned.has(reference)) errors.push(`${reference} does not belong to a file`);
  }
  const additions = diff.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = diff.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const binaryFiles = diff.files.filter((file) => file.binary).length;
  const lowSignalFiles = diff.files.filter((file) => file.lowSignal).length;
  if (diff.summary.filesChanged !== diff.files.length)
    errors.push("summary.filesChanged is inconsistent");
  if (diff.summary.additions !== additions) errors.push("summary.additions is inconsistent");
  if (diff.summary.deletions !== deletions) errors.push("summary.deletions is inconsistent");
  if (diff.summary.binaryFiles !== binaryFiles) errors.push("summary.binaryFiles is inconsistent");
  if (diff.summary.lowSignalFiles !== lowSignalFiles)
    errors.push("summary.lowSignalFiles is inconsistent");
  return { ok: errors.length === 0, errors };
}

export function validateReviewPlanReferences(
  plan: ReviewPlan,
  diff: GitDiffDocument,
  evidenceIndex: EvidenceIndex
): ArtifactValidationResult {
  const errors: string[] = [];
  const hunkIds = new Set(diff.hunks.map((hunk) => hunk.id));
  const fileIds = new Set(diff.files.map((file) => file.id));
  const evidenceIds = new Set(evidenceIndex.evidence.map((evidence) => evidence.id));
  const hunkOwners = new Map(
    diff.files.flatMap((file) => file.hunkRefs.map((reference) => [reference, file.id] as const))
  );
  const assigned = new Map<string, string>();
  if (new Set(plan.candidates.map((candidate) => candidate.id)).size !== plan.candidates.length) {
    errors.push("candidates contains duplicate IDs");
  }
  if (evidenceIds.size !== evidenceIndex.evidence.length) {
    errors.push("evidence contains duplicate IDs");
  }
  for (const evidence of evidenceIndex.evidence) {
    for (const reference of evidence.hunkRefs) {
      if (!hunkIds.has(reference)) {
        errors.push(`${evidence.id} references missing hunk ${reference}`);
      }
    }
  }
  for (const candidate of plan.candidates) {
    for (const reference of candidate.fileRefs) {
      if (!fileIds.has(reference))
        errors.push(`${candidate.id} references missing file ${reference}`);
    }
    for (const reference of candidate.evidenceRefs) {
      if (!evidenceIds.has(reference))
        errors.push(`${candidate.id} references missing evidence ${reference}`);
    }
    for (const reference of candidate.hunkRefs) {
      if (!hunkIds.has(reference))
        errors.push(`${candidate.id} references missing hunk ${reference}`);
      const owner = hunkOwners.get(reference);
      if (owner && !candidate.fileRefs.includes(owner)) {
        errors.push(`${candidate.id} omits owning file ${owner} for ${reference}`);
      }
      const previous = assigned.get(reference);
      if (previous) errors.push(`${reference} is assigned to both ${previous} and ${candidate.id}`);
      assigned.set(reference, candidate.id);
    }
  }
  for (const reference of plan.unclassifiedHunkRefs) {
    if (!hunkIds.has(reference)) errors.push(`unclassified references missing hunk ${reference}`);
    const previous = assigned.get(reference);
    if (previous) errors.push(`${reference} is both ${previous} and unclassified`);
    assigned.set(reference, "unclassified");
  }
  for (const reference of hunkIds) {
    if (!assigned.has(reference)) errors.push(`${reference} is missing from the review plan`);
  }
  return { ok: errors.length === 0, errors };
}
