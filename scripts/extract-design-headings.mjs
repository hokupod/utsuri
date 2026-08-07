#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const DIAGNOSTIC = {
  arguments: "DOC_HEADING_ARGUMENTS",
  duplicate: "DOC_HEADING_DUPLICATE",
  missingParent: "DOC_HEADING_MISSING_PARENT",
  order: "DOC_HEADING_ORDER",
  mismatch: "DOC_HEADING_MANIFEST_MISMATCH"
};

function fail(id, message) {
  process.stderr.write(`${id}: ${message}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input" || argument === "--write" || argument === "--check") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path`);
      }
      result[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  if (!result.input || Boolean(result.write) === Boolean(result.check)) {
    throw new Error("use --input with exactly one of --write or --check");
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function extractHeadings(markdown) {
  const headings = [];
  const seen = new Set();
  const lastSibling = new Map();
  let fence = null;

  for (const [lineIndex, line] of markdown.split(/\r?\n/u).entries()) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;

    const match = line.match(/^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/u);
    if (!match) continue;

    const [, hashes, number, title] = match;
    if (seen.has(number)) {
      throw new Error(
        `${DIAGNOSTIC.duplicate}: duplicate heading ${number} at line ${lineIndex + 1}`
      );
    }

    const parts = number.split(".").map(Number);
    const parent = parts.length === 1 ? null : parts.slice(0, -1).join(".");
    if (parent !== null && !seen.has(parent)) {
      throw new Error(
        `${DIAGNOSTIC.missingParent}: heading ${number} precedes or lacks parent ${parent}`
      );
    }

    const siblingKey = parent ?? "<root>";
    const siblingIndex = parts.at(-1);
    const previous = lastSibling.get(siblingKey);
    if (previous !== undefined && siblingIndex <= previous) {
      throw new Error(`${DIAGNOSTIC.order}: heading ${number} is not in ascending sibling order`);
    }

    const expectedLevel = parts.length + 1;
    if (hashes.length !== expectedLevel) {
      throw new Error(
        `${DIAGNOSTIC.order}: heading ${number} uses level ${hashes.length}; expected ${expectedLevel}`
      );
    }

    seen.add(number);
    lastSibling.set(siblingKey, siblingIndex);
    headings.push({
      number,
      level: hashes.length,
      parent,
      order: headings.length,
      sourceTitleJa: title
    });
  }

  return headings;
}

function comparable(entries) {
  return entries.map(({ number, level, parent, order }) => ({ number, level, parent, order }));
}

async function main() {
  let arguments_;
  try {
    arguments_ = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(DIAGNOSTIC.arguments, error.message);
    return;
  }

  const markdown = await readFile(arguments_.input, "utf8");
  let headings;
  try {
    headings = extractHeadings(markdown);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (arguments_.write) {
    const manifest = {
      schemaVersion: 1,
      source: arguments_.input,
      sourceSha256: sha256(markdown),
      headingCount: headings.length,
      headings
    };
    await writeFile(arguments_.write, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return;
  }

  const manifest = JSON.parse(await readFile(arguments_.check, "utf8"));
  const expected = JSON.stringify(comparable(manifest.headings ?? []));
  const actual = JSON.stringify(comparable(headings));
  if (manifest.headingCount !== headings.length || expected !== actual) {
    fail(DIAGNOSTIC.mismatch, "numbered heading structure differs from the manifest");
  }
}

await main();
