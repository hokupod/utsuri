/* Generated from schemas/review-answer.schema.json. Do not edit directly. */

export interface ReviewAnswer {
  schemaVersion: "1.0";
  batchId: string;
  itemId: string;
  directAnswer: string;
  /**
   * @maxItems 100
   */
  evidence: {
    ref: string;
    explanation: string;
  }[];
  /**
   * @maxItems 100
   */
  uncertainty: string[];
  /**
   * @maxItems 100
   */
  suggestedNextActions: {
    type: "inspect" | "test" | "recapture" | "propose-patch" | "none";
    label: string;
    anchorRef?: string;
  }[];
  metadata: {
    host: "codex" | "claude-code" | "unknown";
    originSessionRef?: string;
    answerTurnRef?: string;
    contextHash: string;
  };
}
