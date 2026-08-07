import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import {
  assertArtifact,
  validateArtifact,
  type CaptureAction,
  type UtsuriConfig
} from "@utsu-ri/report-model";
import { assertAllowedUrl, assertRuntimeCommand, resolveContainedPath } from "@utsu-ri/security";
import { parse } from "yaml";
import { captureCapabilities } from "./capabilities";
import type {
  CaptureMode,
  CaptureSide,
  CaptureTargetConfiguration,
  NormalizedCaptureConfig,
  ServerConfiguration
} from "./types";

type RawConfig = UtsuriConfig & {
  execution: UtsuriConfig["execution"] & { mode: CaptureMode };
  servers?: Partial<
    Record<
      CaptureSide,
      Omit<ServerConfiguration, "shutdownTimeoutMs"> & {
        shutdownTimeoutMs?: number;
      }
    >
  >;
  targets?: Array<{
    id: string;
    path: string;
    viewports: string[];
    roots?: string[];
    fragments?: Record<CaptureSide, string>;
    states: Array<{ name: string; steps?: CaptureAction[] }>;
  }>;
};

function configurationError(id: string, message: string, details = {}): never {
  throw new UtsuriError(id, message, ExitCode.Arguments, details);
}

function requireServers(raw: RawConfig): Record<CaptureSide, ServerConfiguration> {
  const before = raw.servers?.before;
  const after = raw.servers?.after;
  if (!before || !after) {
    return configurationError(
      "CAPTURE_SERVERS_REQUIRED",
      "Capture requires both servers.before and servers.after"
    );
  }
  return {
    before: { ...before, shutdownTimeoutMs: before.shutdownTimeoutMs ?? 3000 },
    after: { ...after, shutdownTimeoutMs: after.shutdownTimeoutMs ?? 3000 }
  };
}

function assertActionList(targets: CaptureTargetConfiguration[]): void {
  for (const target of targets) {
    for (const state of target.states) {
      for (const [index, action] of state.steps.entries()) {
        const result = validateArtifact("capture-action", action);
        if (!result.ok) {
          configurationError(
            "CAPTURE_ACTION_INVALID",
            `${target.id}/${state.name}/steps/${index}: ${result.errors.join("; ")}`,
            { target: target.id, state: state.name, index }
          );
        }
      }
    }
  }
}

function normalizeTargets(raw: RawConfig): CaptureTargetConfiguration[] {
  const configuredTargets = (raw.targets ?? []) as unknown as Array<{
    id: string;
    path: string;
    viewports: string[];
    roots?: string[];
    fragments?: Record<CaptureSide, string>;
    states: Array<{ name: string; steps?: unknown[] }>;
  }>;
  const targets: CaptureTargetConfiguration[] = configuredTargets.map((target) => ({
    id: target.id,
    path: target.path,
    viewports: [...target.viewports],
    roots: [...(target.roots ?? [])],
    fragments: target.fragments,
    states: target.states.map((state) => ({
      name: state.name,
      steps: [...(state.steps ?? [])] as CaptureAction[]
    }))
  }));
  if (targets.length === 0) {
    configurationError("CAPTURE_TARGETS_REQUIRED", "Capture requires at least one target");
  }
  if (new Set(targets.map((target) => target.id)).size !== targets.length) {
    configurationError("CAPTURE_TARGET_DUPLICATE", "Capture target IDs must be unique");
  }
  for (const target of targets) {
    if (new Set(target.viewports).size !== target.viewports.length) {
      configurationError(
        "CAPTURE_VIEWPORT_DUPLICATE",
        `Capture viewports must be unique for ${target.id}`
      );
    }
    if (new Set(target.states.map((state) => state.name)).size !== target.states.length) {
      configurationError(
        "CAPTURE_STATE_DUPLICATE",
        `Capture state names must be unique for ${target.id}`
      );
    }
  }
  assertActionList(targets);
  return targets;
}

