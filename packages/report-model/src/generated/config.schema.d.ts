/* Generated from schemas/config.schema.json. Do not edit directly. */

export interface UtsuriConfig {
  version: 1;
  project: {
    name: string;
    locale?: string;
  };
  proposedCommands?: {
    source: string;
    /**
     * @minItems 1
     */
    command: [string, ...string[]];
    reason: string;
  }[];
  diff: {
    base: string;
    head: string;
    mergeBase?: boolean;
    include?: string[];
    exclude?: string[];
    generatedPatterns?: string[];
  };
  execution: {
    mode: "dual-url" | "static-fragment" | "worktree" | "container";
    trust: "untrusted" | "configured" | "trusted";
    install: "never";
    shell: false;
    timeoutMs: number;
  };
  container?: {
    engine: "docker" | "podman";
    image: string;
    network: "none";
    readOnlyRoot: true;
    noNewPrivileges: true;
    /**
     * @minItems 1
     * @maxItems 1
     */
    capDrop: ["ALL"];
    mountProjectReadOnly: true;
    pidsLimit?: number;
    cpus?: number;
    tmpfsMiB?: number;
  };
  limits?: {
    maxDiffLines?: number;
    maxImagePixels?: number;
    maxTimeMs?: number;
    maxMemoryMiB?: number;
    maxArtifactBytes?: number;
  };
  servers?: {
    before?: Server;
    after?: Server;
  };
  browser?: {
    engine?: "chromium";
    headless?: boolean;
    serviceWorkers?: "block";
    locale?: string;
    timezone?: string;
    colorScheme?: "light" | "dark";
    reducedMotion?: "reduce" | "no-preference";
  };
  viewports?: {
    [k: string]: Viewport;
  };
  targets?: Target[];
  stabilization?: {
    disableAnimations?: boolean;
    hideCaret?: boolean;
    waitForFonts?: boolean;
    freezeTime?: string;
    waitAfterReadyMs?: number;
    maxRetries?: number;
    masks?: {
      selector: string;
      reason: string;
    }[];
  };
  network?: {
    browserPolicy?: "block-external";
    allowedOrigins?: string[];
    blockMethods?: ("POST" | "PUT" | "PATCH" | "DELETE")[];
    recordBlocked?: boolean;
  };
  security?: {
    envAllowlist?: string[];
    followSymlinks?: false;
    allowArbitraryScriptSteps?: false;
    allowRemoteAuthState?: false;
    sanitizeHtmlPreview?: true;
  };
  capture?: {
    fullPage?: boolean;
    elementCrops?: boolean;
    maxFullPageHeight?: number;
    maxMegapixels?: number;
    screenshotFormat?: "png";
    includeDom?: "normalized";
    includeRawDom?: false;
    includeAria?: boolean;
    includeComputedStyles?: "changed-and-layout" | "layout";
    includeAxe?: boolean;
  };
  discovery?: {
    knownUsages?: number | null;
    unknownPossible?: boolean;
    mappings?: {
      targetId: string;
      changedPaths?: string[];
      reason: string;
      knownUsageCount?: number;
    }[];
    sources?: {
      storybookIndex?: string;
      playwrightManifest?: string;
      routeManifest?: string;
      importGraph?: string;
      selectorUsage?: string;
    };
  };
  report: {
    outputDirectory: string;
    language?: string;
    theme?: "system" | "light" | "dark";
    singleFile: boolean;
    singleFileMaxBytes?: number;
    includeReviewNotes?: boolean;
    includeRawLogs?: boolean;
    includeAbsolutePaths: false;
  };
  review: {
    enabled: boolean;
    viewedMode?: "manual";
    staleOnFingerprintChange?: boolean;
    autoResolveAgentAnswer: false;
  };
  feedback: {
    target: "origin-session";
    delivery: "return-to-session" | "direct-same-session" | "export-only";
    directSameSessionBridge?: "auto" | "disabled";
    neverCreateNewSession: true;
    contextPreview?: "required";
    maxBatchItems?: number;
    maxContextBytes?: number;
  };
  policy: {
    failOn: string[];
    warnOn: string[];
  };
}
export interface Server {
  /**
   * @minItems 1
   */
  command?: [string, ...string[]];
  cwd?: string;
  readyUrl: string;
  readySelector?: string;
  shutdownTimeoutMs?: number;
}
export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}
export interface Target {
  id: string;
  path: string;
  /**
   * @minItems 1
   */
  viewports: [string, ...string[]];
  roots?: string[];
  fragments?: {
    before: string;
    after: string;
  };
  /**
   * @minItems 1
   */
  states: [
    {
      name: string;
      steps?: {
        [k: string]: any;
      }[];
    },
    ...{
      name: string;
      steps?: {
        [k: string]: any;
      }[];
    }[]
  ];
}
