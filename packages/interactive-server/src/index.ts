import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { platform } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { realpath } from "node:fs/promises";
import { canonicalJson, ExitCode, UtsuriError } from "@utsu-ri/core";
import { validateReportDirectory } from "@utsu-ri/report-builder";
import {
  assertArtifact,
  type OriginSessionBinding,
  type UtsuriReport
} from "@utsu-ri/report-model";
import {
  getFeedbackBatch,
  previewFeedbackBatch,
  readReviewInbox,
  storeFeedbackBatch,
  type FeedbackDeliveryMode
} from "@utsu-ri/review-inbox";
import {
  createHumanComment,
  createReviewBundle,
  findAnchor,
  loadReviewStore,
  persistReviewStore,
  resolveThread,
  setAgentAttention,
  setJudgment,
  setViewed,
  type HumanJudgment,
  type ReviewAnchor,
  type ReviewStore,
  type ReviewThreadKind
} from "@utsu-ri/review-state";
import {
  interactiveReportCsp,
  parseBoundedJson,
  readContainedRegularFile,
  reportSecurityHeaders,
  staticReportCsp
} from "../../security/src";

export type ViewerMode = "interactive" | "static";

const staticCspMeta = `<meta http-equiv="Content-Security-Policy" content="${staticReportCsp}">`;
const interactiveCspMeta = `<meta http-equiv="Content-Security-Policy" content="${interactiveReportCsp}">`;

export function viewerSecurityHeaders(mode: ViewerMode): Readonly<Record<string, string>> {
  return Object.freeze({
    ...reportSecurityHeaders,
    "content-security-policy": mode === "interactive" ? interactiveReportCsp : staticReportCsp
  });
}

export function viewerDocument(document: string, mode: ViewerMode): string {
  const first = document.indexOf(staticCspMeta);
  if (first === -1 || document.indexOf(staticCspMeta, first + staticCspMeta.length) !== -1) {
    throw new Error("Viewer document must contain exactly one canonical static CSP boundary");
  }
  return mode === "interactive"
    ? `${document.slice(0, first)}${interactiveCspMeta}${document.slice(first + staticCspMeta.length)}`
    : document;
}

function equalToken(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function assertInteractiveMutationBoundary(input: {
  origin: string | null;
  expectedOrigin: string;
  reportId: string;
  expectedReportId: string;
  capabilityToken: string;
  expectedCapabilityToken: string;
  schemaValid: boolean;
  fetchSite?: string | null;
}): void {
  if (input.origin !== input.expectedOrigin)
    throw new Error("Interactive request origin is invalid");
  if (input.reportId !== input.expectedReportId) {
    throw new Error("Interactive request report binding is invalid");
  }
  if (!equalToken(input.capabilityToken, input.expectedCapabilityToken)) {
    throw new Error("Interactive request capability is invalid");
  }
  if (input.fetchSite !== undefined && input.fetchSite !== "same-origin") {
    throw new Error("Interactive request Fetch Metadata is invalid");
  }
  if (!input.schemaValid) throw new Error("Interactive request schema is invalid");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"]
]);

export interface StaticReportServerOptions {
  host?: "127.0.0.1" | "::1" | string;
  openBrowser?: boolean;
}

export interface StaticReportServer {
  host: "127.0.0.1" | "::1";
  port: number;
  origin: string;
  url: string;
  close(): Promise<void>;
}

export interface InteractiveReportServer extends StaticReportServer {
  mode: "interactive";
  capabilityToken: string;
}

export interface InteractiveReportServerOptions extends StaticReportServerOptions {
  originBinding: OriginSessionBinding;
}

function serverError(id: string, message: string): UtsuriError {
  return new UtsuriError(id, message, ExitCode.Security);
}

