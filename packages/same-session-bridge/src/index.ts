import type { FeedbackBatch } from "@utsu-ri/report-model";
import { createFeedbackHandoff, type FeedbackHandoff } from "@utsu-ri/clipboard-handoff";

export interface SameSessionBridgeCapability {
  supported: false;
  reason: string;
}

export interface SameSessionDeliveryFallback {
  delivered: false;
  createdSession: false;
  mode: "return-to-session";
  reason: string;
  handoff: FeedbackHandoff;
}

export function sameSessionBridgeCapability(): SameSessionBridgeCapability {
  return {
    supported: false,
    reason:
      "No officially bound current-session turn API and authenticated response-correlation channel is configured"
  };
}

export function deliverToSameSession(batch: FeedbackBatch): SameSessionDeliveryFallback {
  const capability = sameSessionBridgeCapability();
  return {
    delivered: false,
    createdSession: false,
    mode: "return-to-session",
    reason: capability.reason,
    handoff: createFeedbackHandoff(batch.reportId, batch.id)
  };
}
