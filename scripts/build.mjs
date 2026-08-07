#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { generateSbom } from "./generate-sbom.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiOutput = path.join(root, "skills/utsuri-review/assets/report-ui");
const generatedUi = path.join(root, "packages/report-builder/src/generated-ui-assets.ts");
const cliOutput = path.join(root, "packages/cli/dist/utsuri.mjs");
const skillCliOutput = path.join(root, "skills/utsuri-review/scripts/utsuri.mjs");
const cliPackageRoot = path.join(root, "packages/cli");
const dependencyBaselineName = "scripts/release-dependency-baseline.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createRuntimeBundleStubs(additionalDependencyInputs) {
  return {
    name: "utsuri-runtime-bundle-stubs",
    setup(build) {
      build.onResolve(
        { filter: /^(?:bufferutil|electron\/index\.js|fsevents|utf-8-validate)$/ },
        (args) => ({
          path: args.path,
          namespace: "utsuri-optional"
        })
      );
      build.onResolve({ filter: /^chromium-bidi\/lib\/cjs\// }, (args) => ({
        path: args.path,
        namespace: "utsuri-optional"
      }));
      build.onLoad({ filter: /.*/, namespace: "utsuri-optional" }, (args) => {
        if (
          new Set(["bufferutil", "electron/index.js", "fsevents", "utf-8-validate"]).has(args.path)
        ) {
          return { contents: 'throw new Error("Optional Playwright integration is not bundled");' };
        }
        if (args.path.endsWith("BidiMapper")) {
          return {
            contents:
              'export class BidiServer { static createAndStart() { throw new Error("WebDriver BiDi is not supported by the Utsuri bundle"); } }'
          };
        }
        return {
          contents:
            'export class MapperCdpConnection { constructor() { throw new Error("WebDriver BiDi is not supported by the Utsuri bundle"); } }'
        };
      });
      build.onLoad({ filter: /playwright-core\/lib\/coreBundle\.js$/ }, async (args) => {
        const source = await readFile(args.path, "utf8");
        const dynamicVite = "new Function('return import(\"vite\")')";
        const packageInitialization = `packageRoot = import_path8.default.join(__dirname, "..");
    packageJSON = require(import_path8.default.join(packageRoot, "package.json"));
    binPath = import_path8.default.join(packageRoot, "bin");`;
        const browserRegistryInitialization =
          'registry = new Registry(require(import_path19.default.join(packageRoot, "browsers.json")));';
        if (!source.includes(dynamicVite)) {
          throw new Error(
            "Playwright core bundle no longer contains the expected optional Vite hook"
          );
        }
        if (!source.includes(packageInitialization)) {
          throw new Error(
            "Playwright core bundle no longer contains the expected package initialization"
          );
        }
        if (!source.includes(browserRegistryInitialization)) {
          throw new Error(
            "Playwright core bundle no longer contains the expected browser registry initialization"
          );
        }
        const playwrightRoot = path.join(path.dirname(args.path), "..");
        additionalDependencyInputs.add(path.join(playwrightRoot, "package.json"));
        additionalDependencyInputs.add(path.join(playwrightRoot, "browsers.json"));
        const playwrightPackage = JSON.parse(
          await readFile(path.join(playwrightRoot, "package.json"), "utf8")
        );
        if (playwrightPackage.name !== "playwright-core" || !playwrightPackage.version) {
          throw new Error("Playwright core package metadata is invalid");
        }
        const embeddedPackage = JSON.stringify({
          name: playwrightPackage.name,
          version: playwrightPackage.version
        });
        const embeddedBrowserRegistry = JSON.stringify(
          JSON.parse(await readFile(path.join(playwrightRoot, "browsers.json"), "utf8"))
        );
        return {
          contents: source
            .replace(
              packageInitialization,
              `packageRoot = __dirname;
    packageJSON = Object.freeze(${embeddedPackage});
    binPath = __dirname;`
            )
            .replace(
              browserRegistryInitialization,
              `registry = new Registry(Object.freeze(${embeddedBrowserRegistry}));`
            )
            .replaceAll(
              dynamicVite,
              '() => Promise.reject(new Error("Optional Vite integration is not bundled"))'
            ),
          loader: "js",
          resolveDir: path.dirname(args.path)
        };
      });
    }
  };
}

