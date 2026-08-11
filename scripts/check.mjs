#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const tasks = [
  "native:build",
  "verify:native-cli-json",
  "format:check",
  "lint",
  "typecheck",
  "schemas:check",
  "docs:check",
  "docs:check:test",
  "test"
];

for (const task of tasks) {
  const result = spawnSync("bun", ["run", task], { shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
