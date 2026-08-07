import { expect, test } from "@playwright/test";
import type { FeedbackBatch } from "../../packages/report-model/src";
import {
  deliverToSameSession,
  sameSessionBridgeCapability
} from "../../packages/same-session-bridge/src";

test("uses the explicit return-to-session fallback when no official bridge exists", () => {
  expect(sameSessionBridgeCapability()).toMatchObject({
    supported: false,
    reason: expect.stringContaining("officially bound current-session turn API")
  });
  const batch = {
    id: "fb:phase6",
    reportId: "report:phase6"
  } as FeedbackBatch;
  const first = deliverToSameSession(batch);
  const duplicate = deliverToSameSession(batch);
  expect(first).toEqual(duplicate);
  expect(first).toMatchObject({
    delivered: false,
    createdSession: false,
    mode: "return-to-session"
  });
  expect(first.handoff.text).toContain("Batch: fb:phase6");
});