export function normalizeCaptureConfig(value: UtsuriConfig): NormalizedCaptureConfig {
  const raw = value as RawConfig;
  const mode = raw.execution.mode;
  const capability = captureCapabilities[mode];
  if (!capability.supported || mode === "container") {
    throw new UtsuriError(
      "CAPTURE_MODE_UNAVAILABLE",
      "container capture is not implemented until Phase 4",
      ExitCode.Environment,
      { mode, capability }
    );
  }
  if (raw.execution.trust === "untrusted" && mode !== "static-fragment") {
    configurationError(
      "CAPTURE_UNTRUSTED_MODE_FORBIDDEN",
      "untrusted capture is limited to static-fragment until container mode is available"
    );
  }

  const targets = normalizeTargets(raw);
  const viewports = raw.viewports ?? {};
  for (const target of targets) {
    for (const viewport of target.viewports) {
      if (!(viewport in viewports)) {
        configurationError(
          "CAPTURE_VIEWPORT_MISSING",
          `${target.id} references missing viewport ${viewport}`
        );
      }
    }
  }

  let servers: Record<CaptureSide, ServerConfiguration> | null = null;
  if (mode === "dual-url" || mode === "worktree") servers = requireServers(raw);
  if (mode === "dual-url" && servers) {
    for (const side of ["before", "after"] as const) {
      if (servers[side].command) {
        configurationError(
          "CAPTURE_DUAL_URL_COMMAND_FORBIDDEN",
          `dual-url never starts servers.${side}.command`
        );
      }
    }
  }
  if (mode === "worktree") {
    if (raw.execution.trust !== "trusted") {
      configurationError(
        "CAPTURE_WORKTREE_TRUST_REQUIRED",
        "worktree capture requires execution.trust: trusted"
      );
    }
    if (!servers) configurationError("CAPTURE_SERVERS_REQUIRED", "worktree requires servers");
    for (const side of ["before", "after"] as const) {
      const server = servers[side];
      if (!server.command || !server.cwd) {
        configurationError(
          "CAPTURE_WORKTREE_EXPLICIT_SERVER",
          `worktree requires servers.${side}.command and servers.${side}.cwd`
        );
      }
      assertRuntimeCommand(server.command);
    }
    if (servers.before.cwd === servers.after.cwd) {
      configurationError(
        "CAPTURE_WORKTREE_DIRECTORY_COLLISION",
        "before and after must use separate worktree directories"
      );
    }
  }
  if (mode === "static-fragment") {
    for (const target of targets) {
      if (!target.fragments?.before || !target.fragments.after) {
        configurationError(
          "CAPTURE_FRAGMENT_REQUIRED",
          `static-fragment target ${target.id} requires before and after fragments`
        );
      }
    }
  }

  const allowedOrigins = [...(raw.network?.allowedOrigins ?? [])];
  for (const origin of allowedOrigins) assertAllowedUrl(origin, [new URL(origin).origin]);
  if (servers) {
    for (const side of ["before", "after"] as const) {
      assertAllowedUrl(servers[side].readyUrl, allowedOrigins);
    }
  }

  return {
    mode,
    trust: raw.execution.trust,
    timeoutMs: raw.execution.timeoutMs,
    servers,
    browser: {
      headless: raw.browser?.headless ?? true,
      locale: raw.browser?.locale ?? raw.project.locale ?? "en-US",
      timezone: raw.browser?.timezone ?? "UTC",
      colorScheme: raw.browser?.colorScheme ?? "light",
      reducedMotion: raw.browser?.reducedMotion ?? "reduce"
    },
    viewports,
    targets,
    stabilization: {
      disableAnimations: raw.stabilization?.disableAnimations ?? true,
      hideCaret: raw.stabilization?.hideCaret ?? true,
      waitForFonts: raw.stabilization?.waitForFonts ?? true,
      freezeTime: raw.stabilization?.freezeTime,
      waitAfterReadyMs: raw.stabilization?.waitAfterReadyMs ?? 100,
      maxRetries: (raw.stabilization?.maxRetries ?? 1) as 0 | 1,
      masks: [...(raw.stabilization?.masks ?? [])]
    },
    network: {
      allowedOrigins,
      blockMethods: [...(raw.network?.blockMethods ?? ["POST", "PUT", "PATCH", "DELETE"])],
      recordBlocked: raw.network?.recordBlocked ?? true
    },
    capture: {
      fullPage: raw.capture?.fullPage ?? true,
      elementCrops: raw.capture?.elementCrops ?? true,
      maxFullPageHeight: raw.capture?.maxFullPageHeight ?? 30_000,
      maxMegapixels: raw.capture?.maxMegapixels ?? 80,
      includeAria: raw.capture?.includeAria ?? true,
      includeComputedStyles: raw.capture?.includeComputedStyles ?? "changed-and-layout",
      includeAxe: raw.capture?.includeAxe ?? true
    },
    envAllowlist: [...(raw.security?.envAllowlist ?? [])]
  };
}

export async function loadCaptureConfig(
  cwd: string,
  configPath: string
): Promise<{ filename: string; config: NormalizedCaptureConfig; raw: UtsuriConfig }> {
  const filename = await resolveContainedPath(cwd, configPath);
  let value: unknown;
  try {
    value = parse(await readFile(filename, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    throw new UtsuriError(
      "CONFIG_READ_FAILED",
      `Could not read ${path.basename(filename)}: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.Arguments
    );
  }
  assertArtifact("config", value);
  const raw = value as UtsuriConfig;
  return { filename, config: normalizeCaptureConfig(raw), raw };
}
