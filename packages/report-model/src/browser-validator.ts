import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import reviewBundleSchema from "../../../schemas/review-bundle.schema.json";
import reviewEventSchema from "../../../schemas/review-event.schema.json";
import reviewStateSchema from "../../../schemas/review-state.schema.json";
import reviewThreadSchema from "../../../schemas/review-thread.schema.json";

const schemas = {
  "review-bundle": reviewBundleSchema,
  "review-event": reviewEventSchema,
  "review-state": reviewStateSchema,
  "review-thread": reviewThreadSchema
} as const;

export type BrowserReviewSchemaName = keyof typeof schemas;

export interface BrowserReviewValidationResult {
  ok: boolean;
  errors: string[];
}

interface ReviewBundleForValidation {
  source: { reportId: string; reportFingerprint: string };
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

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);
const validators = new Map<BrowserReviewSchemaName, ValidateFunction>();
for (const name of Object.keys(schemas) as BrowserReviewSchemaName[]) {
  validators.set(name, ajv.compile(schemas[name]));
}

function formatError(error: ErrorObject): string {
  return `${error.instancePath || "/"} ${error.message ?? "is invalid"}`;
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

export function validateBrowserReviewArtifact(
  name: BrowserReviewSchemaName,
  value: unknown
): BrowserReviewValidationResult {
  const validator = validators.get(name)!;
  const valid = validator(value);
  return { ok: Boolean(valid), errors: valid ? [] : (validator.errors ?? []).map(formatError) };
}

export function validateBrowserReviewBundle(value: unknown): BrowserReviewValidationResult {
  const schema = validateBrowserReviewArtifact("review-bundle", value);
  if (!schema.ok) return schema;
  const bundle = value as ReviewBundleForValidation;
  const errors: string[] = [];
  const state = validateBrowserReviewArtifact("review-state", bundle.state);
  errors.push(...state.errors.map((error) => `state${error}`));
  for (const [index, thread] of bundle.threads.entries()) {
    const result = validateBrowserReviewArtifact("review-thread", thread);
    errors.push(...result.errors.map((error) => `threads/${index}${error}`));
  }
  for (const [index, event] of bundle.events.entries()) {
    const result = validateBrowserReviewArtifact("review-event", event);
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
