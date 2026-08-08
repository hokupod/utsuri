#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const forbidden = [
  { id: "macOS user home", pattern: /\/Users\/hokuto(?:\/|\b)/u },
  { id: "macOS private temporary path", pattern: /\/private\/var\/folders(?:\/|\b)/u },
  { id: "Codex private memory path", pattern: /\.codex\/memories(?:\/|\b)/u }
];

function git(root, arguments_, acceptedStatuses = [0]) {
  const result = spawnSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false
  });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status ?? -1)) {
    throw new Error(result.stderr.trim() || `git ${arguments_.join(" ")} failed`);
  }
  return result;
}

export function findForbiddenText(text) {
  return forbidden.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);
}

function parseGrepLocation(line) {
  const match = /^([a-f0-9]{40,64}):(.+?):(\d+):/u.exec(line);
  return match ? { commit: match[1], path: match[2], line: Number(match[3]) } : null;
}

export function scanPublicHistory({ root = repositoryRoot, ref = "HEAD" } = {}) {
  git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  const commits = git(root, ["rev-list", ref]).stdout.trim().split(/\r?\n/u).filter(Boolean);
  const findings = [];
  const seen = new Set();

  for (const commit of commits) {
    const message = git(root, ["show", "-s", "--format=%B", commit]).stdout;
    for (const id of findForbiddenText(message)) {
      const key = `commit-message:${commit}:${id}`;
      if (!seen.has(key)) findings.push({ id, commit, path: "<commit-message>" });
      seen.add(key);
    }

    const grep = git(
      root,
      [
        "grep",
        "-I",
        "-n",
        "-E",
        ["/Users/", "hokuto|/private/var/", "folders|\\.codex/", "memories"].join(""),
        commit,
        "--"
      ],
      [0, 1]
    );
    for (const line of grep.stdout.split(/\r?\n/u).filter(Boolean)) {
      const location = parseGrepLocation(line);
      if (!location) throw new Error("could not parse git grep output");
      const ids = findForbiddenText(line);
      for (const id of ids) {
        const key = `${location.path}:${location.line}:${id}`;
        if (!seen.has(key)) findings.push({ ...location, id });
        seen.add(key);
      }
    }
  }
  return { commits: commits.length, findings };
}

function parseArguments(arguments_) {
  const parsed = { root: repositoryRoot, ref: "HEAD" };
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index];
    if (key !== "--root" && key !== "--ref") throw new Error(`unknown argument: ${key}`);
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  parsed.root = path.resolve(parsed.root);
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = scanPublicHistory(parseArguments(process.argv.slice(2)));
    if (result.findings.length > 0) {
      for (const finding of result.findings.slice(0, 20)) {
        const line = finding.line ? `:${finding.line}` : "";
        process.stderr.write(
          `PUBLIC_HISTORY_PII: ${finding.id} at ${finding.path}${line} (${finding.commit.slice(0, 12)})\n`
        );
      }
      if (result.findings.length > 20) {
        process.stderr.write(`PUBLIC_HISTORY_PII: ${result.findings.length - 20} more findings\n`);
      }
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify({ ok: true, commits: result.commits })}\n`);
    }
  } catch (error) {
    process.stderr.write(`PUBLIC_HISTORY_SCAN_FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}
