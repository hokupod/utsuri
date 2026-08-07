#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyNativeHelper } from "./verify-native-helper.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = `${process.platform}-${process.arch}`;
const supportedTargets = new Set(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);

if (!supportedTargets.has(target)) {
  throw new Error(`Unsupported native helper target: ${target}`);
}

const source = path.join(root, "native/utsuri-fs-ops.c");
const artifact = path.join(root, ".artifacts/native", target, "utsuri-fs-ops");
await mkdir(path.dirname(artifact), { recursive: true });

const linkerFlags = process.platform === "darwin" ? [] : ["-Wl,--build-id=none"];
const compilation = spawnSync(
  process.env.CC || "cc",
  [
    "-std=c11",
    "-Os",
    "-fno-ident",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...linkerFlags,
    source,
    "-o",
    artifact
  ],
  { cwd: root, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] }
);

if (compilation.error) throw compilation.error;
if (compilation.status !== 0) {
  throw new Error(compilation.stderr.trim() || `cc exited with status ${compilation.status}`);
}
await chmod(artifact, 0o755);

for (const output of [
  path.join(root, "packages/cli/dist/native", target, "utsuri-fs-ops"),
  path.join(root, "skills/utsuri-review/scripts/native", target, "utsuri-fs-ops")
]) {
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(artifact, output);
  await chmod(output, 0o755);
}

await verifyNativeHelper({
  helper: artifact,
  output: path.join(root, ".artifacts/native", target, "proof.json"),
  source,
  target
});

console.log(`Built atomic publication helper for ${target}`);
