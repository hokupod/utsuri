import { createServer, type Server } from "node:http";
import { copyFile, mkdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../packages/capture/src/browser";
import type { UtsuriConfig } from "../../packages/report-model/src";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function approvedBrowserAvailable(): Promise<boolean> {
  try {
    await resolveBrowserExecutable();
    return true;
  } catch {
    return false;
  }
}

export async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate a loopback port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

export async function assertPortReleased(port: number): Promise<void> {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

export async function startFixtureServer(
  port: number,
  variant: string,
  options: { network?: boolean; redirectUrl?: string; webSocket?: boolean } = {}
): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.method === "POST") {
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/redirect-external" && options.redirectUrl) {
      response.writeHead(302, { location: options.redirectUrl }).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="en"><body>
        <main data-app-ready data-testid="root">
          <h1>${variant}</h1><time data-dynamic></time>
          <button type="button">Menu</button>
          <a href="https://user:password@example.test/private?token=secret#fragment">Private link</a>
          <a href="//user:password@example.test/protocol?token=relative#fragment">Protocol link</a>
          <a href="/callback?token=root#fragment">Callback link</a>
          <dialog aria-label="Navigation"><p data-testid="status">Ready</p></dialog>
        </main>
        <script>
          document.querySelector("time").textContent = new Date().toISOString();
          console.log("Loaded https://user:password@example.test/private?token=secret#fragment");
          console.log("Protocol //user:password@example.test/protocol?token=relative#fragment");
          console.log("Callback /callback?token=root#fragment");
          console.log("OAuth oauth/callback?code=bare#fragment");
          console.log("Asset asset@2x.png?token=filename#fragment");
          console.log("Parenthesized asset(v2).png?token=parenthesized#fragment");
          console.log("Query ?access_token=query-only");
          console.log("Fragment #access_token=fragment-only");
          document.querySelector("button").addEventListener("click", () => {
            document.querySelector("dialog").showModal();
          });
          ${
            options.network
              ? `fetch("http://127.0.0.1:9/external").catch(() => {}); fetch("/mutate", {method: "POST", body: "blocked"}).catch(() => {}); ${options.redirectUrl ? 'fetch("/redirect-external").catch(() => {});' : ""}`
              : ""
          }
          ${options.webSocket ? 'new WebSocket("ws://127.0.0.1:9/external?token=hidden");' : ""}
        </script>
      </body></html>`);
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

export async function stopFixtureServer(server: Server): Promise<void> {
  if (!server.listening) return;
  server.closeAllConnections();
  server.closeIdleConnections();
  server.unref();
  await Promise.race([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 500))
  ]);
}

export async function prepareWorktreeFixture(
  root: string,
  source: string
): Promise<{ before: string; after: string }> {
  const before = path.join(root, "before");
  const after = path.join(root, "after");
  await Promise.all([mkdir(before), mkdir(after)]);
  await Promise.all([
    copyFile(source, path.join(before, path.basename(source))),
    copyFile(source, path.join(after, path.basename(source)))
  ]);
  return { before, after };
}

export function captureConfig(options: {
  mode: "dual-url" | "worktree" | "static-fragment";
  beforePort?: number;
  afterPort?: number;
  beforeCommand?: string[];
  afterCommand?: string[];
  beforeCwd?: string;
  afterCwd?: string;
  fragments?: { before: string; after: string };
  networkOrigins?: string[];
}): UtsuriConfig {
  const beforeUrl = `http://127.0.0.1:${options.beforePort ?? 4173}/`;
  const afterUrl = `http://127.0.0.1:${options.afterPort ?? 4174}/`;
  return {
    version: 1,
    project: { name: "capture-fixture", locale: "en-US" },
    diff: { base: "HEAD", head: "worktree" },
    execution: {
      mode: options.mode,
      trust: options.mode === "worktree" ? "trusted" : "configured",
      install: "never",
      shell: false,
      timeoutMs: 10_000
    },
    ...(options.mode === "static-fragment"
      ? {}
      : {
          servers: {
            before: {
              ...(options.beforeCommand ? { command: options.beforeCommand } : {}),
              ...(options.beforeCwd ? { cwd: options.beforeCwd } : {}),
              readyUrl: beforeUrl,
              readySelector: "[data-app-ready]",
              shutdownTimeoutMs: 2000
            },
            after: {
              ...(options.afterCommand ? { command: options.afterCommand } : {}),
              ...(options.afterCwd ? { cwd: options.afterCwd } : {}),
              readyUrl: afterUrl,
              readySelector: "[data-app-ready]",
              shutdownTimeoutMs: 2000
            }
          }
        }),
    browser: {
      engine: "chromium",
      headless: true,
      serviceWorkers: "block",
      locale: "en-US",
      timezone: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce"
    },
    viewports: { test: { width: 640, height: 480, deviceScaleFactor: 1 } },
    targets: [
      {
        id: "home",
        path: "/",
        viewports: ["test"],
        roots: ["main"],
        ...(options.fragments ? { fragments: options.fragments } : {}),
        states: [
          {
            name: "default",
            steps:
              options.mode === "static-fragment"
                ? []
                : [
                    {
                      click: {
                        locator: { by: "role", role: "button", name: "Menu" }
                      }
                    },
                    {
                      assertVisible: {
                        locator: { by: "role", role: "dialog", name: "Navigation" }
                      }
                    },
                    {
                      assertText: {
                        locator: { by: "testId", testId: "status" },
                        expected: "Ready",
                        exact: true
                      }
                    }
                  ]
          }
        ]
      }
    ],
    stabilization: {
      disableAnimations: true,
      hideCaret: true,
      waitForFonts: true,
      freezeTime: "2026-01-01T00:00:00.000Z",
      waitAfterReadyMs: 50,
      maxRetries: 1,
      masks: [{ selector: "[data-dynamic]", reason: "timestamp" }]
    },
    network: {
      browserPolicy: "block-external",
      allowedOrigins:
        options.networkOrigins ??
        (options.mode === "static-fragment"
          ? []
          : [new URL(beforeUrl).origin, new URL(afterUrl).origin]),
      blockMethods: ["POST", "PUT", "PATCH", "DELETE"],
      recordBlocked: true
    },
    security: {
      envAllowlist: ["NODE_ENV"],
      followSymlinks: false,
      allowArbitraryScriptSteps: false,
      allowRemoteAuthState: false,
      sanitizeHtmlPreview: true
    },
    capture: {
      fullPage: true,
      elementCrops: true,
      maxFullPageHeight: 30000,
      maxMegapixels: 80,
      screenshotFormat: "png",
      includeDom: "normalized",
      includeRawDom: false,
      includeAria: true,
      includeComputedStyles: "changed-and-layout",
      includeAxe: true
    },
    report: {
      outputDirectory: ".artifacts/utsuri",
      singleFile: false,
      includeAbsolutePaths: false
    },
    review: { enabled: true, autoResolveAgentAnswer: false },
    feedback: {
      target: "origin-session",
      delivery: "return-to-session",
      neverCreateNewSession: true
    },
    policy: { failOn: [], warnOn: [] }
  } as unknown as UtsuriConfig;
}
