#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { assembleCliPackage } from "./assemble-release-package.mjs";
import { buildCliBundle } from "./build.mjs";
import {
  validateCliSourceManifest,
  validateExactFileInventory
} from "./release-manifest-contract.mjs";
import {
  fullShaActionErrors,
  publishedCliSmokeErrors,
  readOnlyPermissionErrors
} from "./workflow-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const builtinSpecifiers = new Set(
  builtinModules.flatMap((name) => [
    name,
    name.startsWith("node:") ? name.slice(5) : `node:${name}`
  ])
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runtimeImportSpecifiers(text) {
  const specifiers = new Set();
  const source = ts.createSourceFile(
    "release.mjs",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  if (source.parseDiagnostics.length > 0) {
    throw new Error(ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, " "));
  }
  const addModuleSpecifier = (node) => {
    if (ts.isStringLiteralLike(node)) specifiers.add(node.text);
    else specifiers.add("<computed-module-specifier>");
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const commonJs = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const esbuildRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "__require";
      if (dynamicImport || commonJs || esbuildRequire) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) specifiers.add(argument.text);
        else if (dynamicImport || commonJs) {
          specifiers.add(dynamicImport ? "<computed-import>" : "<computed-require>");
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

export function releaseTextErrors(relativePath, text) {
  const found = [];
  if (text.includes(root) || /(?:\/Users\/|\/private\/var\/folders\/)/u.test(text)) {
    found.push(`${relativePath} contains a source-only absolute path`);
  }
  if (/@utsuri\//u.test(text)) found.push(`${relativePath} contains the old @utsuri scope`);
  if (/__UTSURI_[A-Z0-9_]+__|REPLACE_ME|<placeholder>|\bTBD\b/u.test(text)) {
    found.push(`${relativePath} contains a release placeholder`);
  }
  if (relativePath.endsWith(".mjs")) {
    let specifiers;
    try {
      specifiers = runtimeImportSpecifiers(text);
    } catch (error) {
      found.push(`${relativePath} is not valid JavaScript: ${error.message}`);
      return found;
    }
    for (const specifier of specifiers) {
      if (
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        builtinSpecifiers.has(specifier)
      ) {
        continue;
      }
      found.push(`${relativePath} has external runtime import: ${specifier}`);
    }
  }
  return found;
}

export async function scanReleaseTree(absoluteRoot, label = path.basename(absoluteRoot)) {
  const found = [];
  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      found.push(`${prefix}: ${error.message}`);
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const entryStat = await lstat(absolute);
      if (entryStat.isSymbolicLink()) {
        found.push(`${relative} must not be a symlink`);
      } else if (entryStat.isDirectory()) {
        await visit(absolute, relative);
      } else if (entryStat.isFile()) {
        const content = await readFile(absolute);
        if (!content.includes(0))
          found.push(...releaseTextErrors(relative, content.toString("utf8")));
      } else {
        found.push(`${relative} must be a regular file or directory`);
      }
    }
  }
  const rootStat = await lstat(absoluteRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    return [`${label} must be a regular non-symlink directory`];
  }
  await visit(absoluteRoot, label);
  return found;
}

const scanIndex = process.argv.indexOf("--scan");
if (scanIndex !== -1) {
  const scanTarget = process.argv[scanIndex + 1];
  if (!scanTarget) {
    console.error("--scan requires a directory");
    process.exit(2);
  }
  const scanErrors = await scanReleaseTree(path.resolve(scanTarget), path.basename(scanTarget));
  if (scanErrors.length > 0) {
    scanErrors.forEach((error) => console.error(error));
    process.exit(5);
  }
  console.log("Release artifact security scan passed");
  process.exit(0);
}

const candidateIndex = process.argv.indexOf("--candidate");
if (candidateIndex !== -1) {
  const candidate = process.argv[candidateIndex + 1];
  if (!candidate) {
    console.error("--candidate requires a directory");
    process.exit(2);
  }
  try {
    const { verifyDistributionCandidate } = await import("./assemble-distribution-candidate.mjs");
    await verifyDistributionCandidate(path.resolve(candidate), root);
    console.log("Distribution candidate contains all four verified native helpers");
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(5);
  }
}

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
  "capture-action.schema.json",
  "config.schema.json",
  "context-pack.schema.json",
  "diff.schema.json",
  "evidence-index.schema.json",
  "feedback-batch.schema.json",
  "mcp-run-registration.schema.json",
  "origin-session.schema.json",
  "report.schema.json",
  "review-answer.schema.json",
  "review-bundle.schema.json",
  "review-event.schema.json",
  "review-plan.schema.json",
  "review-state.schema.json",
  "review-thread.schema.json"
];

