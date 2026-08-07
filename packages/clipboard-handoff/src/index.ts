export interface FeedbackHandoff {
  reportId: string;
  batchId: string;
  text: string;
}

function requireIdentifier(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value) || value.length > 256) throw new Error(`${label} is invalid`);
  return value;
}

export function createFeedbackHandoff(reportId: string, batchId: string): FeedbackHandoff {
  const report = requireIdentifier(reportId, /^report[-:][A-Za-z0-9._:-]+$/u, "Report ID");
  const batch = requireIdentifier(batchId, /^fb[-:][A-Za-z0-9._:-]+$/u, "Feedback Batch ID");
  return {
    reportId: report,
    batchId: batch,
    text: `Process the pending Utsuri review items.\nReport: ${report}\nBatch: ${batch}`
  };
}

export async function copyFeedbackHandoff(
  handoff: FeedbackHandoff,
  clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard
): Promise<void> {
  await clipboard.writeText(handoff.text);
}
