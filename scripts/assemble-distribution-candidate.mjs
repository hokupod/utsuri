#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleCliPackage,
  assembleNativeHelperPackage,
  assertNativeBinary,
  nativeProofTests,
  nativeTargets,
  preparePrivateDirectory,
  repositoryRoot
} from "./assemble-release-package.mjs";
import {
  validateCliManifest,
  validateExactFileInventory,
  validateNativeHelperManifest
} from "./release-manifest-contract.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writePrivate(filename, bytes, executable = false) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const mode = executable ? 0o755 : 0o644;
  await writeFile(filename, bytes, { flag: "wx", mode });
  await chmod(filename, mode);
}

async function copyTree(source, destination, options = {}) {
  const rootStat = await lstat(source);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Distribution source is not a regular directory: ${source}`);
  }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const sourceName = path.join(source, entry.name);
    const destinationName = path.join(destination, entry.name);
    const relative = options.prefix ? `${options.prefix}/${entry.name}` : entry.name;
    if (options.skip?.(relative)) continue;
    const entryStat = await lstat(sourceName);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Distribution source contains a symlink: ${relative}`);
    }
    if (entryStat.isDirectory()) {
      await copyTree(sourceName, destinationName, { ...options, prefix: relative });
    } else if (entryStat.isFile()) {
      if (entryStat.size > 256 * 1024 * 1024) {
        throw new Error(`Distribution source is too large: ${relative}`);
      }
      await writePrivate(
        destinationName,
        await readFile(sourceName),
        (entryStat.mode & 0o111) !== 0
      );
    } else {
      throw new Error(`Distribution source contains a special file: ${relative}`);
    }
  }
}

async function treeFiles(root, prefix = "") {
  const files = [];
  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const entryStat = await lstat(absolute);
      if (entryStat.isSymbolicLink()) throw new Error(`Candidate contains a symlink: ${relative}`);
      if (entryStat.isDirectory()) await visit(absolute, relative);
      else if (entryStat.isFile()) files.push(prefix ? `${prefix}/${relative}` : relative);
      else throw new Error(`Candidate contains a special file: ${relative}`);
    }
  }
  await visit(root, "");
  return files;
}

async function candidateFileManifest(candidate, sourceSha256, version) {
  const files = (await treeFiles(candidate)).filter((name) => name !== "candidate-manifest.json");
  return {
    schemaVersion: "1.0",
    version,
    targets: nativeTargets,
    sourceSha256,
    files: Object.fromEntries(
      await Promise.all(
        files.sort().map(async (relative) => {
          const filename = path.join(candidate, relative);
          const fileStat = await lstat(filename);
          return [
            relative,
            {
              sha256: sha256(await readFile(filename)),
              mode: (fileStat.mode & 0o777).toString(8).padStart(3, "0")
            }
          ];
        })
      )
    )
  };
}

