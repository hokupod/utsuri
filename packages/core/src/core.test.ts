import { describe, expect, test } from "bun:test";
import { canonicalJson, hunkId, parseNdjson, queueForStatus, stableHash } from "./index";

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
});
