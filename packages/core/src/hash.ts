import { createHash } from "node:crypto";
import path from "node:path";

const defaultOmittedKeys = new Set([
  "generatedAt",
  "generationTime",
  "port",
  "temporaryPath",
  "tempPath",
  "timestamp"
]);

function normalize(value: unknown, omittedKeys: ReadonlySet<string>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, omittedKeys));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      if (omittedKeys.has(key) || object[key] === undefined) continue;
      normalized[key] = normalize(object[key], omittedKeys);
    }
    return normalized;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`);
}

export function canonicalJson(
  value: unknown,
  options: { omitKeys?: Iterable<string> } = {}
): string {
  const omittedKeys = new Set(defaultOmittedKeys);
  for (const key of options.omitKeys ?? []) omittedKeys.add(key);
  return JSON.stringify(normalize(value, omittedKeys));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function stableId(prefix: string, value: unknown, length = 16): string {
  return `${prefix}:${stableHash(value).slice(0, length)}`;
}

export function normalizeRepositoryPath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//u, "");
  return path.posix.normalize(normalized);
}

export function hunkId(
  filePath: string,
  oldStart: number,
  newStart: number,
  content: readonly string[]
): string {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const digest = stableHash({ normalizedPath, oldStart, newStart, content }).slice(0, 16);
  return `hunk:${normalizedPath}:${oldStart}:${newStart}:${digest}`;
}