await compare("README.md", "packages/cli/README.md");
await compare("LICENSE", "packages/cli/LICENSE");
await compare("docs/assets/utsuri.jpg", "assets/utsuri.jpg");

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
  ...(await validateExactFileInventory(path.join(root, "assets"), ["utsuri.jpg"])),
  ...(await validateExactFileInventory(path.join(root, "packages/cli/dist"), [
    "build-manifest.json",
    `native/${nativeTarget}/utsuri-fs-ops`,
    "sbom.spdx.json",
    "third-party-licenses.json",
    "utsuri.mjs"
  ])),
  ...(await validateExactFileInventory(path.join(root, "skills/utsuri-review/scripts"), [
    "build-manifest.json",
    `native/${nativeTarget}/utsuri-fs-ops`,
    "utsuri.mjs"
  ])),
  ...(await validateExactFileInventory(path.join(root, "skills/utsuri-review/metadata"), [
    "sbom.spdx.json",
    "third-party-licenses.json"
  ]))
);
await compare(`.artifacts/${nativeHelper}`, `packages/cli/dist/${nativeHelper}`);
await compare(`.artifacts/${nativeHelper}`, `skills/utsuri-review/scripts/${nativeHelper}`);
await compare(".artifacts/release/build-manifest.json", "packages/cli/dist/build-manifest.json");
await compare(
  ".artifacts/release/build-manifest.json",
  "skills/utsuri-review/scripts/build-manifest.json"
);
for (const filename of ["sbom.spdx.json", "third-party-licenses.json"]) {
  await compare(`.artifacts/release/${filename}`, `packages/cli/dist/${filename}`);
  await compare(`.artifacts/release/${filename}`, `skills/utsuri-review/metadata/${filename}`);
}

