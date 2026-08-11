import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

const expectedFiles = ["LICENSE", "README.md", "dist"];
const expectedManifestKeys = [
  "author",
  "bin",
  "bugs",
  "dependencies",
  "description",
  "engines",
  "files",
  "homepage",
  "license",
  "name",
  "optionalDependencies",
  "publishConfig",
  "repository",
  "type",
  "version"
].sort();
const expectedDependencies = {};
const nativeTargets = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];
const completeSemver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:(?:0|[1-9]\d*)|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function isCompleteSemver(value) {
  if (typeof value !== "string") return false;
  return completeSemver.exec(value)?.[0] === value;
}

export function expectedNativeOptionalDependencies(version) {
  return Object.fromEntries(nativeTargets.map((target) => [`@utsu-ri/cli-${target}`, version]));
}

function sortedStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value].sort()
    : undefined;
}

function hasExactStringEntries(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualEntries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

export function validateCliManifest(manifest, expectedVersion) {
  const errors = [];

  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedManifestKeys)) {
    errors.push("CLI package manifest fields do not match the exact allowlist");
  }

  if (manifest.name !== "@utsu-ri/cli") errors.push("CLI package has the wrong name");
  if (manifest.version !== expectedVersion) errors.push("CLI package has the wrong version");
  if (manifest.description !== "Evidence-backed visual change review for Codex and Claude Code") {
    errors.push("CLI package has the wrong description");
  }
  if (manifest.license !== "AGPL-3.0-or-later") errors.push("CLI package has the wrong license");
  if (!hasExactStringEntries(manifest.author, { name: "hokupod" })) {
    errors.push("CLI package has the wrong publisher");
  }
  if (
    !hasExactStringEntries(manifest.repository, {
      type: "git",
      url: "git+https://github.com/hokupod/utsuri.git"
    })
  ) {
    errors.push("CLI package has the wrong repository");
  }
  if (manifest.homepage !== `https://github.com/hokupod/utsuri/tree/v${expectedVersion}#readme`) {
    errors.push("CLI package has the wrong homepage");
  }
  if (!hasExactStringEntries(manifest.bugs, { url: "https://github.com/hokupod/utsuri/issues" })) {
    errors.push("CLI package has the wrong bugs URL");
  }
  if (!hasExactStringEntries(manifest.publishConfig, { access: "public" })) {
    errors.push("CLI package must use public access");
  }
  if (!hasExactStringEntries(manifest.engines, { node: ">=22" })) {
    errors.push("CLI package has the wrong Node engine");
  }
  if (manifest.type !== "module") errors.push("CLI package has the wrong module type");
  if (!hasExactStringEntries(manifest.bin, { utsuri: "dist/utsuri.mjs" })) {
    errors.push("CLI package has the wrong executable");
  }
  if (!hasExactStringEntries(manifest.dependencies, expectedDependencies)) {
    errors.push("CLI package has the wrong dependencies");
  }
  if (
    !hasExactStringEntries(
      manifest.optionalDependencies,
      expectedNativeOptionalDependencies(expectedVersion)
    )
  ) {
    errors.push("CLI package has the wrong optional dependencies");
  }

  const actualFiles = sortedStrings(manifest.files);
  if (!actualFiles || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    errors.push(`CLI package files must exactly match ${expectedFiles.join(", ")}`);
  }

  return errors;
}

export function validateCliSourceManifest(manifest, expectedVersion) {
  const errors = [];
  const externalPins = { fflate: "0.8.2", yaml: "2.8.3" };
  if (manifest.name !== "@utsu-ri/cli") errors.push("CLI source package has the wrong name");
  if (manifest.version !== expectedVersion) errors.push("CLI source package has the wrong version");
  if (manifest.private !== true) errors.push("CLI source package must be private");
  if (manifest.license !== "AGPL-3.0-or-later") {
    errors.push("CLI source package has the wrong license");
  }
  if (Object.hasOwn(manifest, "scripts")) errors.push("CLI source package must not define scripts");
  const dependencies = manifest.dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    errors.push("CLI source package dependencies are missing");
    return errors;
  }
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith("@utsu-ri/")) {
      if (version !== "workspace:*") {
        errors.push(`CLI source workspace dependency is not private: ${name}`);
      }
    } else if (externalPins[name] !== version) {
      errors.push(`CLI source external dependency is not pinned: ${name}`);
    }
  }
  for (const [name, version] of Object.entries(externalPins)) {
    if (dependencies[name] !== version) errors.push(`CLI source dependency is missing: ${name}`);
  }
  return errors;
}

export function validateNativeHelperManifest(manifest, expectedVersion, target) {
  const errors = [];
  const expectedKeys = [
    "author",
    "cpu",
    "description",
    "files",
    "license",
    "name",
    "os",
    "publishConfig",
    "repository",
    "version"
  ].sort();
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)) {
    errors.push("Native helper manifest fields do not match the exact allowlist");
  }
  if (!nativeTargets.includes(target)) errors.push("Native helper target is unsupported");
  if (manifest.name !== `@utsu-ri/cli-${target}`)
    errors.push("Native helper package name is invalid");
  if (manifest.version !== expectedVersion) errors.push("Native helper package version is invalid");
  if (manifest.license !== "AGPL-3.0-or-later") errors.push("Native helper license is invalid");
  if (!hasExactStringEntries(manifest.author, { name: "hokupod" })) {
    errors.push("Native helper publisher is invalid");
  }
  if (
    !hasExactStringEntries(manifest.repository, {
      type: "git",
      url: "git+https://github.com/hokupod/utsuri.git"
    })
  ) {
    errors.push("Native helper repository is invalid");
  }
  if (!hasExactStringEntries(manifest.publishConfig, { access: "public" })) {
    errors.push("Native helper publish access is invalid");
  }
  const expectedOs = target.startsWith("darwin-") ? ["darwin"] : ["linux"];
  const expectedCpu = target.endsWith("-arm64") ? ["arm64"] : ["x64"];
  if (JSON.stringify(manifest.os) !== JSON.stringify(expectedOs)) {
    errors.push("Native helper OS selector is invalid");
  }
  if (JSON.stringify(manifest.cpu) !== JSON.stringify(expectedCpu)) {
    errors.push("Native helper CPU selector is invalid");
  }
  if (
    JSON.stringify(sortedStrings(manifest.files)) !==
    JSON.stringify(["LICENSE", "bin", "integrity.json", "proof.json"].sort())
  ) {
    errors.push("Native helper files are invalid");
  }
  return errors;
}

export async function validateExactFileInventory(root, expectedRelativeFiles) {
  const errors = [];
  const actualFiles = [];
  const expectedDirectories = new Set();
  for (const expectedFile of expectedRelativeFiles) {
    const parts = expectedFile.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      expectedDirectories.add(parts.slice(0, index).join("/"));
    }
  }

  async function visit(absoluteDirectory, relativeDirectory) {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`${relativePath} must not be a symlink`);
      } else if (entry.isDirectory()) {
        if (!expectedDirectories.has(relativePath)) {
          errors.push(`${relativePath} is not an expected directory`);
        }
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        actualFiles.push(relativePath);
      } else {
        errors.push(`${relativePath} must be a regular file or directory`);
      }
    }
  }

  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return ["inventory root must be a regular, non-symlink directory"];
    }
    await visit(root, "");
  } catch (error) {
    return [`inventory could not be read: ${error.message}`];
  }

  const expectedFiles = [...expectedRelativeFiles].sort();
  actualFiles.sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    errors.push(
      `file inventory mismatch: expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}`
    );
  }

  return errors;
}
