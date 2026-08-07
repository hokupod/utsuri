import type {
  ReviewBundle,
  ReviewEvent,
  ReviewState,
  ReviewThread,
  UtsuriReport
} from "@utsu-ri/report-model";

export type ReviewAnchor = ReviewState["viewed"][string]["anchor"];
export type HumanJudgment = ReviewState["judgments"][string]["state"];
export type ViewedState = ReviewState["viewed"][string]["state"];
export type ReviewThreadKind = ReviewThread["kind"];

export interface ReviewBundleDocument extends Omit<ReviewBundle, "state" | "threads" | "events"> {
  state: ReviewState;
  threads: ReviewThread[];
  events: ReviewEvent[];
}

export interface ReviewStore {
  report: UtsuriReport;
  state: ReviewState;
  threads: ReviewThread[];
  events: ReviewEvent[];
  anchorCatalog: ReviewAnchor[];
  sidecarFiles: Record<string, string>;
}

export type ReanchorResult = "exact" | "probable" | "changed" | "missing";
export type ImportDisposition = "matched" | "stale" | "orphaned";

export interface AnchorReanchorResult {
  source: ReviewAnchor;
  result: ReanchorResult;
  disposition: ImportDisposition;
  candidate?: ReviewAnchor;
}

export interface ReviewImportConflict {
  kind: "viewed" | "judgment" | "thread";
  id: string;
  current: unknown;
  incoming: unknown;
}

export interface ReviewImportResult {
  store: ReviewStore;
  reanchored: AnchorReanchorResult[];
  conflicts: ReviewImportConflict[];
}

export type ReviewDigest = (value: unknown) => Promise<string>;

export interface ReviewSourceIdentity {
  base: string | null;
  head: string | null;
}
