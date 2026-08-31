import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  canonicalSkillFiles,
  repositoryRoot,
  verifyPluginDistribution
} from "../../scripts/plugin-distribution.mjs";
import {
  assertPromotionDoesNotRegress,
  createPromotionUpdates,
  finalizeCommittedUpdates,
  parsePromotionOptions,
  restoreCommittedUpdates,
  runPluginPromotion,
  writeUpdatesAtomically
} from "../../scripts/plugin-promote.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "utsuri-plugin-promotion-test-"));
  temporaryRoots.push(root);
  for (const relativePath of [
    "package.json",
    "packages/cli/package.json",
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    "docs/assets/utsuri.jpg",
    "docs/compatibility/plugin-runtime.json"
  ]) {
    copyFile(relativePath, root);
  }
  cpSync(join(repositoryRoot, "plugins", "utsuri"), join(root, "plugins", "utsuri"), {
    recursive: true,
    dereference: false
  });
  for (const relativePath of canonicalSkillFiles) {
    copyFile(`skills/utsuri-review/${relativePath}`, root);
  }
  return root;
}

function copyFile(relativePath: string, root: string): void {
  const source = join(repositoryRoot, relativePath);
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source), {
    mode: lstatSync(source).mode & 0o777
  });
}

function setReleaseVersion(root: string, version: string): void {
  for (const relativePath of ["package.json", "packages/cli/package.json"]) {
    const target = join(root, relativePath);
    const manifest = JSON.parse(readFileSync(target, "utf8"));
    manifest.version = version;
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function treeDigest(root: string): string {
  const digest = createHash("sha256");
  function visit(directory: string, prefix: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      digest.update(relativePath);
      digest.update("\0");
      if (entry.isDirectory()) visit(absolutePath, relativePath);
      else digest.update(readFileSync(absolutePath));
    }
  }
  visit(root, "");
  return digest.digest("hex");
}

function transactionArtifacts(root: string): string[] {
  const artifacts: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.name.includes("plugin-promote-") || entry.name.includes("plugin-rollback-")) {
        artifacts.push(absolutePath);
      }
      if (entry.isDirectory()) visit(absolutePath);
    }
  }
  visit(root);
  return artifacts.sort();
}

const verifiedPublished = async ({ version }: { version: string }) => ({
  package: "@utsu-ri/cli",
  version,
  protocols: 4
});

