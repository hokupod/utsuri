import { expect, test } from "bun:test";
import type { FeedbackBatch } from "@utsu-ri/report-model";
import { deliverToSameSession } from "./index";

test("falls back without creating another session", () => {
  const result = deliverToSameSession({ id: "fb:123", reportId: "report:123" } as FeedbackBatch);
  expect(result).toMatchObject({
    delivered: false,
    createdSession: false,
    mode: "return-to-session"
  });
  expect(result.handoff.text).toContain("Batch: fb:123");
});
