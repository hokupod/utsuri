/* Generated from schemas/evidence-index.schema.json. Do not edit directly. */

export interface EvidenceIndex {
  schemaVersion: "1.0";
  evidence: Evidence[];
}
export interface Evidence {
  id: string;
  type: "code" | "test" | "style" | "configuration" | "generated" | "binary";
  path: string;
  range: null | {
    start: number;
    end: number;
  };
  summary: string;
  hunkRefs: string[];
}
