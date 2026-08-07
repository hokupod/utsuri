import {
  normalizeProjectPath,
  type AdapterCandidate,
  type AdapterTarget
} from "@utsu-ri/adapter-generic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function targetForStory(
  targets: readonly AdapterTarget[],
  storyId: string,
  title: string
): AdapterTarget | undefined {
  const tokens = `${storyId} ${title}`.toLowerCase().replace(/[^a-z0-9]+/gu, " ");
  return (
    targets.find((target) => tokens.includes(target.id.toLowerCase().replaceAll("-", " "))) ??
    (targets.length === 1 ? targets[0] : undefined)
  );
}

export function discoverStorybook(
  value: unknown,
  targets: readonly AdapterTarget[],
  changedPaths: ReadonlySet<string>
): AdapterCandidate[] {
  if (!isRecord(value) || !isRecord(value.entries)) return [];
  const output: AdapterCandidate[] = [];
  for (const [storyId, rawEntry] of Object.entries(value.entries)) {
    if (!isRecord(rawEntry) || typeof rawEntry.importPath !== "string") continue;
    const importPath = normalizeProjectPath(rawEntry.importPath);
    if (!changedPaths.has(importPath)) continue;
    const title = typeof rawEntry.title === "string" ? rawEntry.title : storyId;
    const target = targetForStory(targets, storyId, title);
    if (!target) continue;
    output.push({
      targetId: target.id,
      source: "storybook",
      confidence: "strong",
      reason: `Storybook story ${storyId} directly imports changed source ${importPath}.`,
      changedPaths: [importPath],
      knownUsageCount: 1
    });
  }
  return output;
}
