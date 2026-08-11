import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
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

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "utsuri-plugin-distribution-test-"));
  temporaryRoots.push(root);
  const files = [
    "package.json",
    "packages/cli/package.json",
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
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
  return root;
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
  test("accepts the exact bounded inventory and exact CLI pin", () => {
    const root = fixtureRoot();
    const result = verifyPluginDistribution({ root });
    expect(result).toMatchObject({
      pluginId: "utsuri@utsuri",
      pluginVersion: "0.2.0",
      packageName: "@utsu-ri/cli",
      cliVersion: "0.2.0",
      sourcePath: "./plugins/utsuri"
    });
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
