import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const expected = [
  "13-viewed-vs-reviewed",
  "14-inline-code-comment",
  "15-visual-region-comment",
  "16-agent-attention-checkbox",
  "17-feedback-batch-preview",
  "18-origin-session-binding",
  "19-session-mismatch",
  "20-return-to-session-handoff",
  "21-direct-bridge-fallback",
  "22-no-new-agent-process",
  "23-no-provider-selector",
  "24-literal-provider-token-in-comment",
  "25-stale-hunk-reanchor",
  "26-orphaned-visual-anchor",
  "27-context-pack-redaction",
  "28-localhost-csrf",
  "29-arbitrary-session-api-attempt",
  "30-duplicate-batch-submit",
  "31-itemized-answer-writeback",
  "32-static-mode-export"
];

describe("design 46.25 fixture inventory", () => {
  test("contains every named fixture and executable evidence path", async () => {
    const document = JSON.parse(
      await readFile(
        path.join(repositoryRoot, "fixtures/origin-session-feedback/cases.json"),
        "utf8"
      )
    ) as {
      schemaVersion: string;
      designSection: string;
      cases: Array<{ id: string; assertion: string; evidence: string[] }>;
    };
    expect(document.schemaVersion).toBe("1.0");
    expect(document.designSection).toBe("46.25");
    expect(document.cases.map((entry) => entry.id)).toEqual(expected);
    expect(new Set(document.cases.map((entry) => entry.id)).size).toBe(expected.length);
    for (const entry of document.cases) {
      expect(entry.assertion.trim().length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
      for (const relative of entry.evidence) {
        expect(path.isAbsolute(relative)).toBe(false);
        expect(path.normalize(relative)).toBe(relative);
        await access(path.join(repositoryRoot, relative));
      }
    }
  });
});
