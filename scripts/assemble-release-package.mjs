#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expectedNativeOptionalDependencies,
  validateCliManifest,
  validateCliSourceManifest,
  validateExactFileInventory,
  validateNativeHelperManifest
} from "./release-manifest-contract.mjs";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const nativeTargets = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];

export function nativeProofTests(target) {
  const tests = ["architecture", "contained-read", "no-replace-publication", "path-rejection"];
  if (target.startsWith("linux-")) {
    tests.push(
      "pidfd-browser-termination",
      "pidfd-forged-executable-rejection",
      "pidfd-foreign-parent-rejection"
    );
  }
  return tests;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readRegular(filename, maximumBytes = 256 * 1024 * 1024) {
  const fileStat = await lstat(filename);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > maximumBytes) {
    throw new Error(`Release source must be a bounded regular file: ${filename}`);
  }
  return readFile(filename);
}

export async function preparePrivateDirectory(output) {
  const absolute = path.resolve(output);
  if (absolute === path.parse(absolute).root) throw new Error("Release staging root is too broad");
  const parent = await realpath(path.dirname(absolute));
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("Release staging parent must be a real directory");
  }
  if ((parentStat.mode & 0o022) !== 0 && (parentStat.mode & 0o1000) === 0) {
    throw new Error("Release staging parent is writable by another user");
  }
  try {
    await lstat(absolute);
    throw new Error("Release staging output already exists");
  } catch (error) {
    if (error.message === "Release staging output already exists") throw error;
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(absolute, { mode: 0o700 });
  await chmod(absolute, 0o700);
  return absolute;
}

async function writeRegular(filename, bytes, mode = 0o644) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, bytes, { flag: "wx", mode });
  await chmod(filename, mode);
}

function taggedReadme(source, version) {
  const tag = `v${version}`;
  const result = source.replaceAll(
    "https://github.com/hokupod/utsuri/blob/main/",
    `https://github.com/hokupod/utsuri/blob/${tag}/`
  );
  if (/github\.com\/hokupod\/utsuri\/(?:blob|tree)\/main(?:\/|\b)/u.test(result)) {
    throw new Error("Staged README contains a mutable main-branch link");
  }
  for (const match of result.matchAll(/\]\(([^)]+)\)/gu)) {
    const destination = match[1];
    if (!destination || destination.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(destination)) {
      continue;
    }
    throw new Error(`Staged README contains a package-relative link: ${destination}`);
  }
  return result;
}

