#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeBinary } from "./assemble-release-package.mjs";
import {
  validateCliManifest,
  validateExactFileInventory,
  validateNativeHelperManifest
} from "./release-manifest-contract.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function strictJsonCommand(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: {
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR
    },
    shell: false,
    timeout: 30_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) {
    throw new Error(`Installed CLI failed: ${result.stderr || result.stdout}`);
  }
  if (result.stderr !== "") throw new Error(`Installed CLI wrote to stderr: ${result.stderr}`);
  const lines = result.stdout.split(/\r?\n/u);
  if (lines.at(-1) !== "") throw new Error("Installed CLI output is not newline terminated");
  lines.pop();
  if (lines.length !== 1 || !lines[0]) throw new Error("Installed CLI did not emit one JSON line");
  return JSON.parse(lines[0]);
}

export async function verifyInstalledCli({ installRoot, target, version }) {
  if (target !== `${process.platform}-${process.arch}`) {
    throw new Error(`Install target ${target} does not match current runtime`);
  }
  const cliRoot = await realpath(path.join(installRoot, "node_modules/@utsu-ri/cli"));
  const nativeRoot = await realpath(path.join(installRoot, `node_modules/@utsu-ri/cli-${target}`));
  for (const [label, directory] of [
    ["CLI", cliRoot],
    ["native helper", nativeRoot]
  ]) {
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(`${label} install is not a regular directory`);
    }
    const relative = path.relative(await realpath(installRoot), directory);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`${label} install escaped the isolated root`);
    }
  }

  const cliManifest = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  const cliErrors = validateCliManifest(cliManifest, version);
  if (cliErrors.length > 0) throw new Error(cliErrors.join("; "));
  const cliInventoryErrors = await validateExactFileInventory(cliRoot, [
    "LICENSE",
    "README.md",
    "dist/build-manifest.json",
    "dist/sbom.spdx.json",
    "dist/third-party-licenses.json",
    "dist/utsuri.mjs",
    "package.json"
  ]);
  if (cliInventoryErrors.length > 0) throw new Error(cliInventoryErrors.join("; "));

  const nativeManifest = JSON.parse(await readFile(path.join(nativeRoot, "package.json"), "utf8"));
  const nativeErrors = validateNativeHelperManifest(nativeManifest, version, target);
  if (nativeErrors.length > 0) throw new Error(nativeErrors.join("; "));
  const nativeInventoryErrors = await validateExactFileInventory(nativeRoot, [
    "LICENSE",
    "bin/utsuri-fs-ops",
    "integrity.json",
    "package.json",
    "proof.json"
  ]);
  if (nativeInventoryErrors.length > 0) throw new Error(nativeInventoryErrors.join("; "));
  const helperFilename = path.join(nativeRoot, "bin/utsuri-fs-ops");
  await access(helperFilename, constants.X_OK);
  const helper = await readFile(helperFilename);
  assertNativeBinary(helper, target);
  const integrity = JSON.parse(await readFile(path.join(nativeRoot, "integrity.json"), "utf8"));
  const proof = JSON.parse(await readFile(path.join(nativeRoot, "proof.json"), "utf8"));
  if (
    integrity.target !== target ||
    integrity.helperSha256 !== sha256(helper) ||
    JSON.stringify(integrity) !==
      JSON.stringify({
        schemaVersion: "1.0",
        target,
        sourceSha256: proof.sourceSha256,
        helperSha256: proof.helperSha256
      }) ||
    proof.helperSha256 !== sha256(helper) ||
    proof.target !== target
  ) {
    throw new Error("Installed native helper integrity is invalid");
  }

  const cli = path.join(cliRoot, "dist/utsuri.mjs");
  await access(cli, constants.X_OK);
  const versionResult = strictJsonCommand(
    process.execPath,
    [cli, "--version", "--json"],
    installRoot
  );
  if (
    JSON.stringify(versionResult) !==
    JSON.stringify({
      ok: true,
      command: "version",
      package: "@utsu-ri/cli",
      version,
      protocolVersion: "1.0"
    })
  ) {
    throw new Error("Installed CLI returned the wrong identity");
  }

  const run = path.join(installRoot, "smoke-run");
  await mkdir(run, { mode: 0o700 });
  await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n', { mode: 0o600 });
  const finalized = strictJsonCommand(
    process.execPath,
    [cli, "finalize", "--run", "smoke-run", "--json"],
    installRoot
  );
  if (finalized.command !== "finalize" || finalized.ok !== true) {
    throw new Error("Installed CLI could not publish an immutable report");
  }
  const validated = strictJsonCommand(
    process.execPath,
    [cli, "validate", "smoke-run/report", "--strict", "--json"],
    installRoot
  );
  if (validated.command !== "validate" || validated.ok !== true) {
    throw new Error("Installed CLI could not strictly validate its report");
  }
  return { target, version, reportId: validated.reportId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installRoot = option("--root");
  const target = option("--target");
  const version = option("--version");
  if (!installRoot || !target || !version) {
    throw new Error(
      "Usage: verify-installed-cli.mjs --root PATH --target TARGET --version VERSION"
    );
  }
  const result = await verifyInstalledCli({
    installRoot: path.resolve(installRoot),
    target,
    version
  });
  console.log(
    `Verified isolated @utsu-ri/cli@${result.version} install with ${result.target} helper`
  );
}