function requestPathname(requestUrl: string | undefined): string | null {
  if (!requestUrl || requestUrl.length > 8_192) return null;
  const rawPath = requestUrl.split(/[?#]/u, 1)[0] ?? "";
  if (/%(?:00|2e|2f|5c)/iu.test(rawPath)) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\\") || pathname.includes("\0")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!relative || path.posix.normalize(relative) !== relative || relative.startsWith("../")) {
    return null;
  }
  return relative;
}

function applyHeaders(response: ServerResponse, mode: ViewerMode): void {
  for (const [name, value] of Object.entries(viewerSecurityHeaders(mode))) {
    response.setHeader(name, value);
  }
  response.setHeader("cache-control", "no-store");
}

async function readReportAsset(reportDirectory: string, relative: string): Promise<Buffer> {
  return readContainedRegularFile(reportDirectory, relative, {
    maximumBytes: 64 * 1024 * 1024
  });
}

async function openReportUrl(url: string): Promise<void> {
  const command = platform() === "darwin" ? "open" : platform() === "linux" ? "xdg-open" : null;
  if (!command) {
    throw new UtsuriError(
      "SERVE_OPEN_UNAVAILABLE",
      "Opening the report is unsupported on this platform",
      ExitCode.Environment
    );
  }
  const child = spawn(command, [url], { shell: false, stdio: "ignore", detached: true });
  await Promise.race([
    once(child, "spawn"),
    once(child, "error").then(([error]) => Promise.reject(error as Error))
  ]);
  child.unref();
}

export async function startStaticReportServer(
  reportDirectory: string,
  options: StaticReportServerOptions = {}
): Promise<StaticReportServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw serverError("SERVE_NON_LOOPBACK", "Report serving is restricted to loopback");
  }
  const validation = await validateReportDirectory(reportDirectory, { strict: true });
  if (!validation.ok) {
    throw new UtsuriError("SERVE_REPORT_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const manifest = parseBoundedJson(
    (await readReportAsset(reportDirectory, "manifest.json")).toString("utf8"),
    { label: "report manifest", maximumBytes: 16 * 1024 * 1024 }
  ) as { assetHashes?: unknown };
  if (
    typeof manifest.assetHashes !== "object" ||
    manifest.assetHashes === null ||
    Array.isArray(manifest.assetHashes)
  ) {
    throw new UtsuriError(
      "SERVE_MANIFEST_INVALID",
      "Report manifest asset inventory is invalid",
      ExitCode.Artifact
    );
  }
  const allowedAssets = new Set(["manifest.json", ...Object.keys(manifest.assetHashes)]);

  let expectedHostHeader = "";
  const server = createServer(async (request, response) => {
    applyHeaders(response, "static");
    if (request.headers.host !== expectedHostHeader) {
      response.statusCode = 421;
      response.end("Misdirected request\n");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("allow", "GET, HEAD");
      response.end("Method not allowed\n");
      return;
    }
    const relative = requestPathname(request.url);
    if (!relative || !allowedAssets.has(relative)) {
      response.statusCode = 404;
      response.end("Not found\n");
      return;
    }
    try {
      let bytes = await readReportAsset(reportDirectory, relative);
      if (relative === "index.html") {
        bytes = Buffer.from(viewerDocument(bytes.toString("utf8"), "static"));
      }
      response.statusCode = 200;
      response.setHeader(
        "content-type",
        contentTypes.get(path.extname(relative)) ?? "application/octet-stream"
      );
      response.setHeader("content-length", String(bytes.byteLength));
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.statusCode = 404;
      response.end("Not found\n");
    }
  });

  try {
    server.listen(0, host);
    await once(server, "listening");
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Loopback server did not expose a TCP address");
  }
  const origin = `http://${host === "::1" ? `[${host}]` : host}:${address.port}`;
  expectedHostHeader = `${host === "::1" ? `[${host}]` : host}:${address.port}`;
  const url = `${origin}/`;
  if (options.openBrowser) {
    try {
      await openReportUrl(url);
    } catch (error) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw error;
    }
  }

  return {
    host,
    port: address.port,
    origin,
    url,
    async close() {
      if (!server.listening) return;
      server.closeAllConnections();
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve()
        );
      });
    }
  };
}

