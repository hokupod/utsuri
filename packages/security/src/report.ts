import { PNG } from "pngjs";

const staticCspDirectives = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'"
] as const;

export const staticReportCsp = staticCspDirectives.join("; ");
export const interactiveReportCsp = staticCspDirectives
  .map((directive) => (directive === "connect-src 'none'" ? "connect-src 'self'" : directive))
  .join("; ");

export const staticFragmentCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src data:",
  "form-action 'none'",
  "img-src data: blob:",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'"
].join("; ");

export const reportSecurityHeaders = Object.freeze({
  "cache-control": "no-store",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
});

const blockedElements = new Set([
  "applet",
  "audio",
  "base",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
  "video"
]);

const allowedElements = new Set([
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "button",
  "caption",
  "code",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr"
]);

const voidElements = new Set(["br", "hr", "img", "wbr"]);
const globalAttributes = new Set([
  "class",
  "dir",
  "hidden",
  "id",
  "lang",
  "role",
  "style",
  "title"
]);
const elementAttributes: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["href"]),
  button: new Set(["disabled", "type"]),
  img: new Set(["alt", "height", "src", "width"]),
  ol: new Set(["reversed", "start", "type"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  time: new Set(["datetime"])
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeStyle(value: string): boolean {
  return !/(?:@import|behavior\s*:|expression\s*\(|javascript\s*:|-moz-binding|url\s*\()/iu.test(
    value
  );
}

function safeStylesheet(value: string): boolean {
  return (
    !value.includes("\0") &&
    !value.includes("<") &&
    !/(?:@import|@namespace|behavior\s*:|expression\s*\(|javascript\s*:|data\s*:|-moz-binding|url\s*\(|image\s*\()/iu.test(
      value
    )
  );
}

function safeRasterDataUrl(value: string): boolean {
  return /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/]+=*$/iu.test(value);
}

function safeAttribute(tag: string, name: string, value: string | null): string | null {
  const normalized = name.toLowerCase();
  const allowed =
    globalAttributes.has(normalized) ||
    /^aria-[a-z0-9-]+$/u.test(normalized) ||
    elementAttributes[tag]?.has(normalized);
  if (!allowed || normalized.startsWith("on")) return null;

  if (value === null) {
    return new Set(["disabled", "hidden", "reversed"]).has(normalized) ? normalized : null;
  }
  if (normalized === "style" && !safeStyle(value)) return null;
  if (normalized === "href" && !/^#[a-z0-9_:-]+$/iu.test(value)) return null;
  if (normalized === "src" && !safeRasterDataUrl(value) && !/^blob:[a-z0-9-]+$/iu.test(value)) {
    return null;
  }
  if (normalized === "type" && tag === "button" && value.toLowerCase() !== "button") return null;
  return `${normalized}="${escapeHtml(value)}"`;
}

function sanitizeOpeningTag(token: string): string {
  const opening = /^<\s*([a-z][a-z0-9-]*)([\s\S]*?)\/?\s*>$/iu.exec(token);
  if (!opening) return "";
  const tag = opening[1]!.toLowerCase();
  if (!allowedElements.has(tag) || blockedElements.has(tag)) return "";

  const source = opening[2] ?? "";
  const attributes: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const whitespace = /^\s+/u.exec(source.slice(offset));
    if (!whitespace) return "";
    offset += whitespace[0].length;
    if (offset >= source.length) break;
    const attribute = /^([a-z_:][a-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/iu.exec(
      source.slice(offset)
    );
    if (!attribute) return "";
    offset += attribute[0].length;
    const value = attribute[2] ?? attribute[3] ?? null;
    const sanitized = safeAttribute(tag, attribute[1]!, value);
    if (sanitized) attributes.push(sanitized);
  }
  const suffix = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  return `<${tag}${suffix}>`;
}

function sanitizeTag(token: string): string {
  if (/^<\s*!/u.test(token) || /^<\s*\?/u.test(token)) return "";
  const closing = /^<\s*\/\s*([a-z][a-z0-9-]*)\s*>$/iu.exec(token);
  if (closing) {
    const tag = closing[1]!.toLowerCase();
    return allowedElements.has(tag) && !voidElements.has(tag) ? `</${tag}>` : "";
  }
  return sanitizeOpeningTag(token);
}

export function sanitizeStaticFragment(input: string, maximumBytes = 1_048_576): string {
  if (new TextEncoder().encode(input).byteLength > maximumBytes) {
    throw new Error(`Static fragment exceeds ${maximumBytes} bytes`);
  }
  const styles: string[] = [];
  const styleTokenPrefix = "\u0000UTSURI_SAFE_STYLE_";
  const withStyleTokens = input
    .replaceAll(styleTokenPrefix, "")
    .replace(/<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/giu, (_match, stylesheet) => {
      if (typeof stylesheet !== "string" || !safeStylesheet(stylesheet)) return "";
      const token = `${styleTokenPrefix}${styles.length}\u0000`;
      styles.push(`<style>${stylesheet}</style>`);
      return token;
    });
  const withoutBlockedBodies = withStyleTokens.replace(
    /<\s*(script|iframe|object|embed|svg|math|template|form|audio|video)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu,
    ""
  );
  let result = "";
  let offset = 0;
  for (const match of withoutBlockedBodies.matchAll(/<!--[\s\S]*?-->|<[^>]*>/gu)) {
    const index = match.index ?? offset;
    result += escapeHtml(withoutBlockedBodies.slice(offset, index));
    result += sanitizeTag(match[0]);
    offset = index + match[0].length;
  }
  result += escapeHtml(withoutBlockedBodies.slice(offset));
  for (const [index, style] of styles.entries()) {
    result = result.replace(`${styleTokenPrefix}${index}\u0000`, style);
  }
  return result;
}

export function staticFragmentDocument(input: string): string {
  const fragment = sanitizeStaticFragment(input);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${staticFragmentCsp}"></head><body>${fragment}</body></html>`;
}

export function sandboxedStaticFragment(input: string): { sandbox: ""; srcdoc: string } {
  return { sandbox: "", srcdoc: staticFragmentDocument(input) };
}

export function parseBoundedJson(
  input: string,
  options: { label?: string; maximumBytes?: number } = {}
): unknown {
  const label = options.label ?? "JSON";
  const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024;
  if (new TextEncoder().encode(input).byteLength > maximumBytes) {
    throw new Error(`${label} exceeds ${maximumBytes} bytes`);
  }
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (new Set(["__proto__", "constructor", "prototype"]).has(key)) {
        throw new Error(`${label} contains a forbidden object key`);
      }
      pending.push(child);
    }
  }
  return value;
}

export function assertSafeReportAssetReference(reference: string): string {
  if (
    !reference ||
    reference.includes("\\") ||
    reference.includes("\0") ||
    reference.includes("?") ||
    reference.includes("#") ||
    reference.startsWith("/") ||
    !/^(?:capture|comparison)\//u.test(reference)
  ) {
    throw new Error(`Report artifact reference is unsafe: ${reference}`);
  }
  const segments = reference.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Report artifact reference is unsafe: ${reference}`);
  }
  return reference;
}

export function assertRasterImageReference(reference: string): string {
  assertSafeReportAssetReference(reference);
  if (!reference.toLowerCase().endsWith(".png")) {
    throw new Error(`Report images must be rasterized PNG files: ${reference}`);
  }
  return reference;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function assertPngBytes(
  input: Uint8Array,
  options: { maximumBytes?: number; maximumPixels?: number } = {}
): { width: number; height: number } {
  const bytes = Buffer.from(input);
  const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024;
  const maximumPixels = options.maximumPixels ?? 80_000_000;
  if (bytes.byteLength > maximumBytes) throw new Error(`PNG exceeds ${maximumBytes} bytes`);
  if (bytes.byteLength < 45 || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error("PNG signature is invalid");
  }
  const ihdrLength = bytes.readUInt32BE(8);
  const ihdrType = bytes.subarray(12, 16).toString("ascii");
  if (ihdrLength !== 13 || ihdrType !== "IHDR") throw new Error("PNG IHDR is invalid");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    !Number.isSafeInteger(width * height) ||
    width * height > maximumPixels
  ) {
    throw new Error(`PNG exceeds ${maximumPixels} pixels`);
  }
  let offset = 8;
  let chunks = 0;
  let idatSeen = false;
  let iendSeen = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength || chunks >= 10_000)
      throw new Error("PNG chunks are invalid");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.byteLength) throw new Error("PNG chunk length is invalid");
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (!/^[A-Za-z]{4}$/u.test(type)) throw new Error("PNG chunk type is invalid");
    if (type === "IDAT") idatSeen = true;
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.byteLength) throw new Error("PNG IEND is invalid");
      iendSeen = true;
    }
    offset = end;
    chunks += 1;
  }
  if (!idatSeen || !iendSeen) throw new Error("PNG image data is incomplete");
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(bytes);
  } catch {
    throw new Error("PNG decoder rejected the image");
  }
  if (decoded.width !== width || decoded.height !== height) {
    throw new Error("PNG decoded dimensions are inconsistent");
  }
  return { width, height };
}
