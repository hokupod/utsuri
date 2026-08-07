#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureReports = [
  "fixtures/code-only-review/expected/report",
  "fixtures/empty-report/run/report",
  "fixtures/malicious-html/expected/report"
];
const sharedAssets = new Map([
  ["assets/app.css", "skills/utsuri-review/assets/report-ui/app.css"],
  ["assets/app.js", "skills/utsuri-review/assets/report-ui/app.js"],
  ["context-pack.schema.json", "schemas/context-pack.schema.json"],
  ["review-answer.schema.json", "schemas/review-answer.schema.json"],
  ["review-bundle.schema.json", "schemas/review-bundle.schema.json"],
  ["review-event.schema.json", "schemas/review-event.schema.json"],
  ["review-state.schema.json", "schemas/review-state.schema.json"],
  ["review-thread.schema.json", "schemas/review-thread.schema.json"]
]);
const omittedKeys = new Set([
  "generatedAt",
  "generationTime",
  "port",
  "temporaryPath",
  "tempPath",
  "timestamp"
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(normalize);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (omittedKeys.has(key) || value[key] === undefined) continue;
    result[key] = normalize(value[key]);
  }
  return result;
}

function stableHash(value) {
  return sha256(JSON.stringify(normalize(value)));
}

for (const relativeReport of fixtureReports) {
  const report = path.join(root, relativeReport);
  const manifestPath = path.join(report, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [destination, source] of sharedAssets) {
    const rawSourceBytes = await readFile(path.join(root, source));
    const sourceBytes = destination.endsWith(".schema.json")
      ? Buffer.from(`${JSON.stringify(JSON.parse(rawSourceBytes), null, 2)}\n`)
      : rawSourceBytes;
    const destinationPath = path.join(report, destination);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, sourceBytes);
    manifest.assetHashes[destination] = sha256(sourceBytes);
  }
  manifest.assetHashes = Object.fromEntries(
    Object.entries(manifest.assetHashes).sort(([left], [right]) => left.localeCompare(right))
  );
  const reportDocument = JSON.parse(await readFile(path.join(report, "report.json"), "utf8"));
  manifest.semanticHash = stableHash({
    report: reportDocument,
    sourceSnapshotHash: manifest.sourceSnapshotHash,
    assetHashes: manifest.assetHashes
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

process.stdout.write(`Refreshed shared assets in ${fixtureReports.length} report fixtures\n`);
