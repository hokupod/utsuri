#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSupplyChainDocuments,
  repositoryRoot,
  serializedSupplyChainDocuments
} from "./generate-sbom.mjs";

const expected = serializedSupplyChainDocuments(await buildSupplyChainDocuments(repositoryRoot));
const targets = [
  [".artifacts/release/sbom.spdx.json", expected.sbom],
  [".artifacts/release/third-party-licenses.json", expected.licenses],
  ["packages/cli/dist/sbom.spdx.json", expected.sbom],
  ["packages/cli/dist/third-party-licenses.json", expected.licenses],
  ["skills/utsuri-review/metadata/sbom.spdx.json", expected.sbom],
  ["skills/utsuri-review/metadata/third-party-licenses.json", expected.licenses]
];
const errors = [];
for (const [relative, content] of targets) {
  const filename = path.join(repositoryRoot, relative);
  try {
    const fileStat = await lstat(filename);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      errors.push(`${relative} must be a regular non-symlink file`);
      continue;
    }
    if ((await readFile(filename, "utf8")) !== content) errors.push(`${relative} is not current`);
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
  }
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 5;
} else {
  console.log("SBOM and license inventory are deterministic and current");
}
