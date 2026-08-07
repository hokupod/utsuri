#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "skills/utsuri-review/scripts/utsuri.mjs");

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      LANG: process.env.LANG ?? "C.UTF-8",
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR
    },
    shell: false,
    timeout: 30000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CLI exited ${result.status}: ${result.stderr}`);
  if (result.stderr !== "") throw new Error(`CLI wrote to stderr: ${result.stderr}`);
  if (result.stdout.includes("Safe-chain"))
    throw new Error("Safe-chain output contaminated stdout");
  const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) throw new Error(`Expected one JSON line, received ${lines.length}`);
  return JSON.parse(lines[0]);
}

const version = run(["--version", "--json"]);
if (
  version.ok !== true ||
  version.command !== "version" ||
  version.package !== "@utsu-ri/cli" ||
  version.version !== "0.1.0" ||
  version.protocolVersion !== "1.0"
) {
  throw new Error("Unexpected CLI version response");
}
const doctor = run(["doctor", "--json"]);
if (doctor.command !== "doctor" || !Array.isArray(doctor.checks)) {
  throw new Error("Unexpected doctor response");
}
console.log("Native Node CLI strict JSON smoke passed");
