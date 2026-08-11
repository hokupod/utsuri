import { ExitCode, toUtsuriError, UtsuriError } from "@utsu-ri/core";
import type { ReviewAnswer, UtsuriReport } from "@utsu-ri/report-model";
import {
  claimFeedbackBatch,
  getFeedbackBatch,
  getFeedbackItemContext,
  listFeedbackBatches,
  postFeedbackAnswers,
  releaseFeedbackBatch,
  type FeedbackBatchState
} from "@utsu-ri/review-inbox";
import { loadReviewStore, persistReviewStore } from "@utsu-ri/review-state";
import { assertOriginSessionMatch, type CurrentSessionIdentity } from "@utsu-ri/session-binding";

const toolDefinitions = [
  {
    name: "review_list_batches",
    description: "List Utsuri Feedback Batches bound to this fixed review run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        report_id: { type: "string" },
        state: {
          enum: ["draft", "ready", "submitted", "consumed", "answered", "stale"]
        }
      }
    }
  },
  {
    name: "review_get_batch",
    description: "Read one Utsuri Feedback Batch without claiming it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { batch_id: { type: "string", pattern: "^fb[-:]" } }
    }
  },
  {
    name: "review_claim_batch",
    description: "Claim one ready batch for this exact Origin Session.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { batch_id: { type: "string", pattern: "^fb[-:]" } }
    }
  },
  {
    name: "review_get_item_context",
    description: "Read the bounded Context Pack for one Feedback Item.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id"],
      properties: { item_id: { type: "string", pattern: "^item[-:]" } }
    }
  },
  {
    name: "review_post_answers",
    description: "Write exactly one structured answer for every item in a claimed batch.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["batch_id", "answers"],
      properties: {
        batch_id: { type: "string", pattern: "^fb[-:]" },
        answers: { type: "array", minItems: 1, maxItems: 20, items: { type: "object" } }
      }
    }
  },
  {
    name: "review_release_batch",
    description: "Release a batch claimed by this exact Origin Session.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["batch_id"],
      properties: { batch_id: { type: "string", pattern: "^fb[-:]" } }
    }
  }
] as const;

const maximumRequestBytes = 2 * 1024 * 1024;

