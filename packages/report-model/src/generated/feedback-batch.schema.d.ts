/* Generated from schemas/feedback-batch.schema.json. Do not edit directly. */

export type FeedbackBatch = {
  [k: string]: any;
} & {
  id: string;
  reportId: string;
  origin: Origin;
  /**
   * @minItems 1
   * @maxItems 20
   */
  items:
    | [Item]
    | [Item, Item]
    | [Item, Item, Item]
    | [Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item,
        Item
      ];
  state: "draft" | "ready" | "submitted" | "consumed" | "answered" | "stale";
  deliveryMode: "direct-same-session" | "return-to-session" | "export-only";
  contextHash: string;
  createdAt: string;
  submittedAt?: string;
  consumedAt?: string;
  answeredAt?: string;
};
export type Origin = {
  [k: string]: any;
} & {
  host: "codex" | "claude-code" | "unknown";
  sessionRef?: string;
  projectFingerprint: string;
  reportId: string;
  bindingMode: "direct-same-session" | "return-to-session" | "unbound";
  createdAt: string;
};

export interface Item {
  id: string;
  threadId: string;
  anchor: Anchor;
  sourceMessageId: string;
  requestKind: "explain" | "trace-impact" | "risk-check" | "intent-check" | "a11y-check" | "suggest-tests" | "freeform";
  question: string;
  contextSelection: {
    includeCodeDiff: boolean;
    includeVisualCrop: boolean;
    includeComputedStyle: boolean;
    includeDomAria: boolean;
    includeRelatedTests: boolean;
  };
  state: "ready" | "submitted" | "acknowledged" | "answered" | "stale";
}
export interface Anchor {
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
