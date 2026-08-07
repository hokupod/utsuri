/* Generated from schemas/review-event.schema.json. Do not edit directly. */

export type ReviewEvent = {
  [k: string]: any;
} & {
  schemaVersion: "1.0";
  id: string;
  reportId: string;
  sequence: number;
  type:
    | "viewed.changed"
    | "judgment.changed"
    | "thread.created"
    | "thread.message-added"
    | "thread.resolved"
    | "state.imported";
  createdAt: string;
  anchor?: ReviewAnchor;
  changeId?: string;
  viewState?: "unseen" | "viewed" | "stale";
  judgmentState?: "unreviewed" | "reviewed" | "follow-up" | "blocked" | "stale";
  threadId?: string;
  messageId?: string;
  sourceReportId?: string;
};

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
