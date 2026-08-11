import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateReleaseMetadata, verifyReleaseRef } from "../../scripts/verify-release-ref.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const validRoot = { version: "0.1.0" };
const validCli = { version: "0.1.0", private: true };
const validChangelog = "# Changelog\n\n## [0.1.0] - 2026-08-08\n\n- Initial release.\n";

function runGit(root, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
}

test("release metadata requires an exact stable version and dated changelog entry", () => {
  assert.deepEqual(
    validateReleaseMetadata({
      tag: "v0.1.0",
      rootManifest: validRoot,
      cliManifest: validCli,
      changelog: validChangelog
    }),
    []
  );
  assert.match(
    validateReleaseMetadata({
      tag: "v0.1.0-rc.1",
      rootManifest: { version: "0.1.0-rc.1" },
      cliManifest: { version: "0.1.0-rc.1", private: false },
      changelog: ""
    }).join("\n"),
    /stable SemVer|private|CHANGELOG/u
  );
});

test("current repository metadata is ready for its release tag", async () => {
  const [
    rootManifest,
    cliManifest,
    rootCodexPlugin,
    rootClaudePlugin,
    bundledCodexPlugin,
    bundledCodexMcp,
    bundledClaudePlugin,
    claudeMarketplace,
    changelog
  ] = await Promise.all([
    readFile(path.join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "packages/cli/package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, ".codex-plugin/plugin.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, ".claude-plugin/plugin.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "plugins/utsuri/.codex-plugin/plugin.json"), "utf8").then(
      JSON.parse
    ),
    readFile(path.join(repositoryRoot, "plugins/utsuri/.codex-plugin/mcp.json"), "utf8").then(
      JSON.parse
    ),
    readFile(path.join(repositoryRoot, "plugins/utsuri/.claude-plugin/plugin.json"), "utf8").then(
      JSON.parse
    ),
    readFile(path.join(repositoryRoot, ".claude-plugin/marketplace.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8")
  ]);
  const utsuriMarketplacePlugin = claudeMarketplace.plugins.find(({ name }) => name === "utsuri");

  for (const [source, version] of [
    [".codex-plugin/plugin.json", rootCodexPlugin.version],
    [".claude-plugin/plugin.json", rootClaudePlugin.version],
    ["plugins/utsuri/.codex-plugin/plugin.json", bundledCodexPlugin.version],
    ["plugins/utsuri/.claude-plugin/plugin.json", bundledClaudePlugin.version],
    [".claude-plugin/marketplace.json metadata", claudeMarketplace.metadata.version],
    [".claude-plugin/marketplace.json utsuri entry", utsuriMarketplacePlugin?.version]
  ]) {
    assert.equal(version, rootManifest.version, `${source} must match the release version`);
  }

  const expectedMcpArguments = [
    "-y",
    `--package=@utsu-ri/cli@${rootManifest.version}`,
    "utsuri",
    "mcp"
  ];
  assert.deepEqual(bundledCodexMcp.utsuri.args, expectedMcpArguments);
  assert.deepEqual(bundledClaudePlugin.mcpServers.utsuri.args, expectedMcpArguments);

  assert.deepEqual(
    validateReleaseMetadata({
      tag: `v${rootManifest.version}`,
      rootManifest,
      cliManifest,
      changelog
    }),
    []
  );
});

test("release tag must be annotated and point to the exact main commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-release-ref-"));
  try {
    await mkdir(path.join(root, "packages/cli"), { recursive: true });
    await Promise.all([
      writeFile(path.join(root, "package.json"), `${JSON.stringify(validRoot)}\n`),
      writeFile(path.join(root, "packages/cli/package.json"), `${JSON.stringify(validCli)}\n`),
      writeFile(path.join(root, "CHANGELOG.md"), validChangelog)
    ]);
    runGit(root, "init", "-b", "main");
    runGit(root, "config", "user.name", "Utsuri Test");
    runGit(root, "config", "user.email", "test@example.invalid");
    runGit(root, "add", ".");
    runGit(root, "commit", "-m", "initial");
    runGit(root, "tag", "-a", "v0.1.0", "-m", "v0.1.0");

    await assert.doesNotReject(
      verifyReleaseRef({ root, tag: "v0.1.0", mainRef: "refs/heads/main" })
    );
    await writeFile(path.join(root, "after.txt"), "after\n");
    runGit(root, "add", "after.txt");
    runGit(root, "commit", "-m", "after");
    await assert.rejects(
      verifyReleaseRef({ root, tag: "v0.1.0", mainRef: "refs/heads/main" }),
      /exact refs\/heads\/main/u
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
