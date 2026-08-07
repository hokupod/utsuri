#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "skills/utsuri-review/scripts/utsuri.mjs");

async function findReports(directory) {
  const reports = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.name === "report") reports.push(absolute);
    else reports.push(...(await findReports(absolute)));
  }
  return reports;
}

const reports = await findReports(path.join(root, "fixtures"));
if (reports.length === 0) throw new Error("No report fixtures were found");

const failures = [];
for (const report of reports.sort()) {
  const relativeReport = path.relative(root, report);
  const rejectionPath = path.join(path.dirname(report), "rejection.json");
  const rejection = await readFile(rejectionPath, "utf8")
    .then((value) => JSON.parse(value))
    .catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
  const execution = spawnSync(
    process.execPath,
    [cli, "validate", relativeReport, "--strict", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let result;
  try {
    result = JSON.parse(execution.stdout);
  } catch {
    failures.push(
      `${path.relative(root, report)}: CLI returned invalid JSON (${execution.stderr.trim() || "no diagnostic"})`
    );
    continue;
  }
  if (rejection) {
    if (
      rejection.strictValidation !== "rejected" ||
      !Array.isArray(rejection.requiredDiagnostics)
    ) {
      failures.push(`${relativeReport}: invalid rejection.json contract`);
      continue;
    }
    const diagnostics = result.errors ?? [result.error?.message ?? execution.stderr.trim()];
    if (execution.status === 0 || result.ok) {
      failures.push(`${relativeReport}: expected strict rejection but validation passed`);
      continue;
    }
    const missing = rejection.requiredDiagnostics.filter(
      (required) => !diagnostics.includes(required)
    );
    if (missing.length > 0) {
      failures.push(`${relativeReport}: missing required diagnostics: ${missing.join("; ")}`);
    }
    continue;
  }
  if (execution.status !== 0 || !result.ok) {
    const diagnostics = result.errors ?? [result.error?.message ?? execution.stderr.trim()];
    failures.push(
      `${relativeReport}: ${diagnostics.filter(Boolean).join("; ") || "validation failed"}`
    );
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 5;
} else {
  console.log(`Validated ${reports.length} report fixture(s)`);
}
