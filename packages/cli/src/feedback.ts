import path from "node:path";
import { createFeedbackHandoff } from "@utsu-ri/clipboard-handoff";
import { ExitCode, UtsuriError, type ExitCodeValue } from "@utsu-ri/core";
import type { OriginSessionBinding, ReviewAnswer, UtsuriReport } from "@utsu-ri/report-model";
import { assertArtifact } from "@utsu-ri/report-model";
import { validateReportDirectory } from "@utsu-ri/report-builder";
import { type FeedbackBatchState } from "@utsu-ri/review-inbox";
import { ReviewMcpService } from "@utsu-ri/review-mcp-server";
import {
  parseBoundedJson,
  readContainedRegularFile,
  resolveContainedPath
} from "@utsu-ri/security";
import {
  assertOriginSessionMatch,
  createOriginSessionBinding,
  type CurrentSessionIdentity
} from "@utsu-ri/session-binding";

const originProjectNamespace = "utsu-ri-origin-project-v1";

export interface FeedbackRuntime {
  runDirectory: string;
  report: UtsuriReport;
  binding: OriginSessionBinding;
  currentSession: CurrentSessionIdentity;
  service: ReviewMcpService;
}

function feedbackError(
  id: string,
  message: string,
  exitCode: ExitCodeValue = ExitCode.Arguments
): never {
  throw new UtsuriError(id, message, exitCode);
}

function sessionInput(environment: NodeJS.ProcessEnv): {
  host: "codex" | "claude-code" | "unknown";
  sessionId?: string;
} {
  const codex = environment.UTSURI_CODEX_SESSION_ID;
  const claude = environment.CLAUDE_SESSION_ID;
  if (codex && claude) {
    feedbackError(
      "ORIGIN_SESSION_AMBIGUOUS",
      "Both Codex and Claude Code Origin Session inputs are present",
      ExitCode.Security
    );
  }
  if (codex) return { host: "codex", sessionId: codex };
  if (claude) return { host: "claude-code", sessionId: claude };
  return { host: "unknown" };
}

export async function createRuntimeSessionContext(
  projectRoot: string,
  report: UtsuriReport,
  environment: NodeJS.ProcessEnv = process.env,
  createdAt = new Date().toISOString()
): Promise<{ binding: OriginSessionBinding; currentSession: CurrentSessionIdentity }> {
  const detected = sessionInput(environment);
  if (
    report.origin.bindingMode !== "unbound" &&
    report.origin.host !== "unknown" &&
    detected.host !== "unknown" &&
    report.origin.host !== detected.host
  ) {
    feedbackError(
      "ORIGIN_SESSION_HOST_MISMATCH",
      "Current host differs from the host recorded by the report",
      ExitCode.Security
    );
  }
  const current = await createOriginSessionBinding({
    host: detected.host,
    ...(detected.sessionId ? { sessionId: detected.sessionId } : {}),
    projectRoot,
    repositoryFingerprint: originProjectNamespace,
    reportId: report.reportId,
    createdAt,
    directBridgeAvailable: false
  });
  const binding: OriginSessionBinding =
    report.origin.bindingMode === "unbound"
      ? await createOriginSessionBinding({
          host: "unknown",
          projectRoot,
          repositoryFingerprint: originProjectNamespace,
          reportId: report.reportId,
          createdAt,
          directBridgeAvailable: false
        })
      : {
          host: report.origin.host,
          sessionRef: report.origin.sessionRef!,
          projectFingerprint: report.origin.projectFingerprint,
          reportId: report.reportId,
          bindingMode: report.origin.bindingMode,
          createdAt: report.origin.createdAt
        };
  return {
    binding,
    currentSession: {
      host: current.host,
      ...(current.sessionRef ? { sessionRef: current.sessionRef } : {}),
      projectFingerprint: current.projectFingerprint,
      reportId: current.reportId
    }
  };
}

export async function bindReportToCurrentSession(
  projectRoot: string,
  report: UtsuriReport,
  environment: NodeJS.ProcessEnv = process.env,
  publishedOrigin?: OriginSessionBinding
): Promise<UtsuriReport> {
  const detected = sessionInput(environment);
  if (publishedOrigin) {
    assertArtifact("origin-session", publishedOrigin);
    if (publishedOrigin.reportId !== report.reportId) {
      feedbackError(
        "REPORT_ORIGIN_MISMATCH",
        "The published Origin Session belongs to another report",
        ExitCode.Artifact
      );
    }
    if (publishedOrigin.bindingMode !== "unbound" && detected.host !== "unknown") {
      const current = await createOriginSessionBinding({
        host: detected.host,
        ...(detected.sessionId ? { sessionId: detected.sessionId } : {}),
        projectRoot,
        repositoryFingerprint: originProjectNamespace,
        reportId: report.reportId,
        createdAt: publishedOrigin.createdAt,
        directBridgeAvailable: false
      });
      assertOriginSessionMatch(publishedOrigin, current);
    }
    return { ...structuredClone(report), origin: structuredClone(publishedOrigin) };
  }
  if (report.origin.bindingMode !== "unbound" || detected.host === "unknown") {
    return structuredClone(report);
  }
  const binding = await createOriginSessionBinding({
    host: detected.host,
    ...(detected.sessionId ? { sessionId: detected.sessionId } : {}),
    projectRoot,
    repositoryFingerprint: originProjectNamespace,
    reportId: report.reportId,
    createdAt: new Date().toISOString(),
    directBridgeAvailable: false
  });
  return { ...structuredClone(report), origin: binding };
}

