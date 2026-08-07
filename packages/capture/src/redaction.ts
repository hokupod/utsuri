const absoluteUrl = /\b(?:https?|wss?):\/\/[^\s<>"']+/giu;
const protocolRelativeUrl = /(^|[\s([{"'=,:])(\/\/[^\s<>"'`)\]}]+)/giu;
const relativeTextUrlWithPrivateParts = /(^|[\s<>"'`])([^\s<>"'`]*[?#][^\s<>"'`]+)/gu;
const activeSchemes = /^(?:blob|data|file|javascript):/iu;
const urlAttributes = new Set([
  "action",
  "cite",
  "data",
  "formaction",
  "href",
  "manifest",
  "ping",
  "poster",
  "src",
  "xlink:href"
]);

function withoutPrivateUrlParts(input: string): string {
  if (activeSchemes.test(input.trim())) return "[redacted-url]";
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return input;
  }
}

export function redactUrlsInText(input: string): string {
  return input
    .replace(absoluteUrl, (candidate) => withoutPrivateUrlParts(candidate))
    .replace(protocolRelativeUrl, (_match, prefix: string, candidate: string) => {
      const redacted = withoutPrivateUrlParts(`https:${candidate}`);
      return `${prefix}${redacted.startsWith("https:") ? redacted.slice("https:".length) : redacted}`;
    })
    .replace(relativeTextUrlWithPrivateParts, (_match, prefix: string, candidate: string) => {
      const publicPart = candidate.split(/[?#]/u, 1)[0] ?? "";
      return `${prefix}${publicPart || "[redacted-url]"}`;
    });
}

function redactSingleAttributeUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (activeSchemes.test(value)) return "[redacted-url]";
  if (/^(?:https?|wss?):\/\//iu.test(value)) return withoutPrivateUrlParts(value);
  if (value.startsWith("//")) {
    const redacted = withoutPrivateUrlParts(`https:${value}`);
    return redacted.startsWith("https:") ? redacted.slice("https:".length) : redacted;
  }
  return value.split(/[?#]/u, 1)[0] ?? "";
}

function redactAttribute(name: string, value: string): string {
  const normalizedName = name.toLowerCase();
  if (normalizedName === "srcset") {
    if (activeSchemes.test(value.trim())) return "[redacted-url]";
    return value
      .split(",")
      .map((candidate) => {
        const match = /^(\s*)(\S+)([\s\S]*)$/u.exec(candidate);
        return match ? `${match[1]}${redactSingleAttributeUrl(match[2]!)}${match[3]}` : candidate;
      })
      .join(",");
  }
  if (normalizedName === "style") {
    return redactUrlsInText(value).replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/giu,
      (_match, quote, url) => {
        return `url(${quote}${redactSingleAttributeUrl(url)}${quote})`;
      }
    );
  }
  if (urlAttributes.has(normalizedName)) {
    if (normalizedName === "ping") {
      return value.split(/\s+/u).filter(Boolean).map(redactSingleAttributeUrl).join(" ");
    }
    return redactSingleAttributeUrl(value);
  }
  return redactUrlsInText(value);
}

export function redactEvidenceValue(value: unknown): unknown {
  if (typeof value === "string") return redactUrlsInText(value);
  if (Array.isArray(value)) return value.map(redactEvidenceValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const output = Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, redactEvidenceValue(entry)])
  );
  if (Array.isArray(record.attributes)) {
    output.attributes = record.attributes.map((entry) => {
      if (
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
      ) {
        return [entry[0], redactAttribute(entry[0], entry[1])];
      }
      return redactEvidenceValue(entry);
    });
  }
  return output;
}
