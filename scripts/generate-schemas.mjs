#!/usr/bin/env node

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = path.join(root, "schemas");
const outputDirectory = path.join(root, "packages/report-model/src/generated");
const check = process.argv.includes("--check");

const schemaFiles = (await readdir(schemaDirectory))
  .filter((name) => name.endsWith(".schema.json"))
  .sort();

await mkdir(outputDirectory, { recursive: true });

const drift = [];
for (const filename of schemaFiles) {
  const schema = JSON.parse(await readFile(path.join(schemaDirectory, filename), "utf8"));
  const generated = await compile(schema, schema.title, {
    bannerComment: `/* Generated from schemas/${filename}. Do not edit directly. */`,
    style: { singleQuote: false, semi: true, trailingComma: "none" },
    unknownAny: false
  });
  const outputPath = path.join(outputDirectory, filename.replace(/\.json$/u, ".d.ts"));

  if (check) {
    const existing = await readFile(outputPath, "utf8").catch(() => "");
    if (existing !== generated) drift.push(path.relative(root, outputPath));
  } else {
    await writeFile(outputPath, generated);
  }
}

if (drift.length > 0) {
  console.error(`SCHEMA_GENERATED_DRIFT ${drift.join(", ")}`);
  process.exitCode = 5;
} else {
  console.log(
    check
      ? `Schema declarations are current (${schemaFiles.length})`
      : `Generated ${schemaFiles.length} schema declarations`
  );
}
