/* Generated from schemas/review-bundle.schema.json. Do not edit directly. */

export interface ReviewBundle {
  schemaVersion: "1.0";
  source: {
    reportId: string;
    reportFingerprint: string;
    base: string | null;
    head: string | null;
  };
  state: {
    [k: string]: any;
  };
  threads: {
    [k: string]: any;
  }[];
  events: {
    [k: string]: any;
  }[];
  anchorCatalog: ReviewAnchor[];
  exportedAt: string;
}
export interface ReviewAnchor {
  type: "change" | "file" | "hunk" | "line-range" | "visual-target" | "visual-region" | "finding" | "verification-gap";
  ref: string;
  path?: string;
  side?: "before" | "after" | "diff";
  startLine?: number;
  endLine?: number;
  targetRef?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selectorHint?: string;
  fingerprint: string;
}
