import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import annotationsSchema from "../../../schemas/annotations.schema.json";
import configSchema from "../../../schemas/config.schema.json";
import contextPackSchema from "../../../schemas/context-pack.schema.json";
import feedbackBatchSchema from "../../../schemas/feedback-batch.schema.json";
import originSessionSchema from "../../../schemas/origin-session.schema.json";
import reportSchema from "../../../schemas/report.schema.json";
import reviewAnswerSchema from "../../../schemas/review-answer.schema.json";
import reviewStateSchema from "../../../schemas/review-state.schema.json";
import reviewThreadSchema from "../../../schemas/review-thread.schema.json";
import type { UtsuriReport } from "./generated/report.schema";

const schemaMap = {
  annotations: annotationsSchema,
  config: configSchema,
  "context-pack": contextPackSchema,
  "feedback-batch": feedbackBatchSchema,
  "origin-session": originSessionSchema,
  report: reportSchema,
  "review-answer": reviewAnswerSchema,
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

export function validateReportReferences(report: UtsuriReport): ArtifactValidationResult {
  const errors: string[] = [];
  const hunkIds = new Set(report.hunks.map((hunk) => hunk.id));
  const targetIds = new Set(report.targets.map((target) => target.id));
  const findingIds = new Set(report.findings.map((finding) => finding.id));
  const assigned = new Map<string, string>();

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
  }

  if (report.origin.reportId !== report.reportId)
    errors.push("origin.reportId does not match reportId");
  return { ok: errors.length === 0, errors };
}
