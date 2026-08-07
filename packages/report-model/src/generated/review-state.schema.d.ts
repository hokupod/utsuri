/* Generated from schemas/review-state.schema.json. Do not edit directly. */

export interface ReviewState {
  schemaVersion: "1.3";
  reportId: string;
  reportFingerprint: string;
  revision: number;
  updatedAt: string;
  viewed: {
    [k: string]: {
      anchor: ReviewAnchor;
      state: "unseen" | "viewed" | "stale";
      updatedAt: string;
    };
  };
  judgments: {
    [k: string]: {
      changeId: string;
      state: "unreviewed" | "reviewed" | "follow-up" | "blocked" | "stale";
      updatedAt: string;
    };
  };
  threadIds: string[];
  orphanedThreadIds: string[];
}
export interface ReviewAnchor {
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
