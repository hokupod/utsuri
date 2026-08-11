import { realpath } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { McpRunRegistration } from "@utsu-ri/report-model";
import {
  readMcpRunRegistrations,
  reviewMcpToolDefinitions,
  type ReviewMcpTransportService
} from "@utsu-ri/review-mcp-server";
import { prepareRegisteredFeedbackRuntime, type FeedbackRuntime } from "./feedback";

const reportIdPattern = /^report[-:][A-Za-z0-9._:-]+$/u;
const mutationTools = new Set([
  "review_claim_batch",
  "review_post_answers",
  "review_release_batch"
]);
const toolNames = new Set(reviewMcpToolDefinitions.map((definition) => definition.name));
const eligibilityMismatchDiagnostics = new Set([
  "ORIGIN_SESSION_MISMATCH",
  "ORIGIN_SESSION_HOST_MISMATCH"
]);

function mcpError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Security);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEligibilityMismatch(error: unknown): boolean {
  return error instanceof UtsuriError && eligibilityMismatchDiagnostics.has(error.diagnosticId);
}

function sanitizeBrokerFailure(error: unknown): never {
  if (error instanceof UtsuriError) {
    if (error.diagnosticId.startsWith("SEC_")) {
      mcpError("MCP_BROKER_FILESYSTEM", "Registered MCP filesystem validation failed");
    }
    throw error;
  }
  mcpError("MCP_BROKER_FILESYSTEM", "Registered MCP filesystem operation failed");
}

export const brokerMcpToolDefinitions = reviewMcpToolDefinitions.map((definition) => ({
  ...definition,
  description: definition.description.replace("fixed review run", "registered review run"),
  inputSchema: {
    ...definition.inputSchema,
    properties: {
      ...definition.inputSchema.properties,
      report_id: {
        type: "string",
        pattern: "^report[-:][A-Za-z0-9._:-]+$",
        maxLength: 256
      }
    }
  }
}));

export interface PluginProjectContext {
  host: "codex" | "claude-code";
  projectRoot: string;
}

export async function resolvePluginProjectContext(
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<PluginProjectContext> {
  const codexSession = environment.CODEX_THREAD_ID?.trim() || undefined;
  const claudeSession = environment.CLAUDE_CODE_SESSION_ID?.trim() || undefined;
  const claudeProject = environment.CLAUDE_PROJECT_DIR?.trim() || undefined;
  if (codexSession && (claudeSession || claudeProject)) {
    mcpError("MCP_HOST_AMBIGUOUS", "More than one Plugin host identity is present");
  }
  if (claudeSession || claudeProject) {
    if (!claudeSession || !claudeProject) {
      mcpError(
        "MCP_CLAUDE_CONTEXT_REQUIRED",
        "Claude Code Plugin MCP requires project and session context"
      );
    }
    if (!path.isAbsolute(claudeProject)) {
      mcpError("MCP_PROJECT_INVALID", "Claude Code project root must be absolute");
    }
    const canonical = await realpath(claudeProject).catch(() =>
      mcpError("MCP_PROJECT_INVALID", "Claude Code project root is unavailable")
    );
    if (path.resolve(claudeProject) !== canonical) {
      mcpError("MCP_PROJECT_AMBIGUOUS", "Claude Code project root contains a symlink");
    }
    if (canonical === path.parse(canonical).root) {
      mcpError("MCP_PROJECT_INVALID", "Filesystem root cannot be a Plugin project");
    }
    return { host: "claude-code", projectRoot: canonical };
  }
  if (codexSession) {
    const canonical = await realpath(cwd).catch(() =>
      mcpError("MCP_PROJECT_INVALID", "Codex workspace root is unavailable")
    );
    if (path.resolve(cwd) !== canonical) {
      mcpError("MCP_PROJECT_AMBIGUOUS", "Codex workspace root contains a symlink");
    }
    return { host: "codex", projectRoot: canonical };
  }
  mcpError("MCP_ORIGIN_SESSION_REQUIRED", "Plugin MCP requires a supported Origin Session");
}

function sameRegistration(left: McpRunRegistration, right: McpRunRegistration): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.sessionRef === right.sessionRef &&
    left.projectFingerprint === right.projectFingerprint &&
    left.reportId === right.reportId &&
    left.runPath === right.runPath &&
    left.reportSha256 === right.reportSha256 &&
    left.createdAt === right.createdAt
  );
}

