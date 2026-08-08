import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import axe from "axe-core";
import { ExitCode, sha256, stableHash, UtsuriError } from "@utsu-ri/core";
import { assertArtifact, type GitDiffDocument } from "@utsu-ri/report-model";
import {
  buildChildEnvironment,
  parseBoundedJson,
  readContainedRegularFile,
  staticFragmentDocument
} from "@utsu-ri/security";
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
import {
  type BrowserProcessObservation,
  browserProcessOwnershipAmbiguous,
  observeTrackedBrowserProcessIds,
  resolveTrackedBrowserExecutablePaths,
  terminateObservedBrowserProcesses,
  terminateOwnedBrowserProcesses,
  waitForTrackedBrowserProcesses
} from "./browser-process";
import { captureCapabilities } from "./capabilities";
import { captureFailure, writeFailureEvidence } from "./failure-evidence";
import { installNetworkPolicy, type NetworkRecorder } from "./network-policy";
import { redactEvidenceValue, redactUrlsInText } from "./redaction";
import {
  mapContainerTargetUrl,
  probeContainerCapability,
  startContainerServer
} from "./runtime/container";
import { runCleanupSteps } from "./runtime/cleanup";
import { prepareBrowserMemoryBoundary, type BrowserMemoryBoundary } from "./runtime/browser-memory";
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
  ResourceLimits,
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
  expectedDigests: Readonly<Record<string, string>>,
  maximumBytes: number
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
        return (
          sha256(await readContainedRegularFile(runDirectory, reference, { maximumBytes })) ===
          expected
        );
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
      binding[name] = sha256(
        await readContainedRegularFile(runDirectory, name, {
          maximumBytes: config.limits.maxArtifactBytes
        })
      );
    } catch (error) {
      if (error instanceof UtsuriError && error.diagnosticId === "SEC_PATH_MISSING") {
        binding[name] = null;
      } else if (error instanceof UtsuriError && error.diagnosticId === "SEC_FILE_SIZE_LIMIT") {
        binding[name] = "over-limit";
      } else {
        throw error;
      }
    }
  }
  return stableHash({ toolVersion: "0.1.0", config, binding });
}

function resourceFailure(code: string, message: string): CaptureFailure {
  return {
    code,
    message,
    stage: "limits",
    retryable: false,
    attempts: 1
  };
}

async function resourcePreflightFailure(
  runDirectory: string,
  limits: ResourceLimits
): Promise<CaptureFailure | null> {
  let bytes: Buffer | null = null;
  for (const name of ["input.json", "diff.json"] as const) {
    try {
      const current = await readContainedRegularFile(runDirectory, name, {
        maximumBytes: limits.maxArtifactBytes
      });
      if (name === "input.json") {
        parseBoundedJson(current.toString("utf8"), {
          label: name,
          maximumBytes: limits.maxArtifactBytes
        });
      } else {
        bytes = current;
      }
    } catch (error) {
      if (error instanceof UtsuriError && error.diagnosticId === "SEC_PATH_MISSING") continue;
      return resourceFailure(
        "CAPTURE_INPUT_ARTIFACT_LIMIT",
        `${name} is not a contained regular JSON file within the configured artifact byte limit`
      );
    }
  }
  if (!bytes) return null;
  try {
    const value = parseBoundedJson(bytes.toString("utf8"), {
      label: "diff.json",
      maximumBytes: limits.maxArtifactBytes
    });
    assertArtifact("diff", value);
    const observed = (value as GitDiffDocument).hunks.reduce(
      (total, hunk) => total + hunk.lines.length,
      0
    );
    if (observed > limits.maxDiffLines) {
      return resourceFailure(
        "CAPTURE_DIFF_LINE_LIMIT",
        `Diff contains ${observed} lines, above the configured ${limits.maxDiffLines} limit`
      );
    }
  } catch {
    return resourceFailure("CAPTURE_DIFF_INVALID", "diff.json could not be safely inspected");
  }
  return null;
}

async function assertArtifactByteLimit(filename: string, limits: ResourceLimits): Promise<void> {
  const fileStat = await stat(filename);
  if (!fileStat.isFile() || fileStat.size > limits.maxArtifactBytes) {
    throw new UtsuriError(
      "CAPTURE_ARTIFACT_SIZE_LIMIT",
      `${path.basename(filename)} exceeds the configured artifact byte limit`,
      ExitCode.Incomplete
    );
  }
}