function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return Array.isArray(value) ? null : (value ?? null);
}

function bearerToken(request: IncomingMessage): string {
  const authorization = headerValue(request, "authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/u);
  return match?.[1] ?? "";
}

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", String(bytes.byteLength));
  response.end(bytes);
}

async function requestJson(request: IncomingMessage, maximumBytes = 1024 * 1024): Promise<unknown> {
  const contentType = headerValue(request, "content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw serverError("INTERACTIVE_CONTENT_TYPE", "Interactive JSON content type is required");
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      throw serverError("INTERACTIVE_BODY_LIMIT", "Interactive request exceeds its byte limit");
    }
    chunks.push(value);
  }
  return parseBoundedJson(Buffer.concat(chunks).toString("utf8"), {
    label: "interactive request",
    maximumBytes
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
}

function requireInteractiveBoundary(
  request: IncomingMessage,
  expectedOrigin: string,
  reportId: string,
  capabilityToken: string,
  schemaValid: boolean
): void {
  try {
    const suppliedOrigin = headerValue(request, "origin");
    const referer = headerValue(request, "referer");
    let effectiveOrigin = suppliedOrigin;
    if (effectiveOrigin === null && (request.method === "GET" || request.method === "HEAD")) {
      try {
        const refererMatches = referer === null || new URL(referer).origin === expectedOrigin;
        effectiveOrigin =
          headerValue(request, "sec-fetch-site") === "same-origin" && refererMatches
            ? expectedOrigin
            : null;
      } catch {
        effectiveOrigin = null;
      }
    }
    assertInteractiveMutationBoundary({
      origin: effectiveOrigin,
      expectedOrigin,
      reportId: headerValue(request, "x-utsuri-report-id") ?? "",
      expectedReportId: reportId,
      capabilityToken: bearerToken(request),
      expectedCapabilityToken: capabilityToken,
      schemaValid,
      fetchSite: headerValue(request, "sec-fetch-site")
    });
  } catch {
    throw serverError(
      "INTERACTIVE_BOUNDARY_REJECTED",
      "Interactive request authentication or origin binding is invalid"
    );
  }
}

function anchorFromAction(store: ReviewStore, action: Record<string, unknown>): ReviewAnchor {
  const input = action.anchor;
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["type", "ref", "fingerprint"]) ||
    typeof input.type !== "string" ||
    typeof input.ref !== "string" ||
    typeof input.fingerprint !== "string"
  ) {
    throw serverError("INTERACTIVE_ANCHOR_INVALID", "Interactive review anchor is invalid");
  }
  const anchor = findAnchor(store.anchorCatalog, input.type as ReviewAnchor["type"], input.ref);
  if (!anchor || anchor.fingerprint !== input.fingerprint) {
    throw serverError("INTERACTIVE_ANCHOR_STALE", "Interactive review anchor is stale");
  }
  return anchor;
}

