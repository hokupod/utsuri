/* Generated from schemas/review-thread.schema.json. Do not edit directly. */

export interface ReviewThread {
  id: string;
  reportId: string;
  anchor: ReviewAnchor;
  kind: "note" | "question" | "finding" | "change-request";
  state: "open" | "answered" | "resolved" | "stale" | "orphaned";
  messages: Message[];
  agentAttention: {
    state: "none" | "requested" | "batched" | "submitted" | "acknowledged" | "answered" | "stale";
    batchId?: string;
    updatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
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
export interface Message {
  id: string;
  kind: "human-note" | "agent-answer" | "system";
  author: {
    type: "human" | "agent" | "system";
    label: string;
  };
  body: string;
  feedbackItemId?: string;
  /**
   * @maxItems 100
   */
  evidenceRefs?: string[];
  createdAt: string;
}
