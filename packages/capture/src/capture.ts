import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import axe from "axe-core";
import { ExitCode, sha256, stableHash, UtsuriError } from "@utsu-ri/core";
import { buildChildEnvironment, resolveContainedPath } from "@utsu-ri/security";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { executeCaptureActions } from "./actions";
import {
  artifactDigests,
  artifactReference,
  createAttemptDirectory,
  publishCaptureManifest,
  writeJsonArtifact
} from "./artifacts";
import { resolveBrowserExecutable } from "./browser";
import { captureCapabilities } from "./capabilities";
import { captureFailure, writeFailureEvidence } from "./failure-evidence";
import { installNetworkPolicy, type NetworkRecorder } from "./network-policy";
import { redactEvidenceValue, redactUrlsInText } from "./redaction";
import { startConfiguredServer, type ServerHandle } from "./server-runtime";
import type {
  CaptureFailure,
  CaptureManifest,
  CaptureRunResult,
  CaptureSide,
  CaptureSideResult,
  CaptureTargetConfiguration,
  CaptureTargetResult,
  NormalizedCaptureConfig,
  ViewportConfiguration
} from "./types";

type ConsoleEvidence = {
  type: string;
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number } | null;
};

type AttemptOutcome = {
  result: CaptureSideResult;
  blockedRequests: number;
};

function safeUrl(input: string): string {
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

function captureResultReferences(result: CaptureSideResult): string[] {
  return [
    ...result.screenshotRefs,
    result.domRef,
    result.ariaRef,
    result.styleRef,
    result.axeRef,
    result.consoleRef,
    result.networkRef,
    result.metadataRef,
    result.failureRef
  ].filter((value): value is string => Boolean(value));
}

function safeCaptureReference(reference: string): boolean {
  return (
    reference.startsWith("capture/") &&
    !reference.includes("\\") &&
    path.posix.normalize(reference) === reference
  );
}

async function artifactsMatch(
  runDirectory: string,
  result: CaptureSideResult,
  expectedDigests: Readonly<Record<string, string>>
): Promise<boolean> {
  if (result.status !== "success") return false;
  const references = captureResultReferences(result);
  if (references.length === 0 || references.some((reference) => !safeCaptureReference(reference))) {
    return false;
  }
  const checks = await Promise.all(
    references.map(async (reference) => {
      const expected = expectedDigests[reference];
      if (!expected || !/^[a-f0-9]{64}$/u.test(expected)) return false;
      try {
        return sha256(await readFile(path.join(runDirectory, reference))) === expected;
      } catch {
        return false;
      }
    })
  );
  return checks.every(Boolean);
}

async function captureConfigurationHash(
  runDirectory: string,
  config: NormalizedCaptureConfig
): Promise<string> {
  const binding: Record<string, string | null> = {};
  for (const name of ["input.json", "diff.json"]) {
    try {
      binding[name] = sha256(await readFile(path.join(runDirectory, name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      binding[name] = null;
    }
  }
  return stableHash({ toolVersion: "0.1.0", config, binding });
}

async function readPreviousManifest(runDirectory: string): Promise<CaptureManifest | null> {
  try {
    const value = JSON.parse(await readFile(path.join(runDirectory, "capture.json"), "utf8")) as
      CaptureManifest | undefined;
    return value?.schemaVersion === "1.0" ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

function sanitizedFragment(input: string): string {
  return input
    .replace(/<(script|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<(script|iframe|object|embed|link|meta|base)\b[^>]*\/?\s*>/giu, "")
    .replace(/\s(?:on[a-z]+|srcdoc|formaction|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(
      /\s(?:src|href)\s*=\s*(?:"(?:https?:)?\/\/[^"]*"|'(?:https?:)?\/\/[^']*'|(?:https?:)?\/\/[^\s>]+)/giu,
      ""
    );
}

async function retryTransient<T>(
  stage: "navigation" | "screenshot",
  maxRetries: 0 | 1,
  operation: () => Promise<T>
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (error instanceof UtsuriError || attempt > maxRetries) throw error;
    }
  }
  throw new Error(`${stage} failed: ${String(lastError)}`);
}

async function addTimeFreeze(context: BrowserContext, freezeTime: string): Promise<void> {
  const timestamp = Date.parse(freezeTime);
  await context.addInitScript(`
    (() => {
      const timestamp = ${JSON.stringify(timestamp)};
      const NativeDate = Date;
      class UtsuriFrozenDate extends NativeDate {
        constructor(...args) {
          super(...(args.length === 0 ? [timestamp] : args));
        }
        static now() { return timestamp; }
      }
      Object.defineProperty(globalThis, "Date", {
        configurable: false,
        writable: false,
        value: UtsuriFrozenDate
      });
    })();
  `);
}

async function normalizeDom(page: Page): Promise<unknown> {
  const normalized = await page.locator("html").evaluate((root) => {
    const visit = (node: Node): unknown => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.replace(/\s+/gu, " ").trim() ?? "";
        return text ? { type: "text", text } : null;
      }
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      if (new Set(["script", "style", "noscript", "template"]).has(tag)) return null;
      const attributes = [...node.attributes]
        .filter(
          (attribute) =>
            !/^on/iu.test(attribute.name) &&
            !/^(?:value|srcdoc)$/iu.test(attribute.name) &&
            !/(?:token|secret|password|cookie|session|auth)/iu.test(attribute.name)
        )
        .map((attribute) => [attribute.name, attribute.value] as const)
        .sort(([left], [right]) => left.localeCompare(right));
      const children = [...node.childNodes].map(visit).filter((child) => child !== null);
      return { type: "element", tag, attributes, children };
    };
    return visit(root);
  });
  return redactEvidenceValue(normalized);
}

async function computedStyles(page: Page, roots: readonly string[]): Promise<unknown> {
  return page.evaluate(
    (selectors) => {
      const properties = [
        "display",
        "position",
        "box-sizing",
        "width",
        "height",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "font-family",
        "font-size",
        "font-weight",
        "line-height",
        "color",
        "background-color",
        "border-radius",
        "overflow-x",
        "overflow-y",
        "opacity",
        "visibility"
      ];
      const selected = selectors.length
        ? selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
        : [document.documentElement];
      const elements = [
        ...new Set(selected.flatMap((root) => [root, ...root.querySelectorAll("*")]))
      ].slice(0, 2000);
      return elements.map((element, index) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        const values = Object.fromEntries(
          properties.map((property) => [property, style.getPropertyValue(property)])
        );
        return {
          index,
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          testId: element.getAttribute("data-testid"),
          rectangle: {
            x: Math.round(rectangle.x * 100) / 100,
            y: Math.round(rectangle.y * 100) / 100,
            width: Math.round(rectangle.width * 100) / 100,
            height: Math.round(rectangle.height * 100) / 100
          },
          values
        };
      });
    },
    [...roots]
  );
}

async function pageDimensions(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: Math.max(
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
      document.body?.scrollWidth ?? 0
    ),
    height: Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.clientHeight,
      document.body?.scrollHeight ?? 0
    )
  }));
}

