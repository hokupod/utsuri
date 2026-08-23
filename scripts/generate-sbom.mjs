#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencyBaselineName = "scripts/release-dependency-baseline.json";
export const dependencyBaselineMismatchMessage =
  "Reviewed release dependency baseline does not match installed production packages or bundled inputs. Run `node scripts/safe-chain.mjs bun install --frozen-lockfile`, then `node scripts/safe-chain.mjs bun run deps:refresh`, and review every generated supply-chain diff.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function spdxId(name, version) {
  const readable = `${name}-${version}`.replace(/[^a-zA-Z0-9.-]+/gu, "-");
  return `SPDXRef-Package-${readable}`;
}

function declaredLicense(manifest) {
  if (typeof manifest.license === "string" && manifest.license.trim())
    return manifest.license.trim();
  if (manifest.license && typeof manifest.license.type === "string") return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    const values = manifest.licenses
      .map((value) => (typeof value === "string" ? value : value?.type))
      .filter((value) => typeof value === "string" && value.length > 0);
    if (values.length > 0) return values.sort().join(" OR ");
  }
  return "NOASSERTION";
}

async function readManifest(filename) {
  const bytes = await readFile(filename);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

async function resolveDependencyManifest(packageDirectory, dependency) {
  let current = packageDirectory;
  while (true) {
    const candidate = path.join(current, "node_modules", dependency, "package.json");
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Installed production dependency is missing: ${dependency}`);
}

function lockedPackageIntegrities(lockBytes) {
  const lock = parse(lockBytes.toString("utf8"));
  if (!lock?.packages || typeof lock.packages !== "object") {
    throw new Error("bun.lock has no package integrity inventory");
  }
  const values = new Map();
  for (const entry of Object.values(lock.packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const integrity = entry[3];
    if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(integrity)) {
      continue;
    }
    const previous = values.get(entry[0]);
    if (previous && previous !== integrity) {
      throw new Error(`bun.lock has conflicting integrity values for ${entry[0]}`);
    }
    values.set(entry[0], integrity);
  }
  return values;
}

function lockChecksum(integrity) {
  const bytes = Buffer.from(integrity.slice("sha512-".length), "base64");
  if (bytes.byteLength !== 64) throw new Error("bun.lock has an invalid SHA-512 integrity");
  return bytes.toString("hex");
}

async function packageVerificationCode(packageDirectory) {
  const hashes = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const filename = path.join(directory, entry.name);
      const entryStat = await lstat(filename);
      if (entryStat.isSymbolicLink()) {
        throw new Error(`Installed production package contains a symlink: ${filename}`);
      }
      if (entryStat.isDirectory()) await visit(filename);
      else if (entryStat.isFile()) hashes.push(sha1(await readFile(filename)));
      else throw new Error(`Installed production package contains a special file: ${filename}`);
    }
  }
  await visit(packageDirectory);
  if (hashes.length === 0)
    throw new Error(`Installed production package is empty: ${packageDirectory}`);
  return sha1(hashes.sort().join(""));
}

async function productionGraph(root, lockIntegrities) {
  const rootManifestPath = path.join(root, "package.json");
  const rootManifest = await readManifest(rootManifestPath);
  const dependencies = Object.fromEntries(
    Object.entries(rootManifest.value.dependencies ?? {}).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  const rootPackage = {
    name: rootManifest.value.name,
    version: rootManifest.value.version,
    license: declaredLicense(rootManifest.value),
    manifestHash: sha256(
      JSON.stringify({
        name: rootManifest.value.name,
        version: rootManifest.value.version,
        license: declaredLicense(rootManifest.value),
        dependencies
      })
    ),
    dependencies: Object.keys(dependencies),
    path: rootManifestPath
  };
  const packages = new Map();
  const relationships = new Set();
  const pending = rootPackage.dependencies.map((name) => ({
    name,
    fromDirectory: root,
    parent: spdxId(rootPackage.name, rootPackage.version)
  }));
  while (pending.length > 0) {
    const next = pending.shift();
    const manifestPath = await resolveDependencyManifest(next.fromDirectory, next.name);
    const manifest = await readManifest(manifestPath);
    const name = manifest.value.name;
    const version = manifest.value.version;
    if (typeof name !== "string" || typeof version !== "string") {
      throw new Error(`Dependency manifest has no exact name and version: ${manifestPath}`);
    }
    const id = spdxId(name, version);
    relationships.add(`${next.parent}\0${id}`);
    if (packages.has(id)) continue;
    const packageDirectory = path.dirname(manifestPath);
    const dependencies = Object.keys(manifest.value.dependencies ?? {}).sort();
    packages.set(id, {
      id,
      name,
      version,
      license: declaredLicense(manifest.value),
      dependencies,
      packageDirectory
    });
    pending.push(
      ...dependencies.map((dependency) => ({
        name: dependency,
        fromDirectory: packageDirectory,
        parent: id
      }))
    );
  }
  const verifiedPackages = await Promise.all(
    [...packages.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(async (entry) => {
        const locked = `${entry.name}@${entry.version}`;
        const integrity = lockIntegrities.get(locked);
        if (!integrity) throw new Error(`bun.lock has no exact integrity for ${locked}`);
        return {
          ...entry,
          lockChecksum: lockChecksum(integrity),
          packageVerificationCode: await packageVerificationCode(entry.packageDirectory)
        };
      })
  );
  const sortedRelationships = [...relationships].sort();
  const productionDependencySha256 = sha256(
    JSON.stringify({
      rootManifestSha256: rootPackage.manifestHash,
      packages: verifiedPackages.map((entry) => ({
        id: entry.id,
        lockChecksum: entry.lockChecksum,
        packageVerificationCode: entry.packageVerificationCode
      })),
      relationships: sortedRelationships
    })
  );
  return {
    rootPackage,
    packages: verifiedPackages,
    productionDependencySha256,
    relationships: sortedRelationships
  };
}

function creationTimestamp() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (!raw) return "1980-01-01T00:00:00.000Z";
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error("SOURCE_DATE_EPOCH must be a non-negative integer");
  }
  return new Date(seconds * 1000).toISOString();
}

export async function buildSupplyChainDocuments(root = repositoryRoot, options = {}) {
  const lockBytes = await readFile(path.join(root, "bun.lock"));
  const graph = await productionGraph(root, lockedPackageIntegrities(lockBytes));
  const packageVerificationCodes = Object.fromEntries(
    graph.packages.map((entry) => [`${entry.name}@${entry.version}`, entry.packageVerificationCode])
  );
  let dependencyBaselineSha256 = null;
  if (options.verifyDependencyBaseline !== false) {
    const baselineBytes = await readFile(path.join(root, dependencyBaselineName));
    const baseline = JSON.parse(baselineBytes.toString("utf8"));
    if (
      baseline.schemaVersion !== "1.1" ||
      baseline.productionDependencySha256 !== graph.productionDependencySha256 ||
      JSON.stringify(baseline.packageVerificationCodes) !== JSON.stringify(packageVerificationCodes)
    ) {
      throw new Error(dependencyBaselineMismatchMessage);
    }
    dependencyBaselineSha256 = sha256(baselineBytes);
  }
  const rootId = spdxId(graph.rootPackage.name, graph.rootPackage.version);
  const packages = [
    {
      SPDXID: rootId,
      checksums: [{ algorithm: "SHA256", checksumValue: graph.rootPackage.manifestHash }],
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: graph.rootPackage.license,
      licenseDeclared: graph.rootPackage.license,
      name: graph.rootPackage.name,
      versionInfo: graph.rootPackage.version
    },
    ...graph.packages.map((entry) => ({
      SPDXID: entry.id,
      checksums: [{ algorithm: "SHA512", checksumValue: entry.lockChecksum }],
      downloadLocation: "NOASSERTION",
      filesAnalyzed: true,
      licenseConcluded: entry.license,
      licenseDeclared: entry.license,
      name: entry.name,
      packageVerificationCode: {
        packageVerificationCodeValue: entry.packageVerificationCode
      },
      versionInfo: entry.version
    }))
  ];
  const relationships = [
    {
      relatedSpdxElement: rootId,
      relationshipType: "DESCRIBES",
      spdxElementId: "SPDXRef-DOCUMENT"
    },
    ...graph.relationships.map((relationship) => {
      const [parent, dependency] = relationship.split("\0");
      return {
        relatedSpdxElement: dependency,
        relationshipType: "DEPENDS_ON",
        spdxElementId: parent
      };
    })
  ];
  const sbom = {
    SPDXID: "SPDXRef-DOCUMENT",
    creationInfo: {
      created: creationTimestamp(),
      creators: ["Tool: Utsuri SBOM generator 1"]
    },
    dataLicense: "CC0-1.0",
    documentNamespace: `https://github.com/hokupod/utsuri/sbom/${graph.rootPackage.version}/${graph.productionDependencySha256}`,
    name: `utsuri-${graph.rootPackage.version}`,
    packages,
    relationships,
    spdxVersion: "SPDX-2.3"
  };
  const licenses = {
    schemaVersion: "1.2",
    dependencyBaselineSha256,
    productionDependencySha256: graph.productionDependencySha256,
    packages: packages.map((entry) => ({
      checksum: `${entry.checksums[0].algorithm}:${entry.checksums[0].checksumValue}`,
      license: entry.licenseDeclared,
      name: entry.name,
      packageVerificationCode: entry.packageVerificationCode?.packageVerificationCodeValue ?? null,
      version: entry.versionInfo
    }))
  };
  return {
    sbom,
    licenses,
    provenance: {
      dependencyBaselineSha256,
      packageVerificationCodes,
      productionDependencySha256: graph.productionDependencySha256
    }
  };
}

export function serializedSupplyChainDocuments(documents) {
  const sbom = JSON.stringify(documents.sbom, null, 2).replace(
    /"creators": \[\n\s+"([^"]+)"\n\s+\]/u,
    '"creators": ["$1"]'
  );
  return {
    sbom: `${sbom}\n`,
    licenses: `${JSON.stringify(documents.licenses, null, 2)}\n`
  };
}

export async function generateSbom(root = repositoryRoot) {
  const serialized = serializedSupplyChainDocuments(await buildSupplyChainDocuments(root));
  const outputs = [
    [".artifacts/release/sbom.spdx.json", serialized.sbom],
    [".artifacts/release/third-party-licenses.json", serialized.licenses],
    ["packages/cli/dist/sbom.spdx.json", serialized.sbom],
    ["packages/cli/dist/third-party-licenses.json", serialized.licenses],
    ["skills/utsuri-review/metadata/sbom.spdx.json", serialized.sbom],
    ["skills/utsuri-review/metadata/third-party-licenses.json", serialized.licenses]
  ];
  for (const [relative, content] of outputs) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content);
  }
  return outputs.map(([relative]) => relative);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputs = await generateSbom();
  console.log(`Generated deterministic SBOM and license inventory (${outputs.length} files)`);
}