async function applyReviewMutation(
  store: ReviewStore,
  body: Record<string, unknown>,
  updatedAt: string
): Promise<ReviewStore> {
  const action = body.action;
  if (!isRecord(action) || typeof action.type !== "string") {
    throw serverError("INTERACTIVE_ACTION_INVALID", "Interactive review action is invalid");
  }
  if (action.type === "viewed.changed") {
    if (
      !hasExactKeys(action, ["type", "anchor", "viewState"]) ||
      !new Set(["unseen", "viewed"]).has(String(action.viewState))
    ) {
      throw serverError("INTERACTIVE_ACTION_INVALID", "Viewed action is invalid");
    }
    return setViewed(
      store,
      anchorFromAction(store, action),
      action.viewState as "unseen" | "viewed",
      updatedAt
    );
  }
  if (action.type === "judgment.changed") {
    if (
      !hasExactKeys(action, ["type", "changeId", "judgmentState"]) ||
      typeof action.changeId !== "string" ||
      !new Set(["unreviewed", "reviewed", "follow-up", "blocked"]).has(String(action.judgmentState))
    ) {
      throw serverError("INTERACTIVE_ACTION_INVALID", "Judgment action is invalid");
    }
    return setJudgment(
      store,
      action.changeId,
      action.judgmentState as Exclude<HumanJudgment, "stale">,
      updatedAt
    );
  }
  if (action.type === "thread.created") {
    if (
      !hasExactKeys(action, ["type", "anchor", "body", "kind"], ["requestAgentAttention"]) ||
      typeof action.body !== "string" ||
      !new Set(["note", "question", "finding", "change-request"]).has(String(action.kind)) ||
      (action.requestAgentAttention !== undefined &&
        typeof action.requestAgentAttention !== "boolean")
    ) {
      throw serverError("INTERACTIVE_ACTION_INVALID", "Comment action is invalid");
    }
    return createHumanComment(
      store,
      anchorFromAction(store, action),
      action.body,
      action.kind as ReviewThreadKind,
      updatedAt,
      undefined,
      action.requestAgentAttention === true
    );
  }
  if (action.type === "agent-attention.changed") {
    if (
      !hasExactKeys(action, ["type", "threadId", "requested"]) ||
      typeof action.threadId !== "string" ||
      typeof action.requested !== "boolean"
    ) {
      throw serverError("INTERACTIVE_ACTION_INVALID", "Agent attention action is invalid");
    }
    return setAgentAttention(store, action.threadId, action.requested, updatedAt);
  }
  if (action.type === "thread.resolved") {
    if (!hasExactKeys(action, ["type", "threadId"]) || typeof action.threadId !== "string") {
      throw serverError("INTERACTIVE_ACTION_INVALID", "Resolve action is invalid");
    }
    return resolveThread(store, action.threadId, updatedAt);
  }
  throw serverError("INTERACTIVE_ACTION_INVALID", "Interactive review action is unsupported");
}

function apiErrorStatus(error: unknown): number {
  const diagnostic = error instanceof UtsuriError ? error.diagnosticId : "";
  if (diagnostic.includes("MISSING")) return 404;
  if (diagnostic.includes("CONFLICT") || diagnostic.includes("DUPLICATE")) return 409;
  if (error instanceof UtsuriError && error.exitCode === ExitCode.Arguments) return 400;
  if (error instanceof UtsuriError && error.exitCode === ExitCode.Security) return 403;
  return 422;
}

function apiErrorBody(error: unknown): Record<string, unknown> {
  if (error instanceof UtsuriError) {
    return {
      ok: false,
      error: { id: error.diagnosticId, message: error.message, exitCode: error.exitCode }
    };
  }
  return {
    ok: false,
    error: {
      id: "INTERACTIVE_REQUEST_REJECTED",
      message: error instanceof Error ? error.message : "Interactive request was rejected"
    }
  };
}

