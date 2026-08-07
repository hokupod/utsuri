import contextPackSchema from "../../../schemas/context-pack.schema.json" with { type: "json" };
import reviewAnswerSchema from "../../../schemas/review-answer.schema.json" with { type: "json" };
import reviewStateSchema from "../../../schemas/review-state.schema.json" with { type: "json" };
import reviewThreadSchema from "../../../schemas/review-thread.schema.json" with { type: "json" };

export const reportSchemaFiles = [
  "review-state.schema.json",
  "review-thread.schema.json",
  "context-pack.schema.json",
  "review-answer.schema.json"
] as const;

export type ReportSchemaFile = (typeof reportSchemaFiles)[number];

const schemaDocuments: Record<ReportSchemaFile, unknown> = {
  "context-pack.schema.json": contextPackSchema,
  "review-answer.schema.json": reviewAnswerSchema,
  "review-state.schema.json": reviewStateSchema,
  "review-thread.schema.json": reviewThreadSchema
};

export const reportSchemaAssets = Object.freeze(
  Object.fromEntries(
    reportSchemaFiles.map((filename) => [
      filename,
      `${JSON.stringify(schemaDocuments[filename], null, 2)}\n`
    ])
  ) as Record<ReportSchemaFile, string>
);
