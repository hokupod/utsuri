import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverExplicit,
  discoverFallback,
  normalizeProjectPath,
  type AdapterCandidate,
  type AdapterTarget,
  type ExplicitMapping
} from "@utsu-ri/adapter-generic";
import { discoverPlaywright } from "@utsu-ri/adapter-playwright";
import { discoverRouteManifest } from "@utsu-ri/adapter-route-manifest";
import { discoverStorybook } from "@utsu-ri/adapter-storybook";
import type { CaptureManifest } from "@utsu-ri/capture";
import { ExitCode, stableHash, stableId, UtsuriError } from "@utsu-ri/core";
import {
  assertArtifact,
  validateDiffReferences,
  validateReviewPlanReferences,
  type EvidenceIndex,
  type GitDiffDocument,
  type ReviewPlan
} from "@utsu-ri/report-model";
import { resolveContainedPath } from "@utsu-ri/security";
import { parse as parseYaml } from "yaml";
import type { DiscoverRunResult, DiscoveryCandidate, DiscoveryManifest } from "./types";

interface DiscoveryConfiguration {
  knownUsages?: number | null;
  unknownPossible?: boolean;
  mappings?: ExplicitMapping[];
  sources?: {
    storybookIndex?: string;
    playwrightManifest?: string;
    routeManifest?: string;
    importGraph?: string;
    selectorUsage?: string;
  };
}

interface ConfigurationDocument {
  discovery?: DiscoveryConfiguration;
}

function artifactError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCapture(value: unknown): asserts value is CaptureManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    !Array.isArray(value.targets) ||
    typeof value.captureHash !== "string"
  ) {
    artifactError("DISCOVERY_CAPTURE_INVALID", "capture.json is invalid");
  }
  const { captureHash, ...base } = value;
  if (stableHash(base) !== captureHash) {
    artifactError("DISCOVERY_CAPTURE_HASH", "capture.json semantic hash does not match");
  }
}

async function readJson(filename: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch {
    return artifactError("DISCOVERY_JSON_INVALID", `${label} is not valid JSON`);
  }
}

async function readOptionalSource(
  repositoryRoot: string,
  filename: string | undefined,
  label: string
): Promise<unknown | null> {
  if (!filename) return null;
  const resolved = await resolveContainedPath(repositoryRoot, filename);
  return readJson(resolved, label);
}

function baseTargetId(targetRef: string): string {
  const match = /^target:([^:]+):/u.exec(targetRef);
  if (!match?.[1]) return artifactError("DISCOVERY_TARGET_ID", `Invalid target ID: ${targetRef}`);
  return match[1];
}

function sourcePriority(source: AdapterCandidate["source"]): number {
  return ["explicit", "storybook", "test", "route", "import", "selector", "fallback"].indexOf(
    source
  );
}

function mergeCandidates(candidates: readonly AdapterCandidate[]): AdapterCandidate[] {
  const selected = new Map<string, AdapterCandidate>();
  for (const candidate of candidates) {
    const previous = selected.get(candidate.targetId);
    if (!previous || sourcePriority(candidate.source) < sourcePriority(previous.source)) {
      selected.set(candidate.targetId, candidate);
      continue;
    }
    if (previous.source === candidate.source) {
      selected.set(candidate.targetId, {
        ...previous,
        reason:
          previous.reason === candidate.reason
            ? previous.reason
            : `${previous.reason} ${candidate.reason}`,
        changedPaths: [...new Set([...previous.changedPaths, ...candidate.changedPaths])].sort(),
        knownUsageCount: Math.max(previous.knownUsageCount, candidate.knownUsageCount)
      });
    }
  }
  return [...selected.values()].sort(
    (left, right) =>
      sourcePriority(left.source) - sourcePriority(right.source) ||
      left.targetId.localeCompare(right.targetId)
  );
}

