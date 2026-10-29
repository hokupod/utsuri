import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  canonicalSkillFiles,
  repositoryRoot,
  syncPluginSkill,
  verifyPluginDistribution
} from "../../scripts/plugin-distribution.mjs";

import { createPromotionUpdates } from "../../scripts/plugin-promote.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(options: { staged?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "utsuri-plugin-distribution-test-"));
  temporaryRoots.push(root);
  const files = [
    "package.json",
    "packages/cli/package.json",
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    "docs/assets/utsuri.jpg",
    "docs/compatibility/plugin-runtime.json"
  ];
  for (const relativePath of files) copyFile(relativePath, root);
  cpSync(join(repositoryRoot, "plugins", "utsuri"), join(root, "plugins", "utsuri"), {
    recursive: true,
    dereference: false
  });
  for (const relativePath of canonicalSkillFiles) {
    copyFile(`skills/utsuri-review/${relativePath}`, root);
  }
  if (options.staged) restorePublishedSurface(root);
  else {
    const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    for (const update of createPromotionUpdates({ version }, root)) {
      writeFileSync(update.path, update.next);
    }
  }
  return root;
}

function restorePublishedSurface(root: string): void {
  const git = (args: string[]) => execFileSync("git", ["-C", repositoryRoot, ...args]);
  const anchor = JSON.parse(
    git(["show", "origin/main:docs/compatibility/plugin-runtime.json"]).toString("utf8")
  ).publicGitVerification;
  const paths = [
    "plugins/utsuri",
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    "docs/compatibility/plugin-runtime.json"
  ];
  const entries = git(["ls-tree", "-r", "-z", anchor.sourceCommit, "--", ...paths])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  rmSync(join(root, "plugins/utsuri"), { recursive: true, force: true });
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match) throw new Error("Published fixture requires regular Git blobs");
    const [, mode, objectId, relativePath] = match;
    if (!mode || !objectId || !relativePath) throw new Error("Incomplete published fixture entry");
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, git(["cat-file", "blob", objectId]), {
      mode: Number.parseInt(mode.slice(3), 8)
    });
  }
  mutateJson(root, "docs/compatibility/plugin-runtime.json", (value) => {
    value.publicGitVerification = anchor;
  });
  const parts = anchor.pluginVersion.split(".");
  parts[2] = String(BigInt(parts[2]) + 1n);
  for (const name of ["package.json", "packages/cli/package.json"]) {
    mutateJson(root, name, (value) => {
      value.version = parts.join(".");
    });
  }
}

function copyFile(relativePath: string, root: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(join(repositoryRoot, relativePath)), {
    mode: lstatSync(join(repositoryRoot, relativePath)).mode & 0o777
  });
}