async function runAxe(page: Page, enabled: boolean, synthetic: boolean): Promise<unknown> {
  if (!enabled) return { status: "disabled" };
  if (synthetic) return { status: "skipped", reason: "javascript-disabled-static-fragment" };
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const runner = (
      globalThis as typeof globalThis & {
        axe?: { run: (root: Document) => Promise<unknown> };
      }
    ).axe;
    if (!runner) throw new Error("axe-core injection failed");
    return runner.run(document);
  });
}

async function writeFailureResult(
  runDirectory: string,
  targetId: string,
  side: CaptureSide,
  failure: CaptureFailure,
  url?: string
): Promise<CaptureSideResult> {
  const directory = await createAttemptDirectory(runDirectory, targetId, side);
  const filename = await writeFailureEvidence(directory, failure);
  return {
    status: "failed",
    url: url ? safeUrl(url) : undefined,
    screenshotRefs: [],
    blockedRequestCount: 0,
    failureRef: artifactReference(runDirectory, filename),
    failure
  };
}

async function captureSide(
  browser: Browser,
  repositoryRoot: string,
  runDirectory: string,
  config: NormalizedCaptureConfig,
  target: CaptureTargetConfiguration,
  targetId: string,
  side: CaptureSide,
  viewportName: string,
  viewport: ViewportConfiguration,
  stateName: string,
  browserVersion: string
): Promise<AttemptOutcome> {
  const directory = await createAttemptDirectory(runDirectory, targetId, side);
  const synthetic = config.mode === "static-fragment";
  const server = config.servers?.[side];
  const targetUrl = server ? new URL(target.path, server.readyUrl).toString() : undefined;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: config.browser.locale,
    timezoneId: config.browser.timezone,
    colorScheme: config.browser.colorScheme,
    reducedMotion: config.browser.reducedMotion,
    serviceWorkers: "block",
    javaScriptEnabled: !synthetic
  });
  if (config.stabilization.freezeTime && !synthetic) {
    await addTimeFreeze(context, config.stabilization.freezeTime);
  }
  const allowedOrigins = [
    ...config.network.allowedOrigins,
    ...(config.servers
      ? [config.servers.before.readyUrl, config.servers.after.readyUrl].map(
          (entry) => new URL(entry).origin
        )
      : [])
  ];
  let recorder: NetworkRecorder | null = null;
  let page: Page | null = null;
  let stage = "context";
  let attempts = 1;
  try {
    recorder = await installNetworkPolicy(context, {
      allowedOrigins,
      blockMethods: config.network.blockMethods,
      blockAllHttp: synthetic
    });
    page = await context.newPage();
    await recorder.attachPage(page);
    const consoleEvidence: ConsoleEvidence[] = [];
    page.on("console", (message) => {
      const location = message.location();
      consoleEvidence.push({
        type: message.type(),
        text: redactUrlsInText(message.text()).slice(0, 4096),
        location: location.url
          ? {
              url: safeUrl(location.url),
              lineNumber: location.lineNumber,
              columnNumber: location.columnNumber
            }
          : null
      });
    });
    page.on("pageerror", (error) => {
      consoleEvidence.push({
        type: "pageerror",
        text: redactUrlsInText(error.message).slice(0, 4096),
        location: null
      });
    });

    stage = "navigation";
    if (synthetic) {
      const fragmentPath = target.fragments?.[side];
      if (!fragmentPath) throw new Error(`Missing ${side} fragment`);
      const filename = await resolveContainedPath(repositoryRoot, fragmentPath);
      const fragment = sanitizedFragment(await readFile(filename, "utf8"));
      await page.setContent(fragment, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
    } else if (targetUrl) {
      const navigation = await retryTransient("navigation", config.stabilization.maxRetries, () =>
        page!.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs })
      );
      attempts = navigation.attempts;
    } else {
      throw new Error("Capture URL is unavailable");
    }

    stage = "ready";
    if (server?.readySelector) {
      await page
        .locator(server.readySelector)
        .waitFor({ state: "visible", timeout: config.timeoutMs });
    }
    const state = target.states.find((entry) => entry.name === stateName);
    if (!state) throw new Error(`Missing capture state ${stateName}`);
    stage = "actions";
    await executeCaptureActions(page, state.steps);
    stage = "fonts";
    if (config.stabilization.waitForFonts) {
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });
    }
    stage = "stabilization";
    if (!synthetic && (config.stabilization.disableAnimations || config.stabilization.hideCaret)) {
      await page.addStyleTag({
        content: `${
          config.stabilization.disableAnimations
            ? "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}"
            : ""
        }${config.stabilization.hideCaret ? "*{caret-color:transparent!important;}" : ""}`
      });
    }
    if (config.stabilization.waitAfterReadyMs > 0) {
      await page.waitForTimeout(config.stabilization.waitAfterReadyMs);
    }

    stage = "screenshot";
    const dimensions = await pageDimensions(page);
    if (dimensions.height > config.capture.maxFullPageHeight) {
      throw new UtsuriError(
        "CAPTURE_PAGE_HEIGHT_LIMIT",
        `Page height ${dimensions.height}px exceeds ${config.capture.maxFullPageHeight}px`,
        4
      );
    }
    const megapixels =
      (dimensions.width * dimensions.height * viewport.deviceScaleFactor ** 2) / 1_000_000;
    if (megapixels > config.capture.maxMegapixels) {
      throw new UtsuriError(
        "CAPTURE_MEGAPIXEL_LIMIT",
        `Capture size ${megapixels.toFixed(2)}MP exceeds ${config.capture.maxMegapixels}MP`,
        4
      );
    }
    const mask = config.stabilization.masks.map((entry) => page!.locator(entry.selector));
    const screenshotPath = path.join(
      directory,
      config.capture.fullPage ? "full-page.png" : "viewport.png"
    );
    const screenshot = await retryTransient("screenshot", config.stabilization.maxRetries, () =>
      page!.screenshot({
        path: screenshotPath,
        fullPage: config.capture.fullPage,
        mask,
        type: "png"
      })
    );
    attempts = Math.max(attempts, screenshot.attempts);
    const screenshotRefs = [artifactReference(runDirectory, screenshotPath)];
    if (config.capture.elementCrops) {
      for (const [index, selector] of target.roots.entries()) {
        const cropPath = path.join(directory, `crop-${String(index + 1).padStart(2, "0")}.png`);
        await page.locator(selector).first().screenshot({ path: cropPath, mask, type: "png" });
        screenshotRefs.push(artifactReference(runDirectory, cropPath));
      }
    }

    stage = "artifacts";
    const domPath = await writeJsonArtifact(directory, "dom.json", await normalizeDom(page));
    const ariaPath = await writeJsonArtifact(
      directory,
      "aria.json",
      config.capture.includeAria
        ? redactEvidenceValue({
            status: "captured",
            snapshot: await page.locator("body").ariaSnapshot()
          })
        : { status: "disabled" }
    );
    const stylePath = await writeJsonArtifact(
      directory,
      "styles.json",
      await computedStyles(page, target.roots)
    );
    const axePath = await writeJsonArtifact(
      directory,
      "axe.json",
      redactEvidenceValue(await runAxe(page, config.capture.includeAxe, synthetic))
    );
    const consolePath = await writeJsonArtifact(
      directory,
      "console.json",
      [...consoleEvidence].sort((left, right) =>
        `${left.type}\0${left.text}`.localeCompare(`${right.type}\0${right.text}`)
      )
    );
    const networkPath = await writeJsonArtifact(directory, "network.json", recorder.entries());
    const metadataPath = await writeJsonArtifact(directory, "metadata.json", {
      schemaVersion: "1.0",
      targetId,
      side,
      mode: config.mode,
      synthetic,
      browser: { engine: "chromium", version: browserVersion },
      viewport: { name: viewportName, ...viewport },
      locale: config.browser.locale,
      timezone: config.browser.timezone,
      colorScheme: config.browser.colorScheme,
      reducedMotion: config.browser.reducedMotion,
      url: targetUrl ? safeUrl(targetUrl) : null,
      stabilization: {
        disableAnimations: config.stabilization.disableAnimations,
        hideCaret: config.stabilization.hideCaret,
        waitForFonts: config.stabilization.waitForFonts,
        freezeTime: config.stabilization.freezeTime ?? null,
        waitAfterReadyMs: config.stabilization.waitAfterReadyMs,
        masks: config.stabilization.masks
      },
      attempts,
      dimensions,
      blockedRequestCount: recorder.blockedCount()
    });
    return {
      blockedRequests: recorder.blockedCount(),
      result: {
        status: "success",
        url: targetUrl ? safeUrl(targetUrl) : undefined,
        screenshotRefs,
        domRef: artifactReference(runDirectory, domPath),
        ariaRef: artifactReference(runDirectory, ariaPath),
        styleRef: artifactReference(runDirectory, stylePath),
        axeRef: artifactReference(runDirectory, axePath),
        consoleRef: artifactReference(runDirectory, consolePath),
        networkRef: artifactReference(runDirectory, networkPath),
        metadataRef: artifactReference(runDirectory, metadataPath),
        blockedRequestCount: recorder.blockedCount()
      }
    };
  } catch (error) {
    const failure = captureFailure(error, stage, attempts, [repositoryRoot, runDirectory]);
    const failurePath = await writeFailureEvidence(directory, failure);
    let failureNetworkPath: string | undefined;
    if (recorder) {
      try {
        failureNetworkPath = await writeJsonArtifact(directory, "network.json", recorder.entries());
      } catch (networkError) {
        if ((networkError as NodeJS.ErrnoException).code !== "EEXIST") throw networkError;
        failureNetworkPath = await writeJsonArtifact(
          directory,
          "network-failure.json",
          recorder.entries()
        );
      }
    }
    return {
      blockedRequests: recorder?.blockedCount() ?? 0,
      result: {
        status: "failed",
        url: targetUrl ? safeUrl(targetUrl) : undefined,
        screenshotRefs: [],
        blockedRequestCount: recorder?.blockedCount() ?? 0,
        networkRef: failureNetworkPath
          ? artifactReference(runDirectory, failureNetworkPath)
          : undefined,
        failureRef: artifactReference(runDirectory, failurePath),
        failure
      }
    };
  } finally {
    if (recorder) await recorder.dispose().catch(() => undefined);
    await boundedClose(() => context.close(), 3000);
  }
}

