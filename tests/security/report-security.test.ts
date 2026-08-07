import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateReportDirectory } from "../../packages/report-builder/src";
import {
  assertPngBytes,
  assertRasterImageReference,
  assertSafeReportAssetReference,
  interactiveReportCsp,
  parseBoundedJson,
  reportSecurityHeaders,
  sandboxedStaticFragment,
  sanitizeStaticFragment,
  staticFragmentCsp,
  staticReportCsp
} from "../../packages/security/src";
import {
  assertInteractiveMutationBoundary,
  viewerDocument,
  viewerSecurityHeaders
} from "../../packages/interactive-server/src";

describe("report security boundaries", () => {
  test("separates static and interactive CSP without weakening other directives", () => {
    expect(staticReportCsp).toContain("connect-src 'none'");
    expect(interactiveReportCsp).toContain("connect-src 'self'");
    for (const directive of [
      "default-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'none'"
    ]) {
      expect(staticReportCsp).toContain(directive);
      expect(interactiveReportCsp).toContain(directive);
    }
    expect(viewerSecurityHeaders("static")).toEqual({
      ...reportSecurityHeaders,
      "content-security-policy": staticReportCsp
    });
    const staticDocument = `<html><head><meta http-equiv="Content-Security-Policy" content="${staticReportCsp}"></head></html>`;
    expect(viewerDocument(staticDocument, "static")).toBe(staticDocument);
    expect(viewerDocument(staticDocument, "interactive")).toContain(interactiveReportCsp);
    expect(viewerDocument(staticDocument, "interactive")).not.toContain(staticReportCsp);
    expect(() => viewerDocument("<html></html>", "interactive")).toThrow("exactly one");
  });

  test("sanitizes active HTML into an empty-sandbox static fragment", () => {
    const malicious = [
      "<script>globalThis.pwned = true</script>",
      '<img src="data:image/svg+xml;base64,PHN2Zz4=" onerror="pwn()">',
      '<a href="javascript:pwn()" target="_blank">unsafe</a>',
      '<form action="https://attacker.invalid"><button formaction="/send">send</button></form>',
      '<p style="background:url(https://attacker.invalid/x)">safe text</p>',
      "<style>main { display: grid; gap: 1rem; }</style>",
      '<style>@import "https://attacker.invalid/style.css";</style>',
      '<svg><foreignObject><iframe srcdoc="x"></iframe></foreignObject></svg>'
    ].join("");
    const fragment = sanitizeStaticFragment(malicious);
    expect(fragment).not.toMatch(
      /script|onerror|javascript:|formaction|<form|<svg|foreignObject/iu
    );
    expect(fragment).toContain("safe text");
    expect(fragment).toContain("<style>main { display: grid; gap: 1rem; }</style>");
    expect(fragment).not.toContain("@import");
    const preview = sandboxedStaticFragment(malicious);
    expect(preview.sandbox).toBe("");
    expect(preview.srcdoc).toContain(staticFragmentCsp);
    expect(preview.srcdoc).not.toContain("allow-scripts");
  });

  test("rejects the malicious HTML report fixture without executing active content", async () => {
    const fixtureRoot = path.resolve(import.meta.dir, "../../fixtures/malicious-html");
    const malicious = await readFile(path.join(fixtureRoot, "input.html"), "utf8");
    const fragment = sanitizeStaticFragment(malicious);
    expect(fragment).not.toMatch(/script|onerror|javascript:|formaction|<form|<svg/iu);

    const validation = await validateReportDirectory(path.join(fixtureRoot, "expected/report"), {
      strict: true
    });
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("Hash mismatch: index.html");
    expect(validation.errors).toContain("Inline script is forbidden");
    expect(validation.errors).toContain("Inline event handlers are forbidden");
    expect(validation.errors).toContain("Active URL scheme is forbidden");
  });

  test("accepts only contained report assets and rasterized images", () => {
    expect(assertSafeReportAssetReference("capture/target/dom.json")).toBe(
      "capture/target/dom.json"
    );
    expect(assertRasterImageReference("comparison/target/diff.png")).toEndWith(".png");
    for (const reference of [
      "../../secret",
      "capture/../secret",
      "capture\\secret",
      "https://attacker.invalid/x.png",
      "capture/x.png?token=secret"
    ]) {
      expect(() => assertSafeReportAssetReference(reference), reference).toThrow();
    }
    expect(() => assertRasterImageReference("capture/active.svg")).toThrow();
  });

  test("validates PNG bytes and rejects renamed or trailing active content", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    expect(assertPngBytes(png)).toEqual({ width: 1, height: 1 });
    expect(() => assertPngBytes(Buffer.from("<svg><script>alert(1)</script></svg>"))).toThrow(
      "signature"
    );
    expect(() => assertPngBytes(Buffer.concat([png, Buffer.from("<script>x</script>")]))).toThrow(
      "IEND"
    );
    expect(() => assertPngBytes(png, { maximumPixels: 0 })).toThrow("pixels");
  });

  test("bounds JSON and rejects prototype-bearing keys", () => {
    expect(parseBoundedJson('{"safe":true}')).toEqual({ safe: true });
    expect(() => parseBoundedJson('{"__proto__":{}}')).toThrow("forbidden object key");
    expect(() => parseBoundedJson('"123456"', { maximumBytes: 4 })).toThrow("exceeds");
  });

  test("requires origin, report, capability, and schema for mutations", () => {
    const valid = {
      origin: "http://127.0.0.1:4173",
      expectedOrigin: "http://127.0.0.1:4173",
      reportId: "report-123",
      expectedReportId: "report-123",
      capabilityToken: "opaque-token",
      expectedCapabilityToken: "opaque-token",
      schemaValid: true
    };
    expect(() => assertInteractiveMutationBoundary(valid)).not.toThrow();
    for (const override of [
      { origin: "https://attacker.invalid" },
      { reportId: "report-other" },
      { capabilityToken: "wrong-token" },
      { schemaValid: false }
    ]) {
      expect(() => assertInteractiveMutationBoundary({ ...valid, ...override })).toThrow();
    }
  });
});
