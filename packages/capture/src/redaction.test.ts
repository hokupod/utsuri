import { describe, expect, test } from "bun:test";
import { captureFailure } from "./failure-evidence";
import { redactEvidenceValue, redactUrlsInText } from "./redaction";

describe("capture evidence redaction", () => {
  test("removes URL credentials, queries, and fragments from text", () => {
    const redacted = redactUrlsInText(
      [
        "request https://user:password@example.test/path?token=secret#fragment",
        "from //user:password@example.test/private?token=relative#fragment",
        "to /callback?token=root#fragment",
        "through oauth/callback?code=bare#fragment",
        "with asset.png?signature=file#fragment",
        "plus asset@2x+dark&v=1;final.png?token=filename#fragment",
        "and asset(v2).png?token=parenthesized#fragment",
        "using ?access_token=query-only",
        "and #access_token=fragment-only",
        "then ../asset.png?signature=parent#fragment failed"
      ].join(" ")
    );
    expect(redacted).toBe(
      "request https://example.test/path from //example.test/private to /callback through oauth/callback with asset.png plus asset@2x+dark&v=1;final.png and asset(v2).png using [redacted-url] and [redacted-url] then ../asset.png failed"
    );
  });

  test("redacts normalized DOM URL-bearing attributes", () => {
    const redacted = redactEvidenceValue({
      type: "element",
      attributes: [
        ["href", "https://user:password@example.test/path?token=secret#fragment"],
        ["src", "/asset.png?signature=secret#fragment"],
        ["srcset", "/one.png?token=one 1x, /two.png?token=two 2x"],
        ["data-image", "https://example.test/image?token=secret"]
      ]
    });
    expect(JSON.stringify(redacted)).not.toMatch(/password|secret|fragment/u);
    expect(redacted).toEqual({
      type: "element",
      attributes: [
        ["href", "https://example.test/path"],
        ["src", "/asset.png"],
        ["srcset", "/one.png 1x, /two.png 2x"],
        ["data-image", "https://example.test/image"]
      ]
    });
  });

  test("redacts URLs from typed failure evidence", () => {
    const failure = captureFailure(
      new Error("GET https://user:password@example.test/path?token=secret#fragment failed"),
      "navigation",
      1,
      []
    );
    expect(failure.message).toBe("GET https://example.test/path failed");
  });
});