async function startWorktreeServers(
  repositoryRoot: string,
  config: NormalizedCaptureConfig
): Promise<{
  handles: Partial<Record<CaptureSide, ServerHandle>>;
  failures: Partial<Record<CaptureSide, CaptureFailure>>;
}> {
  const handles: Partial<Record<CaptureSide, ServerHandle>> = {};
  const failures: Partial<Record<CaptureSide, CaptureFailure>> = {};
  if (config.mode !== "worktree" || !config.servers) return { handles, failures };
  await Promise.all(
    (["before", "after"] as const).map(async (side) => {
      try {
        handles[side] = await startConfiguredServer(
          repositoryRoot,
          config.servers![side],
          config.envAllowlist,
          config.timeoutMs
        );
      } catch (error) {
        failures[side] = captureFailure(error, "server", 1, [repositoryRoot]);
      }
    })
  );
  return { handles, failures };
}

async function stopServers(
  runDirectory: string,
  handles: Partial<Record<CaptureSide, ServerHandle>>
): Promise<void> {
  await Promise.all(
    (["before", "after"] as const).map(async (side) => {
      const handle = handles[side];
      if (!handle) return;
      await handle.stop();
      const directory = path.join(runDirectory, "capture", "servers");
      await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
      await writeJsonArtifact(directory, `${side}.json`, {
        pid: handle.pid,
        stopped: true,
        stdout: redactUrlsInText(handle.stdout()),
        stderr: redactUrlsInText(handle.stderr())
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        return path.join(directory, `${side}.json`);
      });
    })
  );
}

