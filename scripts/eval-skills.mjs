#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, chmod, copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relative) {
  const value = JSON.parse(await readFile(path.join(root, relative), "utf8"));
  if (
    value.schemaVersion !== "1.0" ||
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.some((entry) => !entry || typeof entry.id !== "string" || !entry.id)
  ) {
    throw new Error(`Skill eval fixture is invalid: ${relative}`);
  }
  return value.cases;
}

function classifyPrompt(prompt) {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("artifact creation is forbidden") ||
    lower.includes("do not create artifacts") ||
    lower.includes("no repository change")
  ) {
    return "do-not-trigger";
  }
  if (
    ["review", "diff", "ui change", "evidence report", "utsuri"].some((term) =>
      lower.includes(term)
    ) &&
    ["change", "diff", "capture", "evidence", "report"].some((term) => lower.includes(term))
  ) {
    return "trigger";
  }
  return "do-not-trigger";
}

function runCli(cli, args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args, "--json"], {
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
  if (result.status !== 0 || result.stderr !== "") {
    throw new Error(`Skill eval CLI failed: ${result.stderr || result.stdout}`);
  }
  const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) throw new Error("Skill eval CLI protocol was not one JSON line");
  return JSON.parse(lines[0]);
}

const [triggerCases, workflowCases, outputCases, hostCases, skillText] = await Promise.all([
  readJson("evals/trigger/cases.json"),
  readJson("evals/workflow/cases.json"),
  readJson("evals/output/cases.json"),
  readJson("evals/host-compatibility/cases.json"),
  readFile(path.join(root, "skills/utsuri-review/SKILL.md"), "utf8")
]);

for (const entry of triggerCases) {
  if (classifyPrompt(entry.prompt) !== entry.expected) {
    throw new Error(`Skill trigger eval failed: ${entry.id}`);
  }
}
for (const entry of workflowCases) {
  for (const phrase of entry.requiredPhrases) {
    if (!skillText.includes(phrase)) {
      throw new Error(`Skill workflow eval ${entry.id} is missing: ${phrase}`);
    }
  }
}
for (const entry of hostCases) {
  const [skill, bundle] = await Promise.all([
    readFile(path.join(root, entry.skill), "utf8"),
    readFile(path.join(root, entry.bundle))
  ]);
  if (!skill.startsWith("---\nname: utsuri-review\n") || bundle.length === 0) {
    throw new Error(`Host compatibility resources are invalid: ${entry.id}`);
  }
  await access(path.join(root, entry.bundle));
  if (
    !entry.feedback ||
    !Array.isArray(entry.feedback.sessionBindingInputs) ||
    !["return-to-session", "export-only"].includes(entry.feedback.deliveryMode) ||
    entry.feedback.directBridge !== false
  ) {
    throw new Error(`Host feedback compatibility is invalid: ${entry.id}`);
  }
  if (entry.manifest) {
    const manifest = JSON.parse(await readFile(path.join(root, entry.manifest), "utf8"));
    if (
      manifest.name !== entry.pluginName ||
      manifest.license !== "AGPL-3.0-or-later" ||
      manifest.author?.name !== "hokupod"
    ) {
      throw new Error(`Host manifest is invalid: ${entry.id}`);
    }
  }
}
await access(path.join(root, "skills/utsuri-review/schemas/report.schema.json"));

const cli = path.join(root, "skills/utsuri-review/scripts/utsuri.mjs");
const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-skill-eval-"));
await chmod(scratch, 0o700);
try {
  for (const entry of outputCases) {
    const caseRoot = path.join(scratch, entry.id);
    await mkdir(caseRoot, { mode: 0o700 });
    const initialized = spawnSync("git", ["init", "-q"], {
      cwd: caseRoot,
      encoding: "utf8",
      env: {
        LANG: "C",
        LC_ALL: "C",
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR ?? os.tmpdir()
      },
      shell: false
    });
    if (initialized.error) throw initialized.error;
    if (initialized.status !== 0 || initialized.stderr !== "") {
      throw new Error(`Output eval Git initialization failed: ${entry.id}`);
    }
    await copyFile(path.join(root, entry.patch), path.join(caseRoot, "changes.patch"));
    const collected = runCli(
      cli,
      ["collect", "--patch", "changes.patch", "--output", "run"],
      caseRoot
    );
    if (collected.command !== "collect")
      throw new Error(`Output eval collection failed: ${entry.id}`);
    const finalized = runCli(cli, ["finalize", "--run", "run"], caseRoot);
    if (finalized.command !== "finalize")
      throw new Error(`Output eval finalize failed: ${entry.id}`);
    const validated = runCli(cli, ["validate", "run/report", "--strict"], caseRoot);
    if (validated.ok !== true) throw new Error(`Output eval strict validation failed: ${entry.id}`);
    const [report, manifest] = await Promise.all([
      readJsonFile(path.join(caseRoot, "run/report/report.json")),
      readJsonFile(path.join(caseRoot, "run/report/manifest.json"))
    ]);
    if (
      report.status !== entry.expectedStatus ||
      !report.diagnostics?.incompleteReasons?.includes(entry.expectedIncompleteReason)
    ) {
      throw new Error(`Output eval partial-failure semantics failed: ${entry.id}`);
    }
    for (const schema of entry.requiredSchemaAssets) {
      if (!Object.hasOwn(manifest.assetHashes ?? {}, schema)) {
        throw new Error(`Output eval resource is missing for ${entry.id}: ${schema}`);
      }
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log(
  `Skill evals passed (${triggerCases.length} trigger, ${workflowCases.length} workflow, ${outputCases.length} output, ${hostCases.length} host)`
);

async function readJsonFile(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}
