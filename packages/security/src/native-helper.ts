import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const nativeHelperTargets = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64"
] as const;
export type NativeHelperTarget = (typeof nativeHelperTargets)[number];

export const nativeHelperPackageVersion = "0.3.2";

interface NativeHelperIntegrity {
  schemaVersion: "1.0";
  target: NativeHelperTarget;
  sourceSha256: string;
  helperSha256: string;
}

function currentTarget(): NativeHelperTarget | null {
  const value = `${process.platform}-${process.arch}`;
  return nativeHelperTargets.find((target) => target === value) ?? null;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function executableRegularFile(filename: string): Promise<string | null> {
  try {
    const fileStat = await lstat(filename);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) return null;
    await access(filename, constants.X_OK);
    return await realpath(filename);
  } catch {
    return null;
  }
}

async function optionalPackageHelper(target: NativeHelperTarget): Promise<string | null> {
  const packageName = `@utsu-ri/cli-${target}`;
  const require = createRequire(import.meta.url);
  let helper: string;
  let manifestFile: string;
  try {
    helper = require.resolve(`${packageName}/bin/utsuri-fs-ops`);
    manifestFile = require.resolve(`${packageName}/package.json`);
  } catch {
    return null;
  }
  const resolvedHelper = await executableRegularFile(helper);
  if (!resolvedHelper) return null;
  const packageDirectory = path.dirname(await realpath(manifestFile));
  const expectedHelper = path.join(packageDirectory, "bin/utsuri-fs-ops");
  if (resolvedHelper !== expectedHelper) return null;
  try {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as Record<string, unknown>;
    const expectedOs = target.startsWith("darwin-") ? "darwin" : "linux";
    const expectedCpu = target.endsWith("-arm64") ? "arm64" : "x64";
    if (
      manifest.name !== packageName ||
      manifest.version !== nativeHelperPackageVersion ||
      manifest.license !== "AGPL-3.0-or-later" ||
      JSON.stringify(manifest.os) !== JSON.stringify([expectedOs]) ||
      JSON.stringify(manifest.cpu) !== JSON.stringify([expectedCpu])
    ) {
      return null;
    }
    const integrity = JSON.parse(
      await readFile(path.join(packageDirectory, "integrity.json"), "utf8")
    ) as NativeHelperIntegrity;
    if (
      integrity.schemaVersion !== "1.0" ||
      integrity.target !== target ||
      !/^[a-f0-9]{64}$/u.test(integrity.sourceSha256) ||
      integrity.helperSha256 !== sha256(await readFile(resolvedHelper))
    ) {
      return null;
    }
    return resolvedHelper;
  } catch {
    return null;
  }
}

export async function resolveNativeHelper(): Promise<string | null> {
  const target = currentTarget();
  if (!target) return null;
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.join(moduleDirectory, "native", target, "utsuri-fs-ops"),
    await optionalPackageHelper(target),
    path.resolve(moduleDirectory, "../../..", ".artifacts/native", target, "utsuri-fs-ops"),
    path.resolve(moduleDirectory, "../../../..", ".artifacts/native", target, "utsuri-fs-ops")
  ]) {
    if (!candidate) continue;
    const resolved = await executableRegularFile(candidate);
    if (resolved) return resolved;
  }
  return null;
}