async function boundedClose(operation: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    operation()
      .then(() => true)
      .catch(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
}

function directChildProcessIds(): Set<number> {
  if (process.platform === "win32") return new Set();
  try {
    const output = execFileSync("ps", ["-o", "pid=", "-P", String(process.pid)], {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return new Set(output.split(/\s+/u).filter(Boolean).map(Number).filter(Number.isInteger));
  } catch {
    return new Set();
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateTrackedBrowserProcesses(processIds: ReadonlySet<number>): Promise<void> {
  for (const pid of processIds) {
    try {
      if (processAlive(pid)) process.kill(pid, "SIGTERM");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const pid of processIds) {
    try {
      if (processAlive(pid)) process.kill(pid, "SIGKILL");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
}

async function closeBrowserRuntime(
  browser: Browser | null,
  browserProcessIds: ReadonlySet<number>
): Promise<void> {
  if (browser) await boundedClose(() => browser.close(), 3000);
  await terminateTrackedBrowserProcesses(browserProcessIds);
}

export async function captureRun(
  repositoryRoot: string,
  runDirectory: string,
  config: NormalizedCaptureConfig,
  options: { allowProjectCode?: boolean } = {}
): Promise<CaptureRunResult> {
  if (
    config.targets.length === 0 ||
    config.targets.some((target) => target.viewports.length === 0 || target.states.length === 0)
  ) {
    throw new UtsuriError(
      "CAPTURE_TARGETS_REQUIRED",
      "Capture requires at least one target, viewport, and state",
      ExitCode.Arguments
    );
  }
  if (config.mode === "worktree" && !options.allowProjectCode) {
    throw new UtsuriError(
      "CAPTURE_WORKTREE_CONSENT_REQUIRED",
      "worktree capture requires the explicit --allow-project-code authorization",
      ExitCode.Security
    );
  }
  const previous = await readPreviousManifest(runDirectory);
  const configurationHash = await captureConfigurationHash(runDirectory, config);
  const previousTargets = new Map(previous?.targets.map((target) => [target.id, target]) ?? []);
  const { handles, failures: serverFailures } = await startWorktreeServers(repositoryRoot, config);
  let browser: Browser | null = null;
  let browserProcessIds = new Set<number>();
  let browserFailure: CaptureFailure | null = null;
  let browserVersion = previous?.browser.version ?? "unavailable";
  const ensureBrowser = async (): Promise<Browser | null> => {
    if (browser) return browser;
    if (browserFailure) return null;
    try {
      const { chromium } = await import("playwright-core");
      const executablePath = await resolveBrowserExecutable();
      const childrenBeforeLaunch = directChildProcessIds();
      browser = await chromium.launch({
        executablePath,
        headless: config.browser.headless,
        env: buildChildEnvironment(process.env, []),
        args: [
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-default-apps",
          "--disable-extensions",
          "--disable-quic",
          "--disable-sync",
          "--metrics-recording-only",
          "--no-first-run"
        ]
      });
      browserProcessIds = new Set(
        [...directChildProcessIds()].filter((pid) => !childrenBeforeLaunch.has(pid))
      );
      browserVersion = browser.version();
      return browser;
    } catch (error) {
      browserFailure = captureFailure(error, "browser", 1, [repositoryRoot, runDirectory]);
      return null;
    }
  };

  let reusablePrevious = false;
  if (previous?.configurationHash === configurationHash) {
    const currentBrowser = await ensureBrowser();
    reusablePrevious = Boolean(currentBrowser && previous.browser.version === browserVersion);
  }

  const targets: CaptureTargetResult[] = [];
  let blockedRequestCount = 0;
  let reusedSides = 0;
  try {
    for (const target of config.targets) {
      for (const viewportName of target.viewports) {
        const viewport = config.viewports[viewportName];
        if (!viewport) {
          throw new UtsuriError(
            "CAPTURE_VIEWPORT_MISSING",
            `${target.id} references missing viewport ${viewportName}`,
            ExitCode.Arguments
          );
        }
        for (const state of target.states) {
          const targetId = `target:${target.id}:${viewportName}:${state.name}`;
          const previousTarget = previousTargets.get(targetId);
          const sideResults: Partial<Record<CaptureSide, CaptureSideResult>> = {};
          for (const side of ["before", "after"] as const) {
            const previousResult = previousTarget?.[side];
            if (
              reusablePrevious &&
              previousResult &&
              (await artifactsMatch(runDirectory, previousResult, previous!.artifactDigests))
            ) {
              sideResults[side] = previousResult;
              blockedRequestCount += previousResult.blockedRequestCount ?? 0;
              reusedSides += 1;
              continue;
            }
            const serverFailure = serverFailures[side];
            if (serverFailure) {
              sideResults[side] = await writeFailureResult(
                runDirectory,
                targetId,
                side,
                serverFailure,
                config.servers?.[side].readyUrl
              );
              continue;
            }
            const activeBrowser = await ensureBrowser();
            if (!activeBrowser || browserFailure) {
              sideResults[side] = await writeFailureResult(
                runDirectory,
                targetId,
                side,
                browserFailure ?? {
                  code: "CAPTURE_BROWSER_UNAVAILABLE",
                  message: "Browser is unavailable",
                  stage: "browser",
                  retryable: false,
                  attempts: 1
                }
              );
              continue;
            }
            const outcome = await captureSide(
              activeBrowser,
              repositoryRoot,
              runDirectory,
              config,
              target,
              targetId,
              side,
              viewportName,
              viewport,
              state.name,
              browserVersion
            );
            sideResults[side] = outcome.result;
            blockedRequestCount += outcome.blockedRequests;
          }
          targets.push({
            id: targetId,
            routeOrStory: target.path.split(/[?#]/u, 1)[0] || "/",
            viewport: viewportName,
            state: state.name,
            roots: target.roots,
            discovery: {
              source: "explicit",
              confidence: "explicit",
              reason: "Declared in the capture configuration"
            },
            before: sideResults.before!,
            after: sideResults.after!
          });
        }
      }
    }
  } finally {
    await closeBrowserRuntime(browser, browserProcessIds);
    await stopServers(runDirectory, handles);
  }

  const references = targets.flatMap((target) => [
    ...captureResultReferences(target.before),
    ...captureResultReferences(target.after)
  ]);
  const digests = await artifactDigests(runDirectory, references);
  const manifestBase = {
    schemaVersion: "1.0" as const,
    configurationHash,
    mode: config.mode,
    capability: captureCapabilities[config.mode],
    browser: {
      engine: "chromium" as const,
      version: browserVersion,
      locale: config.browser.locale,
      timezone: config.browser.timezone,
      colorScheme: config.browser.colorScheme,
      reducedMotion: config.browser.reducedMotion
    },
    environment: {
      os: process.platform,
      arch: process.arch
    },
    stabilization: {
      disableAnimations: config.stabilization.disableAnimations,
      hideCaret: config.stabilization.hideCaret,
      waitForFonts: config.stabilization.waitForFonts,
      freezeTime: config.stabilization.freezeTime ?? null,
      waitAfterReadyMs: config.stabilization.waitAfterReadyMs,
      masks: config.stabilization.masks
    },
    targets,
    blockedRequestCount,
    artifactDigests: digests
  };
  const manifest: CaptureManifest = {
    ...manifestBase,
    captureHash: stableHash({ ...manifestBase, artifactDigests: digests })
  };
  const manifestPath = await publishCaptureManifest(runDirectory, manifest);
  const complete =
    blockedRequestCount === 0 &&
    targets.length > 0 &&
    targets.every(
      (target) => target.before.status === "success" && target.after.status === "success"
    );
  return { manifest, manifestPath, complete, reusedSides };
}
