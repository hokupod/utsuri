/* Generated from schemas/report.schema.json. Do not edit directly. */

export interface UtsuriReport {
  schemaVersion: "1.0";
  reportId: string;
  status: "PASS" | "CHANGED" | "REGRESSION" | "INCOMPLETE" | "UNCOVERED" | "SKIPPED";
  summary: {
    statement: string;
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  hunks: Hunk[];
  unclassifiedHunkRefs: string[];
  changes: Change[];
  targets: Target[];
  findings: Finding[];
  coverage: {
    knownUsages: number | null;
    verifiedUsages: number;
    unknownPossible: boolean;
    planned: number;
    succeeded: number;
    failed: number;
  };
  origin: Origin;
  diagnostics: {
    incompleteReasons: string[];
    blockedRequestCount: number;
  };
}
export interface Hunk {
  id: string;
  path: string;
  oldStart: number;
  newStart: number;
  lines: string[];
  lowSignal: boolean;
}
export interface Change {
  id: string;
  title: string;
  kind: "visual" | "behavior" | "content" | "accessibility" | "refactor" | "mixed" | "unknown";
  summary: string;
  intent: {
    text: string;
    source: "declared" | "supported-inference" | "weak-inference" | "unknown";
    evidenceRefs: string[];
    missingEvidence?: string[];
  };
  implementation: string;
  userImpact: string[];
  technicalImpact: string[];
  risk: {
    level: "critical" | "high" | "medium" | "low" | "info";
    reasons: string[];
  };
  hunkRefs: string[];
  targetRefs: string[];
  findingRefs: string[];
  verification: {
    verified: string[];
    gaps: string[];
  };
}
export interface Target {
  id: string;
  routeOrStory: string;
  viewport: string;
  state: string;
  roots: string[];
  discovery: {
    source: "explicit" | "storybook" | "test" | "route" | "import" | "selector" | "fallback";
    confidence: "explicit" | "strong" | "medium" | "weak" | "unknown";
    reason: string;
  };
  before: CaptureResult;
  after: CaptureResult;
  comparisonRef?: string;
}
export interface CaptureResult {
  status: "success" | "failed" | "skipped";
  url?: string;
  screenshotRefs: string[];
  domRef?: string;
  ariaRef?: string;
  styleRef?: string;
  axeRef?: string;
  consoleRef?: string;
  networkRef?: string;
  failure?: {
    code: string;
    message: string;
    stage: string;
  };
}
export interface Finding {
  id: string;
  category:
    "visual" | "layout" | "dom" | "aria" | "a11y" | "console" | "page-error" | "network" | "coverage" | "security";
  state: "new" | "resolved" | "unchanged" | "incomplete";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  targetRef?: string;
  evidenceRefs: string[];
  hunkRefs: string[];
}
export interface Origin {
  host: "codex" | "claude-code" | "unknown";
  sessionRef?: string;
  projectFingerprint: string;
  reportId: string;
  bindingMode: "direct-same-session" | "return-to-session" | "unbound";
  createdAt: string;
}
