import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { CaptureFailure } from "./types";
import { redactUrlsInText } from "./redaction";

function scrubMessage(message: string, roots: readonly string[]): string {
  let output = message;
  for (const [index, root] of roots.entries()) {
    if (root) output = output.replaceAll(root, index === 0 ? "<repository>" : "<run>");
  }
  return (
    redactUrlsInText(output)
      // eslint-disable-next-line no-control-regex -- persisted diagnostics must drop C0 controls
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
      .slice(0, 4096)
  );
}

export function captureFailure(
  error: unknown,
  stage: string,
  attempts: number,
  roots: readonly string[]
): CaptureFailure {
  const utsuri = error instanceof UtsuriError ? error : null;
  return {
    code: utsuri?.diagnosticId ?? "CAPTURE_STAGE_FAILED",
    message: scrubMessage(error instanceof Error ? error.message : String(error), roots),
    stage,
    retryable: stage === "navigation" || stage === "screenshot",
    attempts
  };
}

export async function writeFailureEvidence(
  directory: string,
  failure: CaptureFailure,
  maximumBytes = 16 * 1024 * 1024
): Promise<string> {
  const filename = path.join(directory, "failure.json");
  const content = `${JSON.stringify(failure, null, 2)}\n`;
  if (Buffer.byteLength(content) > maximumBytes) {
    throw new UtsuriError(
      "CAPTURE_ARTIFACT_SIZE_LIMIT",
      "failure.json exceeds the configured artifact byte limit",
      ExitCode.Incomplete
    );
  }
  await writeFile(filename, content, { flag: "wx" });
  return filename;
}
