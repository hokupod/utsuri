#!/usr/bin/env node

import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCliManifest, validateExactFileInventory } from "./release-manifest-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

async function readRegular(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    const stat = await lstat(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      errors.push(`${relativePath} must be a regular, non-symlink file`);
      return undefined;
    }
    return await readFile(absolutePath);
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return undefined;
  }
}

async function compare(left, right) {
  const [leftContent, rightContent] = await Promise.all([readRegular(left), readRegular(right)]);
  if (leftContent && rightContent && !leftContent.equals(rightContent)) {
    errors.push(`${right} does not match ${left}`);
  }
}

async function requireExactDirectories(relativePath, expectedNames) {
  try {
    const entries = await readdir(path.join(root, relativePath), { withFileTypes: true });
    const actualNames = entries.map((entry) => entry.name).sort();
    const sortedExpectedNames = [...expectedNames].sort();
    if (
      entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink()) ||
      JSON.stringify(actualNames) !== JSON.stringify(sortedExpectedNames)
    ) {
      errors.push(`${relativePath} must contain only ${sortedExpectedNames.join(", ")}`);
    }
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
  }
}

const schemaNames = [
  "annotations.schema.json",
  "config.schema.json",
  "context-pack.schema.json",
  "diff.schema.json",
  "evidence-index.schema.json",
  "feedback-batch.schema.json",
  "origin-session.schema.json",
  "report.schema.json",
  "review-answer.schema.json",
  "review-plan.schema.json",
  "review-state.schema.json",
  "review-thread.schema.json"
];

await compare("README.md", "packages/cli/README.md");
await compare("LICENSE", "packages/cli/LICENSE");

for (const schemaName of schemaNames) {
  await compare(`schemas/${schemaName}`, `skills/utsuri-review/schemas/${schemaName}`);
}
await compare("packages/cli/dist/utsuri.mjs", "skills/utsuri-review/scripts/utsuri.mjs");
const nativeTarget = `${process.platform}-${process.arch}`;
const nativeHelper = `native/${nativeTarget}/utsuri-fs-ops`;
await requireExactDirectories(".artifacts/native", [nativeTarget]);
await requireExactDirectories("packages/cli/dist/native", [nativeTarget]);
await requireExactDirectories("skills/utsuri-review/scripts/native", [nativeTarget]);
errors.push(
  ...(await validateExactFileInventory(path.join(root, "packages/cli/dist"), [
    `native/${nativeTarget}/utsuri-fs-ops`,
    "utsuri.mjs"
  ])),
  ...(await validateExactFileInventory(path.join(root, "skills/utsuri-review/scripts"), [
    `native/${nativeTarget}/utsuri-fs-ops`,
    "utsuri.mjs"
  ]))
);
await compare(`.artifacts/${nativeHelper}`, `packages/cli/dist/${nativeHelper}`);
await compare(`.artifacts/${nativeHelper}`, `skills/utsuri-review/scripts/${nativeHelper}`);

const generatedModule = await import(
  pathToFileURL(path.join(root, "packages/report-builder/src/generated-ui-assets.ts")).href
);
const [releaseJavaScript, releaseCss] = await Promise.all([
  readRegular("skills/utsuri-review/assets/report-ui/app.js"),
  readRegular("skills/utsuri-review/assets/report-ui/app.css")
]);
if (releaseJavaScript?.toString("utf8") !== generatedModule.reportUiJavaScript) {
  errors.push("release app.js does not match the embedded report UI");
}
if (releaseCss?.toString("utf8") !== generatedModule.reportUiCss) {
  errors.push("release app.css does not match the embedded report UI");
}

const rootManifestContent = await readRegular("package.json");
let expectedVersion;
if (rootManifestContent) {
  try {
    const manifest = JSON.parse(rootManifestContent.toString("utf8"));
    expectedVersion = manifest.version;
    if (typeof expectedVersion !== "string") errors.push("root package has no version");
  } catch (error) {
    errors.push(`package.json is not valid JSON: ${error.message}`);
  }
}