function serviceError(id: string, message: string, exitCode = ExitCode.Arguments): never {
  throw new UtsuriError(id, message, exitCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactArguments(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (!isRecord(value)) serviceError("MCP_ARGUMENTS_INVALID", "MCP tool arguments are invalid");
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    serviceError("MCP_ARGUMENTS_INVALID", "MCP tool arguments contain invalid fields");
  }
  return value;
}

export interface ReviewMcpServiceOptions {
  runDirectory: string;
  report: UtsuriReport;
  currentSession: CurrentSessionIdentity;
  now?: () => string;
}

export interface ReviewMcpTransportService {
  readonly toolDefinitions?: readonly unknown[];
  readonly structuredToolErrors?: boolean;
  readonly serverInfo?: { name: string; version: string };
  callTool(name: string, rawArguments: unknown): Promise<unknown>;
}

export class ReviewMcpService {
  readonly toolDefinitions = toolDefinitions;
  readonly structuredToolErrors = false;
  readonly serverInfo = { name: "utsu-ri-review", version: "0.2.0" };
  readonly #runDirectory: string;
  readonly #report: UtsuriReport;
  readonly #currentSession: CurrentSessionIdentity;
  readonly #now: () => string;

  constructor(options: ReviewMcpServiceOptions) {
    this.#runDirectory = options.runDirectory;
    this.#report = structuredClone(options.report);
    this.#currentSession = structuredClone(options.currentSession);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async #store() {
    return loadReviewStore(this.#runDirectory, this.#report, this.#now());
  }

  async #uniqueBatchId(requested: unknown, states: FeedbackBatchState[]): Promise<string> {
    if (requested !== undefined) {
      if (typeof requested !== "string" || !/^fb[-:]/u.test(requested)) {
        serviceError("FEEDBACK_BATCH_ID_INVALID", "Feedback Batch ID is invalid");
      }
      return requested;
    }
    const store = await this.#store();
    const candidates = states.flatMap((state) => listFeedbackBatches(store, state));
    const unique = [...new Map(candidates.map((batch) => [batch.id, batch])).values()];
    if (unique.length !== 1) {
      serviceError(
        "FEEDBACK_BATCH_AMBIGUOUS",
        unique.length === 0
          ? "No matching Feedback Batch is available"
          : `More than one Feedback Batch is available: ${unique.map((batch) => batch.id).join(", ")}`
      );
    }
    return unique[0]!.id;
  }

  async callTool(name: string, rawArguments: unknown): Promise<unknown> {
    if (name === "review_list_batches") {
      const arguments_ = exactArguments(rawArguments, [], ["report_id", "state"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      if (arguments_.report_id !== undefined && arguments_.report_id !== this.#report.reportId) {
        serviceError("FEEDBACK_REPORT_MISMATCH", "Requested report does not match this MCP server");
      }
      const state = arguments_.state;
      if (
        state !== undefined &&
        !new Set(["draft", "ready", "submitted", "consumed", "answered", "stale"]).has(
          String(state)
        )
      ) {
        serviceError("FEEDBACK_STATE_INVALID", "Feedback Batch state is invalid");
      }
      return {
        reportId: this.#report.reportId,
        batches: listFeedbackBatches(await this.#store(), state as FeedbackBatchState | undefined)
      };
    }
    if (name === "review_get_batch") {
      const arguments_ = exactArguments(rawArguments, [], ["batch_id"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      const batchId = await this.#uniqueBatchId(arguments_.batch_id, [
        "ready",
        "submitted",
        "consumed"
      ]);
      return { batch: getFeedbackBatch(await this.#store(), batchId) };
    }
    if (name === "review_claim_batch") {
      const arguments_ = exactArguments(rawArguments, [], ["batch_id"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      const batchId = await this.#uniqueBatchId(arguments_.batch_id, ["ready", "submitted"]);
      const store = await this.#store();
      const result = await claimFeedbackBatch(store, batchId, this.#currentSession, this.#now());
      if (result.claimed)
        await persistReviewStore(this.#runDirectory, result.store, store.state.revision);
      return {
        claimed: result.claimed,
        batch: result.batch,
        contexts: result.contexts
      };
    }
    if (name === "review_get_item_context") {
      const arguments_ = exactArguments(rawArguments, ["item_id"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      if (typeof arguments_.item_id !== "string" || !/^item[-:]/u.test(arguments_.item_id)) {
        serviceError("FEEDBACK_ITEM_ID_INVALID", "Feedback Item ID is invalid");
      }
      return { context: getFeedbackItemContext(await this.#store(), arguments_.item_id) };
    }
    if (name === "review_post_answers") {
      const arguments_ = exactArguments(rawArguments, ["batch_id", "answers"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      if (
        typeof arguments_.batch_id !== "string" ||
        !/^fb[-:]/u.test(arguments_.batch_id) ||
        !Array.isArray(arguments_.answers)
      ) {
        serviceError("FEEDBACK_ANSWER_INPUT_INVALID", "Feedback answer input is invalid");
      }
      const store = await this.#store();
      const next = await postFeedbackAnswers(
        store,
        arguments_.batch_id,
        arguments_.answers as ReviewAnswer[],
        this.#currentSession,
        this.#now()
      );
      if (next.state.revision !== store.state.revision) {
        await persistReviewStore(this.#runDirectory, next, store.state.revision);
      }
      return { answered: true, batch: getFeedbackBatch(next, arguments_.batch_id) };
    }
    if (name === "review_release_batch") {
      const arguments_ = exactArguments(rawArguments, ["batch_id"]);
      assertOriginSessionMatch(this.#report.origin, this.#currentSession);
      if (typeof arguments_.batch_id !== "string" || !/^fb[-:]/u.test(arguments_.batch_id)) {
        serviceError("FEEDBACK_BATCH_ID_INVALID", "Feedback Batch ID is invalid");
      }
      const store = await this.#store();
      const next = await releaseFeedbackBatch(
        store,
        arguments_.batch_id,
        this.#currentSession,
        this.#now()
      );
      await persistReviewStore(this.#runDirectory, next, store.state.revision);
      return { released: true, batch: getFeedbackBatch(next, arguments_.batch_id) };
    }
    serviceError("MCP_TOOL_UNKNOWN", `Unknown review MCP tool: ${name}`);
  }
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) return false;
  const allowed = new Set(["jsonrpc", "id", "method", "params"]);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    value.jsonrpc !== "2.0" ||
    typeof value.method !== "string" ||
    value.method.length === 0
  ) {
    return false;
  }
  return (
    !("id" in value) ||
    value.id === null ||
    typeof value.id === "string" ||
    (typeof value.id === "number" && Number.isSafeInteger(value.id))
  );
}

type BoundedLine = { line: string; tooLarge: false } | { tooLarge: true };

async function* boundedRequestLines(input: NodeJS.ReadableStream): AsyncGenerator<BoundedLine> {
  let pending = Buffer.alloc(0);
  let discarding = false;
  for await (const rawChunk of input as NodeJS.ReadableStream & AsyncIterable<Buffer | string>) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    let start = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) continue;
      const segment = chunk.subarray(start, index);
      if (discarding) {
        discarding = false;
      } else if (pending.length + segment.length > maximumRequestBytes) {
        yield { tooLarge: true };
      } else {
        let bytes = pending.length === 0 ? segment : Buffer.concat([pending, segment]);
        if (bytes.at(-1) === 0x0d) bytes = bytes.subarray(0, -1);
        yield { line: bytes.toString("utf8"), tooLarge: false };
      }
      pending = Buffer.alloc(0);
      start = index + 1;
    }
    const remainder = chunk.subarray(start);
    if (discarding || remainder.length === 0) continue;
    if (pending.length + remainder.length > maximumRequestBytes) {
      pending = Buffer.alloc(0);
      discarding = true;
      yield { tooLarge: true };
    } else {
      pending = pending.length === 0 ? Buffer.from(remainder) : Buffer.concat([pending, remainder]);
    }
  }
  if (!discarding && pending.length > 0) {
    if (pending.at(-1) === 0x0d) pending = pending.subarray(0, -1);
    yield { line: pending.toString("utf8"), tooLarge: false };
  }
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string): unknown {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function runReviewMcpStdio(
  service: ReviewMcpTransportService,
  streams: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {}
): Promise<void> {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stdout;
  for await (const bounded of boundedRequestLines(input)) {
    if (bounded.tooLarge) {
      output.write(`${JSON.stringify(rpcError(null, -32700, "Request exceeds 2 MiB"))}\n`);
      continue;
    }
    const line = bounded.line;
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      output.write(`${JSON.stringify(rpcError(null, -32700, "Parse error"))}\n`);
      continue;
    }
    if (!isJsonRpcRequest(value)) {
      output.write(`${JSON.stringify(rpcError(null, -32600, "Invalid Request"))}\n`);
      continue;
    }
    const request = value;
    if (!("id" in request)) continue;
    try {
      let result: unknown;
      if (request.method === "initialize") {
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: service.serverInfo ?? { name: "utsu-ri-review", version: "0.2.0" }
        };
      } else if (request.method === "ping") result = {};
      else if (request.method === "tools/list")
        result = { tools: service.toolDefinitions ?? toolDefinitions };
      else if (request.method === "tools/call") {
        const params = exactArguments(request.params, ["name"], ["arguments"]);
        if (typeof params.name !== "string") {
          serviceError("MCP_TOOL_INVALID", "MCP tool name is invalid");
        }
        try {
          const data = await service.callTool(params.name, params.arguments ?? {});
          result = {
            content: [{ type: "text", text: JSON.stringify(data) }],
            structuredContent: data,
            isError: false
          };
        } catch (error) {
          if (!service.structuredToolErrors) throw error;
          const normalized = toUtsuriError(error);
          const data = {
            ok: false,
            error: { id: normalized.diagnosticId, message: normalized.message }
          };
          result = {
            content: [{ type: "text", text: JSON.stringify(data) }],
            structuredContent: data,
            isError: true
          };
        }
      } else {
        output.write(`${JSON.stringify(rpcError(request.id, -32601, "Method not found"))}\n`);
        continue;
      }
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review MCP request failed";
      output.write(`${JSON.stringify(rpcError(request.id, -32602, message))}\n`);
    }
  }
}

export { toolDefinitions as reviewMcpToolDefinitions };
export {
  assertSafeRegistrationRunPath,
  maximumRegistrationEntries,
  mcpRegistrationDirectory,
  readMcpRunRegistrations,
  registerMcpRun,
  type RegisterMcpRunResult
} from "./run-registry";