export function assertImagePixelLimit(
  dimensions: { width: number; height: number },
  deviceScaleFactor: number,
  limits: ResourceLimits
): number {
  const imagePixels = dimensions.width * dimensions.height * deviceScaleFactor ** 2;
  if (!Number.isSafeInteger(imagePixels) || imagePixels > limits.maxImagePixels) {
    throw new UtsuriError(
      "CAPTURE_IMAGE_PIXEL_LIMIT",
      `Capture has ${imagePixels} pixels, above the configured ${limits.maxImagePixels} limit`,
      ExitCode.Incomplete
    );
  }
  return imagePixels;
}

function validPreviousManifest(value: unknown): value is CaptureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<CaptureManifest>;
  if (
    manifest.schemaVersion !== "1.0" ||
    typeof manifest.configurationHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(manifest.configurationHash) ||
    !manifest.browser ||
    typeof manifest.browser.version !== "string" ||
    !Array.isArray(manifest.targets) ||
    !manifest.artifactDigests ||
    typeof manifest.artifactDigests !== "object" ||
    typeof manifest.captureHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(manifest.captureHash)
  ) {
    return false;
  }
  for (const [reference, digest] of Object.entries(manifest.artifactDigests)) {
    if (!safeCaptureReference(reference) || !/^[a-f0-9]{64}$/u.test(digest)) return false;
  }
  for (const target of manifest.targets) {
    if (!target || typeof target.id !== "string") return false;
    for (const side of [target.before, target.after]) {
      if (
        !side ||
        !new Set(["success", "failed", "skipped"]).has(side.status) ||
        !Array.isArray(side.screenshotRefs) ||
        captureResultReferences(side).some((reference) => !safeCaptureReference(reference))
      ) {
        return false;
      }
    }
  }
  const { captureHash, ...manifestBase } = manifest;
  return stableHash(manifestBase) === captureHash;
}

async function readPreviousManifest(
  runDirectory: string,
  maximumBytes: number
): Promise<CaptureManifest | null> {
  try {
    const bytes = await readContainedRegularFile(runDirectory, "capture.json", { maximumBytes });
    const value = parseBoundedJson(bytes.toString("utf8"), {
      label: "capture.json",
      maximumBytes
    });
    return validPreviousManifest(value) ? value : null;
  } catch (error) {
    if (error instanceof UtsuriError && error.diagnosticId === "SEC_PATH_MISSING") return null;
    if (error instanceof UtsuriError) throw error;
    return null;
  }
}

export async function retryTransient<T>(
  stage: "browser" | "navigation" | "screenshot",
  maxRetries: 0 | 1,
  operation: () => Promise<T>,
  retryDelayMs = 0
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (error instanceof UtsuriError || attempt > maxRetries) throw error;
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw new Error(`${stage} failed: ${String(lastError)}`);
}

