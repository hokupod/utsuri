import type { BrowserContext, CDPSession, Page, Request, Response, Route } from "playwright-core";

export interface NetworkEvidenceEntry {
  method: string;
  url: string;
  resourceType: string;
  status: number | null;
  disposition: "allowed" | "blocked" | "failed";
  reason: string | null;
}

export interface NetworkRecorder {
  entries(): NetworkEvidenceEntry[];
  blockedCount(): number;
  attachPage(page: Page): Promise<void>;
  dispose(): Promise<void>;
}

interface PausedResponse {
  requestId: string;
  request: {
    method: string;
    url: string;
  };
  resourceType?: string;
  responseStatusCode?: number;
  responseHeaders?: Array<{ name: string; value: string }>;
}

function normalizedUrl(input: string): string {
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "invalid-url";
  }
}

function isLocalDocumentScheme(url: URL): boolean {
  return new Set(["about:", "blob:", "data:"]).has(url.protocol);
}

function requestPolicyOrigin(url: URL): string {
  if (url.protocol === "ws:") return `http://${url.host}`;
  if (url.protocol === "wss:") return `https://${url.host}`;
  return url.origin;
}

export async function installNetworkPolicy(
  context: BrowserContext,
  options: {
    allowedOrigins: readonly string[];
    blockMethods: readonly string[];
    blockAllHttp?: boolean;
  }
): Promise<NetworkRecorder> {
  const allowedOrigins = new Set(options.allowedOrigins.map((origin) => new URL(origin).origin));
  const blockedMethods = new Set(options.blockMethods.map((method) => method.toUpperCase()));
  const evidence: NetworkEvidenceEntry[] = [];
  const sessions = new Set<CDPSession>();
  const attachments = new Map<Page, Promise<void>>();
  const pendingResponses = new Set<Promise<void>>();

  const redirectReason = (input: string): "external-redirect" | "invalid-redirect" | null => {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      return "invalid-redirect";
    }
    if (isLocalDocumentScheme(parsed)) return null;
    return options.blockAllHttp || !allowedOrigins.has(requestPolicyOrigin(parsed))
      ? "external-redirect"
      : null;
  };

  const handlePausedResponse = async (session: CDPSession, event: PausedResponse) => {
    const status = event.responseStatusCode;
    const location = event.responseHeaders?.find(
      (header) => header.name.toLowerCase() === "location"
    )?.value;
    if (!status || status < 300 || status >= 400 || !location) {
      await session.send("Fetch.continueResponse", { requestId: event.requestId });
      return;
    }

    let redirectUrl: string;
    try {
      redirectUrl = new URL(location, event.request.url).toString();
    } catch {
      redirectUrl = "invalid-url";
    }
    const reason = redirectReason(redirectUrl);
    if (!reason) {
      await session.send("Fetch.continueResponse", { requestId: event.requestId });
      return;
    }

    evidence.push({
      method: event.request.method.toUpperCase(),
      url: normalizedUrl(redirectUrl),
      resourceType: event.resourceType?.toLowerCase() ?? "other",
      status,
      disposition: "blocked",
      reason
    });
    await session.send("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 502,
      responseHeaders: [
        { name: "cache-control", value: "no-store" },
        { name: "content-type", value: "text/plain; charset=utf-8" }
      ],
      body: Buffer.from("Blocked by Utsuri\n", "utf8").toString("base64")
    });
  };

  const attachPage = async (page: Page): Promise<void> => {
    const existing = attachments.get(page);
    if (existing) return existing;
    const attachment = (async () => {
      const session = await context.newCDPSession(page);
      sessions.add(session);
      session.on("Fetch.requestPaused", (rawEvent: unknown) => {
        const event = rawEvent as PausedResponse;
        const task = handlePausedResponse(session, event)
          .catch(async () => {
            await session
              .send("Fetch.failRequest", {
                requestId: event.requestId,
                errorReason: "BlockedByClient"
              })
              .catch(() => undefined);
          })
          .finally(() => pendingResponses.delete(task));
        pendingResponses.add(task);
      });
      await session.send("Fetch.enable", {
        patterns: [{ urlPattern: "*", requestStage: "Response" }]
      });
    })();
    attachments.set(page, attachment);
    return attachment;
  };

  const onPage = (page: Page) => {
    void attachPage(page).catch(async () => {
      evidence.push({
        method: "GET",
        url: normalizedUrl(page.url()),
        resourceType: "document",
        status: null,
        disposition: "blocked",
        reason: "network-policy-attach-failed"
      });
      await page.close().catch(() => undefined);
    });
  };
  context.on("page", onPage);

  await context.routeWebSocket("**/*", async (webSocket) => {
    let parsed: URL;
    try {
      parsed = new URL(webSocket.url());
    } catch {
      evidence.push({
        method: "GET",
        url: "invalid-url",
        resourceType: "websocket",
        status: null,
        disposition: "blocked",
        reason: "invalid-url"
      });
      await webSocket.close({ code: 1008, reason: "Blocked by Utsuri" });
      return;
    }
    const blocked = options.blockAllHttp || !allowedOrigins.has(requestPolicyOrigin(parsed));
    if (blocked) {
      evidence.push({
        method: "GET",
        url: normalizedUrl(webSocket.url()),
        resourceType: "websocket",
        status: null,
        disposition: "blocked",
        reason: "external-origin"
      });
      await webSocket.close({ code: 1008, reason: "Blocked by Utsuri" });
      return;
    }
    evidence.push({
      method: "GET",
      url: normalizedUrl(webSocket.url()),
      resourceType: "websocket",
      status: null,
      disposition: "allowed",
      reason: null
    });
    webSocket.connectToServer();
  });

  const onRoute = async (route: Route, request: Request) => {
    const method = request.method().toUpperCase();
    let parsed: URL;
    try {
      parsed = new URL(request.url());
    } catch {
      evidence.push({
        method,
        url: "invalid-url",
        resourceType: request.resourceType(),
        status: null,
        disposition: "blocked",
        reason: "invalid-url"
      });
      await route.abort("blockedbyclient");
      return;
    }
    const external =
      !isLocalDocumentScheme(parsed) &&
      (options.blockAllHttp || !allowedOrigins.has(requestPolicyOrigin(parsed)));
    const reason = blockedMethods.has(method)
      ? "mutation-method"
      : external
        ? "external-origin"
        : null;
    if (reason) {
      evidence.push({
        method,
        url: normalizedUrl(request.url()),
        resourceType: request.resourceType(),
        status: null,
        disposition: "blocked",
        reason
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  };
  await context.route("**/*", onRoute);

  const onFinished = async (request: Request) => {
    const response: Response | null = await request.response().catch(() => null);
    evidence.push({
      method: request.method(),
      url: normalizedUrl(request.url()),
      resourceType: request.resourceType(),
      status: response?.status() ?? null,
      disposition: "allowed",
      reason: null
    });
  };
  const onFailed = (request: Request) => {
    if (request.failure()?.errorText.includes("ERR_BLOCKED_BY_CLIENT")) return;
    evidence.push({
      method: request.method(),
      url: normalizedUrl(request.url()),
      resourceType: request.resourceType(),
      status: null,
      disposition: "failed",
      reason: request.failure()?.errorText ?? "request-failed"
    });
  };
  context.on("requestfinished", onFinished);
  context.on("requestfailed", onFailed);

  return {
    entries: () =>
      [...evidence].sort((left, right) =>
        `${left.url}\0${left.method}\0${left.disposition}\0${left.resourceType}`.localeCompare(
          `${right.url}\0${right.method}\0${right.disposition}\0${right.resourceType}`
        )
      ),
    blockedCount: () => evidence.filter((entry) => entry.disposition === "blocked").length,
    attachPage,
    dispose: async () => {
      context.off("page", onPage);
      context.off("requestfinished", onFinished);
      context.off("requestfailed", onFailed);
      await Promise.allSettled([...attachments.values(), ...pendingResponses]);
      await Promise.allSettled(
        [...sessions].map(async (session) => {
          await session.send("Fetch.disable").catch(() => undefined);
          await session.detach().catch(() => undefined);
        })
      );
    }
  };
}
