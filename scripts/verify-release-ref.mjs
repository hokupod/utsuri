#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

function git(root, arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${arguments_.join(" ")} failed`);
  }
  return result.stdout.trim();
}

export function validateReleaseMetadata({ tag, rootManifest, cliManifest, changelog }) {
  const errors = [];
  const version = rootManifest?.version;
  if (typeof version !== "string" || !stableVersionPattern.test(version)) {
    errors.push("root package version must be a stable SemVer");
  }
  if (tag !== `v${version}`) errors.push("tag must exactly match the root package version");
  if (cliManifest?.version !== version) errors.push("CLI package version differs from the root");
  if (cliManifest?.private !== true) errors.push("source CLI package must remain private");
  if (typeof changelog !== "string" || !changelog.includes(`## [${version}] - `)) {
    errors.push("CHANGELOG.md has no dated entry for the release version");
  }
  return errors;
}

export async function verifyReleaseRef({ root = repositoryRoot, tag, mainRef = "origin/main" }) {
  const [rootManifest, cliManifest, changelog] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "packages/cli/package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "CHANGELOG.md"), "utf8")
  ]);
  const errors = validateReleaseMetadata({ tag, rootManifest, cliManifest, changelog });
  if (errors.length > 0) throw new Error(errors.join("; "));

  if (git(root, ["cat-file", "-t", tag]) !== "tag") {
    throw new Error("release tag must be an annotated tag");
  }
  const taggedCommit = git(root, ["rev-parse", `${tag}^{commit}`]);
  const mainCommit = git(root, ["rev-parse", `${mainRef}^{commit}`]);
  if (taggedCommit !== mainCommit) {
    throw new Error(`release tag must point to the exact ${mainRef} commit`);
  }
  return { version: rootManifest.version, commit: taggedCommit };
}

function parseArguments(arguments_) {
  const parsed = { root: repositoryRoot, mainRef: "origin/main" };
  const fields = { "--root": "root", "--tag": "tag", "--main-ref": "mainRef" };
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index];
    if (!fields[key]) {
      throw new Error(`unknown argument: ${key}`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    parsed[fields[key]] = value;
    index += 1;
  }
  if (!parsed.tag) throw new Error("--tag is required");
  parsed.root = path.resolve(parsed.root);
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const result = await verifyReleaseRef(arguments_);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`RELEASE_REF_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
