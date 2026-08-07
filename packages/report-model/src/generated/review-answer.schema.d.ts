/* Generated from schemas/review-answer.schema.json. Do not edit directly. */

export interface ReviewAnswer {
  schemaVersion: "1.0";
  batchId: string;
  itemId: string;
  directAnswer: string;
  evidence: {
    ref: string;
    explanation: string;
  }[];
  uncertainty: string[];
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
