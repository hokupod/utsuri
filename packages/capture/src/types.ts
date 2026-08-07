import type { CaptureAction } from "@utsu-ri/report-model";

export type CaptureMode = "dual-url" | "static-fragment" | "worktree" | "container";
export type CaptureSide = "before" | "after";

export interface CaptureCapability {
  supported: boolean;
  startsProjectCode: boolean;
  requiresExplicitCommand: boolean;
  availablePhase?: number;
  engine?: "docker" | "podman";
  reason?: string;
}

export interface ResourceLimits {
  maxDiffLines: number;
  maxImagePixels: number;
  maxTimeMs: number;
  maxMemoryMiB: number;
  maxArtifactBytes: number;
}

export interface ContainerConfiguration {
  engine: "docker" | "podman";
  image: string;
  network: "none";
  readOnlyRoot: true;
  noNewPrivileges: true;
  capDrop: ["ALL"];
  mountProjectReadOnly: true;
  pidsLimit: number;
  cpus: number;
  tmpfsMiB: number;
}

export interface ServerConfiguration {
  command?: string[];
  cwd?: string;
  readyUrl: string;
  readySelector?: string;
  shutdownTimeoutMs: number;
}

export interface ViewportConfiguration {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface CaptureStateConfiguration {
  name: string;
  steps: CaptureAction[];
}

export interface CaptureTargetConfiguration {
  id: string;
  path: string;
  viewports: string[];
  roots: string[];
  fragments?: Record<CaptureSide, string>;
  states: CaptureStateConfiguration[];
}

export interface StabilizationConfiguration {
  disableAnimations: boolean;
  hideCaret: boolean;
  waitForFonts: boolean;
  freezeTime?: string;
  waitAfterReadyMs: number;
  maxRetries: 0 | 1;
  masks: Array<{ selector: string; reason: string }>;
}

export interface NetworkConfiguration {
  allowedOrigins: string[];
  blockMethods: Array<"POST" | "PUT" | "PATCH" | "DELETE">;
  recordBlocked: boolean;
}

export interface BrowserConfiguration {
  headless: boolean;
  locale: string;
  timezone: string;
  colorScheme: "light" | "dark";
  reducedMotion: "reduce" | "no-preference";
}

export interface CaptureOutputConfiguration {
  fullPage: boolean;
  elementCrops: boolean;
  maxFullPageHeight: number;
  maxMegapixels: number;
  includeAria: boolean;
  includeComputedStyles: "changed-and-layout" | "layout";
  includeAxe: boolean;
}

export interface NormalizedCaptureConfig {
  mode: CaptureMode;
  trust: "untrusted" | "configured" | "trusted";
  timeoutMs: number;
  servers: Record<CaptureSide, ServerConfiguration> | null;
  browser: BrowserConfiguration;
  viewports: Record<string, ViewportConfiguration>;
  targets: CaptureTargetConfiguration[];
  stabilization: StabilizationConfiguration;
  network: NetworkConfiguration;
  capture: CaptureOutputConfiguration;
  envAllowlist: string[];
  container: ContainerConfiguration | null;
  limits: ResourceLimits;
}

export interface CaptureFailure {
  code: string;
  message: string;
  stage: string;
  retryable: boolean;
  attempts: number;
}

export interface CaptureSideResult {
  status: "success" | "failed" | "skipped";
  url?: string;
  screenshotRefs: string[];
  domRef?: string;
  ariaRef?: string;
  styleRef?: string;
  axeRef?: string;
  consoleRef?: string;
  networkRef?: string;
  metadataRef?: string;
  failureRef?: string;
  blockedRequestCount?: number;
  failure?: CaptureFailure;
}

export interface CaptureTargetResult {
  id: string;
  routeOrStory: string;
  viewport: string;
  state: string;
  roots: string[];
  discovery: {
    source: "explicit";
    confidence: "explicit";
    reason: string;
  };
  before: CaptureSideResult;
  after: CaptureSideResult;
}

export interface CaptureManifest {
  schemaVersion: "1.0";
  configurationHash: string;
  mode: CaptureMode;
  capability: CaptureCapability;
  browser: {
    engine: "chromium";
    version: string;
    locale: string;
    timezone: string;
    colorScheme: "light" | "dark";
    reducedMotion: "reduce" | "no-preference";
  };
  environment: {
    os: NodeJS.Platform;
    arch: string;
    limits: ResourceLimits;
  };
  stabilization: {
    disableAnimations: boolean;
    hideCaret: boolean;
    waitForFonts: boolean;
    freezeTime: string | null;
    waitAfterReadyMs: number;
    masks: Array<{ selector: string; reason: string }>;
  };
  targets: CaptureTargetResult[];
  blockedRequestCount: number;
  artifactDigests: Record<string, string>;
  captureHash: string;
}

export interface CaptureRunResult {
  manifest: CaptureManifest;
  manifestPath: string;
  complete: boolean;
  reusedSides: number;
}
