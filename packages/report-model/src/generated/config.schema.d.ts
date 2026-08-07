/* Generated from schemas/config.schema.json. Do not edit directly. */

export interface UtsuriConfig {
  version: 1;
  project: {
    name: string;
    locale?: string;
  };
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
  report: {
    outputDirectory: string;
    language?: string;
    theme?: "system" | "light" | "dark";
    singleFile: boolean;
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
  command: [string, ...string[]];
  readyUrl: string;
  readySelector?: string;
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
