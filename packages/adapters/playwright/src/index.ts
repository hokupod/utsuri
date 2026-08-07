import {
  normalizeProjectPath,
  type AdapterCandidate,
  type AdapterTarget
} from "@utsu-ri/adapter-generic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTests(
  value: unknown,
  output: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTests(item, output);
  } else if (isRecord(value)) {
    if (
      typeof value.file === "string" &&
      (typeof value.targetId === "string" || typeof value.route === "string")
    ) {
      output.push(value);
    }
    for (const child of Object.values(value)) collectTests(child, output);
  }
  return output;
}

export function discoverPlaywright(
  value: unknown,
  targets: readonly AdapterTarget[],
  changedPaths: ReadonlySet<string>
): AdapterCandidate[] {
  const output: AdapterCandidate[] = [];
  for (const test of collectTests(value)) {
    const file = normalizeProjectPath(String(test.file));
    if (!changedPaths.has(file)) continue;
    const target =
      (typeof test.targetId === "string"
        ? targets.find((entry) => entry.id === test.targetId)
        : undefined) ??
      (typeof test.route === "string"
        ? targets.find((entry) => entry.routeOrStory === test.route)
        : undefined);
    if (!target) continue;
    output.push({
      targetId: target.id,
      source: "test",
      confidence: "strong",
      reason: `Changed Playwright test ${file} exercises ${target.routeOrStory}.`,
      changedPaths: [file],
      knownUsageCount: 1
    });
  }
  return output;
}
