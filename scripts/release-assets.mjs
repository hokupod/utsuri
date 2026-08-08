#!/usr/bin/env node

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  restorePluginArtifactModes,
  verifyPluginArchive
} from "./assemble-distribution-candidate.mjs";
import { nativeTargets, repositoryRoot } from "./assemble-release-package.mjs";
import { validateExactFileInventory } from "./release-manifest-contract.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha512Integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

export function expectedPackageTarballs(version) {
  return [
    ...nativeTargets.map((target) => ({
      packageName: `@utsu-ri/cli-${target}`,
      relative: `tarballs/utsu-ri-cli-${target}-${version}.tgz`
    })),
    { packageName: "@utsu-ri/cli", relative: `tarballs/utsu-ri-cli-${version}.tgz` }
  ];
}

function writeText(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`tar field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, "0")}\0`;
  if (encoded.length !== length) throw new Error(`tar numeric field is too large: ${value}`);
  writeText(buffer, offset, length, encoded);
}

function tarHeader(name, mode, size, type) {
  if (!/^[\x20-\x7e]+$/u.test(name) || Buffer.byteLength(name) > 100) {
    throw new Error(`Plugin archive path is not portable: ${name}`);
  }
  const header = Buffer.alloc(512, 0);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, type);
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function padded(bytes) {
  const remainder = bytes.length % 512;
  return remainder === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(512 - remainder, 0)]);
}