const buildManifestContent = await readRegular(".artifacts/release/build-manifest.json");
let independentBuild;
try {
  const [rootManifest, esbuildManifest] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "node_modules/esbuild/package.json"), "utf8").then(JSON.parse)
  ]);
  const expectedEsbuild = rootManifest.devDependencies?.esbuild;
  if (
    expectedEsbuild !== "0.28.2" ||
    esbuildManifest.version !== expectedEsbuild ||
    !/^\d+\.\d+\.\d+$/u.test(expectedEsbuild)
  ) {
    errors.push("independent bundle verification requires exact esbuild 0.28.2");
  } else {
    independentBuild = await buildCliBundle(root);
    const distributed = await readRegular("packages/cli/dist/utsuri.mjs");
    if (distributed && !distributed.equals(independentBuild.bundle)) {
      errors.push("distributed CLI does not match an independent source rebuild");
    }
  }
} catch (error) {
  errors.push(`independent CLI rebuild failed: ${error.message}`);
}
if (buildManifestContent) {
  try {
    const manifest = JSON.parse(buildManifestContent.toString("utf8"));
    const exactKeys = [
      "bundleSha256",
      "dependencyBaselineSha256",
      "dependencyHash",
      "dependencyHashes",
      "schemaHashes",
      "schemaVersion",
      "sourceHash",
      "sourceHashes",
      "toolVersion",
      "uiAssetHashes"
    ].sort();
    if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(exactKeys)) {
      errors.push("build manifest fields are invalid");
    }
    if (manifest.schemaVersion !== "1.1") errors.push("build manifest schema version is invalid");
    if (!manifest.sourceHashes || typeof manifest.sourceHashes !== "object") {
      errors.push("build manifest source hashes are missing");
    } else {
      for (const [relative, expected] of Object.entries(manifest.sourceHashes)) {
        if (
          !relative ||
          relative.startsWith("/") ||
          relative.includes("\\") ||
          path.posix.normalize(relative) !== relative
        ) {
          errors.push(`build manifest source path is unsafe: ${relative}`);
          continue;
        }
        const content = await readRegular(relative);
        if (content && sha256(content) !== expected) {
          errors.push(`build manifest source hash mismatch: ${relative}`);
        }
      }
      if (manifest.sourceHash !== sha256(JSON.stringify(manifest.sourceHashes))) {
        errors.push("build manifest aggregate source hash is invalid");
      }
      if (
        independentBuild &&
        JSON.stringify(manifest.sourceHashes) !== JSON.stringify(independentBuild.sourceHashes)
      ) {
        errors.push("build manifest source inventory does not match the independent rebuild");
      }
    }
    if (!manifest.dependencyHashes || typeof manifest.dependencyHashes !== "object") {
      errors.push("build manifest dependency hashes are missing");
    } else {
      for (const [identity, expected] of Object.entries(manifest.dependencyHashes)) {
        if (
          !/^@?[^/\s]+(?:\/[^/\s]+)?@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\/.+/u.test(identity) ||
          !/^[a-f0-9]{64}$/u.test(expected)
        ) {
          errors.push(`build manifest dependency input is invalid: ${identity}`);
        }
      }
      if (manifest.dependencyHash !== sha256(JSON.stringify(manifest.dependencyHashes))) {
        errors.push("build manifest aggregate dependency hash is invalid");
      }
      if (
        independentBuild &&
        JSON.stringify(manifest.dependencyHashes) !==
          JSON.stringify(independentBuild.dependencyHashes)
      ) {
        errors.push("build manifest dependency inventory does not match the independent rebuild");
      }
    }
    const dependencyBaseline = await readRegular("scripts/release-dependency-baseline.json");
    if (
      !dependencyBaseline ||
      manifest.dependencyBaselineSha256 !== sha256(dependencyBaseline) ||
      (independentBuild &&
        manifest.dependencyBaselineSha256 !== independentBuild.dependencyBaselineSha256)
    ) {
      errors.push("build manifest dependency baseline hash is invalid");
    }
    const bundle = await readRegular("packages/cli/dist/utsuri.mjs");
    if (bundle && manifest.bundleSha256 !== sha256(bundle)) {
      errors.push("build manifest bundle hash is invalid");
    }
    if (independentBuild && manifest.bundleSha256 !== sha256(independentBuild.bundle)) {
      errors.push("build manifest bundle hash does not match the independent rebuild");
    }
    for (const schemaName of schemaNames) {
      const content = await readRegular(`schemas/${schemaName}`);
      if (content && manifest.schemaHashes?.[schemaName] !== sha256(content)) {
        errors.push(`build manifest schema hash mismatch: ${schemaName}`);
      }
    }
  } catch (error) {
    errors.push(`build manifest is not valid JSON: ${error.message}`);
  }
}

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
if (buildManifestContent) {
  try {
    const manifest = JSON.parse(buildManifestContent.toString("utf8"));
    if (manifest.uiAssetHashes?.["app.js"] !== sha256(generatedModule.reportUiJavaScript)) {
      errors.push("build manifest app.js hash is invalid");
    }
    if (manifest.uiAssetHashes?.["app.css"] !== sha256(generatedModule.reportUiCss)) {
      errors.push("build manifest app.css hash is invalid");
    }
  } catch {
    // The build-manifest JSON diagnostic is emitted above.
  }
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
    if (
      index === 0 &&
      (manifest.interface?.composerIcon !== "./assets/utsuri.jpg" ||
        manifest.interface?.logo !== "./assets/utsuri.jpg")
    ) {
      errors.push("Codex manifest does not reference the product illustration");
    }
  } catch (error) {
    errors.push(`manifest ${index + 1} is not valid JSON: ${error.message}`);
  }
}

const toolchainPolicyContent = await readRegular("toolchain-policy.json");
if (toolchainPolicyContent) {
  try {
    const policy = JSON.parse(toolchainPolicyContent.toString("utf8"));
    const expectedText = `Safe-chain ${policy.safeChain?.version}`;
    const content = await readRegular("CONTRIBUTING.md");
    if (content && !content.toString("utf8").includes(expectedText)) {
      errors.push("CONTRIBUTING.md does not match the Safe-chain policy version");
    }
  } catch (error) {
    errors.push(`toolchain-policy.json is not valid JSON: ${error.message}`);
  }
}

