/* Generated from schemas/annotations.schema.json. Do not edit directly. */

export interface Annotations {
  schemaVersion: "1.0";
  changes: SemanticChange[];
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
  targetRefs: string[];
  findingRefs: string[];
  verification: {
    verified: string[];
    gaps: string[];
  };
}