export function createDeterministicTarGzip(entries) {
  const chunks = [];
  for (const entry of entries) {
    const directory = entry.type === "directory";
    const bytes = directory ? Buffer.alloc(0) : Buffer.from(entry.bytes);
    chunks.push(tarHeader(entry.path, entry.mode, bytes.length, directory ? "5" : "0"));
    if (!directory) chunks.push(padded(bytes));
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

async function pluginArchiveBytes(plugin, candidateManifest) {
  const files = Object.entries(candidateManifest.files)
    .filter(([relative]) => relative.startsWith("plugin/"))
    .map(([relative, descriptor]) => [relative.slice("plugin/".length), descriptor])
    .sort(([left], [right]) => left.localeCompare(right));
  if (files.length === 0) throw new Error("candidate manifest has no Plugin files");

  const directories = new Set(["utsuri-plugin/"]);
  for (const [relative] of files) {
    const parts = relative.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`utsuri-plugin/${parts.slice(0, index).join("/")}/`);
    }
  }
  const entries = [...directories]
    .sort()
    .map((relative) => ({ path: relative, mode: 0o755, type: "directory" }));
  for (const [relative, descriptor] of files) {
    entries.push({
      path: `utsuri-plugin/${relative}`,
      mode: Number.parseInt(descriptor.mode, 8),
      type: "file",
      bytes: await readFile(path.join(plugin, relative))
    });
  }
  return createDeterministicTarGzip(entries);
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function validateAssetDescriptor(relative, descriptor, expectedPackageName) {
  const expectedKeys = expectedPackageName
    ? ["integrity", "packageName", "sha256", "size"]
    : ["sha256", "size"];
  if (
    !exactKeys(descriptor, expectedKeys) ||
    !/^[a-f0-9]{64}$/u.test(descriptor.sha256) ||
    !Number.isSafeInteger(descriptor.size) ||
    descriptor.size < 1
  ) {
    throw new Error(`release asset descriptor is invalid: ${relative}`);
  }
  if (
    expectedPackageName &&
    (descriptor.packageName !== expectedPackageName ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(descriptor.integrity))
  ) {
    throw new Error(`npm release asset descriptor is invalid: ${relative}`);
  }
}

async function assetDescriptor(filename, packageName) {
  const bytes = await readFile(filename);
  return {
    ...(packageName ? { integrity: sha512Integrity(bytes), packageName } : {}),
    sha256: sha256(bytes),
    size: bytes.length
  };
}

function sha256Sums(files) {
  return `${Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, descriptor]) => `${descriptor.sha256}  ${relative}`)
    .join("\n")}\n`;
}

export async function finalizeReleaseAssets(candidate, root = repositoryRoot) {
  const candidateRoot = path.resolve(candidate);
  const manifestPath = path.join(candidateRoot, "candidate-manifest.json");
  const candidateManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await verifyPluginArchive(path.join(candidateRoot, "plugin"), candidateManifest, root);
  const version = candidateManifest.version;
  const archiveRelative = `utsuri-plugin-${version}.tar.gz`;
  const archive = await pluginArchiveBytes(path.join(candidateRoot, "plugin"), candidateManifest);
  await writeFile(path.join(candidateRoot, archiveRelative), archive, { flag: "wx", mode: 0o600 });

  const files = {
    "candidate-manifest.json": await assetDescriptor(manifestPath),
    [archiveRelative]: await assetDescriptor(path.join(candidateRoot, archiveRelative))
  };
  for (const { packageName, relative } of expectedPackageTarballs(version)) {
    files[relative] = await assetDescriptor(path.join(candidateRoot, relative), packageName);
  }
  const releaseManifest = { schemaVersion: "1.0", version, files };
  await Promise.all([
    writeFile(
      path.join(candidateRoot, "release-assets.json"),
      `${JSON.stringify(releaseManifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 }
    ),
    writeFile(path.join(candidateRoot, "SHA256SUMS"), sha256Sums(files), {
      flag: "wx",
      mode: 0o600
    })
  ]);
  await verifyReleaseAssets(candidateRoot, root);
  return releaseManifest;
}

export async function verifyReleaseAssets(candidate, root = repositoryRoot) {
  const candidateRoot = path.resolve(candidate);
  const [candidateManifest, releaseManifest] = await Promise.all([
    readFile(path.join(candidateRoot, "candidate-manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(candidateRoot, "release-assets.json"), "utf8").then(JSON.parse)
  ]);
  await restorePluginArtifactModes(path.join(candidateRoot, "plugin"), candidateManifest, root);
  if (
    !exactKeys(releaseManifest, ["files", "schemaVersion", "version"]) ||
    releaseManifest.schemaVersion !== "1.0" ||
    releaseManifest.version !== candidateManifest.version ||
    !releaseManifest.files ||
    typeof releaseManifest.files !== "object" ||
    Array.isArray(releaseManifest.files)
  ) {
    throw new Error("release asset manifest is invalid");
  }

  const version = candidateManifest.version;
  const archiveRelative = `utsuri-plugin-${version}.tar.gz`;
  const packageTarballs = expectedPackageTarballs(version);
  const expectedAssets = [
    "candidate-manifest.json",
    archiveRelative,
    ...packageTarballs.map(({ relative }) => relative)
  ].sort();
  if (
    JSON.stringify(Object.keys(releaseManifest.files).sort()) !== JSON.stringify(expectedAssets)
  ) {
    throw new Error("release asset inventory is invalid");
  }

  const packageNames = new Map(
    packageTarballs.map(({ relative, packageName }) => [relative, packageName])
  );
  for (const relative of expectedAssets) {
    const descriptor = releaseManifest.files[relative];
    validateAssetDescriptor(relative, descriptor, packageNames.get(relative));
    const filename = path.join(candidateRoot, relative);
    const fileStat = await lstat(filename);
    const bytes = await readFile(filename);
    if (
      !fileStat.isFile() ||
      fileStat.isSymbolicLink() ||
      fileStat.size !== descriptor.size ||
      sha256(bytes) !== descriptor.sha256 ||
      (packageNames.has(relative) && sha512Integrity(bytes) !== descriptor.integrity)
    ) {
      throw new Error(`release asset differs from its manifest: ${relative}`);
    }
  }

  const expectedArchive = await pluginArchiveBytes(
    path.join(candidateRoot, "plugin"),
    candidateManifest
  );
  if (!(await readFile(path.join(candidateRoot, archiveRelative))).equals(expectedArchive)) {
    throw new Error("Plugin archive is not the deterministic candidate archive");
  }
  const sums = await readFile(path.join(candidateRoot, "SHA256SUMS"), "utf8");
  if (sums !== sha256Sums(releaseManifest.files)) throw new Error("SHA256SUMS is invalid");

  const pluginFiles = Object.keys(candidateManifest.files)
    .filter((relative) => relative.startsWith("plugin/"))
    .map((relative) => relative.slice("plugin/".length));
  const inventoryErrors = await validateExactFileInventory(candidateRoot, [
    "candidate-manifest.json",
    "release-assets.json",
    "SHA256SUMS",
    archiveRelative,
    ...packageTarballs.map(({ relative }) => relative),
    ...pluginFiles.map((relative) => `plugin/${relative}`)
  ]);
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  return releaseManifest;
}

function parseArguments(arguments_) {
  const command = arguments_[0];
  if (command !== "finalize" && command !== "verify") {
    throw new Error("first argument must be finalize or verify");
  }
  if (arguments_[1] !== "--candidate" || !arguments_[2] || arguments_.length !== 3) {
    throw new Error(`${command} requires --candidate PATH`);
  }
  return { command, candidate: path.resolve(arguments_[2]) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, candidate } = parseArguments(process.argv.slice(2));
    const result =
      command === "finalize"
        ? await finalizeReleaseAssets(candidate)
        : await verifyReleaseAssets(candidate);
    process.stdout.write(
      `${JSON.stringify({ ok: true, version: result.version, assets: Object.keys(result.files).length })}\n`
    );
  } catch (error) {
    process.stderr.write(`RELEASE_ASSETS_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