async function verifyReadOnlyPluginWorkflow(relativePath, requirements) {
  const content = await readRegular(relativePath);
  if (!content) return;
  const text = content.toString("utf8");
  errors.push(...fullShaActionErrors(relativePath, text));
  errors.push(...readOnlyPermissionErrors(relativePath, text));
  if (!text.includes("persist-credentials: false")) {
    errors.push(`${relativePath} must disable checkout credential persistence`);
  }
  for (const forbidden of ["plugin-promote.mjs --write", "git push", "gh pr ", "npm publish"]) {
    if (text.includes(forbidden)) {
      errors.push(`${relativePath} contains a forbidden mutation: ${forbidden}`);
    }
  }
  for (const required of requirements) {
    if (!text.includes(required)) {
      errors.push(`${relativePath} omits required pinned contract: ${required}`);
    }
  }
}

await verifyReadOnlyPluginWorkflow(".github/workflows/git-plugin-verification.yml", [
  "node-version: 24.19.0",
  "bun-version: 1.3.14",
  "releases/download/1.5.14/",
  "@openai/codex@0.146.0",
  "@anthropic-ai/claude-code@2.1.220",
  "@anthropic-ai/claude-code-linux-x64@2.1.220",
  "node_modules/@anthropic-ai/claude-code-linux-x64/claude",
  'test "$(command -v claude)" = "${utsuri_host_bin}/claude"',
  '"assets/**"',
  '"docs/assets/utsuri.jpg"',
  '"skills/utsuri-review/**"',
  '"package.json"',
  '"packages/*/package.json"',
  '"packages/security/src/**"',
  '"packages/session-binding/src/**"',
  '"docs/compatibility/plugin-runtime.json"',
  '"scripts/safe-chain.mjs"',
  '"tests/integration/verify-published-cli.test.ts"',
  '".github/workflows/plugin-promotion.yml"',
  '".github/workflows/release.yml"',
  "bun run plugin:verify",
  "plugin-runtime-probe.mjs --host codex --version 0.146.0",
  "plugin-runtime-probe.mjs --host claude --version 2.1.220",
  "claude plugin validate plugins/utsuri --strict"
]);
await verifyReadOnlyPluginWorkflow(".github/workflows/plugin-promotion.yml", [
  "verify-published-cli.mjs",
  "plugin-promote.mjs --version",
  "plugin validate .artifacts/release-candidate/plugin --strict",
  "plugin validate plugins/utsuri --strict"
]);

const releaseWorkflowContent = await readRegular(".github/workflows/release.yml");
if (releaseWorkflowContent) {
  const releaseWorkflow = releaseWorkflowContent.toString("utf8");
  errors.push(
    ...fullShaActionErrors(".github/workflows/release.yml", releaseWorkflow, {
      allowedLocalReferences: ["./.github/workflows/distribution-candidate.yml"]
    })
  );
  errors.push(...publishedCliSmokeErrors(".github/workflows/release.yml", releaseWorkflow));
  if (releaseWorkflow.includes("plugin-promote.mjs")) {
    errors.push("Release workflow must not automatically promote the Git Plugin");
  }
}

const candidateWorkflowContent = await readRegular(".github/workflows/distribution-candidate.yml");
if (candidateWorkflowContent) {
  errors.push(
    ...fullShaActionErrors(
      ".github/workflows/distribution-candidate.yml",
      candidateWorkflowContent.toString("utf8")
    )
  );
}

const cliManifestContent = await readRegular("packages/cli/package.json");
if (cliManifestContent) {
  try {
    const manifest = JSON.parse(cliManifestContent.toString("utf8"));
    errors.push(...validateCliSourceManifest(manifest, expectedVersion));
  } catch (error) {
    errors.push(`packages/cli/package.json is not valid JSON: ${error.message}`);
  }
}

const releaseStagingParent = await mkdtemp(path.join(os.tmpdir(), "utsuri-release-layout-"));
try {
  const staged = await assembleCliPackage(path.join(releaseStagingParent, "cli"), root);
  errors.push(...(await scanReleaseTree(staged.directory, "staged-cli")));
} catch (error) {
  errors.push(`public CLI staging is invalid: ${error.message}`);
} finally {
  await rm(releaseStagingParent, { recursive: true, force: true });
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

for (const relative of [
  ".claude-plugin",
  ".codex-plugin",
  "packages/cli/dist",
  "skills/utsuri-review"
]) {
  errors.push(...(await scanReleaseTree(path.join(root, relative), relative)));
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 5;
} else {
  console.log("Release layout matches source contracts and build outputs");
}