function mutateJson(root: string, relativePath: string, mutate: (value: any) => void): void {
  const filename = join(root, relativePath);
  const value = JSON.parse(readFileSync(filename, "utf8"));
  mutate(value);
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

describe("Git Marketplace Plugin distribution", () => {
  test("keeps the verified published Git surface intact while the next CLI is staged", () => {
    const root = fixtureRoot({ staged: true });
    const { distribution } = JSON.parse(
      readFileSync(join(root, "docs/compatibility/plugin-runtime.json"), "utf8")
    );
    const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(verifyPluginDistribution({ root })).toMatchObject({
      pluginVersion: distribution.pluginVersion,
      cliVersion: distribution.cliVersion,
      sourceCliVersion: version,
      publicationStage: "cli-candidate-with-published-git-plugin"
    });
  });

  test("rejects changed public Plugin bytes and modes during CLI staging", () => {
    for (const change of ["bytes", "mode"]) {
      const root = fixtureRoot({ staged: true });
      const name = join(root, "plugins/utsuri/skills/utsuri-review/SKILL.md");
      if (change === "bytes") writeFileSync(name, `${readFileSync(name, "utf8")}\n`);
      else chmodSync(name, 0o755);
      const legacyOptions = { root, allowRootReleaseSkew: true };
      expect(() => verifyPluginDistribution(legacyOptions)).toThrow(
        "verified public Git Plugin preimage"
      );
    }
  });

  test("rejects an edited publication anchor and a staged CLI downgrade", () => {
    const root = fixtureRoot({ staged: true });
    mutateJson(root, "docs/compatibility/plugin-runtime.json", (value) => {
      value.publicGitVerification.sourceCommit = "f".repeat(40);
    });
    expect(() => verifyPluginDistribution({ root })).toThrow(
      "preserve main's verified public Git record"
    );
    const candidate = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    for (const version of ["0.0.0", `${candidate}-beta.1`, `${candidate}\n`]) {
      const downgraded = fixtureRoot({ staged: true });
      for (const name of ["package.json", "packages/cli/package.json"]) {
        mutateJson(downgraded, name, (value) => {
          value.version = version;
        });
      }
      expect(() => verifyPluginDistribution({ root: downgraded })).toThrow("newer stable CLI");
    }
  });

  test("refuses Skill synchronization before verified post-publication promotion", () => {
    const root = fixtureRoot({ staged: true });
    const name = join(root, "plugins/utsuri/skills/utsuri-review/SKILL.md");
    const before = readFileSync(name);
    expect(() => syncPluginSkill(root)).toThrow("verified post-publication promotion");
    expect(readFileSync(name)).toEqual(before);
  });

  test("accepts the exact bounded inventory and exact CLI pin", () => {
    const root = fixtureRoot();
    const result = verifyPluginDistribution({ root });
    expect(result).toMatchObject({
      pluginId: "utsuri@utsuri",
      pluginVersion: "0.3.7",
      packageName: "@utsu-ri/cli",
      cliVersion: "0.3.7",
      sourcePath: "./plugins/utsuri"
    });
  });

  test("requires canonical Codex product illustration paths and bytes", () => {
    const root = fixtureRoot();
    mutateJson(root, "plugins/utsuri/.codex-plugin/plugin.json", (value) => {
      value.interface.logo = "../utsuri.jpg";
    });
    writeFileSync(join(root, "plugins/utsuri/assets/utsuri.jpg"), "not the canonical image\n");
    expect(() => verifyPluginDistribution({ root })).toThrow(
      "Codex Plugin manifest must reference the product illustration"
    );
    expect(() => verifyPluginDistribution({ root })).toThrow(
      "Git Plugin product illustration does not match the canonical image"
    );
  });

  test("rejects a floating package pin", () => {
    const root = fixtureRoot();
    mutateJson(root, "plugins/utsuri/.codex-plugin/mcp.json", (value) => {
      value.utsuri.args[1] = "--package=@utsu-ri/cli@latest";
    });
    expect(() => verifyPluginDistribution({ root })).toThrow("exact @utsu-ri/cli SemVer pin");
  });

  test("rejects a Plugin version that differs from the CLI release", () => {
    const root = fixtureRoot();
    mutateJson(root, "plugins/utsuri/.codex-plugin/plugin.json", (value) => {
      value.version = "0.2.1";
    });
    mutateJson(root, "plugins/utsuri/.claude-plugin/plugin.json", (value) => {
      value.version = "0.2.1";
    });
    mutateJson(root, ".claude-plugin/marketplace.json", (value) => {
      value.metadata.version = "0.2.1";
      value.plugins[0].version = "0.2.1";
    });
    mutateJson(root, "docs/compatibility/plugin-runtime.json", (value) => {
      value.distribution.pluginVersion = "0.2.1";
    });
    expect(() => verifyPluginDistribution({ root })).toThrow(
      "Plugin, CLI, and root versions are not synchronized"
    );
  });

  test("rejects catalog traversal and extra identity environment", () => {
    const root = fixtureRoot();
    mutateJson(root, ".agents/plugins/marketplace.json", (value) => {
      value.plugins[0].source.path = "../plugins/utsuri";
    });
    mutateJson(root, "plugins/utsuri/.codex-plugin/mcp.json", (value) => {
      value.utsuri.env_vars.push("CLAUDE_CODE_SESSION_ID");
    });
    expect(() => verifyPluginDistribution({ root })).toThrow("required shape");
    expect(() => verifyPluginDistribution({ root })).toThrow("bounded stdio contract");
  });

  test("rejects generated drift, a symlink, compiled output, and ai paths", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "plugins/utsuri/skills/utsuri-review/SKILL.md"), "hand-edited\n");
    symlinkSync("SKILL.md", join(root, "plugins/utsuri/skills/utsuri-review/linked.md"));
    mkdirSync(join(root, "plugins/utsuri/skills/utsuri-review/scripts"));
    writeFileSync(
      join(root, "plugins/utsuri/skills/utsuri-review/scripts/utsuri.mjs"),
      "export {};\n"
    );
    mkdirSync(join(root, "plugins/utsuri/ai"));
    writeFileSync(join(root, "plugins/utsuri/ai/note.md"), "private\n");
    expect(() => verifyPluginDistribution({ root })).toThrow("symlink");
    expect(() => verifyPluginDistribution({ root })).toThrow("forbidden artifact");
    expect(() => verifyPluginDistribution({ root })).toThrow("Generated Skill drift");
  });

  test("deterministically restores the generated Skill from canonical inputs", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "plugins/utsuri/skills/utsuri-review/SKILL.md"), "drift\n");
    const first = syncPluginSkill(root);
    const firstBytes = readFileSync(
      join(root, "plugins/utsuri/skills/utsuri-review/.generated.json")
    );
    const second = syncPluginSkill(root);
    const secondBytes = readFileSync(
      join(root, "plugins/utsuri/skills/utsuri-review/.generated.json")
    );
    expect(first.canonicalSha256).toBe(second.canonicalSha256);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(() => verifyPluginDistribution({ root })).not.toThrow();
  });

  test("rejects a dangling generated-Skill symlink before synchronization", () => {
    const root = fixtureRoot();
    const skill = join(root, "plugins/utsuri/skills/utsuri-review");
    rmSync(skill, { recursive: true });
    symlinkSync("missing-skill-target", skill);
    expect(() => syncPluginSkill(root)).toThrow("Plugin Skill destination must not be a symlink");
    expect(lstatSync(skill).isSymbolicLink()).toBe(true);
  });

  test("rejects synchronized Plugin bytes containing NUL before text and secret scanning", () => {
    const root = fixtureRoot();
    const canonical = join(root, "skills/utsuri-review/references/security.md");
    const secretLike = ["sk", "A".repeat(24)].join("-");
    writeFileSync(
      canonical,
      Buffer.concat([readFileSync(canonical), Buffer.from(`\0synthetic-${secretLike}\n`, "utf8")])
    );
    syncPluginSkill(root);
    expect(() => verifyPluginDistribution({ root })).toThrow(
      "Git Plugin file contains NUL: skills/utsuri-review/references/security.md"
    );
  });
});
