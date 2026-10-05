/* Generated from schemas/annotations.schema.json. Do not edit directly. */

export interface Annotations {
  schemaVersion: "1.0";
  language: string;
  /**
   * @maxItems 100
   */
  verificationResults?: VerificationResult[];
  overview: string;
  changes: SemanticChange[];
}
export interface VerificationResult {
  id: string;
  kind: "unit-tests" | "typecheck" | "lint" | "build" | "app-e2e" | "external-service";
  environment: string;
  /**
   * @minItems 1
   * @maxItems 100
   */
  command: [string, ...string[]];
  subjectSha: string | null;
  exitCode: number | null;
  passedCount: number | null;
  /**
   * @maxItems 100
   */
  warnings: string[];
  /**
   * @maxItems 1000
   */
  changeRefs: string[];
  completedAt: string | null;
  logRef?: string;
  logSha256?: string;
}
export interface SemanticChange {
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
  hunkExplanations: HunkExplanation[];
  targetRefs: string[];
  findingRefs: string[];
  verification: {
    verified: string[];
    gaps: string[];
  };
}
export interface HunkExplanation {
  hunkRef: string;
  purpose: string;
  meaning: string;
}