function importGraphCandidates(
  value: unknown,
  targets: readonly AdapterTarget[],
  changedPaths: ReadonlySet<string>
): AdapterCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.edges) || !Array.isArray(value.targets)) return [];
  const importers = new Map<string, Set<string>>();
  for (const rawEdge of value.edges) {
    if (!isRecord(rawEdge) || typeof rawEdge.from !== "string" || typeof rawEdge.to !== "string") {
      continue;
    }
    const from = normalizeProjectPath(rawEdge.from);
    const to = normalizeProjectPath(rawEdge.to);
    const values = importers.get(to) ?? new Set<string>();
    values.add(from);
    importers.set(to, values);
  }
  const reachable = new Set(changedPaths);
  const queue = [...changedPaths];
  for (let index = 0; index < queue.length; index += 1) {
    for (const importer of importers.get(queue[index]!) ?? []) {
      if (!reachable.has(importer)) {
        reachable.add(importer);
        queue.push(importer);
      }
    }
  }
  const output: AdapterCandidate[] = [];
  for (const rawTarget of value.targets) {
    if (
      !isRecord(rawTarget) ||
      typeof rawTarget.targetId !== "string" ||
      typeof rawTarget.entry !== "string" ||
      !targets.some((target) => target.id === rawTarget.targetId)
    ) {
      continue;
    }
    const entry = normalizeProjectPath(rawTarget.entry);
    if (!reachable.has(entry)) continue;
    const related = [...changedPaths].filter((changed) => {
      const seen = new Set([changed]);
      const pending = [changed];
      for (let cursor = 0; cursor < pending.length; cursor += 1) {
        for (const importer of importers.get(pending[cursor]!) ?? []) {
          if (importer === entry) return true;
          if (!seen.has(importer)) {
            seen.add(importer);
            pending.push(importer);
          }
        }
      }
      return changed === entry;
    });
    output.push({
      targetId: rawTarget.targetId,
      source: "import",
      confidence: "medium",
      reason: `Import graph connects ${related.join(", ")} to ${entry}.`,
      changedPaths: related,
      knownUsageCount: 1
    });
  }
  return output;
}

function selectorCandidates(
  value: unknown,
  targets: readonly AdapterTarget[],
  changedPaths: ReadonlySet<string>
): AdapterCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.usages)) return [];
  const output: AdapterCandidate[] = [];
  for (const rawUsage of value.usages) {
    if (
      !isRecord(rawUsage) ||
      typeof rawUsage.changedPath !== "string" ||
      typeof rawUsage.targetId !== "string" ||
      !targets.some((target) => target.id === rawUsage.targetId)
    ) {
      continue;
    }
    const changedPath = normalizeProjectPath(rawUsage.changedPath);
    if (!changedPaths.has(changedPath)) continue;
    const token = typeof rawUsage.token === "string" ? rawUsage.token : "selector or token";
    const count =
      typeof rawUsage.count === "number" &&
      Number.isSafeInteger(rawUsage.count) &&
      rawUsage.count >= 0
        ? rawUsage.count
        : 1;
    output.push({
      targetId: rawUsage.targetId,
      source: "selector",
      confidence: "weak",
      reason: `${token} usage maps ${changedPath} to this target.`,
      changedPaths: [changedPath],
      knownUsageCount: count
    });
  }
  return output;
}

function changePathMap(diff: GitDiffDocument, plan: ReviewPlan): Map<string, Set<string>> {
  const files = new Map(
    diff.files.map((file) => [file.id, normalizeProjectPath(file.newPath ?? file.oldPath ?? "")])
  );
  return new Map(
    plan.candidates.map((candidate) => [
      candidate.id,
      new Set(
        candidate.fileRefs
          .map((reference) => files.get(reference))
          .filter((entry): entry is string => Boolean(entry))
      )
    ])
  );
}

function mappedChanges(
  changedPaths: readonly string[],
  pathsByChange: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  if (changedPaths.length === 0) {
    return pathsByChange.size === 1 ? [...pathsByChange.keys()] : [];
  }
  const pathSet = new Set(changedPaths);
  return [...pathsByChange.entries()]
    .filter(([, paths]) => [...paths].some((entry) => pathSet.has(entry)))
    .map(([reference]) => reference)
    .sort();
}

