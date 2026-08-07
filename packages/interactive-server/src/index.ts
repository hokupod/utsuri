import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { platform } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { validateReportDirectory } from "@utsu-ri/report-builder";
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
}): void {
  if (input.origin !== input.expectedOrigin)
    throw new Error("Interactive request origin is invalid");
  if (input.reportId !== input.expectedReportId) {
    throw new Error("Interactive request report binding is invalid");
  }
  if (!equalToken(input.capabilityToken, input.expectedCapabilityToken)) {
    throw new Error("Interactive request capability is invalid");
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