describe("Plugin promotion", () => {
  test("requires complete exact versions and rejects ranges, tags, and missing values", () => {
    expect(parsePromotionOptions(["--version", "0.2.0"])).toEqual({
      write: false,
      version: "0.2.0"
    });
    for (const invalid of ["latest", "^0.2.0", "0.2", "workspace:*"]) {
      expect(() => parsePromotionOptions(["--version", invalid])).toThrow("complete SemVer");
    }
    expect(() => parsePromotionOptions([])).toThrow("Usage");
    expect(() => parsePromotionOptions(["--cli-version", "0.2.0"])).toThrow("Unknown");
    expect(() => parsePromotionOptions(["--plugin-version", "0.2.0"])).toThrow("Unknown");
  });

  test("reports synchronous CLI argument failures without an uncaught stack", () => {
    const result = spawnSync(
      process.execPath,
      [join(repositoryRoot, "scripts/plugin-promote.mjs"), "--version", "latest"],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("--version must be a complete SemVer version");
  });

  test("compares complete SemVer precedence without build metadata loss or hyphen truncation", () => {
    expect(() =>
      assertPromotionDoesNotRegress(
        { cliVersion: "1.2.3+build.10", pluginVersion: "1.2.3+build.10" },
        { version: "1.2.3+build.9" }
      )
    ).not.toThrow();
    expect(() =>
      assertPromotionDoesNotRegress(
        { cliVersion: "2.0.0-alpha-z", pluginVersion: "2.0.0-alpha-z" },
        { version: "2.0.0-alpha-a" }
      )
    ).toThrow("version must not regress");
    expect(() =>
      assertPromotionDoesNotRegress(
        { cliVersion: "2.0.0-alpha-z.9", pluginVersion: "2.0.0-alpha-z.9" },
        { version: "2.0.0-alpha-z.10" }
      )
    ).not.toThrow();
    expect(() =>
      assertPromotionDoesNotRegress(
        { cliVersion: "1.2.3", pluginVersion: "1.2.4" },
        { version: "1.2.4" }
      )
    ).toThrow("must be synchronized");
  });

  test("dry-run accepts controlled version skew and writes zero bytes", async () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const before = treeDigest(root);
    const lines: string[] = [];
    const result = await runPluginPromotion(
      { version: "0.3.2", write: false },
      { root, verifyPublished: verifiedPublished, log: (line: string) => lines.push(line) }
    );
    expect(result.action).toBe("dry-run");
    expect(treeDigest(root)).toBe(before);
    expect(lines.join("\n")).toContain("@utsu-ri/cli@0.3.2");
  });

  test("write atomically updates every synchronized Plugin version", async () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const result = await runPluginPromotion(
      { version: "0.3.2", write: true },
      { root, verifyPublished: verifiedPublished, log: () => undefined }
    );
    expect(result.action).toBe("updated");
    expect(verifyPluginDistribution({ root })).toMatchObject({
      pluginVersion: "0.3.2",
      cliVersion: "0.3.2"
    });
    expect(transactionArtifacts(root)).toEqual([]);
  });

  test("scopes in-flight backup exclusion to the exact verified transaction", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    const written = writeUpdatesAtomically(updates);
    expect(() => verifyPluginDistribution({ root })).toThrow("Git Plugin inventory mismatch");
    expect(() =>
      verifyPluginDistribution({ root, transactionArtifacts: written.committed })
    ).not.toThrow();
    finalizeCommittedUpdates(written.committed);
    expect(transactionArtifacts(root)).toEqual([]);
    expect(() => verifyPluginDistribution({ root })).not.toThrow();
  });

  test("post-write verification failure restores every original byte", async () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const before = treeDigest(root);
    let verificationCalls = 0;
    await expect(
      runPluginPromotion(
        { version: "0.3.2", write: true },
        {
          root,
          verifyPublished: verifiedPublished,
          log: () => undefined,
          verifyDistribution: (options: { root: string }) => {
            verificationCalls += 1;
            if (verificationCalls === 2) throw new Error("synthetic post-write failure");
            return verifyPluginDistribution(options);
          }
        }
      )
    ).rejects.toThrow("original bytes were restored");
    expect(treeDigest(root)).toBe(before);
    expect(() => verifyPluginDistribution({ root, allowRootReleaseSkew: true })).not.toThrow();
  });

  test("preimage changes abort before overwriting the changed file", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    const target = updates.find((entry) => !entry.current.equals(entry.next));
    expect(target).toBeDefined();
    writeFileSync(target!.path, "operator change\n");
    expect(() => writeUpdatesAtomically(updates)).toThrow("preimage changed");
    expect(readFileSync(target!.path, "utf8")).toBe("operator change\n");
  });

  test("an edit after the preimage check is displaced, detected, and restored without overwrite", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    const target = updates.find((entry) => !entry.current.equals(entry.next));
    expect(target).toBeDefined();
    let edited = false;
    let message = "";
    try {
      writeUpdatesAtomically(updates, {
        beforeRename(entry: { path: string }) {
          if (!edited && entry.path === target!.path) {
            edited = true;
            writeFileSync(entry.path, "concurrent operator edit\n");
          }
        }
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(`Promotion preimage changed: ${target!.path}`);
    expect(message).not.toContain("plugin-promote-backup");
    expect(message).not.toContain("plugin-promote-next");
    expect(readFileSync(target!.path, "utf8")).toBe("concurrent operator edit\n");
    expect(transactionArtifacts(root)).toEqual([]);
  });

  test("a displacement durability failure restores the target and cleans staged artifacts", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const before = treeDigest(root);
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    let failed = false;
    expect(() =>
      writeUpdatesAtomically(updates, {
        beforeFlush(operation: string) {
          if (!failed && operation === "displace-target") {
            failed = true;
            throw new Error("synthetic directory fsync failure");
          }
        }
      })
    ).toThrow("target displacement failed");
    expect(treeDigest(root)).toBe(before);
    expect(transactionArtifacts(root)).toEqual([]);
  });

  test("an install-next failure restores the displaced target without replacement", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const before = treeDigest(root);
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    let failed = false;
    expect(() =>
      writeUpdatesAtomically(updates, {
        beforeInstall() {
          if (failed) return;
          failed = true;
          throw new Error("synthetic install-next link failure");
        }
      })
    ).toThrow("committed files were restored");
    expect(treeDigest(root)).toBe(before);
    expect(transactionArtifacts(root)).toEqual([]);
  });

  test("rollback preserves a target concurrently recreated before install-next", () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    const updates = createPromotionUpdates({ version: "0.3.2" }, root);
    const target = updates.find((entry) => !entry.current.equals(entry.next));
    expect(target).toBeDefined();
    let failure = "";
    try {
      writeUpdatesAtomically(updates, {
        beforeInstall(entry: { path: string; mode: number }) {
          if (entry.path !== target!.path) return;
          writeFileSync(entry.path, "concurrent operator edit\n", {
            flag: "wx",
            mode: entry.mode
          });
        }
      });
    } catch (error) {
      failure = (error as Error).message;
    }
    expect(failure).toContain(`Terminal rollback conflict: ${target!.path}`);
    expect(readFileSync(target!.path, "utf8")).toBe("concurrent operator edit\n");
    const retained = readdirSync(dirname(target!.path)).filter((name) =>
      name.startsWith(`.${basename(target!.path)}.plugin-promote-backup-`)
    );
    expect(retained).toHaveLength(1);
    expect(
      readFileSync(join(dirname(target!.path), retained[0]!)).equals(target!.current)
    ).toBeTrue();
  });

  test("rollback preserves an edit after its match check and retains the original backup", async () => {
    const root = fixtureRoot();
    setReleaseVersion(root, "0.3.2");
    let verificationCalls = 0;
    let conflictingEntry:
      { path: string; current: Buffer; next: Buffer; mode: number; backup: string } | undefined;
    let failure = "";
    try {
      await runPluginPromotion(
        { version: "0.3.2", write: true },
        {
          root,
          verifyPublished: verifiedPublished,
          log: () => undefined,
          verifyDistribution: (options: { root: string }) => {
            verificationCalls += 1;
            if (verificationCalls === 2) throw new Error("synthetic post-write failure");
            return verifyPluginDistribution(options);
          },
          restoreUpdates: (
            committed: Array<{
              path: string;
              current: Buffer;
              next: Buffer;
              mode: number;
              backup: string;
            }>
          ) => {
            let edited = false;
            restoreCommittedUpdates(committed, {
              beforeRollback(entry: (typeof committed)[number]) {
                if (edited) return;
                edited = true;
                conflictingEntry = entry;
                writeFileSync(entry.path, "external edit before rollback\n");
              }
            });
          }
        }
      );
    } catch (error) {
      failure = (error as Error).message;
    }
    expect(failure).toContain(`Terminal rollback conflict: ${conflictingEntry!.path}`);
    expect(failure).not.toContain("plugin-promote-backup");
    expect(failure).not.toContain("plugin-rollback-");
    expect(readFileSync(conflictingEntry!.path, "utf8")).toBe("external edit before rollback\n");
    const retained = readdirSync(dirname(conflictingEntry!.path)).filter((name) =>
      name.startsWith(`.${basename(conflictingEntry!.path)}.plugin-promote-backup-`)
    );
    expect(retained).toHaveLength(1);
    expect(
      readFileSync(join(dirname(conflictingEntry!.path), retained[0]!)).equals(
        conflictingEntry!.current
      )
    ).toBeTrue();
    expect(() => verifyPluginDistribution({ root })).toThrow("Git Plugin inventory mismatch");
  });
});
