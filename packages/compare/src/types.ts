export type FindingCategory =
  | "visual"
  | "layout"
  | "dom"
  | "aria"
  | "style"
  | "a11y"
  | "console"
  | "page-error"
  | "network"
  | "coverage"
  | "security";

export type FindingState = "new" | "resolved" | "unchanged" | "incomplete";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface ChangedRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
}

export interface ImageComparison {
  id: string;
  kind: "full-page" | "crop" | "viewport";
  label: string;
  beforeRef: string;
  afterRef: string;
  diffRef: string;
  width: number;
  height: number;
  diffPixelCount: number;
  diffRatio: number;
  regions: ChangedRegion[];
}

export interface StructuralComparison {
  dom: { beforeHash: string; afterHash: string; changed: boolean };
  aria: { beforeHash: string; afterHash: string; changed: boolean };
  style: { beforeHash: string; afterHash: string; changed: boolean };
}

export interface ComparisonFinding {
  id: string;
  fingerprint: string;
  category: FindingCategory;
  state: FindingState;
  severity: FindingSeverity;
  title: string;
  description: string;
  targetRef: string;
  evidencePaths: string[];
}

export interface TargetComparison {
  id: string;
  targetRef: string;
  status: "compared" | "incomplete";
  images: ImageComparison[];
  structural: StructuralComparison | null;
  findings: ComparisonFinding[];
  incompleteReasons: string[];
}

export interface ComparisonManifest {
  schemaVersion: "1.0";
  captureHash: string;
  engine: {
    name: "utsu-ri-compare";
    version: "1";
    pixelThreshold: number;
    minimumRegionPixels: number;
    mergeDistance: number;
  };
  targets: TargetComparison[];
  artifactDigests: Record<string, string>;
  comparisonHash: string;
}

export interface CompareRunResult {
  manifest: ComparisonManifest;
  manifestPath: string;
  complete: boolean;
}
