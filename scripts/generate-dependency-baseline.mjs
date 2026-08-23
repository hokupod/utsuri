#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCliBundle } from "./build.mjs";
import { buildSupplyChainDocuments, repositoryRoot } from "./generate-sbom.mjs";

export async function generateDependencyBaseline(root = repositoryRoot) {
  const [bundle, supplyChain] = await Promise.all([
    buildCliBundle(root, { verifyDependencyBaseline: false }),
    buildSupplyChainDocuments(root, { verifyDependencyBaseline: false })
  ]);
  const baseline = {
    schemaVersion: "1.1",
    productionDependencySha256: supplyChain.provenance.productionDependencySha256,
    bundledInputHash: bundle.dependencyHash,
    packageVerificationCodes: supplyChain.provenance.packageVerificationCodes
  };
  const filename = path.join(root, "scripts/release-dependency-baseline.json");
  await writeFile(filename, `${JSON.stringify(baseline, null, 2)}\n`);
  return filename;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateDependencyBaseline();
  console.log("Generated reviewed release dependency baseline");
}