async function publishManifest(runDirectory: string, manifest: DiscoveryManifest): Promise<string> {
  const filename = path.join(runDirectory, "discovery.json");
  const temporary = path.join(runDirectory, `.discovery-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
    try {
      const existing = await lstat(filename);
      if (!existing.isFile()) {
        return artifactError("DISCOVERY_MANIFEST_PATH", "discovery.json is not a regular file");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, filename);
    return filename;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function discoverRun(
  repositoryInput: string,
  runInput: string,
  configInput: string
): Promise<DiscoverRunResult> {
  const repositoryRoot = await realpath(repositoryInput);
  const runDirectory = await realpath(runInput);
  const configFilename = await resolveContainedPath(repositoryRoot, configInput);
  const configValue = parseYaml(await readFile(configFilename, "utf8")) as unknown;
  assertArtifact("config", configValue);
  const discoveryConfig = (configValue as ConfigurationDocument).discovery ?? {};

  const captureValue = await readJson(path.join(runDirectory, "capture.json"), "capture.json");
  assertCapture(captureValue);
  const capture = captureValue;
  const targetMap = new Map<string, AdapterTarget>();
  for (const target of capture.targets) {
    const id = baseTargetId(target.id);
    targetMap.set(id, { id, routeOrStory: target.routeOrStory });
  }
  const targets = [...targetMap.values()].sort((left, right) => left.id.localeCompare(right.id));

  const diffValue = await readJson(path.join(runDirectory, "diff.json"), "diff.json");
  const evidenceValue = await readJson(
    path.join(runDirectory, "evidence-index.json"),
    "evidence-index.json"
  );
  const planValue = await readJson(path.join(runDirectory, "review-plan.json"), "review-plan.json");
  assertArtifact("diff", diffValue);
  assertArtifact("evidence-index", evidenceValue);
  assertArtifact("review-plan", planValue);
  const diff = diffValue as GitDiffDocument;
  const evidence = evidenceValue as EvidenceIndex;
  const plan = planValue as ReviewPlan;
  const diffReferences = validateDiffReferences(diff);
  if (!diffReferences.ok)
    artifactError("DISCOVERY_DIFF_REFERENCE", diffReferences.errors.join("; "));
  const planReferences = validateReviewPlanReferences(plan, diff, evidence);
  if (!planReferences.ok)
    artifactError("DISCOVERY_PLAN_REFERENCE", planReferences.errors.join("; "));
  const changedPaths = new Set(
    diff.files
      .map((file) => normalizeProjectPath(file.newPath ?? file.oldPath ?? ""))
      .filter(Boolean)
  );

  const [storybook, playwright, routeManifest, importGraph, selectorUsage] = await Promise.all([
    readOptionalSource(repositoryRoot, discoveryConfig.sources?.storybookIndex, "Storybook index"),
    readOptionalSource(
      repositoryRoot,
      discoveryConfig.sources?.playwrightManifest,
      "Playwright manifest"
    ),
    readOptionalSource(repositoryRoot, discoveryConfig.sources?.routeManifest, "route manifest"),
    readOptionalSource(repositoryRoot, discoveryConfig.sources?.importGraph, "import graph"),
    readOptionalSource(repositoryRoot, discoveryConfig.sources?.selectorUsage, "selector usage")
  ]);
  const adapters: AdapterCandidate[] = [
    ...discoverExplicit(discoveryConfig.mappings ?? [], targets),
    ...(storybook ? discoverStorybook(storybook, targets, changedPaths) : []),
    ...(playwright ? discoverPlaywright(playwright, targets, changedPaths) : []),
    ...(routeManifest ? discoverRouteManifest(routeManifest, targets, changedPaths) : []),
    ...(importGraph ? importGraphCandidates(importGraph, targets, changedPaths) : []),
    ...(selectorUsage ? selectorCandidates(selectorUsage, targets, changedPaths) : []),
    ...discoverFallback(targets)
  ];
  const pathsByChange = changePathMap(diff, plan);
  const candidates: DiscoveryCandidate[] = mergeCandidates(adapters).map((candidate) => {
    const changeRefs = mappedChanges(candidate.changedPaths, pathsByChange);
    const hunkRefs = changeRefs.flatMap(
      (reference) => plan.candidates.find((entry) => entry.id === reference)?.hunkRefs ?? []
    );
    return {
      id: stableId(
        "discovery",
        { targetId: candidate.targetId, source: candidate.source, reason: candidate.reason },
        16
      ),
      targetId: candidate.targetId,
      targetRefs: capture.targets
        .filter((target) => baseTargetId(target.id) === candidate.targetId)
        .map((target) => target.id)
        .sort(),
      source: candidate.source,
      confidence: candidate.confidence,
      reason: candidate.reason,
      knownUsageCount: candidate.knownUsageCount,
      changeRefs,
      hunkRefs: [...new Set(hunkRefs)].sort()
    };
  });
  const mapped = new Set(candidates.flatMap((candidate) => candidate.changeRefs));
  const unmappedChangeRefs = plan.candidates
    .map((candidate) => candidate.id)
    .filter((reference) => !mapped.has(reference));
  const succeeded = capture.targets.filter(
    (target) => target.before.status === "success" && target.after.status === "success"
  ).length;
  const failed = capture.targets.length - succeeded;
  const verifiedUsages = candidates.reduce((sum, candidate) => {
    const verified = candidate.targetRefs.some((reference) => {
      const target = capture.targets.find((entry) => entry.id === reference);
      return target?.before.status === "success" && target.after.status === "success";
    });
    return sum + (verified ? candidate.knownUsageCount : 0);
  }, 0);
  const knownUsages = discoveryConfig.knownUsages ?? null;
  if (knownUsages !== null && verifiedUsages > knownUsages) {
    artifactError(
      "DISCOVERY_COVERAGE_INVALID",
      `Verified usage count ${verifiedUsages} exceeds known usage count ${knownUsages}`
    );
  }
  const base = {
    schemaVersion: "1.0" as const,
    captureHash: capture.captureHash,
    diffHash: stableHash(diff),
    candidates,
    unmappedChangeRefs,
    coverage: {
      knownUsages,
      verifiedUsages,
      unknownPossible: discoveryConfig.unknownPossible ?? true,
      planned: capture.targets.length,
      succeeded,
      failed
    }
  };
  const manifest: DiscoveryManifest = { ...base, discoveryHash: stableHash(base) };
  return { manifest, manifestPath: await publishManifest(runDirectory, manifest) };
}
