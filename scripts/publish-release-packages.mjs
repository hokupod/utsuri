#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedPackageTarballs, verifyReleaseAssets } from "./release-assets.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function encodedPackageName(name) {
  return encodeURIComponent(name).replace(/^%40/u, "@");
}

export async function registryIntegrity(fetchImpl, registry, name, version) {
  const endpoint = `${registry.replace(/\/$/u, "")}/${encodedPackageName(name)}/${encodeURIComponent(version)}`;
  const response = await fetchImpl(endpoint, {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}`);
  const metadata = await response.json();
  if (
    metadata?.name !== name ||
    metadata?.version !== version ||
    typeof metadata?.dist?.integrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(metadata.dist.integrity)
  ) {
    throw new Error(`npm registry returned invalid metadata for ${name}@${version}`);
  }
  return metadata.dist.integrity;
}

export async function publishPackageSequence({
  packages,
  lookupIntegrity,
  publish,
  sleep = delay,
  pollAttempts = 12,
  pollDelayMs = 5_000
}) {
  const results = [];
  for (const package_ of packages) {
    const existing = await lookupIntegrity(package_);
    if (existing !== null) {
      if (existing !== package_.integrity) {
        throw new Error(`${package_.name}@${package_.version} already exists with different bytes`);
      }
      results.push({ name: package_.name, status: "already-published" });
      continue;
    }

    const publication = await publish(package_);
    let observed = null;
    let lastLookupError;
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      if (attempt > 0) await sleep(pollDelayMs);
      try {
        observed = await lookupIntegrity(package_);
        lastLookupError = undefined;
      } catch (error) {
        lastLookupError = error;
        continue;
      }
      if (observed !== null) break;
    }
    if (observed !== null && observed !== package_.integrity) {
      throw new Error(`${package_.name}@${package_.version} appeared with different bytes`);
    }
    if (observed !== package_.integrity) {
      const reason = lastLookupError?.message ?? `npm publish exited with ${publication.status}`;
      throw new Error(`${package_.name}@${package_.version} was not verified: ${reason}`);
    }
    results.push({
      name: package_.name,
      status: publication.ok ? "published" : "recovered-after-publish-error"
    });
  }
  return results;
}

function runNpmPublish(package_) {
  const result = spawnSync(
    "npm",
    ["publish", package_.tarball, "--access", "public", "--provenance"],
    { cwd: repositoryRoot, shell: false, stdio: "inherit" }
  );
  if (result.error) throw result.error;
  return { ok: result.status === 0, status: result.status ?? 1 };
}

export async function publishReleasePackages({
  candidate,
  registry = "https://registry.npmjs.org",
  fetchImpl = fetch,
  publish = runNpmPublish,
  sleep = delay
}) {
  const candidateRoot = path.resolve(candidate);
  const releaseManifest = await verifyReleaseAssets(candidateRoot, repositoryRoot);
  const packages = expectedPackageTarballs(releaseManifest.version).map(
    ({ packageName, relative }) => ({
      name: packageName,
      version: releaseManifest.version,
      tarball: path.join(candidateRoot, relative),
      integrity: releaseManifest.files[relative].integrity
    })
  );
  return publishPackageSequence({
    packages,
    lookupIntegrity: ({ name, version }) => registryIntegrity(fetchImpl, registry, name, version),
    publish,
    sleep
  });
}

function parseArguments(arguments_) {
  if (arguments_[0] !== "--candidate" || !arguments_[1] || arguments_.length !== 2) {
    throw new Error("Usage: publish-release-packages.mjs --candidate PATH");
  }
  return path.resolve(arguments_[1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
      throw new Error("token-based npm authentication is forbidden; use trusted publishing OIDC");
    }
    const results = await publishReleasePackages({
      candidate: parseArguments(process.argv.slice(2))
    });
    process.stdout.write(`${JSON.stringify({ ok: true, packages: results })}\n`);
  } catch (error) {
    process.stderr.write(`RELEASE_PUBLICATION_FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}
