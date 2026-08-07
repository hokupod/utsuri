#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("bun", ["run", "build"]);
run(process.execPath, [
  path.join(root, "node_modules/@playwright/test/cli.js"),
  "test",
  ...process.argv.slice(2)
]);
