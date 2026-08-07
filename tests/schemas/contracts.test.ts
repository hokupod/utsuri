import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  schemaNames,
  validateArtifact,
  validateReportReferences,
  type SchemaName,
  type UtsuriReport
} from "../../packages/report-model/src";

const root = path.resolve(import.meta.dir, "../..");

async function fixtures(kind: "valid" | "invalid") {
  const directory = path.join(root, "fixtures/schemas", kind);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(
    names.map(async (filename) => ({
      filename,
      schemaName: filename.split(".")[0] as SchemaName,
      value: JSON.parse(await readFile(path.join(directory, filename), "utf8")) as unknown
    }))
  );
}

describe("schema contracts", () => {
  test("exports the canonical external artifact schemas", () => {
    expect(schemaNames).toEqual([
      "annotations",
      "capture-action",
      "config",
      "context-pack",
      "diff",
      "evidence-index",
      "feedback-batch",
      "origin-session",
      "report",
      "review-answer",
      "review-plan",
      "review-state",
      "review-thread"
    ]);
  });

  test("accepts every valid fixture", async () => {
    for (const fixture of await fixtures("valid")) {
      const result = validateArtifact(fixture.schemaName, fixture.value);
      expect(result.errors, fixture.filename).toEqual([]);
      if (fixture.schemaName === "report") {
        expect(validateReportReferences(fixture.value as UtsuriReport).errors).toEqual([]);
      }
    }
  });

  test("rejects unknown fields, missing fields, invalid enums, command strings, and broken refs", async () => {
    for (const fixture of await fixtures("invalid")) {
      const schema = validateArtifact(fixture.schemaName, fixture.value);
      const references =
        fixture.schemaName === "report"
          ? validateReportReferences(fixture.value as UtsuriReport)
          : { ok: true, errors: [] };
      expect(schema.ok && references.ok, fixture.filename).toBeFalse();
    }
  });

  test("requires every hunk to be classified exactly once", async () => {
    const report = JSON.parse(
      await readFile(path.join(root, "fixtures/schemas/valid/report.empty.json"), "utf8")
    ) as UtsuriReport;
    report.hunks.push({
      id: "hunk:src/app.ts:1:1:00000000",
      path: "src/app.ts",
      oldPath: "src/app.ts",
      newPath: "src/app.ts",
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      heading: "",
      lines: [
        {
          kind: "addition",
          content: "export const value = 1;",
          oldLine: null,
          newLine: 1
        }
      ],
      lowSignal: false
    });
    expect(validateReportReferences(report).errors).toContain(
      "hunk:src/app.ts:1:1:00000000 is neither classified nor unclassified"
    );
  });
});