export async function prepareFeedbackRuntime(
  cwd: string,
  runValue: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<FeedbackRuntime> {
  const runDirectory = await resolveContainedPath(cwd, runValue);
  const reportDirectory = path.join(runDirectory, "report");
  const validation = await validateReportDirectory(reportDirectory, { strict: true });
  if (!validation.ok) {
    feedbackError("FEEDBACK_REPORT_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const report = parseBoundedJson(
    (
      await readContainedRegularFile(reportDirectory, "report.json", {
        maximumBytes: 32 * 1024 * 1024
      })
    ).toString("utf8"),
    { label: "feedback report", maximumBytes: 32 * 1024 * 1024 }
  ) as UtsuriReport;
  const { binding, currentSession } = await createRuntimeSessionContext(cwd, report, environment);
  assertOriginSessionMatch(binding, currentSession);
  return {
    runDirectory,
    report,
    binding,
    currentSession,
    service: new ReviewMcpService({ runDirectory, report, currentSession })
  };
}

export async function feedbackList(
  runtime: FeedbackRuntime,
  state?: string
): Promise<{ data: Record<string, unknown>; human: string }> {
  if (
    state !== undefined &&
    !new Set(["draft", "ready", "submitted", "consumed", "answered", "stale"]).has(state)
  ) {
    feedbackError("FEEDBACK_STATE_INVALID", "--status is not a Feedback Batch state");
  }
  const result = (await runtime.service.callTool("review_list_batches", {
    ...(state ? { state } : {})
  })) as { reportId: string; batches: Array<{ id: string; state: string; items: unknown[] }> };
  return {
    data: { ok: true, command: "feedback list", ...result },
    human:
      result.batches.length === 0
        ? "No matching Feedback Batches"
        : result.batches
            .map((batch) => `${batch.id}\t${batch.state}\t${batch.items.length} items`)
            .join("\n")
  };
}

export async function feedbackGet(
  runtime: FeedbackRuntime,
  batchId?: string
): Promise<{ data: Record<string, unknown>; human: string }> {
  const result = (await runtime.service.callTool("review_claim_batch", {
    ...(batchId ? { batch_id: batchId } : {})
  })) as { batch: { id: string; items: unknown[] }; contexts: unknown[]; claimed: boolean };
  return {
    data: { ok: true, command: "feedback get", ...result },
    human: `${result.claimed ? "Claimed" : "Opened"} ${result.batch.id} (${result.batch.items.length} items)`
  };
}

export async function feedbackAnswer(
  cwd: string,
  runtime: FeedbackRuntime,
  batchId: string | undefined,
  inputValue: string
): Promise<{ data: Record<string, unknown>; human: string }> {
  const bytes = await readContainedRegularFile(cwd, inputValue, {
    maximumBytes: 2 * 1024 * 1024
  });
  const value = parseBoundedJson(bytes.toString("utf8"), {
    label: "feedback answers",
    maximumBytes: 2 * 1024 * 1024
  });
  const answers = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value) && "answers" in value
      ? (value as { answers: unknown }).answers
      : null;
  if (!Array.isArray(answers)) {
    feedbackError("FEEDBACK_ANSWER_INPUT_INVALID", "Answer input must be an array or { answers }");
  }
  let selectedBatchId = batchId;
  if (!selectedBatchId) {
    const consumed = (await runtime.service.callTool("review_list_batches", {
      state: "consumed" satisfies FeedbackBatchState
    })) as { batches: Array<{ id: string }> };
    if (consumed.batches.length !== 1) {
      feedbackError(
        "FEEDBACK_BATCH_AMBIGUOUS",
        "Specify --batch unless exactly one claimed Feedback Batch exists"
      );
    }
    selectedBatchId = consumed.batches[0]!.id;
  }
  const result = (await runtime.service.callTool("review_post_answers", {
    batch_id: selectedBatchId,
    answers: answers as ReviewAnswer[]
  })) as { batch: { id: string; items: unknown[] } };
  return {
    data: { ok: true, command: "feedback answer", ...result },
    human: `Stored ${result.batch.items.length} answers for ${result.batch.id}`
  };
}

export async function feedbackHandoff(
  runtime: FeedbackRuntime,
  batchId?: string
): Promise<{ data: Record<string, unknown>; human: string }> {
  const result = (await runtime.service.callTool("review_get_batch", {
    ...(batchId ? { batch_id: batchId } : {})
  })) as { batch: { id: string; reportId: string } };
  const handoff = createFeedbackHandoff(result.batch.reportId, result.batch.id);
  return {
    data: { ok: true, command: "feedback handoff", handoff },
    human: handoff.text
  };
}
