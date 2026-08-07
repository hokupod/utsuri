export type DiscoverySource =
  "explicit" | "storybook" | "test" | "route" | "import" | "selector" | "fallback";

export type DiscoveryConfidence = "explicit" | "strong" | "medium" | "weak" | "unknown";

export interface AdapterTarget {
  id: string;
  routeOrStory: string;
}

export interface AdapterCandidate {
  targetId: string;
  source: DiscoverySource;
  confidence: DiscoveryConfidence;
  reason: string;
  changedPaths: string[];
  knownUsageCount: number;
}

export interface ExplicitMapping {
  targetId: string;
  changedPaths?: string[];
  reason: string;
  knownUsageCount?: number;
}

export function normalizeProjectPath(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function discoverExplicit(
  mappings: readonly ExplicitMapping[],
  targets: readonly AdapterTarget[]
): AdapterCandidate[] {
  const targetIds = new Set(targets.map((target) => target.id));
  return mappings.map((mapping) => {
    if (!targetIds.has(mapping.targetId)) {
      throw new Error(`Explicit discovery mapping references unknown target: ${mapping.targetId}`);
    }
    if (!mapping.reason.trim()) throw new Error("Explicit discovery mappings require a reason");
    return {
      targetId: mapping.targetId,
      source: "explicit",
      confidence: "explicit",
      reason: mapping.reason,
      changedPaths: [...new Set((mapping.changedPaths ?? []).map(normalizeProjectPath))].sort(),
      knownUsageCount: mapping.knownUsageCount ?? 1
    };
  });
}

export function discoverFallback(targets: readonly AdapterTarget[]): AdapterCandidate[] {
  return targets.map((target) => ({
    targetId: target.id,
    source: "fallback",
    confidence: "unknown",
    reason: `Generic manual target for ${target.routeOrStory}; no stronger mapping was found.`,
    changedPaths: [],
    knownUsageCount: 0
  }));
}
