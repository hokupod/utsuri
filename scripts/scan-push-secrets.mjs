#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const zeroObjectIdPattern = /^(?:0{40}|0{64})$/u;

function assertObjectId(value, lineNumber, label) {
  if (!objectIdPattern.test(value)) {
    throw new Error(`invalid ${label} object id on pre-push input line ${lineNumber}`);
  }
}

export function pushRangesFromStdin(input) {
  const ranges = [];
  const seen = new Set();

  for (const [index, rawLine] of input.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = line.split(/\s+/u);
    if (fields.length !== 4) {
      throw new Error(`invalid pre-push input on line ${index + 1}`);
    }

    const [localRef, localObjectId, remoteRef, remoteObjectId] = fields;
    if (!localRef || !remoteRef) {
      throw new Error(`missing ref on pre-push input line ${index + 1}`);
    }
    assertObjectId(localObjectId, index + 1, "local");
    assertObjectId(remoteObjectId, index + 1, "remote");

    if (zeroObjectIdPattern.test(localObjectId)) continue;
    const range = zeroObjectIdPattern.test(remoteObjectId)
      ? localObjectId
      : `${remoteObjectId}..${localObjectId}`;
    if (!seen.has(range)) ranges.push(range);
    seen.add(range);
  }

  return ranges;
}

export function gitleaksArgumentsForPush(input) {
  const ranges = pushRangesFromStdin(input);
  if (ranges.length === 0) return null;

  return [
    "git",
    "--log-opts",
    ["--diff-filter=ACMR", ...ranges].join(" "),
    "--config",
    ".gitleaks.toml",
    "--redact",
    "--no-banner",
    "--no-color",
    "."
  ];
}

function main() {
  const arguments_ = gitleaksArgumentsForPush(readFileSync(0, "utf8"));
  if (!arguments_) return;

  const result = spawnSync("gitleaks", arguments_, {
    cwd: repositoryRoot,
    shell: false,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`PRE_PUSH_SECRET_SCAN_FAILED: ${message}\n`);
    process.exitCode = 1;
  }
}