export async function assembleDistributionCandidate(output, nativeRoot, root = repositoryRoot) {
  const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const candidate = await preparePrivateDirectory(output);
  const packagesRoot = path.join(candidate, "packages");
  await mkdir(packagesRoot, { mode: 0o700 });
  await assembleCliPackage(path.join(packagesRoot, "cli"), root);
  const nativePackageRoot = path.join(packagesRoot, "native");
  await mkdir(nativePackageRoot, { mode: 0o700 });
  for (const target of nativeTargets) {
    await assembleNativeHelperPackage(path.join(nativePackageRoot, target), target, root, {
      helper: path.join(nativeRoot, target, "utsuri-fs-ops"),
      proof: path.join(nativeRoot, target, "proof.json")
    });
  }

  const pluginRoot = path.join(candidate, "plugin");
  await mkdir(pluginRoot, { mode: 0o700 });
  await Promise.all([
    copyTree(path.join(root, ".codex-plugin"), path.join(pluginRoot, ".codex-plugin")),
    copyTree(path.join(root, ".claude-plugin"), path.join(pluginRoot, ".claude-plugin"), {
      prefix: ".claude-plugin",
      skip: (relative) => relative === ".claude-plugin/marketplace.json"
    }),
    copyTree(path.join(root, "skills"), path.join(pluginRoot, "skills"), {
      prefix: "skills",
      skip: (relative) => relative === "skills/utsuri-review/scripts/native"
    })
  ]);
  for (const target of nativeTargets) {
    const source = path.join(nativeRoot, target, "utsuri-fs-ops");
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || (sourceStat.mode & 0o111) === 0) {
      throw new Error(`Plugin helper is not a regular executable for ${target}`);
    }
    await writePrivate(
      path.join(pluginRoot, "skills/utsuri-review/scripts/native", target, "utsuri-fs-ops"),
      await readFile(source),
      true
    );
  }

  const sourceSha256 = sha256(await readFile(path.join(root, "native/utsuri-fs-ops.c")));
  const manifest = await candidateFileManifest(candidate, sourceSha256, rootManifest.version);
  await writePrivate(
    path.join(candidate, "candidate-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await verifyDistributionCandidate(candidate, root);
  return { directory: candidate, manifest };
}

async function exactDirectories(directory, expected) {
  const entries = await readdir(directory, { withFileTypes: true });
  const actual = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink()) ||
    JSON.stringify(actual) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${directory} must contain only ${expected.join(", ")}`);
  }
}

function validateCandidateFileEntry(relative, expected) {
  if (
    !relative ||
    relative === "." ||
    relative === ".." ||
    relative.startsWith("../") ||
    relative.startsWith("/") ||
    relative.endsWith("/") ||
    relative.includes("\\") ||
    path.posix.normalize(relative) !== relative ||
    !expected ||
    typeof expected !== "object" ||
    Array.isArray(expected) ||
    JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(["mode", "sha256"]) ||
    !/^[a-f0-9]{64}$/u.test(expected.sha256) ||
    !["644", "755"].includes(expected.mode)
  ) {
    throw new Error(`Distribution candidate file entry is invalid: ${relative}`);
  }
}

async function assertCandidateManifestIdentity(manifest, root) {
  const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const sourceBytes = await readFile(path.join(root, "native/utsuri-fs-ops.c"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    JSON.stringify(Object.keys(manifest).sort()) !==
      JSON.stringify(["files", "schemaVersion", "sourceSha256", "targets", "version"].sort()) ||
    manifest.schemaVersion !== "1.0" ||
    manifest.version !== rootManifest.version ||
    manifest.sourceSha256 !== sha256(sourceBytes) ||
    JSON.stringify(manifest.targets) !== JSON.stringify(nativeTargets) ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  ) {
    throw new Error("Distribution candidate manifest is invalid");
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    validateCandidateFileEntry(relative, expected);
  }
  return { rootManifest, sourceBytes };
}

function pluginManifestEntries(manifest) {
  const entries = Object.entries(manifest.files)
    .filter(([relative]) => relative.startsWith("plugin/"))
    .map(([relative, expected]) => [relative.slice("plugin/".length), expected]);
  if (entries.length === 0) throw new Error("Candidate manifest has no Plugin files");
  for (const [relative, expected] of entries) validateCandidateFileEntry(relative, expected);
  return entries;
}

export async function verifyDistributionCandidate(candidate, root = repositoryRoot) {
  const manifest = JSON.parse(
    await readFile(path.join(candidate, "candidate-manifest.json"), "utf8")
  );
  const { rootManifest, sourceBytes } = await assertCandidateManifestIdentity(manifest, root);
  const inventoryErrors = await validateExactFileInventory(candidate, [
    ...Object.keys(manifest.files),
    "candidate-manifest.json"
  ]);
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  for (const forbidden of [
    "plugin/.agents",
    "plugin/plugins",
    "plugin/.claude-plugin/marketplace.json"
  ]) {
    if (
      Object.keys(manifest.files).some(
        (relative) => relative === forbidden || relative.startsWith(`${forbidden}/`)
      )
    ) {
      throw new Error(`Aggregate Plugin must not contain Git Marketplace material: ${forbidden}`);
    }
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const filename = path.join(candidate, relative);
    const fileStat = await lstat(filename);
    const mode = (fileStat.mode & 0o777).toString(8).padStart(3, "0");
    if (
      !fileStat.isFile() ||
      fileStat.isSymbolicLink() ||
      expected.sha256 !== sha256(await readFile(filename)) ||
      expected.mode !== mode ||
      !["644", "755"].includes(mode)
    ) {
      throw new Error(`Distribution candidate file does not match its manifest: ${relative}`);
    }
  }

  await exactDirectories(path.join(candidate, "packages/native"), nativeTargets);
  await exactDirectories(
    path.join(candidate, "plugin/skills/utsuri-review/scripts/native"),
    nativeTargets
  );
  const cliPackage = JSON.parse(
    await readFile(path.join(candidate, "packages/cli/package.json"), "utf8")
  );
  const cliErrors = validateCliManifest(cliPackage, rootManifest.version);
  if (cliErrors.length > 0) throw new Error(cliErrors.join("; "));

  const pluginBundle = await readFile(
    path.join(candidate, "plugin/skills/utsuri-review/scripts/utsuri.mjs")
  );
  const cliBundle = await readFile(path.join(candidate, "packages/cli/dist/utsuri.mjs"));
  if (!pluginBundle.equals(cliBundle)) throw new Error("Plugin and npm CLI bundles differ");

  for (const target of nativeTargets) {
    const packageRoot = path.join(candidate, "packages/native", target);
    const packageManifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8")
    );
    const packageErrors = validateNativeHelperManifest(
      packageManifest,
      rootManifest.version,
      target
    );
    if (packageErrors.length > 0) throw new Error(packageErrors.join("; "));
    const nativeInventoryErrors = await validateExactFileInventory(packageRoot, [
      "LICENSE",
      "bin/utsuri-fs-ops",
      "integrity.json",
      "package.json",
      "proof.json"
    ]);
    if (nativeInventoryErrors.length > 0) throw new Error(nativeInventoryErrors.join("; "));
    const helper = await readFile(path.join(packageRoot, "bin/utsuri-fs-ops"));
    assertNativeBinary(helper, target);
    await access(path.join(packageRoot, "bin/utsuri-fs-ops"), constants.X_OK);
    const integrity = JSON.parse(await readFile(path.join(packageRoot, "integrity.json"), "utf8"));
    const proof = JSON.parse(await readFile(path.join(packageRoot, "proof.json"), "utf8"));
    if (
      integrity.target !== target ||
      integrity.sourceSha256 !== sha256(sourceBytes) ||
      integrity.helperSha256 !== sha256(helper) ||
      JSON.stringify(proof) !==
        JSON.stringify({
          schemaVersion: "1.0",
          target,
          sourceSha256: sha256(sourceBytes),
          helperSha256: sha256(helper),
          tests: nativeProofTests(target)
        })
    ) {
      throw new Error(`Native helper integrity or proof is invalid for ${target}`);
    }
    const pluginHelper = await readFile(
      path.join(candidate, "plugin/skills/utsuri-review/scripts/native", target, "utsuri-fs-ops")
    );
    if (!pluginHelper.equals(helper)) throw new Error(`Plugin helper differs for ${target}`);
    await access(
      path.join(candidate, "plugin/skills/utsuri-review/scripts/native", target, "utsuri-fs-ops"),
      constants.X_OK
    );
  }
  return manifest;
}

export async function verifyPluginArchive(plugin, candidateManifest, root = repositoryRoot) {
  const manifest =
    typeof candidateManifest === "string"
      ? JSON.parse(await readFile(candidateManifest, "utf8"))
      : candidateManifest;
  await assertCandidateManifestIdentity(manifest, root);
  const expectedEntries = pluginManifestEntries(manifest);
  const inventoryErrors = await validateExactFileInventory(
    plugin,
    expectedEntries.map(([relative]) => relative)
  );
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  for (const [relative, expected] of expectedEntries) {
    const filename = path.join(plugin, relative);
    const fileStat = await lstat(filename);
    const mode = (fileStat.mode & 0o777).toString(8).padStart(3, "0");
    if (
      !fileStat.isFile() ||
      fileStat.isSymbolicLink() ||
      expected.sha256 !== sha256(await readFile(filename)) ||
      expected.mode !== mode
    ) {
      throw new Error(`Plugin file differs from the candidate manifest: ${relative}`);
    }
  }
  await exactDirectories(path.join(plugin, "skills/utsuri-review/scripts/native"), nativeTargets);
  for (const target of nativeTargets) {
    const helper = path.join(
      plugin,
      "skills/utsuri-review/scripts/native",
      target,
      "utsuri-fs-ops"
    );
    const bytes = await readFile(helper);
    assertNativeBinary(bytes, target);
    await access(helper, constants.X_OK);
  }
  return manifest;
}

export async function restorePluginArtifactModes(plugin, candidateManifest, root = repositoryRoot) {
  const manifest =
    typeof candidateManifest === "string"
      ? JSON.parse(await readFile(candidateManifest, "utf8"))
      : candidateManifest;
  await assertCandidateManifestIdentity(manifest, root);
  const expectedEntries = pluginManifestEntries(manifest);
  const inventoryErrors = await validateExactFileInventory(
    plugin,
    expectedEntries.map(([relative]) => relative)
  );
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  const verified = [];
  for (const [relative, expected] of expectedEntries) {
    const filename = path.join(plugin, relative);
    const fileStat = await lstat(filename);
    if (
      !fileStat.isFile() ||
      fileStat.isSymbolicLink() ||
      expected.sha256 !== sha256(await readFile(filename))
    ) {
      throw new Error(`Downloaded Plugin file differs from the candidate manifest: ${relative}`);
    }
    verified.push([filename, Number.parseInt(expected.mode, 8)]);
  }
  await Promise.all(verified.map(([filename, mode]) => chmod(filename, mode)));
  return verifyPluginArchive(plugin, manifest, root);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--verify-plugin")) {
    const plugin = option("--verify-plugin");
    const manifest = option("--manifest");
    if (!plugin || !manifest) {
      throw new Error("--verify-plugin and --manifest require paths");
    }
    await verifyPluginArchive(path.resolve(plugin), path.resolve(manifest));
    console.log(`Verified aggregate Plugin at ${path.resolve(plugin)}`);
  } else if (process.argv.includes("--restore-plugin-modes")) {
    const plugin = option("--restore-plugin-modes");
    const manifest = option("--manifest");
    if (!plugin || !manifest) {
      throw new Error("--restore-plugin-modes and --manifest require paths");
    }
    await restorePluginArtifactModes(path.resolve(plugin), path.resolve(manifest));
    console.log(`Restored and verified aggregate Plugin at ${path.resolve(plugin)}`);
  } else if (process.argv.includes("--verify")) {
    const candidate = option("--verify");
    if (!candidate) throw new Error("--verify requires a candidate directory");
    await verifyDistributionCandidate(path.resolve(candidate));
    console.log(`Verified distribution candidate at ${path.resolve(candidate)}`);
  } else {
    const output = option("--output");
    const nativeRoot = option("--native-root");
    if (!output || !nativeRoot) {
      throw new Error(
        "Usage: assemble-distribution-candidate.mjs --output PATH --native-root PATH"
      );
    }
    await assembleDistributionCandidate(path.resolve(output), path.resolve(nativeRoot));
    console.log(`Assembled distribution candidate at ${path.resolve(output)}`);
  }
}
