import {
  normalizeProjectPath,
  type AdapterCandidate,
  type AdapterTarget
} from "@utsu-ri/adapter-generic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRoutes(
  value: unknown,
  output: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRoutes(item, output);
  } else if (isRecord(value)) {
    if (
      typeof value.path === "string" &&
      (typeof value.file === "string" || typeof value.source === "string")
    ) {
      output.push(value);
    }
    for (const child of Object.values(value)) collectRoutes(child, output);
  }
  return output;
}

export function discoverRouteManifest(
  value: unknown,
  targets: readonly AdapterTarget[],
  changedPaths: ReadonlySet<string>
): AdapterCandidate[] {
  const output: AdapterCandidate[] = [];
  for (const route of collectRoutes(value)) {
    const source = normalizeProjectPath(String(route.file ?? route.source));
    if (!changedPaths.has(source)) continue;
    const target =
      (typeof route.targetId === "string"
        ? targets.find((entry) => entry.id === route.targetId)
        : undefined) ?? targets.find((entry) => entry.routeOrStory === route.path);
    if (!target) continue;
    output.push({
      targetId: target.id,
      source: "route",
      confidence: "medium",
      reason: `Route ${String(route.path)} maps changed source ${source} to this target.`,
      changedPaths: [source],
      knownUsageCount: 1
    });
  }
  return output;
}