export class PluginBrokerMcpService implements ReviewMcpTransportService {
  readonly toolDefinitions = brokerMcpToolDefinitions;
  readonly structuredToolErrors = true;
  readonly serverInfo = { name: "utsu-ri-plugin-broker", version: "0.2.0" };
  readonly #projectRoot: string;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #readRegistrations: typeof readMcpRunRegistrations;

  constructor(
    projectRoot: string,
    environment: NodeJS.ProcessEnv = process.env,
    dependencies: { readRegistrations?: typeof readMcpRunRegistrations } = {}
  ) {
    this.#projectRoot = projectRoot;
    this.#environment = { ...environment };
    delete this.#environment.UTSURI_CODEX_SESSION_ID;
    delete this.#environment.CLAUDE_SESSION_ID;
    this.#readRegistrations = dependencies.readRegistrations ?? readMcpRunRegistrations;
  }

  async #registrations(): Promise<McpRunRegistration[]> {
    try {
      return await this.#readRegistrations(this.#projectRoot);
    } catch (error) {
      sanitizeBrokerFailure(error);
    }
  }

  async #snapshot(): Promise<
    Array<{ registration: McpRunRegistration; runtime: FeedbackRuntime }>
  > {
    const registrations = await this.#registrations();
    const runtimes: Array<{ registration: McpRunRegistration; runtime: FeedbackRuntime }> = [];
    for (const registration of registrations) {
      try {
        const runtime = await prepareRegisteredFeedbackRuntime(
          this.#projectRoot,
          registration,
          this.#environment
        );
        runtimes.push({ registration, runtime });
      } catch (error) {
        if (isEligibilityMismatch(error)) continue;
        sanitizeBrokerFailure(error);
      }
    }
    return runtimes;
  }

  async #revalidate(selected: {
    registration: McpRunRegistration;
    runtime: FeedbackRuntime;
  }): Promise<FeedbackRuntime> {
    const registrations = await this.#registrations();
    const current = registrations.find(
      (registration) => registration.reportId === selected.registration.reportId
    );
    if (!current || !sameRegistration(current, selected.registration)) {
      mcpError("MCP_REGISTRATION_CHANGED", "Selected MCP registration changed during request");
    }
    try {
      return await prepareRegisteredFeedbackRuntime(this.#projectRoot, current, this.#environment);
    } catch (error) {
      sanitizeBrokerFailure(error);
    }
  }

  async callTool(name: string, rawArguments: unknown): Promise<unknown> {
    if (!toolNames.has(name as (typeof reviewMcpToolDefinitions)[number]["name"])) {
      mcpError("MCP_TOOL_UNKNOWN", "Unknown review MCP tool");
    }
    if (!isRecord(rawArguments)) {
      mcpError("MCP_ARGUMENTS_INVALID", "MCP tool arguments are invalid");
    }
    const reportId = rawArguments.report_id;
    if (
      reportId !== undefined &&
      (typeof reportId !== "string" || reportId.length > 256 || !reportIdPattern.test(reportId))
    ) {
      mcpError("MCP_REPORT_ID_INVALID", "Registered report selector is invalid");
    }
    const arguments_ = { ...rawArguments };
    delete arguments_.report_id;
    const candidates = await this.#snapshot();
    if (candidates.length === 0) {
      mcpError("MCP_RUN_UNAVAILABLE", "No same-session registered report is available");
    }
    let selected;
    if (reportId !== undefined) {
      selected = candidates.find((candidate) => candidate.registration.reportId === reportId);
      if (!selected) mcpError("MCP_RUN_UNKNOWN", "Requested registered report is unavailable");
    } else if (candidates.length === 1) {
      selected = candidates[0];
    } else {
      mcpError(
        "MCP_RUN_AMBIGUOUS",
        `More than one registered report is available: ${candidates
          .map((candidate) => candidate.registration.reportId)
          .sort()
          .join(", ")}`
      );
    }
    if (!selected) mcpError("MCP_RUN_UNAVAILABLE", "Registered report selection failed");
    const runtime = mutationTools.has(name) ? await this.#revalidate(selected) : selected.runtime;
    return runtime.service.callTool(name, arguments_);
  }
}