const manifests = await Promise.all([
  readRegular(".codex-plugin/plugin.json"),
  readRegular(".claude-plugin/plugin.json")
]);
for (const [index, content] of manifests.entries()) {
  if (!content) continue;
  try {
    const manifest = JSON.parse(content.toString("utf8"));
    if (manifest.name !== "utsuri") errors.push(`manifest ${index + 1} has the wrong name`);
    if (manifest.version !== expectedVersion)
      errors.push(`manifest ${index + 1} has the wrong version`);
    if (manifest.author?.name !== "hokupod") {
      errors.push(`manifest ${index + 1} has the wrong publisher`);
    }
    if (manifest.repository !== "https://github.com/hokupod/utsuri") {
      errors.push(`manifest ${index + 1} has the wrong repository`);
    }
    if (manifest.homepage !== "https://github.com/hokupod/utsuri#readme") {
      errors.push(`manifest ${index + 1} has the wrong homepage`);
    }
    if (manifest.license !== "AGPL-3.0-or-later") {
      errors.push(`manifest ${index + 1} has the wrong license`);
    }
  } catch (error) {
    errors.push(`manifest ${index + 1} is not valid JSON: ${error.message}`);
  }
}

const documentationStateContent = await readRegular("docs/documentation-state.json");
if (documentationStateContent) {
  try {
    const state = JSON.parse(documentationStateContent.toString("utf8"));
    const expectedPublicationMetadata = {
      publisher: "hokupod",
      npmMaintainer: "hokupod-npm",
      npmPublishing: "GitHub Actions trusted publishing",
      spdxLicense: "AGPL-3.0-or-later"
    };
    const actualMetadata = state.publicationMetadata;
    if (
      !actualMetadata ||
      Object.keys(actualMetadata).length !== Object.keys(expectedPublicationMetadata).length ||
      Object.entries(expectedPublicationMetadata).some(
        ([key, value]) => actualMetadata[key] !== value
      )
    ) {
      errors.push("documentation state has the wrong publication metadata");
    }
  } catch (error) {
    errors.push(`docs/documentation-state.json is not valid JSON: ${error.message}`);
  }
}

const toolchainPolicyContent = await readRegular("toolchain-policy.json");
if (toolchainPolicyContent) {
  try {
    const policy = JSON.parse(toolchainPolicyContent.toString("utf8"));
    const expectedText = `Safe-chain ${policy.safeChain?.version}`;
    for (const relativePath of ["README.md", "README.ja.md", "README.zh-CN.md"]) {
      const content = await readRegular(relativePath);
      if (content && !content.toString("utf8").includes(expectedText)) {
        errors.push(`${relativePath} does not match the Safe-chain policy version`);
      }
    }
  } catch (error) {
    errors.push(`toolchain-policy.json is not valid JSON: ${error.message}`);
  }
}

const cliManifestContent = await readRegular("packages/cli/package.json");
if (cliManifestContent) {
  try {
    const manifest = JSON.parse(cliManifestContent.toString("utf8"));
    errors.push(...validateCliManifest(manifest, expectedVersion));
  } catch (error) {
    errors.push(`packages/cli/package.json is not valid JSON: ${error.message}`);
  }
}

await readRegular("skills/utsuri-review/SKILL.md");
await readRegular("skills/utsuri-review/agents/openai.yaml");
try {
  await access(path.join(root, "skills/utsuri-review/scripts/utsuri.mjs"), constants.X_OK);
} catch {
  errors.push("bundled CLI is not executable");
}
for (const relativePath of [
  `packages/cli/dist/${nativeHelper}`,
  `skills/utsuri-review/scripts/${nativeHelper}`
]) {
  try {
    await access(path.join(root, relativePath), constants.X_OK);
  } catch {
    errors.push(`${relativePath} is not executable`);
  }
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 5;
} else {
  console.log("Release layout matches source contracts and build outputs");
}
