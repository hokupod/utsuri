#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopes = {
  all: ["scripts", "packages", "tests"],
  integration: ["tests/integration"],
  security: ["tests/security"]
};
const excludedDirectories = new Set(["a11y", "e2e", "node_modules"]);
const testFilePattern = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/u;

async function collectTestFiles(relativeDirectory) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...(await collectTestFiles(relative)));
      continue;
    }
    if (entry.isFile() && testFilePattern.test(entry.name)) files.push(relative);
  }
  return files;
}

const scope = process.argv[2] ?? "all";
const roots = scopes[scope];
if (!roots || process.argv.length > 3) {
  console.error("Usage: node scripts/run-test-files.mjs [all|integration|security]");
  process.exit(2);
}

const files = (await Promise.all(roots.map(collectTestFiles)))
  .flat()
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
if (files.length === 0) {
  console.error(`No test files found for scope: ${scope}`);
  process.exit(2);
}

for (const file of files) {
  const result = spawnSync("bun", ["test", "--parallel=1", "--max-concurrency=1", file], {
    cwd: repositoryRoot,
    shell: false,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Passed ${files.length} isolated test files for scope: ${scope}`);
