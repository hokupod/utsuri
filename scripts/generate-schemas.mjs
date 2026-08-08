#!/usr/bin/env node

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";
import { build as esbuild } from "esbuild";
import { compile } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = path.join(root, "schemas");
const outputDirectory = path.join(root, "packages/report-model/src/generated");
const check = process.argv.includes("--check");
const browserSchemaNames = ["review-bundle", "review-event", "review-state", "review-thread"];

async function generateBrowserValidators() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
    code: { source: true, esm: true }
  });
  addFormats(ajv);
  const exports = {};
  for (const name of browserSchemaNames) {
    const schema = JSON.parse(
      await readFile(path.join(schemaDirectory, `${name}.schema.json`), "utf8")
    );
    ajv.addSchema(schema, name);
    exports[name.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = name;
  }
  const result = await esbuild({
    stdin: {
      contents: standaloneCode(ajv, exports),
      resolveDir: root,
      sourcefile: "browser-validators.generated.js"
    },
    bundle: true,
    format: "esm",
    legalComments: "none",
    minify: true,
    platform: "browser",
    target: "es2024",
    write: false
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("Browser schema validator generation produced no output");
  if (output.includes("new Function") || /\beval\s*\(/u.test(output)) {
    throw new Error("Browser schema validators require CSP-forbidden runtime code generation");
  }
  return `/* Generated from canonical schemas by scripts/generate-schemas.mjs. */\n${output}`;
}

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

const browserValidators = await generateBrowserValidators();
const browserValidatorPath = path.join(outputDirectory, "browser-validators.generated.js");
if (check) {
  const existing = await readFile(browserValidatorPath, "utf8").catch(() => "");
  if (existing !== browserValidators) drift.push(path.relative(root, browserValidatorPath));
} else {
  await writeFile(browserValidatorPath, browserValidators);
}

if (drift.length > 0) {
  console.error(`SCHEMA_GENERATED_DRIFT ${drift.join(", ")}`);
  process.exitCode = 5;
} else {
  console.log(
    check
      ? `Schema declarations and browser validators are current (${schemaFiles.length})`
      : `Generated ${schemaFiles.length} schema declarations and browser validators`
  );
}