export async function assembleCliPackage(output, root = repositoryRoot) {
  const [rootManifest, sourceManifest, readme, license] = await Promise.all([
    readRegular(path.join(root, "package.json")).then(JSON.parse),
    readRegular(path.join(root, "packages/cli/package.json")).then(JSON.parse),
    readRegular(path.join(root, "README.md")).then((value) => value.toString("utf8")),
    readRegular(path.join(root, "LICENSE"))
  ]);
  const sourceErrors = validateCliSourceManifest(sourceManifest, rootManifest.version);
  if (sourceErrors.length > 0) throw new Error(sourceErrors.join("; "));
  const staging = await preparePrivateDirectory(output);
  const manifest = {
    name: "@utsu-ri/cli",
    version: rootManifest.version,
    description: "Evidence-backed visual change review for Codex and Claude Code",
    license: "AGPL-3.0-or-later",
    author: { name: "hokupod" },
    repository: {
      type: "git",
      url: "git+https://github.com/hokupod/utsuri.git"
    },
    homepage: `https://github.com/hokupod/utsuri/tree/v${rootManifest.version}#readme`,
    bugs: { url: "https://github.com/hokupod/utsuri/issues" },
    type: "module",
    engines: { node: ">=22" },
    bin: { utsuri: "dist/utsuri.mjs" },
    files: ["dist", "README.md", "LICENSE"],
    publishConfig: { access: "public" },
    dependencies: {},
    optionalDependencies: expectedNativeOptionalDependencies(rootManifest.version)
  };
  const manifestErrors = validateCliManifest(manifest, rootManifest.version);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("; "));
  const sourceDist = path.join(root, "packages/cli/dist");
  const stagedFiles = [
    "build-manifest.json",
    "sbom.spdx.json",
    "third-party-licenses.json",
    "utsuri.mjs"
  ];
  await Promise.all([
    writeRegular(path.join(staging, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeRegular(path.join(staging, "README.md"), taggedReadme(readme, rootManifest.version)),
    writeRegular(path.join(staging, "LICENSE"), license),
    ...stagedFiles.map(async (name) =>
      writeRegular(
        path.join(staging, "dist", name),
        await readRegular(path.join(sourceDist, name)),
        name === "utsuri.mjs" ? 0o755 : 0o644
      )
    )
  ]);
  const expected = [
    "LICENSE",
    "README.md",
    "package.json",
    ...stagedFiles.map((name) => `dist/${name}`)
  ];
  const inventoryErrors = await validateExactFileInventory(staging, expected);
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  await access(path.join(staging, "dist/utsuri.mjs"), constants.X_OK);
  return { directory: staging, manifest };
}

export function assertNativeBinary(bytes, target) {
  if (target.startsWith("linux-")) {
    if (
      bytes.length < 20 ||
      bytes[0] !== 0x7f ||
      bytes[1] !== 0x45 ||
      bytes[2] !== 0x4c ||
      bytes[3] !== 0x46 ||
      bytes[4] !== 2 ||
      bytes[5] !== 1
    ) {
      throw new Error(`Native helper is not a 64-bit little-endian ELF for ${target}`);
    }
    const machine = bytes.readUInt16LE(18);
    const expected = target.endsWith("-arm64") ? 183 : 62;
    if (machine !== expected)
      throw new Error(`Native helper ELF architecture is wrong for ${target}`);
    return;
  }
  if (
    bytes.length < 8 ||
    bytes[0] !== 0xcf ||
    bytes[1] !== 0xfa ||
    bytes[2] !== 0xed ||
    bytes[3] !== 0xfe
  ) {
    throw new Error(`Native helper is not a 64-bit little-endian Mach-O for ${target}`);
  }
  const cpu = bytes.readUInt32LE(4);
  const expected = target.endsWith("-arm64") ? 0x0100000c : 0x01000007;
  if (cpu !== expected) throw new Error(`Native helper Mach-O architecture is wrong for ${target}`);
}

export async function assembleNativeHelperPackage(
  output,
  target,
  root = repositoryRoot,
  options = {}
) {
  if (!nativeTargets.includes(target)) throw new Error(`Unsupported native target: ${target}`);
  const helperFilename =
    options.helper ?? path.join(root, ".artifacts/native", target, "utsuri-fs-ops");
  const proofFilename = options.proof ?? path.join(root, ".artifacts/native", target, "proof.json");
  const [rootManifest, helper, source, proofBytes, license] = await Promise.all([
    readRegular(path.join(root, "package.json")).then(JSON.parse),
    readRegular(helperFilename),
    readRegular(path.join(root, "native/utsuri-fs-ops.c")),
    readRegular(proofFilename),
    readRegular(path.join(root, "LICENSE"))
  ]);
  assertNativeBinary(helper, target);
  const proof = JSON.parse(proofBytes.toString("utf8"));
  const expectedSourceSha256 = sha256(source);
  const expectedHelperSha256 = sha256(helper);
  if (
    JSON.stringify(Object.keys(proof).sort()) !==
      JSON.stringify(["helperSha256", "schemaVersion", "sourceSha256", "target", "tests"].sort()) ||
    proof.schemaVersion !== "1.0" ||
    proof.target !== target ||
    proof.sourceSha256 !== expectedSourceSha256 ||
    proof.helperSha256 !== expectedHelperSha256 ||
    JSON.stringify(proof.tests) !== JSON.stringify(nativeProofTests(target))
  ) {
    throw new Error(`Native helper proof is invalid for ${target}`);
  }
  const staging = await preparePrivateDirectory(output);
  const manifest = {
    name: `@utsu-ri/cli-${target}`,
    version: rootManifest.version,
    description: `Atomic filesystem helper for Utsuri on ${target}`,
    license: "AGPL-3.0-or-later",
    author: { name: "hokupod" },
    repository: {
      type: "git",
      url: "git+https://github.com/hokupod/utsuri.git"
    },
    os: [target.startsWith("darwin-") ? "darwin" : "linux"],
    cpu: [target.endsWith("-arm64") ? "arm64" : "x64"],
    files: ["bin", "integrity.json", "proof.json", "LICENSE"],
    publishConfig: { access: "public" }
  };
  const manifestErrors = validateNativeHelperManifest(manifest, rootManifest.version, target);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("; "));
  const integrity = {
    schemaVersion: "1.0",
    target,
    sourceSha256: expectedSourceSha256,
    helperSha256: expectedHelperSha256
  };
  await Promise.all([
    writeRegular(path.join(staging, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeRegular(path.join(staging, "integrity.json"), `${JSON.stringify(integrity, null, 2)}\n`),
    writeRegular(path.join(staging, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`),
    writeRegular(path.join(staging, "LICENSE"), license),
    writeRegular(path.join(staging, "bin/utsuri-fs-ops"), helper, 0o755)
  ]);
  const inventoryErrors = await validateExactFileInventory(staging, [
    "LICENSE",
    "bin/utsuri-fs-ops",
    "integrity.json",
    "package.json",
    "proof.json"
  ]);
  if (inventoryErrors.length > 0) throw new Error(inventoryErrors.join("; "));
  await access(path.join(staging, "bin/utsuri-fs-ops"), constants.X_OK);
  return { directory: staging, manifest, integrity };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kind = option("--kind");
  const output = option("--output");
  if (!output || (kind !== "cli" && kind !== "native")) {
    throw new Error(
      "Usage: assemble-release-package.mjs --kind cli|native --output PATH [--target TARGET]"
    );
  }
  if (kind === "cli") {
    await assembleCliPackage(output);
  } else {
    const target = option("--target");
    if (!target) throw new Error("--target is required for a native helper package");
    await assembleNativeHelperPackage(output, target, repositoryRoot, {
      helper: option("--helper"),
      proof: option("--proof")
    });
  }
  console.log(`Assembled private ${kind} release staging at ${path.resolve(output)}`);
}
