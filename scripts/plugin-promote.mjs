#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCompleteSemver,
  buildPluginMcpArgs,
  distributionPaths,
  expectedPluginSkill,
  readDistributionIdentity,
  repositoryRoot,
  verifyPluginDistribution
} from "./plugin-distribution.mjs";
import { verifyPublishedCli } from "./verify-published-cli.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPluginPromotion(parsePromotionOptions(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}

export function parsePromotionOptions(args) {
  /** @type {{ write: boolean; version?: string }} */
  const result = { write: false };
  const consumed = new Set();
  for (let index = 0; index < args.length; index += 1) {
    if (consumed.has(index)) continue;
    const argument = args[index];
    if (argument === "--write") {
      if (result.write) throw new Error("--write may only be provided once");
      result.write = true;
      continue;
    }
    if (argument === "--version") {
      if (result.version !== undefined) {
        throw new Error(`${argument} may only be provided once`);
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      result.version = value;
      consumed.add(index + 1);
      index += 1;
      continue;
    }
    throw new Error(`Unknown Plugin promotion option: ${argument}`);
  }
  if (!result.version) {
    throw new Error("Usage: plugin-promote.mjs --version VERSION [--write]");
  }
  assertCompleteSemver(result.version, "--version");
  return result;
}

export async function runPluginPromotion(options, dependencies = {}) {
  assertCompleteSemver(options.version, "--version");
  if (typeof options.write !== "boolean") {
    throw new Error("Plugin promotion write mode must be boolean");
  }

  const root = dependencies.root ?? repositoryRoot;
  const verifyDistribution = dependencies.verifyDistribution ?? verifyPluginDistribution;
  const verifyPublished = dependencies.verifyPublished ?? verifyPublishedCli;
  const createUpdates = dependencies.createUpdates ?? createPromotionUpdates;
  const writeUpdates = dependencies.writeUpdates ?? writeUpdatesAtomically;
  const restoreUpdates = dependencies.restoreUpdates ?? restoreCommittedUpdates;
  const finalizeUpdates = dependencies.finalizeUpdates ?? finalizeCommittedUpdates;
  const log = dependencies.log ?? console.log;

  const current = verifyDistribution({ root, allowRootReleaseSkew: true });
  const currentIdentity = readDistributionIdentity(root);
  if (
    current.cliVersion !== currentIdentity.cliVersion ||
    current.pluginVersion !== currentIdentity.pluginVersion
  ) {
    throw new Error("Current Plugin distribution identity is inconsistent");
  }
  assertPromotionDoesNotRegress(currentIdentity, options);

  const rootVersion = readJson(join(root, "package.json")).version;
  const cliVersion = readJson(join(root, "packages", "cli", "package.json")).version;
  if (rootVersion !== options.version || cliVersion !== options.version) {
    throw new Error(
      `Root and CLI package versions must both equal --version (${options.version}) before promotion`
    );
  }

  const published = await verifyPublished({ version: options.version });
  if (published?.package !== "@utsu-ri/cli" || published?.version !== options.version) {
    throw new Error("Published CLI verification returned the wrong identity");
  }

  const updates = createUpdates(options, root);
  if (!options.write) {
    log("plugin promotion dry-run (no files changed)");
    printUpdates(updates, root, log);
    log(
      `published CLI verified: ${published.package}@${published.version}; rerun with --write only after separate authorization`
    );
    return { action: "dry-run", published, updates };
  }

  let written;
  try {
    written = writeUpdates(updates);
  } catch (error) {
    throw new Error(`Plugin promotion write failed: ${errorMessage(error)}`);
  }
  const committed = written?.committed ?? written;
  if (!Array.isArray(committed)) {
    throw new Error("Plugin promotion write did not report committed entries");
  }

  try {
    const verified = verifyDistribution({
      root,
      transactionArtifacts: committed
    });
    if (verified.cliVersion !== options.version || verified.pluginVersion !== options.version) {
      throw new Error("Post-write Plugin identity does not match promotion target");
    }
  } catch (verificationError) {
    let rollbackError;
    try {
      restoreUpdates(committed);
      verifyDistribution({ root, allowRootReleaseSkew: true });
    } catch (error) {
      rollbackError = error;
    }
    if (rollbackError) {
      throw new Error(
        `Plugin promotion verification failed: ${errorMessage(verificationError)}; rollback failed: ${errorMessage(rollbackError)}`
      );
    }
    throw new Error(
      `Plugin promotion verification failed and original bytes were restored: ${errorMessage(verificationError)}`
    );
  }

  try {
    finalizeUpdates(committed);
  } catch (error) {
    throw new Error(`Plugin promotion cleanup failed: ${errorMessage(error)}`);
  }

  log(`plugin promotion updated after verifying ${published.package}@${published.version}`);
  printUpdates(updates, root, log);
  return { action: "updated", published, updates, committed };
}

export function assertPromotionDoesNotRegress(current, requested) {
  if (current.cliVersion !== current.pluginVersion) {
    throw new Error("Current Plugin and CLI versions must be synchronized");
  }
  if (compareSemver(requested.version, current.cliVersion) < 0) {
    throw new Error("Plugin and CLI version must not regress");
  }
}

export function createPromotionUpdates(options, root = repositoryRoot) {
  const paths = distributionPaths(root);
  const codexCatalog = readJson(paths.catalog);
  const claudeMarketplace = readJson(paths.claudeMarketplace);
  const codexManifest = readJson(paths.codexManifest);
  const codexMcp = readJson(paths.codexMcp);
  const claudeManifest = readJson(paths.claudeManifest);
  const compatibility = readJson(paths.compatibility);

  codexManifest.version = options.version;
  codexMcp.utsuri.args = buildPluginMcpArgs(options.version);
  claudeManifest.version = options.version;
  claudeManifest.mcpServers.utsuri.args = buildPluginMcpArgs(options.version);
  claudeMarketplace.metadata.version = options.version;
  claudeMarketplace.plugins[0].version = options.version;
  compatibility.distribution = {
    pluginVersion: options.version,
    cliVersion: options.version,
    mcpPackagePin: `@utsu-ri/cli@${options.version}`
  };

  const updates = [
    update(paths.catalog, json(codexCatalog)),
    update(paths.claudeMarketplace, json(claudeMarketplace)),
    update(paths.codexManifest, json(codexManifest)),
    update(paths.codexMcp, json(codexMcp)),
    update(paths.claudeManifest, json(claudeManifest)),
    update(paths.compatibility, json(compatibility))
  ];
  const generated = expectedPluginSkill(root, options.version);
  for (const [relativePath, bytes] of generated.files) {
    updates.push(update(join(paths.pluginSkill, relativePath), bytes));
  }
  return updates.sort((left, right) => left.path.localeCompare(right.path));
}

export function writeUpdatesAtomically(updates, options = {}) {
  const staged = [];
  const flush = (operation, entry) => {
    options.beforeFlush?.(operation, entry);
    flushDirectory(dirname(entry.path));
  };
  try {
    for (const entry of updates) {
      assertPromotionTargetUnchanged(entry);
      if (entry.current.equals(entry.next)) continue;
      const temporary = temporaryPath(entry.path, "plugin-promote-next");
      const stagedEntry = { ...entry, temporary };
      staged.push(stagedEntry);
      try {
        writeExclusiveAndFlush(temporary, entry.next, entry.mode);
        flush("stage-next", stagedEntry);
      } catch {
        throw new Error(`Promotion staging failed: ${entry.path}`);
      }
    }
  } catch (error) {
    const cleanupFailures = cleanupTemporaryEntries(staged);
    throw new Error(`${errorMessage(error)}${formatCleanupFailures(cleanupFailures)}`);
  }

  const committed = [];
  try {
    for (const entry of staged) {
      assertPromotionTargetUnchanged(entry);
      try {
        options.beforeRename?.(entry, committed);
      } catch {
        throw new Error(`Promotion transaction hook failed: ${entry.path}`);
      }

      const transaction = {
        ...entry,
        backup: temporaryPath(entry.path, "plugin-promote-backup")
      };
      let displaced = false;
      try {
        renameSync(entry.path, transaction.backup);
        displaced = true;
        flush("displace-target", transaction);
      } catch {
        if (displaced) restoreDisplacedWithoutReplace(transaction.backup, entry.path);
        throw new Error(`Promotion target displacement failed: ${entry.path}`);
      }

      if (!fileMatches(transaction.backup, entry.current, entry.mode)) {
        const restored = restoreDisplacedWithoutReplace(transaction.backup, entry.path);
        throw new Error(
          `${restored ? "Promotion preimage changed" : "Terminal promotion conflict"}: ${entry.path}`
        );
      }

      committed.push(transaction);
      try {
        options.beforeInstall?.(transaction);
        linkSync(entry.temporary, entry.path);
        flush("install-next", transaction);
      } catch {
        throw new Error(`Promotion no-replace install failed: ${entry.path}`);
      }
      if (!fileMatches(entry.path, entry.next, entry.mode)) {
        throw new Error(`Terminal promotion conflict: ${entry.path}`);
      }
      try {
        unlinkSync(entry.temporary);
        flush("remove-next-temp", transaction);
      } catch {
        throw new Error(`Promotion temporary cleanup failed: ${entry.path}`);
      }
      if (!fileMatches(entry.path, entry.next, entry.mode)) {
        throw new Error(`Terminal promotion conflict: ${entry.path}`);
      }
    }
  } catch (error) {
    let rollbackError;
    try {
      restoreCommittedUpdates(committed);
    } catch (restoreFailure) {
      rollbackError = restoreFailure;
    }
    const cleanupFailures = cleanupTemporaryEntries(staged);
    throw new Error(
      `${errorMessage(error)}${
        rollbackError
          ? `; rollback failed: ${errorMessage(rollbackError)}`
          : "; committed files were restored"
      }${formatCleanupFailures(cleanupFailures)}`
    );
  }

  return {
    committed,
    cleanupFailures: cleanupTemporaryEntries(staged)
  };
}

export function restoreCommittedUpdates(committed, options = {}) {
  const failures = [];
  for (const entry of [...committed].reverse()) {
    if (!fileMatches(entry.backup, entry.current, entry.mode)) {
      failures.push(`Terminal rollback conflict: ${entry.path}`);
      continue;
    }
    if (!fileMatches(entry.path, entry.next, entry.mode)) {
      if (restoreDisplacedWithoutReplace(entry.backup, entry.path)) continue;
      failures.push(`Terminal rollback conflict: ${entry.path}`);
      continue;
    }

    try {
      options.beforeRollback?.(entry);
    } catch {
      failures.push(`Terminal rollback conflict: ${entry.path}`);
      continue;
    }

    const displaced = temporaryPath(entry.path, "plugin-rollback-displaced");
    const temporary = temporaryPath(entry.path, "plugin-rollback-original");
    let movedCurrent = false;
    try {
      renameSync(entry.path, displaced);
      movedCurrent = true;
      flushDirectory(dirname(entry.path));
      if (!fileMatches(displaced, entry.next, entry.mode)) {
        restoreDisplacedWithoutReplace(displaced, entry.path);
        failures.push(`Terminal rollback conflict: ${entry.path}`);
        continue;
      }

      writeExclusiveAndFlush(temporary, entry.current, entry.mode);
      flushDirectory(dirname(entry.path));
      linkSync(temporary, entry.path);
      flushDirectory(dirname(entry.path));
      if (!fileMatches(entry.path, entry.current, entry.mode)) {
        failures.push(`Terminal rollback conflict: ${entry.path}`);
        continue;
      }
      unlinkSync(temporary);
      flushDirectory(dirname(entry.path));
      if (!fileMatches(entry.path, entry.current, entry.mode)) {
        failures.push(`Terminal rollback conflict: ${entry.path}`);
        continue;
      }
      unlinkSync(displaced);
      unlinkSync(entry.backup);
      flushDirectory(dirname(entry.path));
    } catch {
      if (movedCurrent && !fileExists(entry.path)) {
        restoreDisplacedWithoutReplace(displaced, entry.path);
      }
      failures.push(`Terminal rollback conflict: ${entry.path}`);
    } finally {
      removeOwnArtifact(temporary);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

export function finalizeCommittedUpdates(committed) {
  const failures = [];
  for (const entry of committed) {
    if (
      !fileMatches(entry.path, entry.next, entry.mode) ||
      !fileMatches(entry.backup, entry.current, entry.mode)
    ) {
      failures.push(`Terminal promotion cleanup conflict: ${entry.path}`);
      continue;
    }
    try {
      unlinkSync(entry.backup);
      flushDirectory(dirname(entry.path));
    } catch {
      failures.push(`Promotion backup cleanup failed: ${entry.path}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
}

function update(path, next) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Promotion target must be a regular non-symlink file: ${path}`);
  }
  const current = readFileSync(path);
  return {
    path,
    current,
    next: Buffer.isBuffer(next) ? next : Buffer.from(next, "utf8"),
    mode: stat.mode & 0o777
  };
}

function assertPromotionTargetUnchanged(entry) {
  if (!fileMatches(entry.path, entry.current, entry.mode)) {
    throw new Error(`Promotion preimage changed: ${entry.path}`);
  }
}

function fileMatches(path, expected, mode) {
  try {
    const stat = lstatSync(path);
    return (
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o777) === mode &&
      readFileSync(path).equals(expected)
    );
  } catch {
    return false;
  }
}

function fileExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function restoreDisplacedWithoutReplace(displaced, target) {
  try {
    linkSync(displaced, target);
    unlinkSync(displaced);
    flushDirectory(dirname(target));
    return true;
  } catch {
    return false;
  }
}

function writeExclusiveAndFlush(path, bytes, mode) {
  const descriptor = openSync(path, "wx", mode);
  try {
    writeFileSync(descriptor, bytes);
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function flushDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function temporaryPath(path, label) {
  return join(dirname(path), `.${basename(path)}.${label}-${process.pid}-${randomUUID()}`);
}

function cleanupTemporaryEntries(entries) {
  const failures = [];
  for (const entry of entries) {
    try {
      rmSync(entry.temporary, { force: true });
    } catch {
      failures.push(entry.path);
    }
  }
  return failures;
}

function removeOwnArtifact(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // A retained artifact is reported through the declared target conflict.
  }
}

function formatCleanupFailures(failures) {
  return failures.length === 0 ? "" : `; temporary cleanup failed: ${failures.join("; ")}`;
}

function printUpdates(updates, root, log) {
  for (const entry of updates) {
    log(
      `${entry.current.equals(entry.next) ? "verify" : "update"} ${entry.path.slice(root.length + 1)}`
    );
  }
}

function compareSemver(left, right) {
  const parse = (value) => {
    const buildIndex = value.indexOf("+");
    const precedence = buildIndex === -1 ? value : value.slice(0, buildIndex);
    const prereleaseIndex = precedence.indexOf("-");
    const core = prereleaseIndex === -1 ? precedence : precedence.slice(0, prereleaseIndex);
    const prerelease = prereleaseIndex === -1 ? "" : precedence.slice(prereleaseIndex + 1);
    const [major, minor, patch] = core.split(".");
    return { major, minor, patch, prerelease: prerelease.split(".").filter(Boolean) };
  };
  const compareNumeric = (leftPart, rightPart) => {
    if (leftPart.length !== rightPart.length) return leftPart.length > rightPart.length ? 1 : -1;
    if (leftPart === rightPart) return 0;
    return leftPart > rightPart ? 1 : -1;
  };
  const leftValue = parse(left);
  const rightValue = parse(right);
  for (const key of ["major", "minor", "patch"]) {
    if (leftValue[key] !== rightValue[key]) {
      return compareNumeric(leftValue[key], rightValue[key]);
    }
  }
  if (leftValue.prerelease.length === 0 && rightValue.prerelease.length === 0) {
    return 0;
  }
  if (leftValue.prerelease.length === 0) return 1;
  if (rightValue.prerelease.length === 0) return -1;
  const length = Math.max(leftValue.prerelease.length, rightValue.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftValue.prerelease[index];
    const rightPart = rightValue.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return compareNumeric(leftPart, rightPart);
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
