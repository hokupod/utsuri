#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemas = new Map();
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

for (const filename of (await readdir(path.join(root, "schemas")))
  .filter((name) => name.endsWith(".schema.json"))
  .sort()) {
  const name = filename.replace(/\.schema\.json$/u, "");
  const schema = JSON.parse(await readFile(path.join(root, "schemas", filename), "utf8"));
  schemas.set(name, ajv.compile(schema));
}

async function loadCases(directory) {
  const files = await readdir(directory);
  return Promise.all(
    files
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(async (filename) => ({
        filename,
        value: JSON.parse(await readFile(path.join(directory, filename), "utf8"))
      }))
  );
}

const failures = [];

function reportReferencesAreValid(report) {
  const hunkIds = new Set(report.hunks?.map((hunk) => hunk.id) ?? []);
  const targetIds = new Set(report.targets?.map((target) => target.id) ?? []);
  const findingIds = new Set(report.findings?.map((finding) => finding.id) ?? []);
  const assigned = new Set();

  for (const change of report.changes ?? []) {
    for (const ref of change.hunkRefs ?? []) {
      if (!hunkIds.has(ref) || assigned.has(ref)) return false;
      assigned.add(ref);
    }
    if ((change.targetRefs ?? []).some((ref) => !targetIds.has(ref))) return false;
    if ((change.findingRefs ?? []).some((ref) => !findingIds.has(ref))) return false;
  }
  for (const ref of report.unclassifiedHunkRefs ?? []) {
    if (!hunkIds.has(ref) || assigned.has(ref)) return false;
    assigned.add(ref);
  }
  if ([...hunkIds].some((ref) => !assigned.has(ref))) return false;
  if (report.origin?.reportId !== report.reportId) return false;
  return true;
}

function validateFixture(schemaName, validate, value) {
  const schemaValid = validate(value);
  if (!schemaValid) return false;
  return schemaName !== "report" || reportReferencesAreValid(value);
}

for (const fixture of await loadCases(path.join(root, "fixtures/schemas/valid"))) {
  const schemaName = fixture.filename.split(".")[0];
  const validate = schemas.get(schemaName);
  if (!validate) failures.push(`No schema for ${fixture.filename}`);
  else if (!validateFixture(schemaName, validate, fixture.value)) {
    failures.push(`${fixture.filename} rejected: ${ajv.errorsText(validate.errors)}`);
  }
}

for (const fixture of await loadCases(path.join(root, "fixtures/schemas/invalid"))) {
  const schemaName = fixture.filename.split(".")[0];
  const validate = schemas.get(schemaName);
  if (!validate) failures.push(`No schema for ${fixture.filename}`);
  else if (validateFixture(schemaName, validate, fixture.value)) {
    failures.push(`${fixture.filename} was unexpectedly accepted`);
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`SCHEMA_FIXTURE_INVALID ${failure}`));
  process.exitCode = 5;
} else {
  console.log(`Validated ${schemas.size} schemas and their fixtures`);
}
