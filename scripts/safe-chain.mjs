#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, lstat, open, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { arch, homedir, platform } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const policyPath = new URL("../toolchain-policy.json", import.meta.url);

function executableIdentity(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs
  };
}

export async function assertSafeChainUnchanged(executable, expectedIdentity) {
  const current = await lstat(executable);
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    JSON.stringify(executableIdentity(current)) !== JSON.stringify(expectedIdentity)
  ) {
    throw new Error("Safe-chain executable changed after digest verification");
  }
}

export async function resolveSafeChain() {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const candidate = path.join(homedir(), policy.safeChain.relativeExecutable);

  await access(candidate, constants.X_OK).catch(() => {
    throw new Error(
      `Safe-chain ${policy.safeChain.version} is required at the standard user installation location`
    );
  });

  return validateSafeChainExecutable(candidate, policy);
}

export async function validateSafeChainExecutable(candidate, policy) {
  const candidateStat = await lstat(candidate);
  if (candidateStat.isSymbolicLink()) {
    throw new Error("The standard Safe-chain executable must not be a symbolic link");
  }
  if (!candidateStat.isFile()) {
    throw new Error("The standard Safe-chain executable must be a regular file");
  }

  const resolved = await realpath(candidate);
  if (path.basename(resolved) !== "safe-chain") {
    throw new Error("The resolved Safe-chain executable has an unexpected basename");
  }

  const platformKey = `${platform()}-${arch()}`;
  const expectedSha256 = policy.safeChain.sha256?.[platformKey];
  if (!expectedSha256) {
    throw new Error(`Safe-chain has no approved digest for ${platformKey}`);
  }
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  let identity;
  let bytes;
  try {
    const verifiedStat = await handle.stat();
    if (!verifiedStat.isFile()) {
      throw new Error("The opened Safe-chain executable must be a regular file");
    }
    identity = executableIdentity(verifiedStat);
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expectedSha256) {
    throw new Error(`Safe-chain digest mismatch for ${platformKey}`);
  }

  await assertSafeChainUnchanged(resolved, identity);
  const version = spawnSync(resolved, ["--version"], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (version.status !== 0) {
    throw new Error("Safe-chain version detection failed");
  }

  const match = version.stdout.match(/Current safe-chain version:\s*([^\s]+)/u);
  if (match?.[1] !== policy.safeChain.version) {
    throw new Error(
      `Safe-chain ${policy.safeChain.version} is required; found ${match?.[1] ?? "unknown"}`
    );
  }

  return { executable: resolved, identity, version: match[1], sha256, policy };
}

export function isDirectExecution(moduleUrl, argumentPath) {
  if (!argumentPath) return false;
  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argumentPath);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error("Usage: node scripts/safe-chain.mjs <package-manager> [args...]");
  }

  const { executable, identity } = await resolveSafeChain();
  await assertSafeChainUnchanged(executable, identity);
  const result = spawnSync(executable, args, {
    env: process.env,
    shell: false,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(`safe-chain: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 3;
  });
}
