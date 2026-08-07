/* Generated from schemas/context-pack.schema.json. Do not edit directly. */

export interface ContextPack {
  schemaVersion: "1.1";
  reportId: string;
  batchId: string;
  itemId: string;
  baseSha: string;
  headSha: string;
  anchor: Anchor;
  question: string;
  semanticChange?: {
    id: string;
    title: string;
    summary: string;
    intent: {
      text: string;
      source: "declared" | "supported-inference" | "weak-inference" | "unknown";
      evidenceRefs: string[];
    };
    risk: {
      level: "critical" | "high" | "medium" | "low" | "info";
      reasons: string[];
    };
  };
  code: {
    path: string;
    startLine: number;
    endLine: number;
    textRef: string;
  }[];
  images: {
    role: "before" | "after" | "diff";
    assetRef: string;
    crop?: Region;
  }[];
  evidenceRefs: string[];
  priorThreadMessages: {
    role: "human" | "agent";
    text: string;
  }[];
  redactions: {
    category: string;
    ref: string;
  }[];
  contextHash: string;
}
export interface Anchor {
  type: "change" | "file" | "hunk" | "line-range" | "visual-target" | "visual-region" | "finding" | "verification-gap";
  ref: string;
  path?: string;
  side?: "before" | "after" | "diff";
  startLine?: number;
  endLine?: number;
  targetRef?: string;
  region?: Region;
  selectorHint?: string;
  fingerprint: string;
}
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