async function dependencyInputKey(filename, packageCache) {
  const resolved = await realpath(filename);
  const marker = `${path.sep}node_modules${path.sep}`;
  const markerIndex = resolved.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error(`Bundled dependency is outside node_modules: ${resolved}`);
  const suffix = resolved.slice(markerIndex + marker.length);
  const segments = suffix.split(path.sep);
  const packageSegments = segments[0]?.startsWith("@") ? 2 : 1;
  if (segments.length <= packageSegments) {
    throw new Error(`Bundled dependency path has no package-relative file: ${resolved}`);
  }
  const packageDirectory = resolved.slice(
    0,
    markerIndex + marker.length + segments.slice(0, packageSegments).join(path.sep).length
  );
  let identity = packageCache.get(packageDirectory);
  if (!identity) {
    const manifest = JSON.parse(
      await readFile(path.join(packageDirectory, "package.json"), "utf8")
    );
    if (
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string" ||
      !manifest.name ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(manifest.version)
    ) {
      throw new Error(`Bundled dependency has invalid package identity: ${packageDirectory}`);
    }
    identity = `${manifest.name}@${manifest.version}`;
    packageCache.set(packageDirectory, identity);
  }
  const relative = path.relative(packageDirectory, resolved).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.posix.normalize(relative) !== relative) {
    throw new Error(`Bundled dependency path escapes its package: ${resolved}`);
  }
  return `${identity}/${relative}`;
}

async function verifiedDependencyBaseline(repositoryRoot, dependencyHash) {
  const filename = path.join(repositoryRoot, dependencyBaselineName);
  const bytes = await readFile(filename);
  const baseline = JSON.parse(bytes.toString("utf8"));
  const lockfileSha256 = sha256(await readFile(path.join(repositoryRoot, "bun.lock")));
  if (
    baseline.schemaVersion !== "1.0" ||
    baseline.lockfileSha256 !== lockfileSha256 ||
    baseline.bundledInputHash !== dependencyHash
  ) {
    throw new Error(
      "Installed bundled dependencies do not match scripts/release-dependency-baseline.json"
    );
  }
  return sha256(bytes);
}

export async function buildCliBundle(repositoryRoot = root, options = {}) {
  const additionalDependencyInputs = new Set();
  const result = await esbuild({
    entryPoints: [path.join(repositoryRoot, "packages/cli/src/main.ts")],
    outfile: path.join(repositoryRoot, ".artifacts/independent/utsuri.mjs"),
    banner: {
      js: '#!/usr/bin/env node\nimport { createRequire as __utsuriCreateRequire } from "node:module";\nimport { dirname as __utsuriDirname } from "node:path";\nimport { fileURLToPath as __utsuriFileURLToPath } from "node:url";\nconst require = __utsuriCreateRequire(import.meta.url);\nconst __filename = __utsuriFileURLToPath(import.meta.url);\nconst __dirname = __utsuriDirname(__filename);'
    },
    bundle: true,
    charset: "utf8",
    format: "esm",
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
    minify: false,
    platform: "node",
    plugins: [createRuntimeBundleStubs(additionalDependencyInputs)],
    target: "node22",
    write: false
  });
  const output = result.outputFiles?.find((file) => file.path.endsWith("utsuri.mjs"));
  if (!output) throw new Error("esbuild did not produce the independent CLI output");
  const bundle = Buffer.from(output.text.replace(/[ \t]+$/gmu, ""));
  const sourceHashes = {};
  const dependencyInputFiles = new Set(additionalDependencyInputs);
  for (const input of Object.keys(result.metafile.inputs).sort()) {
    if (input.startsWith("utsuri-optional:")) continue;
    const filename = input.split(" with {", 1)[0];
    const absolute = path.isAbsolute(filename) ? filename : path.join(repositoryRoot, filename);
    const relative = path.relative(repositoryRoot, absolute).split(path.sep).join("/");
    if (
      relative.startsWith("../") ||
      relative.startsWith("node_modules/") ||
      relative.includes("/node_modules/")
    ) {
      dependencyInputFiles.add(absolute);
      continue;
    }
    sourceHashes[relative] = sha256(await readFile(absolute));
  }
  const dependencyHashes = {};
  const packageCache = new Map();
  for (const filename of [...dependencyInputFiles].sort()) {
    const key = await dependencyInputKey(filename, packageCache);
    const digest = sha256(await readFile(filename));
    if (dependencyHashes[key] && dependencyHashes[key] !== digest) {
      throw new Error(`Bundled dependency identity is ambiguous: ${key}`);
    }
    dependencyHashes[key] = digest;
  }
  const sortedDependencyHashes = Object.fromEntries(
    Object.entries(dependencyHashes).sort(([left], [right]) => left.localeCompare(right))
  );
  const dependencyHash = sha256(JSON.stringify(sortedDependencyHashes));
  const dependencyBaselineSha256 =
    options.verifyDependencyBaseline === false
      ? null
      : await verifiedDependencyBaseline(repositoryRoot, dependencyHash);
  return {
    bundle,
    dependencyBaselineSha256,
    dependencyHash,
    dependencyHashes: sortedDependencyHashes,
    sourceHashes
  };
}

