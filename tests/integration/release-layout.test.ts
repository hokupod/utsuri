import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { repositoryRoot } from "./capture-helpers";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function scan(relative: string) {
  return spawnSync(process.execPath, ["scripts/verify-release-layout.mjs", "--scan", relative], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false
  });
}

describe("release layout security", () => {
  test("accepts a self-contained artifact with Node built-ins only", () => {
    const result = scan("fixtures/release-artifacts/valid");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("rejects external imports, old identifiers, placeholders, and source paths", () => {
    const result = scan("fixtures/release-artifacts/invalid");
    expect(result.status).toBe(5);
    expect(result.stderr).toContain("external runtime import: unbundled-runtime-package");
    expect(result.stderr).toContain("external runtime import: unbundled-export-package");
    expect(result.stderr).toContain("external runtime import: <computed-import>");
    expect(result.stderr).toContain("external runtime import: <computed-require>");
    expect(result.stderr).toContain("old @utsuri scope");
    expect(result.stderr).toContain("release placeholder");
    expect(result.stderr).toContain("source-only absolute path");
  });

  test("rejects symlinks without reading their targets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "utsuri-release-symlink-"));
    temporaryDirectories.push(directory);
    await symlink("/etc/passwd", path.join(directory, "escape"));
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts/verify-release-layout.mjs"), "--scan", directory],
      { cwd: repositoryRoot, encoding: "utf8", shell: false }
    );
    expect(result.status).toBe(5);
    expect(result.stderr).toContain("must not be a symlink");
    expect(result.stdout).not.toContain("root:");
  });

  test("validates the current bundle, source hashes, schemas, and UI hashes", () => {
    const result = spawnSync(process.execPath, ["scripts/verify-release-layout.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: false
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  }, 30_000);

  test("binds bundled third-party bytes to the reviewed dependency baseline", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repositoryRoot, ".artifacts/release/build-manifest.json"), "utf8")
    );
    expect(manifest.schemaVersion).toBe("1.1");
    expect(manifest.schemaHashes["mcp-run-registration.schema.json"]).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.dependencyBaselineSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.dependencyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.keys(manifest.dependencyHashes).length).toBeGreaterThan(10);
    expect(
      Object.keys(manifest.dependencyHashes).some((identity) =>
        identity.startsWith("playwright-core@1.61.1/")
      )
    ).toBeTrue();
    expect(
      Object.keys(manifest.dependencyHashes).every(
        (identity) => !identity.includes("node_modules") && !path.isAbsolute(identity)
      )
    ).toBeTrue();
  });

  test("binds publication metadata policy to the independent release allowlist", async () => {
    const policy = JSON.parse(
      await readFile(path.join(repositoryRoot, "docs/documentation-policy.json"), "utf8")
    );
    const verifier = await readFile(
      path.join(repositoryRoot, "scripts/verify-release-layout.mjs"),
      "utf8"
    );
    for (const [key, value] of Object.entries(policy.requiredPublicationMetadata)) {
      expect(verifier).toContain(`${key}: ${JSON.stringify(value)}`);
    }
  });

  test("rejects publication metadata that disagrees with the independent allowlist", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "utsuri-publication-metadata-"));
    temporaryDirectories.push(directory);
    const policy = JSON.parse(
      await readFile(path.join(repositoryRoot, "docs/documentation-policy.json"), "utf8")
    );
    const state = JSON.parse(
      await readFile(path.join(repositoryRoot, "docs/documentation-state.json"), "utf8")
    );
    policy.requiredPublicationMetadata.npmPublishing = "manual registry publication";
    const policyPath = path.join(directory, "policy.json");
    const statePath = path.join(directory, "state.json");
    await Promise.all([
      writeFile(policyPath, `${JSON.stringify(policy)}\n`, { mode: 0o600 }),
      writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 })
    ]);
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-release-layout.mjs", "--verify-publication-metadata", policyPath, statePath],
      { cwd: repositoryRoot, encoding: "utf8", shell: false }
    );
    expect(result.status).toBe(5);
    expect(result.stderr).toContain("documentation policy has the wrong publication metadata");
    expect(result.stdout).toBe("");
  });
});
