import { canonicalJson } from "./hash";

export interface NdjsonEvent {
  event: string;
  level: "debug" | "info" | "warn" | "error";
  stage: string;
  time?: string;
  [key: string]: unknown;
}

export function encodeNdjsonEvent(event: NdjsonEvent): string {
  return `${canonicalJson(event, { omitKeys: [] })}\n`;
}

export function parseNdjson(text: string): unknown[] {
  const lines = text.split(/\r?\n/u).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new SyntaxError(`Invalid NDJSON at line ${index + 1}`);
    }
  });
}