export async function buildReleaseArtifacts() {
  await import("./build-native-helper.mjs");
  await viteBuild({ configFile: path.join(root, "vite.config.ts") });
  const appJavaScriptPath = path.join(uiOutput, "app.js");
  const rawAppJavaScript = await readFile(appJavaScriptPath, "utf8");
  const rawSvelteWhitespaceLiteral = "` \t\n\\r\\f\u00a0\\v\\uFEFF`";
  const escapedSvelteWhitespaceLiteral = JSON.stringify(" \t\n\r\f\u00a0\u000b\ufeff");
  const appJavaScript = rawAppJavaScript.replaceAll(
    rawSvelteWhitespaceLiteral,
    escapedSvelteWhitespaceLiteral
  );
  if (/[ \t]+$/mu.test(appJavaScript)) {
    throw new Error("Generated report UI JavaScript contains trailing whitespace");
  }
  if (appJavaScript !== rawAppJavaScript) await writeFile(appJavaScriptPath, appJavaScript);
  const appCss = await readFile(path.join(uiOutput, "app.css"), "utf8");
  await writeFile(
    generatedUi,
    `/* Generated by scripts/build.mjs. */\nexport const reportUiJavaScript = ${JSON.stringify(appJavaScript)};\nexport const reportUiCss = ${JSON.stringify(appCss)};\n`
  );

  await mkdir(path.dirname(cliOutput), { recursive: true });
  await mkdir(path.dirname(skillCliOutput), { recursive: true });
  const {
    bundle: bundledCli,
    dependencyBaselineSha256,
    dependencyHash,
    dependencyHashes,
    sourceHashes
  } = await buildCliBundle(root);
  await writeFile(cliOutput, bundledCli);
  await chmod(cliOutput, 0o755);
  await copyFile(cliOutput, skillCliOutput);
  await chmod(skillCliOutput, 0o755);

  await Promise.all([
    copyFile(path.join(root, "README.md"), path.join(cliPackageRoot, "README.md")),
    copyFile(path.join(root, "LICENSE"), path.join(cliPackageRoot, "LICENSE"))
  ]);

  const schemaOutput = path.join(root, "skills/utsuri-review/schemas");
  await mkdir(schemaOutput, { recursive: true });
  const schemaNames = [
    "annotations.schema.json",
    "capture-action.schema.json",
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
  for (const name of schemaNames) {
    await copyFile(path.join(root, "schemas", name), path.join(schemaOutput, name));
  }

  const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const schemaHashes = Object.fromEntries(
    await Promise.all(
      schemaNames.map(async (name) => [
        name,
        sha256(await readFile(path.join(root, "schemas", name)))
      ])
    )
  );
  const buildManifest = {
    schemaVersion: "1.1",
    toolVersion: rootManifest.version,
    sourceHash: sha256(JSON.stringify(sourceHashes)),
    sourceHashes,
    dependencyBaselineSha256,
    dependencyHash,
    dependencyHashes,
    schemaHashes,
    uiAssetHashes: {
      "app.css": sha256(appCss),
      "app.js": sha256(appJavaScript)
    },
    bundleSha256: sha256(await readFile(cliOutput))
  };
  const serializedBuildManifest = `${JSON.stringify(buildManifest, null, 2)}\n`;
  for (const relative of [
    ".artifacts/release/build-manifest.json",
    "packages/cli/dist/build-manifest.json",
    "skills/utsuri-review/scripts/build-manifest.json"
  ]) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, serializedBuildManifest);
  }

  await generateSbom(root);

  console.log(
    "Built single-file Node 22 ESM CLI, native helper, Svelte report UI, hashes, SBOM, and release schema copies"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildReleaseArtifacts();
}