export async function startInteractiveReportServer(
  reportDirectory: string,
  options: InteractiveReportServerOptions
): Promise<InteractiveReportServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw serverError("SERVE_NON_LOOPBACK", "Interactive report serving is restricted to loopback");
  }
  const canonicalReport = await realpath(reportDirectory);
  const runDirectory = await realpath(path.dirname(canonicalReport));
  if (
    path.basename(canonicalReport) !== "report" ||
    path.dirname(canonicalReport) !== runDirectory
  ) {
    throw serverError(
      "SERVE_RUN_BINDING",
      "Interactive serving requires the immutable report directory directly under its run"
    );
  }
  const validation = await validateReportDirectory(canonicalReport, { strict: true });
  if (!validation.ok) {
    throw new UtsuriError("SERVE_REPORT_INVALID", validation.errors.join("; "), ExitCode.Artifact);
  }
  const report = parseBoundedJson(
    (await readReportAsset(canonicalReport, "report.json")).toString("utf8"),
    { label: "report", maximumBytes: 32 * 1024 * 1024 }
  ) as UtsuriReport;
  assertArtifact("origin-session", options.originBinding);
  const manifest = parseBoundedJson(
    (await readReportAsset(canonicalReport, "manifest.json")).toString("utf8"),
    { label: "report manifest", maximumBytes: 16 * 1024 * 1024 }
  ) as {
    reportId?: unknown;
    assetHashes?: unknown;
    source?: { base?: string | null; head?: string | null };
  };
  if (
    manifest.reportId !== report.reportId ||
    options.originBinding.reportId !== report.reportId ||
    options.originBinding.bindingMode === "unbound" ||
    canonicalJson(options.originBinding) !== canonicalJson(report.origin) ||
    !isRecord(manifest.assetHashes)
  ) {
    throw new UtsuriError(
      "SERVE_REPORT_BINDING",
      "Interactive report, manifest, and Origin Session binding do not match",
      ExitCode.Artifact
    );
  }
  const allowedAssets = new Set(["manifest.json", ...Object.keys(manifest.assetHashes)]);
  const capabilityToken = randomBytes(32).toString("base64url");
  const sseClients = new Set<ServerResponse>();
  let expectedHostHeader = "";
  let origin = "";
  let observedRevision = (
    await loadReviewStore(runDirectory, report, options.originBinding.createdAt)
  ).state.revision;
  let revisionPollActive = false;
  let mutationQueue: Promise<void> = Promise.resolve();
  const enqueue = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const load = () => loadReviewStore(runDirectory, report, options.originBinding.createdAt);
  const notify = (event: unknown): void => {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) client.write(message);
  };
  const pollRevision = async (): Promise<void> => {
    if (revisionPollActive || sseClients.size === 0) return;
    revisionPollActive = true;
    try {
      const store = await load();
      if (store.state.revision !== observedRevision) {
        observedRevision = store.state.revision;
        notify({
          type: "review.updated",
          reportId: report.reportId,
          revision: observedRevision
        });
      }
    } finally {
      revisionPollActive = false;
    }
  };
  const revisionPoller = setInterval(() => void pollRevision().catch(() => undefined), 500);
  revisionPoller.unref();

  const server = createServer(async (request, response) => {
    const pathname = requestPathname(request.url);
    const api = Boolean(pathname?.startsWith("api/v1/"));
    applyHeaders(response, "interactive");
    if (request.headers.host !== expectedHostHeader) {
      response.statusCode = 421;
      response.end("Misdirected request\n");
      return;
    }
    if (!api) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.statusCode = 405;
        response.setHeader("allow", "GET, HEAD");
        response.end("Method not allowed\n");
        return;
      }
      if (!pathname || !allowedAssets.has(pathname)) {
        response.statusCode = 404;
        response.end("Not found\n");
        return;
      }
      try {
        let bytes = await readReportAsset(canonicalReport, pathname);
        if (pathname === "index.html") {
          bytes = Buffer.from(viewerDocument(bytes.toString("utf8"), "interactive"));
        }
        response.statusCode = 200;
        response.setHeader(
          "content-type",
          contentTypes.get(path.extname(pathname)) ?? "application/octet-stream"
        );
        response.setHeader("content-length", String(bytes.byteLength));
        response.end(request.method === "HEAD" ? undefined : bytes);
      } catch {
        response.statusCode = 404;
        response.end("Not found\n");
      }
      return;
    }

    try {
      requireInteractiveBoundary(request, origin, report.reportId, capabilityToken, true);
      if (pathname === "api/v1/review-state" && request.method === "GET") {
        const store = await load();
        jsonResponse(response, 200, {
          ok: true,
          reportId: report.reportId,
          state: store.state,
          threads: store.threads,
          inbox: readReviewInbox(store)
        });
        return;
      }
      if (pathname === "api/v1/review-events" && request.method === "POST") {
        const body = await requestJson(request);
        if (
          !isRecord(body) ||
          !hasExactKeys(body, ["schemaVersion", "reportId", "expectedRevision", "action"]) ||
          body.schemaVersion !== "1.0" ||
          body.reportId !== report.reportId ||
          !Number.isSafeInteger(body.expectedRevision)
        ) {
          throw serverError("INTERACTIVE_SCHEMA_INVALID", "Review mutation schema is invalid");
        }
        const next = await enqueue(async () => {
          const store = await load();
          if (store.state.revision !== body.expectedRevision) {
            throw new UtsuriError(
              "REVIEW_REVISION_CONFLICT",
              "Review state changed before this mutation",
              ExitCode.Artifact
            );
          }
          const changed = await applyReviewMutation(store, body, new Date().toISOString());
          if (changed.state.revision !== store.state.revision) {
            await persistReviewStore(runDirectory, changed, store.state.revision);
            observedRevision = changed.state.revision;
            notify(changed.events.at(-1));
          }
          return changed;
        });
        jsonResponse(response, 200, {
          ok: true,
          state: next.state,
          threads: next.threads,
          inbox: readReviewInbox(next),
          event: next.events.at(-1) ?? null
        });
        return;
      }
      if (pathname === "api/v1/feedback-batches/preview" && request.method === "POST") {
        const body = await requestJson(request);
        if (
          !isRecord(body) ||
          !hasExactKeys(
            body,
            ["schemaVersion", "reportId", "expectedRevision"],
            ["deliveryMode"]
          ) ||
          body.schemaVersion !== "1.0" ||
          body.reportId !== report.reportId ||
          !Number.isSafeInteger(body.expectedRevision) ||
          (body.deliveryMode !== undefined &&
            !new Set(["return-to-session", "export-only", "direct-same-session"]).has(
              String(body.deliveryMode)
            ))
        ) {
          throw serverError("INTERACTIVE_SCHEMA_INVALID", "Feedback preview schema is invalid");
        }
        const store = await load();
        if (store.state.revision !== body.expectedRevision) {
          throw new UtsuriError(
            "REVIEW_REVISION_CONFLICT",
            "Review state changed before preview",
            ExitCode.Artifact
          );
        }
        const preview = await previewFeedbackBatch(store, options.originBinding, {
          createdAt: new Date().toISOString(),
          deliveryMode: body.deliveryMode as FeedbackDeliveryMode | undefined,
          directBridgeAvailable: false,
          baseSha: manifest.source?.base,
          headSha: manifest.source?.head
        });
        jsonResponse(response, 200, { ok: true, preview });
        return;
      }
      if (pathname === "api/v1/feedback-batches" && request.method === "POST") {
        const body = await requestJson(request);
        if (
          !isRecord(body) ||
          !hasExactKeys(
            body,
            ["schemaVersion", "reportId", "expectedRevision", "idempotencyKey"],
            ["deliveryMode"]
          ) ||
          body.schemaVersion !== "1.0" ||
          body.reportId !== report.reportId ||
          !Number.isSafeInteger(body.expectedRevision) ||
          typeof body.idempotencyKey !== "string" ||
          (body.deliveryMode !== undefined &&
            !new Set(["return-to-session", "export-only", "direct-same-session"]).has(
              String(body.deliveryMode)
            ))
        ) {
          throw serverError("INTERACTIVE_SCHEMA_INVALID", "Feedback Batch schema is invalid");
        }
        const stored = await enqueue(async () => {
          const store = await load();
          const result = await storeFeedbackBatch(store, options.originBinding, {
            idempotencyKey: body.idempotencyKey as string,
            createdAt: new Date().toISOString(),
            deliveryMode: body.deliveryMode as FeedbackDeliveryMode | undefined,
            directBridgeAvailable: false,
            baseSha: manifest.source?.base,
            headSha: manifest.source?.head
          });
          if (result.created) {
            if (store.state.revision !== body.expectedRevision) {
              throw new UtsuriError(
                "REVIEW_REVISION_CONFLICT",
                "Review state changed before Feedback Batch storage",
                ExitCode.Artifact
              );
            }
            await persistReviewStore(runDirectory, result.store, store.state.revision);
            observedRevision = result.store.state.revision;
            notify(result.store.events.at(-1));
          }
          return result;
        });
        jsonResponse(response, stored.created ? 201 : 200, {
          ok: true,
          created: stored.created,
          batch: stored.preview.batch,
          preview: stored.preview,
          state: stored.store.state,
          threads: stored.store.threads,
          inbox: readReviewInbox(stored.store)
        });
        return;
      }
      const batchMatch = pathname?.match(/^api\/v1\/feedback-batches\/(fb[-:][a-zA-Z0-9_-]+)$/u);
      if (batchMatch && request.method === "GET") {
        const store = await load();
        jsonResponse(response, 200, {
          ok: true,
          batch: getFeedbackBatch(store, batchMatch[1]!)
        });
        return;
      }
      if (pathname === "api/v1/review/export" && request.method === "POST") {
        const body = await requestJson(request);
        if (
          !isRecord(body) ||
          !hasExactKeys(body, ["schemaVersion", "reportId", "expectedRevision"]) ||
          body.schemaVersion !== "1.0" ||
          body.reportId !== report.reportId ||
          !Number.isSafeInteger(body.expectedRevision)
        ) {
          throw serverError("INTERACTIVE_SCHEMA_INVALID", "Review export schema is invalid");
        }
        const store = await load();
        if (store.state.revision !== body.expectedRevision) {
          throw new UtsuriError(
            "REVIEW_REVISION_CONFLICT",
            "Review state changed before export",
            ExitCode.Artifact
          );
        }
        jsonResponse(
          response,
          200,
          createReviewBundle(
            store,
            { base: manifest.source?.base ?? null, head: manifest.source?.head ?? null },
            new Date().toISOString()
          )
        );
        return;
      }
      if (pathname === "api/v1/events" && request.method === "GET") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream; charset=utf-8");
        response.setHeader("connection", "keep-alive");
        response.setHeader("x-accel-buffering", "no");
        response.flushHeaders();
        response.write(`data: ${JSON.stringify({ type: "ready", reportId: report.reportId })}\n\n`);
        sseClients.add(response);
        request.once("close", () => sseClients.delete(response));
        return;
      }
      response.statusCode = 404;
      response.end("Not found\n");
    } catch (error) {
      jsonResponse(response, apiErrorStatus(error), apiErrorBody(error));
    }
  });

  try {
    server.listen(0, host);
    await once(server, "listening");
  } catch (error) {
    clearInterval(revisionPoller);
    server.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") {
    clearInterval(revisionPoller);
    server.close();
    throw new Error("Loopback server did not expose a TCP address");
  }
  origin = `http://${host === "::1" ? `[${host}]` : host}:${address.port}`;
  expectedHostHeader = `${host === "::1" ? `[${host}]` : host}:${address.port}`;
  const url = `${origin}/#token=${encodeURIComponent(capabilityToken)}`;
  if (options.openBrowser) {
    try {
      await openReportUrl(url);
    } catch (error) {
      clearInterval(revisionPoller);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw error;
    }
  }
  return {
    mode: "interactive",
    host,
    port: address.port,
    origin,
    url,
    capabilityToken,
    async close() {
      clearInterval(revisionPoller);
      for (const client of sseClients) client.end();
      sseClients.clear();
      if (!server.listening) return;
      server.closeAllConnections();
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve()
        );
      });
    }
  };
}
