import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256, stableHash } from "@utsu-ri/core";

export function targetDirectoryName(targetId: string): string {
  const readable = targetId.replace(/[^a-zA-Z0-9_-]+/gu, "-").slice(0, 48);
  return `${readable}-${stableHash(targetId).slice(0, 8)}`;
}

export async function createAttemptDirectory(
  runDirectory: string,
  targetId: string,
  side: "before" | "after"
): Promise<string> {
  const parent = path.join(runDirectory, "capture", "targets", targetDirectoryName(targetId), side);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const attempts = (await readdir(parent))
    .map((name) => /^attempt-(\d+)$/u.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const directory = path.join(parent, `attempt-${Math.max(0, ...attempts) + 1}`);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  return directory;
}

export async function writeJsonArtifact(
  directory: string,
  name: string,
  value: unknown
): Promise<string> {
  const filename = path.join(directory, name);
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  return filename;
}

export function artifactReference(runDirectory: string, filename: string): string {
  const relative = path.relative(runDirectory, filename).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../")) {
    throw new Error("Capture artifact escaped the run directory");
  }
  return relative;
}

export async function artifactDigests(
  runDirectory: string,
  references: readonly string[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    [...new Set(references)]
      .sort()
      .map(
        async (reference) =>
          [reference, sha256(await readFile(path.join(runDirectory, reference)))] as const
      )
  );
  return Object.fromEntries(entries);
}

export async function publishCaptureManifest(
  runDirectory: string,
  value: unknown
): Promise<string> {
  const filename = path.join(runDirectory, "capture.json");
  const temporary = path.join(runDirectory, `.capture-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, filename);
  return filename;
}
