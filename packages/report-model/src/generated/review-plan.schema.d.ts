/* Generated from schemas/review-plan.schema.json. Do not edit directly. */

export interface ReviewPlan {
  schemaVersion: "1.0";
  candidates: Candidate[];
  unclassifiedHunkRefs: string[];
}
export interface Candidate {
  id: string;
  title: string;
  reason: string;
  fileRefs: string[];
  /**
   * @minItems 1
   */
  hunkRefs: [string, ...string[]];
  evidenceRefs: string[];
}