async function withinCaptureDeadline<T>(
  stage: string,
  deadline: number,
  operationTimeoutMs: number,
  operation: () => Promise<T>
): Promise<T> {
  const timeoutMs = Math.min(operationTimeoutMs, deadline - Date.now());
  if (timeoutMs <= 0) {
    throw new UtsuriError(
      "CAPTURE_TIME_LIMIT",
      `Capture time limit was reached before ${stage}`,
      ExitCode.Incomplete
    );
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new UtsuriError(
                "CAPTURE_TIME_LIMIT",
                `Capture stage ${stage} exceeded the remaining ${timeoutMs}ms limit`,
                ExitCode.Incomplete
              )
            ),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
        "outline-color",
        "outline-style",
        "outline-width",
        "overflow-x",
        "overflow-y",
        "z-index",
        "flex-direction",
        "gap",
        "grid-template-columns",
        "opacity",
        "visibility"
      ];
      const selected = selectors.length
        ? selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
        : [document.documentElement];
      const selectedSet = new Set(selected);
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
          root: selectedSet.has(element),
          rectangle: {
            x: Math.round(rectangle.x * 100) / 100,
            y: Math.round(rectangle.y * 100) / 100,
            width: Math.round(rectangle.width * 100) / 100,
            height: Math.round(rectangle.height * 100) / 100
          },
          scroll: {
            width: element.scrollWidth,
            height: element.scrollHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight
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
  url: string | undefined,
  maximumBytes: number
): Promise<CaptureSideResult> {
  const directory = await createAttemptDirectory(runDirectory, targetId, side);
  const filename = await writeFailureEvidence(directory, failure, maximumBytes);
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
  browserVersion: string,
  serverHandle?: ServerHandle
): Promise<AttemptOutcome> {
  const directory = await createAttemptDirectory(runDirectory, targetId, side);
  const synthetic = config.mode === "static-fragment";
  const server = config.servers?.[side];
  const targetUrl = server
    ? config.mode === "container" && serverHandle?.readyUrl
      ? mapContainerTargetUrl(target.path, server.readyUrl, serverHandle.readyUrl)
      : new URL(target.path, server.readyUrl).toString()
    : undefined;
  const allowedOrigins =
    config.mode === "container" && serverHandle?.readyUrl
      ? [new URL(serverHandle.readyUrl).origin]
      : [
          ...config.network.allowedOrigins,
          ...(config.servers
            ? [config.servers.before.readyUrl, config.servers.after.readyUrl].map(
                (entry) => new URL(entry).origin
              )
            : [])
        ];
  let context: BrowserContext | null = null;
  let recorder: NetworkRecorder | null = null;
  let page: Page | null = null;
  let stage = "context";
  let attempts = 1;
  const deadline = Date.now() + config.limits.maxTimeMs;
  const runStage = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    stage = label;
    return await withinCaptureDeadline(label, deadline, config.timeoutMs, operation);
  };
  try {
    context = await runStage("context", () =>
      browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        locale: config.browser.locale,
        timezoneId: config.browser.timezone,
        colorScheme: config.browser.colorScheme,
        reducedMotion: config.browser.reducedMotion,
        serviceWorkers: "block",
        javaScriptEnabled: !synthetic,
        ...(serverHandle?.requestHeaders
          ? { extraHTTPHeaders: { ...serverHandle.requestHeaders } }
          : {})
      })
    );
    if (config.stabilization.freezeTime && !synthetic) {
      await runStage("context", () => addTimeFreeze(context!, config.stabilization.freezeTime!));
    }
    recorder = await runStage("network", () =>
      installNetworkPolicy(context!, {
        allowedOrigins,
        blockMethods: config.network.blockMethods,
        blockAllHttp: synthetic
      })
    );
    page = await runStage("page", () => context!.newPage());
    page.setDefaultTimeout(config.timeoutMs);
    page.setDefaultNavigationTimeout(config.timeoutMs);
    await runStage("network", () => recorder!.attachPage(page!));
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

    if (synthetic) {
      await runStage("navigation", async () => {
        const fragmentPath = target.fragments?.[side];
        if (!fragmentPath) throw new Error(`Missing ${side} fragment`);
        const fragment = staticFragmentDocument(
          (
            await readContainedRegularFile(repositoryRoot, fragmentPath, {
              maximumBytes: 1_048_576,
              timeoutMs: config.timeoutMs
            })
          ).toString("utf8")
        );
        await page!.setContent(fragment, {
          waitUntil: "domcontentloaded",
          timeout: config.timeoutMs
        });
      });
    } else if (targetUrl) {
      const navigation = await runStage("navigation", () =>
        retryTransient("navigation", config.stabilization.maxRetries, () =>
          page!.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs })
        )
      );
      attempts = navigation.attempts;
    } else {
      throw new Error("Capture URL is unavailable");
    }
    serverHandle?.assertHealthy?.();

    if (server?.readySelector) {
      await runStage("ready", () =>
        page!.locator(server.readySelector!).waitFor({
          state: "visible",
          timeout: config.timeoutMs
        })
      );
    }
    const state = target.states.find((entry) => entry.name === stateName);
    if (!state) throw new Error(`Missing capture state ${stateName}`);
    await runStage("actions", () => executeCaptureActions(page!, state.steps));
    if (config.stabilization.waitForFonts) {
      await runStage("fonts", () =>
        page!.evaluate(async () => {
          await document.fonts?.ready;
        })
      );
    }
    if (!synthetic && (config.stabilization.disableAnimations || config.stabilization.hideCaret)) {
      await runStage("stabilization", () =>
        page!
          .addStyleTag({
            content: `${
              config.stabilization.disableAnimations
                ? "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}"
                : ""
            }${config.stabilization.hideCaret ? "*{caret-color:transparent!important;}" : ""}`
          })
          .then(() => undefined)
      );
    }
    if (config.stabilization.waitAfterReadyMs > 0) {
      await runStage("stabilization", () =>
        page!.waitForTimeout(config.stabilization.waitAfterReadyMs)
      );
    }

    const dimensions = await runStage("screenshot", () => pageDimensions(page!));
    if (dimensions.height > config.capture.maxFullPageHeight) {
      throw new UtsuriError(
        "CAPTURE_PAGE_HEIGHT_LIMIT",
        `Page height ${dimensions.height}px exceeds ${config.capture.maxFullPageHeight}px`,
        4
      );
    }
    const imagePixels = assertImagePixelLimit(
      dimensions,
      viewport.deviceScaleFactor,
      config.limits
    );
    const megapixels = imagePixels / 1_000_000;
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
    const screenshot = await runStage("screenshot", () =>
      retryTransient("screenshot", config.stabilization.maxRetries, () =>
        page!.screenshot({
          path: screenshotPath,
          fullPage: config.capture.fullPage,
          mask,
          type: "png"
        })
      )
    );
    attempts = Math.max(attempts, screenshot.attempts);
    await assertArtifactByteLimit(screenshotPath, config.limits);
    const screenshotRefs = [artifactReference(runDirectory, screenshotPath)];
    if (config.capture.elementCrops) {
      for (const [index, selector] of target.roots.entries()) {
        const cropPath = path.join(directory, `crop-${String(index + 1).padStart(2, "0")}.png`);
        await runStage("screenshot", () =>
          page!.locator(selector).first().screenshot({ path: cropPath, mask, type: "png" })
        );
        await assertArtifactByteLimit(cropPath, config.limits);
        screenshotRefs.push(artifactReference(runDirectory, cropPath));
      }
    }

    const normalizedDom = await runStage("artifacts", () => normalizeDom(page!));
    const domPath = await writeJsonArtifact(
      directory,
      "dom.json",
      normalizedDom,
      config.limits.maxArtifactBytes
    );
    const ariaEvidence = config.capture.includeAria
      ? redactEvidenceValue({
          status: "captured",
          snapshot: await runStage("artifacts", () => page!.locator("body").ariaSnapshot())
        })
      : { status: "disabled" };
    const ariaPath = await writeJsonArtifact(
      directory,
      "aria.json",
      ariaEvidence,
      config.limits.maxArtifactBytes
    );
    const styleEvidence = await runStage("artifacts", () => computedStyles(page!, target.roots));
    const stylePath = await writeJsonArtifact(
      directory,
      "styles.json",
      styleEvidence,
      config.limits.maxArtifactBytes
    );
    const axeEvidence = await runStage("artifacts", () =>
      runAxe(page!, config.capture.includeAxe, synthetic)
    );
    const axePath = await writeJsonArtifact(
      directory,
      "axe.json",
      redactEvidenceValue(axeEvidence),
      config.limits.maxArtifactBytes
    );
    const consolePath = await writeJsonArtifact(
      directory,
      "console.json",
      [...consoleEvidence].sort((left, right) =>
        `${left.type}\0${left.text}`.localeCompare(`${right.type}\0${right.text}`)
      ),
      config.limits.maxArtifactBytes
    );
    const networkPath = await writeJsonArtifact(
      directory,
      "network.json",
      recorder.entries(),
      config.limits.maxArtifactBytes
    );
    const metadataPath = await writeJsonArtifact(
      directory,
      "metadata.json",
      {
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
        blockedRequestCount: recorder.blockedCount(),
        limits: config.limits
      },
      config.limits.maxArtifactBytes
    );
    serverHandle?.assertHealthy?.();
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
    const failurePath = await writeFailureEvidence(
      directory,
      failure,
      config.limits.maxArtifactBytes
    );
    let failureNetworkPath: string | undefined;
    if (recorder) {
      try {
        failureNetworkPath = await writeJsonArtifact(
          directory,
          "network.json",
          recorder.entries(),
          config.limits.maxArtifactBytes
        );
      } catch (networkError) {
        if ((networkError as NodeJS.ErrnoException).code !== "EEXIST") throw networkError;
        failureNetworkPath = await writeJsonArtifact(
          directory,
          "network-failure.json",
          recorder.entries(),
          config.limits.maxArtifactBytes
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
    const activeContext = context;
    if (activeContext) await boundedClose(() => activeContext.close(), 3000);
  }
}

async function startCaptureServers(
  repositoryRoot: string,
  config: NormalizedCaptureConfig
): Promise<{
  handles: Partial<Record<CaptureSide, ServerHandle>>;
  failures: Partial<Record<CaptureSide, CaptureFailure>>;
}> {
  const handles: Partial<Record<CaptureSide, ServerHandle>> = {};
  const failures: Partial<Record<CaptureSide, CaptureFailure>> = {};
  if (!new Set(["worktree", "container"]).has(config.mode) || !config.servers) {
    return { handles, failures };
  }
  await Promise.all(
    (["before", "after"] as const).map(async (side) => {
      try {
        handles[side] =
          config.mode === "container" && config.container
            ? await startContainerServer(
                repositoryRoot,
                config.servers![side],
                config.container,
                config.limits
              )
            : await startConfiguredServer(
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
  handles: Partial<Record<CaptureSide, ServerHandle>>,
  maximumBytes: number
): Promise<void> {
  await runCleanupSteps(
    (["before", "after"] as const).map((side) => async () => {
      const handle = handles[side];
      if (!handle) return;
      await handle.stop();
      const directory = path.join(runDirectory, "capture", "servers");
      await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
      await writeJsonArtifact(
        directory,
        `${side}.json`,
        {
          pid: handle.pid,
          stopped: true,
          stdout: redactUrlsInText(handle.stdout()),
          stderr: redactUrlsInText(handle.stderr())
        },
        maximumBytes
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        return path.join(directory, `${side}.json`);
      });
    })
  );
}

async function boundedClose(operation: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation().then(
        () => true,
        () => false
      ),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function assertBrowserCleanupOutcome(
  ownershipAmbiguous: boolean,
  cleanupComplete: boolean
): void {
  if (ownershipAmbiguous) {
    throw new UtsuriError(
      "CAPTURE_BROWSER_PROCESS_AMBIGUOUS",
      "Multiple tracked browser parents were observed during cleanup",
      ExitCode.Environment
    );
  }
  if (!cleanupComplete) {
    throw new UtsuriError(
      "CAPTURE_BROWSER_CLEANUP_FAILED",
      "Tracked browser processes remained after bounded termination",
      ExitCode.Environment
    );
  }
}

export interface BrowserRuntimeCleanupOperations {
  observe?: (
    executablePaths: ReadonlySet<string>,
    captureToken: string
  ) => BrowserProcessObservation;
  terminate?: (
    processIds: ReadonlySet<number>,
    executablePaths: ReadonlySet<string>,
    captureToken: string
  ) => Promise<boolean>;
  wait?: (processIds: ReadonlySet<number>, timeoutMs: number) => Promise<boolean>;
}

export async function closeBrowserRuntime(
  browser: Browser | null,
  initialObservation: BrowserProcessObservation,
  executablePaths: ReadonlySet<string>,
  captureToken: string,
  operations: BrowserRuntimeCleanupOperations = {}
): Promise<void> {
  const browserProcessIds = initialObservation.processIds;
  let ownershipAmbiguous = browserProcessOwnershipAmbiguous(initialObservation.candidateProcessIds);
  const ownershipProcessIds = new Set(initialObservation.candidateProcessIds);
  let trackingError: UtsuriError | null = initialObservation.error;
  let cleanupError: unknown;
  const observeProcessIds = (): Set<number> => {
    if (executablePaths.size === 0) return new Set();
    const observation = (operations.observe ?? observeTrackedBrowserProcessIds)(
      executablePaths,
      captureToken
    );
    trackingError ??= observation.error;
    const { processIds, candidateProcessIds } = observation;
    for (const processId of candidateProcessIds) ownershipProcessIds.add(processId);
    ownershipAmbiguous ||= browserProcessOwnershipAmbiguous(ownershipProcessIds);
    return processIds;
  };
  const closed = browser ? await boundedClose(() => browser.close(), 3000) : true;
  const currentProcessIds = observeProcessIds();
  const trackedProcessIds = new Set([...browserProcessIds, ...currentProcessIds]);
  ownershipAmbiguous ||= browserProcessOwnershipAmbiguous(browserProcessIds, currentProcessIds);
  const exited =
    closed && (await (operations.wait ?? waitForTrackedBrowserProcesses)(trackedProcessIds, 1000));
  const remainingAfterClose = observeProcessIds();
  ownershipAmbiguous ||= browserProcessOwnershipAmbiguous(trackedProcessIds, remainingAfterClose);
  const remainingProcessIds = exited
    ? new Set(remainingAfterClose)
    : new Set([...trackedProcessIds, ...remainingAfterClose]);
  const cleanup = await terminateObservedBrowserProcesses(
    remainingProcessIds,
    observeProcessIds,
    async (processIds) => {
      for (const processId of processIds) ownershipProcessIds.add(processId);
      ownershipAmbiguous ||= browserProcessOwnershipAmbiguous(ownershipProcessIds);
      if (ownershipAmbiguous) return false;
      try {
        return await (operations.terminate ?? terminateOwnedBrowserProcesses)(
          processIds,
          executablePaths,
          captureToken
        );
      } catch (error) {
        cleanupError ??= error;
        return false;
      }
    }
  );
  ownershipAmbiguous ||= browserProcessOwnershipAmbiguous(cleanup.observedProcessIds);
  if (ownershipAmbiguous) assertBrowserCleanupOutcome(true, cleanup.complete);
  if (trackingError) throw trackingError;
  if (cleanupError) throw cleanupError;
  assertBrowserCleanupOutcome(false, cleanup.complete);
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
  const preflightFailure = await resourcePreflightFailure(runDirectory, config.limits);
  let runtimeCapability =
    config.mode === "container" && config.container
      ? await probeContainerCapability(config.container)
      : captureCapabilities[config.mode];
  const previous = await readPreviousManifest(runDirectory, config.limits.maxArtifactBytes);
  const configurationHash = await captureConfigurationHash(runDirectory, config);
  const previousTargets = new Map(previous?.targets.map((target) => [target.id, target]) ?? []);
  let containerBrowserExecutable: string | null = null;
  let browserMemoryBoundary: BrowserMemoryBoundary | null = null;
  if (config.mode === "container" && !preflightFailure && runtimeCapability.supported) {
    try {
      const resolvedContainerBrowser = await resolveBrowserExecutable();
      const trackedContainerBrowserPaths =
        await resolveTrackedBrowserExecutablePaths(resolvedContainerBrowser);
      containerBrowserExecutable = trackedContainerBrowserPaths.values().next().value ?? null;
      if (!containerBrowserExecutable) {
        throw new Error("container browser executable did not resolve to a canonical path");
      }
      const prepared = await prepareBrowserMemoryBoundary(
        containerBrowserExecutable,
        config.limits.maxMemoryMiB
      );
      if (prepared.supported) {
        browserMemoryBoundary = prepared;
      } else {
        runtimeCapability = { ...runtimeCapability, supported: false, reason: prepared.reason };
      }
    } catch {
      runtimeCapability = {
        ...runtimeCapability,
        supported: false,
        reason: "container-browser-or-memory-isolation-unavailable"
      };
    }
  }
  const capabilityFailure =
    config.mode === "container" && !runtimeCapability.supported
      ? resourceFailure(
          "CONTAINER_CAPABILITY_MISSING",
          `Container capability is unavailable: ${runtimeCapability.reason ?? "unknown reason"}`
        )
      : null;
  const globalFailure = preflightFailure ?? capabilityFailure;
  let serverRuntime: Awaited<ReturnType<typeof startCaptureServers>>;
  try {
    serverRuntime = globalFailure
      ? { handles: {}, failures: {} }
      : await startCaptureServers(repositoryRoot, config);
  } catch (error) {
    await browserMemoryBoundary?.cleanup();
    throw error;
  }
  const { handles, failures: serverFailures } = serverRuntime;
  let browser: Browser | null = null;
  let browserProcessObservation: BrowserProcessObservation = {
    processIds: new Set(),
    candidateProcessIds: new Set(),
    error: null
  };
  let browserFailure: CaptureFailure | null = null;
  let browserVersion = previous?.browser.version ?? "unavailable";
  let browserLaunchAttempts = 0;
  let browserExecutablePaths: ReadonlySet<string> = new Set();
  const browserProcessToken = randomUUID();
  const ensureBrowser = async (): Promise<Browser | null> => {
    if (browserFailure) return null;
    if (browser) return browser;
    try {
      const { chromium } = await import("playwright-core");
      const executablePath = containerBrowserExecutable ?? (await resolveBrowserExecutable());
      const trackedExecutablePaths = await resolveTrackedBrowserExecutablePaths(executablePath);
      const canonicalExecutablePath = trackedExecutablePaths.values().next().value;
      if (!canonicalExecutablePath) {
        throw new UtsuriError(
          "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
          "Browser executable tracking resolved no canonical path",
          ExitCode.Environment
        );
      }
      browserExecutablePaths = trackedExecutablePaths;
      const launched = await retryTransient(
        "browser",
        config.stabilization.maxRetries,
        async () => {
          browserLaunchAttempts += 1;
          try {
            return await chromium.launch({
              executablePath: browserMemoryBoundary?.launcherPath ?? canonicalExecutablePath,
              headless: config.browser.headless,
              timeout: config.timeoutMs,
              env: {
                ...buildChildEnvironment(process.env, []),
                ...browserMemoryBoundary?.environment
              },
              args: [
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-extensions",
                "--disable-quic",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
                `--utsuri-capture-token=${browserProcessToken}`
              ]
            });
          } catch (error) {
            await closeBrowserRuntime(
              null,
              { processIds: new Set(), candidateProcessIds: new Set(), error: null },
              trackedExecutablePaths,
              browserProcessToken
            );
            throw error;
          }
        },
        250
      );
      browser = launched.value;
      browserProcessObservation = observeTrackedBrowserProcessIds(
        trackedExecutablePaths,
        browserProcessToken
      );
      if (browserProcessOwnershipAmbiguous(browserProcessObservation.candidateProcessIds)) {
        throw new UtsuriError(
          "CAPTURE_BROWSER_PROCESS_AMBIGUOUS",
          `Expected one tracked browser parent, observed ${browserProcessObservation.candidateProcessIds.size} candidates`,
          ExitCode.Environment
        );
      }
      if (browserProcessObservation.error) throw browserProcessObservation.error;
      if (browserProcessObservation.processIds.size !== 1) {
        throw new UtsuriError(
          "CAPTURE_BROWSER_PROCESS_AMBIGUOUS",
          `Expected one tracked browser parent, observed ${browserProcessObservation.processIds.size}`,
          ExitCode.Environment
        );
      }
      browserVersion = browser.version();
      return browser;
    } catch (error) {
      browserFailure = captureFailure(error, "browser", Math.max(browserLaunchAttempts, 1), [
        repositoryRoot,
        runDirectory
      ]);
      return null;
    }
  };

  let reusablePrevious = false;
  if (!globalFailure && previous?.configurationHash === configurationHash) {
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
            if (globalFailure) {
              sideResults[side] = await writeFailureResult(
                runDirectory,
                targetId,
                side,
                globalFailure,
                config.servers?.[side].readyUrl,
                config.limits.maxArtifactBytes
              );
              continue;
            }
            const previousResult = previousTarget?.[side];
            if (
              reusablePrevious &&
              previousResult &&
              (await artifactsMatch(
                runDirectory,
                previousResult,
                previous!.artifactDigests,
                config.limits.maxArtifactBytes
              ))
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
                config.servers?.[side].readyUrl,
                config.limits.maxArtifactBytes
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
                },
                undefined,
                config.limits.maxArtifactBytes
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
              browserVersion,
              handles[side]
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
    await runCleanupSteps([
      () =>
        closeBrowserRuntime(
          browser,
          browserProcessObservation,
          browserExecutablePaths,
          browserProcessToken
        ),
      async () => browserMemoryBoundary?.cleanup(),
      () => stopServers(runDirectory, handles, config.limits.maxArtifactBytes)
    ]);
  }

  const references = targets.flatMap((target) => [
    ...captureResultReferences(target.before),
    ...captureResultReferences(target.after)
  ]);
  const digests = await artifactDigests(runDirectory, references, config.limits.maxArtifactBytes);
  const manifestBase = {
    schemaVersion: "1.0" as const,
    configurationHash,
    mode: config.mode,
    capability: runtimeCapability,
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
      arch: process.arch,
      limits: config.limits
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
