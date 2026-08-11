#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "skills/utsuri-review/scripts/utsuri.mjs");
const rootManifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const cliManifest = JSON.parse(readFileSync(path.join(root, "packages/cli/package.json"), "utf8"));
const completeSemver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

if (
  cliManifest.name !== "@utsu-ri/cli" ||
  !completeSemver.test(rootManifest.version) ||
  rootManifest.version !== cliManifest.version
) {
  throw new Error("Root and CLI manifests must define one synchronized CLI release identity");
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      LANG: process.env.LANG ?? "C.UTF-8",
      PATH: options.path ?? process.env.PATH,
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

const version = run(["--version", "--json"], { path: "" });
if (
  version.ok !== true ||
  version.command !== "version" ||
  version.package !== cliManifest.name ||
  version.version !== cliManifest.version ||
  version.protocolVersion !== "1.1"
) {
  throw new Error("Unexpected CLI version response");
}
const help = run(["--help", "--json"], { path: "" });
const requiredCommands = [
  "doctor",
  "collect",
  "capture",
  "discover",
  "compare",
  "finalize",
  "validate",
  "serve",
  "pack",
  "review export",
  "review import",
  "feedback list",
  "feedback get",
  "feedback answer",
  "feedback handoff",
  "review-mcp"
];
if (typeof help.help !== "string") throw new Error("Unexpected CLI help response");
for (const command of requiredCommands) {
  if (!help.help.includes(command)) throw new Error(`Native CLI help omits command: ${command}`);
}
const doctor = run(["doctor", "--json"]);
if (doctor.command !== "doctor" || !Array.isArray(doctor.checks)) {
  throw new Error("Unexpected doctor response");
}
console.log("Native Node CLI strict JSON and Bun-free command startup smoke passed");
