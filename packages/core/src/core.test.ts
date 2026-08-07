import { describe, expect, test } from "bun:test";
import {
  canonicalJson,
  classifyLowSignal,
  createEvidenceIndex,
  createReviewPlan,
  hunkId,
  parseNdjson,
  queueForStatus,
  stableHash,
  type GitDiffDocument
} from "./index";

describe("core deterministic primitives", () => {
  test("canonicalizes key order and removes nondeterministic fields", () => {
    const left = { b: 2, a: 1, timestamp: "one", nested: { port: 3000, value: true } };
    const right = { nested: { value: true, port: 4000 }, timestamp: "two", a: 1, b: 2 };
    expect(canonicalJson(left)).toBe('{"a":1,"b":2,"nested":{"value":true}}');
    expect(stableHash(left)).toBe(stableHash(right));
  });

  test("creates stable hunk IDs across path separator variants", () => {
    expect(hunkId("src\\app.ts", 1, 2, ["+value"])).toBe(hunkId("./src/app.ts", 1, 2, ["+value"]));
  });

  test("keeps incomplete and uncovered outside the no-issue queue", () => {
    expect(queueForStatus("INCOMPLETE")).toBe("needs-confirmation");
    expect(queueForStatus("UNCOVERED")).toBe("needs-confirmation");
    expect(queueForStatus("CHANGED", { intended: true })).toBe("no-issue");
  });

  test("reports the exact invalid NDJSON line", () => {
    expect(() => parseNdjson('{"ok":true}\nnot-json\n')).toThrow("line 2");
  });

  test("classifies low-signal paths without hiding them", () => {
    expect(classifyLowSignal("vendor/app.min.js", { binary: true })).toEqual([
      "binary",
      "minified",
      "vendor"
    ]);
    expect(classifyLowSignal("src/app.ts")).toEqual([]);
  });

  test("clusters implementation and test hunks without losing coverage", () => {
    const diff: GitDiffDocument = {
      schemaVersion: "1.0",
      input: { mode: "patch", base: null, head: null, mergeBase: null, patchPath: "x.patch" },
      repository: { fingerprint: "12345678" },
      sourceDigests: {
        patch: "0".repeat(64),
        numstat: null,
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      },
      summary: { filesChanged: 2, additions: 2, deletions: 0, binaryFiles: 0, lowSignalFiles: 0 },
      files: [
        {
          id: "file:source",
          status: "modified",
          oldPath: "src/button.ts",
          newPath: "src/button.ts",
          additions: 1,
          deletions: 0,
          binary: false,
          submodule: false,
          oldMode: "100644",
          newMode: "100644",
          oldOid: null,
          newOid: null,
          similarity: null,
          lowSignal: false,
          lowSignalReasons: [],
          hunkRefs: ["hunk:source"]
        },
        {
          id: "file:test",
          status: "modified",
          oldPath: "src/button.test.ts",
          newPath: "src/button.test.ts",
          additions: 1,
          deletions: 0,
          binary: false,
          submodule: false,
          oldMode: "100644",
          newMode: "100644",
          oldOid: null,
          newOid: null,
          similarity: null,
          lowSignal: false,
          lowSignalReasons: [],
          hunkRefs: ["hunk:test"]
        }
      ],
      hunks: [
        {
          id: "hunk:source",
          path: "src/button.ts",
          oldPath: "src/button.ts",
          newPath: "src/button.ts",
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          heading: "",
          lines: [],
          lowSignal: false
        },
        {
          id: "hunk:test",
          path: "src/button.test.ts",
          oldPath: "src/button.test.ts",
          newPath: "src/button.test.ts",
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          heading: "",
          lines: [],
          lowSignal: false
        }
      ]
    };
    const plan = createReviewPlan(diff);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.hunkRefs).toEqual(["hunk:source", "hunk:test"]);
    expect(plan.unclassifiedHunkRefs).toEqual([]);

    diff.hunks[0] = {
      ...diff.hunks[0]!,
      oldStart: 8,
      oldLines: 3,
      newStart: 8,
      newLines: 0
    };
    expect(createEvidenceIndex(diff).evidence[0]?.range).toEqual({ start: 8, end: 10 });
  });
});
