import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedNativeOptionalDependencies,
  validateCliManifest,
  validateCliSourceManifest,
  validateExactFileInventory,
  validateNativeHelperManifest
} from "../../scripts/release-manifest-contract.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const validManifest = {
  name: "@utsu-ri/cli",
  version: "0.1.0",
  description: "Evidence-backed visual change review for Codex and Claude Code",
  license: "AGPL-3.0-or-later",
  author: { name: "hokupod" },
  repository: {
    type: "git",
    url: "git+https://github.com/hokupod/utsuri.git"
  },
  homepage: "https://github.com/hokupod/utsuri/tree/v0.1.0#readme",
  bugs: { url: "https://github.com/hokupod/utsuri/issues" },
  type: "module",
  engines: { node: ">=22" },
  bin: { utsuri: "dist/utsuri.mjs" },
  files: ["dist", "README.md", "LICENSE"],
  publishConfig: { access: "public" },
  dependencies: {},
  optionalDependencies: expectedNativeOptionalDependencies("0.1.0")
};

describe("CLI release manifest contract", () => {
  test("accepts the exact public metadata and package allowlist", () => {
    assert.deepEqual(validateCliManifest(validManifest, "0.1.0"), []);
  });

  test("rejects missing and extra package files", () => {
    assert.match(
      validateCliManifest({ ...validManifest, files: ["dist", "README.md"] }, "0.1.0").join("\n"),
      /must exactly match/u
    );
    assert.match(
      validateCliManifest(
        { ...validManifest, files: [...validManifest.files, "src"] },
        "0.1.0"
      ).join("\n"),
      /must exactly match/u
    );
  });

  test("rejects install scripts and additional executables", () => {
    assert.match(
      validateCliManifest(
        { ...validManifest, scripts: { postinstall: "node install.mjs" } },
        "0.1.0"
      ).join("\n"),
      /exact allowlist/u
    );
    assert.match(
      validateCliManifest(
        { ...validManifest, bin: { ...validManifest.bin, hidden: "dist/hidden.mjs" } },
        "0.1.0"
      ).join("\n"),
      /wrong executable/u
    );
  });

  test("rejects dependency drift", () => {
    assert.match(
      validateCliManifest(
        { ...validManifest, dependencies: { ...validManifest.dependencies, unknown: "1.0.0" } },
        "0.1.0"
      ).join("\n"),
      /wrong dependencies/u
    );
  });

  test("accepts semantically identical metadata with a different key order", () => {
    const reorderedManifest = {
      ...validManifest,
      repository: {
        url: validManifest.repository.url,
        type: validManifest.repository.type
      },
      dependencies: Object.fromEntries(Object.entries(validManifest.dependencies).reverse())
    };
    assert.deepEqual(validateCliManifest(reorderedManifest, "0.1.0"), []);
  });

  for (const [label, mutate, expected] of [
    ["version", (value) => ({ ...value, version: "0.2.0" }), /wrong version/u],
    [
      "repository type",
      (value) => ({ ...value, repository: { ...value.repository, type: "svn" } }),
      /wrong repository/u
    ],
    [
      "repository URL",
      (value) => ({ ...value, repository: { ...value.repository, url: "https://example.test" } }),
      /wrong repository/u
    ],
    ["homepage", (value) => ({ ...value, homepage: "https://example.test" }), /homepage/u],
    ["bugs URL", (value) => ({ ...value, bugs: { url: "https://example.test" } }), /bugs URL/u]
  ]) {
    test(`rejects the wrong ${label}`, () => {
      assert.match(validateCliManifest(mutate(validManifest), "0.1.0").join("\n"), expected);
    });
  }
});

describe("release file inventory", () => {
  test("rejects an untracked file below dist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-release-inventory-"));
    try {
      await mkdir(path.join(root, "native", "darwin-arm64"), { recursive: true });
      await writeFile(path.join(root, "utsuri.mjs"), "bundle");
      await writeFile(path.join(root, "native", "darwin-arm64", "utsuri-fs-ops"), "helper");

      const expected = ["native/darwin-arm64/utsuri-fs-ops", "utsuri.mjs"];
      assert.deepEqual(await validateExactFileInventory(root, expected), []);

      await writeFile(path.join(root, "debug.json"), "{}");
      assert.match((await validateExactFileInventory(root, expected)).join("\n"), /debug\.json/u);

      await rm(path.join(root, "debug.json"));
      await mkdir(path.join(root, "junk"));
      assert.match(
        (await validateExactFileInventory(root, expected)).join("\n"),
        /junk is not an expected directory/u
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("cross-job distribution transport", () => {
  test("never extracts a downloaded helper or Plugin tarball", async () => {
    const [candidateWorkflow, releaseWorkflow, promotionWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/release.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/plugin-promotion.yml"), "utf8")
    ]);
    for (const workflow of [candidateWorkflow, releaseWorkflow, promotionWorkflow]) {
      assert.doesNotMatch(workflow, /(?:^|\s)-[A-Za-z]*x[A-Za-z]*(?:\s|$)/mu);
    }
    assert.match(promotionWorkflow, /--restore-plugin-modes/u);
    assert.match(promotionWorkflow, /Package only the verified aggregate Plugin/u);
  });

  test("keeps candidate generation read-only and isolates trusted publication", async () => {
    const [candidateWorkflow, releaseWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/release.yml"), "utf8")
    ]);
    assert.doesNotMatch(candidateWorkflow, /npm (?:stage )?publish|id-token:\s*write/u);
    assert.match(candidateWorkflow, /workflow_call:/u);
    assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/u);
    assert.match(releaseWorkflow, /environment: release/u);
    assert.match(releaseWorkflow, /id-token: write/u);
    assert.match(releaseWorkflow, /publish-release-packages\.mjs/u);
    assert.match(releaseWorkflow, /already exists; refusing to bypass asset verification/u);
    assert.match(releaseWorkflow, /--draft\s/u);
    assert.match(releaseWorkflow, /--draft=false/u);
    assert.doesNotMatch(releaseWorkflow, /NODE_AUTH_TOKEN|NPM_TOKEN/u);
  });
});

describe("Safe-chain CI contract", () => {
  test("builds generated release inputs before clean-check tests", async () => {
    const [ciWorkflow, candidateWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"), "utf8")
    ]);
    const bunMatrix = ciWorkflow.slice(
      ciWorkflow.indexOf("  bun-matrix:"),
      ciWorkflow.indexOf("  nix-compatibility:")
    );
    const nixCompatibility = ciWorkflow.slice(
      ciWorkflow.indexOf("  nix-compatibility:"),
      ciWorkflow.indexOf("  browser-e2e:")
    );
    const browserE2e = ciWorkflow.slice(ciWorkflow.indexOf("  browser-e2e:"));
    for (const [name, workflow, testCommand] of [
      ["Bun matrix", bunMatrix, "bun run check"],
      ["Nix compatibility", nixCompatibility, "bun run check"],
      ["browser E2E", browserE2e, "bun run test:integration"],
      ["distribution candidate", candidateWorkflow, "bun run check"]
    ]) {
      const buildIndex = workflow.indexOf("bun run build");
      const testIndex = workflow.indexOf(testCommand);
      assert.ok(buildIndex >= 0, `${name} must build generated release inputs`);
      assert.ok(testIndex >= 0, `${name} must run ${testCommand}`);
      assert.ok(buildIndex < testIndex, `${name} must build before ${testCommand}`);
    }
  });

  test("verifies npm and Bun through the pinned Safe-chain wrapper", async () => {
    const workflowPaths = [
      ".github/workflows/ci.yml",
      ".github/workflows/distribution-candidate.yml",
      ".github/workflows/plugin-promotion.yml",
      ".github/workflows/release.yml"
    ];
    for (const workflowPath of workflowPaths) {
      const workflow = await readFile(path.join(repositoryRoot, workflowPath), "utf8");
      const setups = workflow.match(/node scripts\/safe-chain\.mjs setup-ci/gu) ?? [];
      const npmVerifications =
        workflow.match(
          /(?:nix develop --command )?node scripts\/safe-chain\.mjs npm safe-chain-verify/gu
        ) ?? [];
      const bunVerifications =
        workflow.match(
          /(?:nix develop --command )?node scripts\/safe-chain\.mjs bun safe-chain-verify/gu
        ) ?? [];
      assert.ok(setups.length > 0, `${workflowPath} must configure Safe-chain`);
      assert.equal(npmVerifications.length, setups.length, workflowPath);
      assert.equal(bunVerifications.length, setups.length, workflowPath);
      assert.doesNotMatch(workflow, /\b(?:npx|bunx) safe-chain-verify\b/u);
    }
    const ciWorkflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8"
    );
    assert.match(
      ciWorkflow,
      /nix develop --command node scripts\/safe-chain\.mjs npm safe-chain-verify/u
    );
    assert.match(
      ciWorkflow,
      /nix develop --command node scripts\/safe-chain\.mjs bun safe-chain-verify/u
    );
  });

  test("isolates real-browser tests to the pinned Nix Chromium job", async () => {
    const workflow = await readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    assert.match(workflow, /^ {2}browser-e2e:\n/mu);
    assert.equal(
      (workflow.match(/UTSURI_BROWSER_TESTS(?:: disabled|=disabled)/gu) ?? []).length,
      3
    );
    assert.match(workflow, /nix develop --command which chromium/u);
    assert.match(workflow, /\/nix\/store\/\*\/bin\/chromium/u);
    assert.match(workflow, /UTSURI_BROWSER_EXECUTABLE=.*GITHUB_ENV/u);
    assert.match(
      workflow,
      /UTSURI_BROWSER_TESTS=disabled nix develop --command node scripts\/safe-chain\.mjs bun run test:integration/u
    );
    assert.match(workflow, /tests\/cli\/installed-bundle\.test\.ts/u);
    assert.match(workflow, /bun run test:e2e/u);
    assert.doesNotMatch(workflow, /playwright(?:-core)?(?:\/cli\.js)? install/u);
  });
});

describe("source and native package contracts", () => {
  test("keeps the workspace CLI private while pinning bundled external inputs", () => {
    const sourceManifest = {
      name: "@utsu-ri/cli",
      version: "0.1.0",
      private: true,
      license: "AGPL-3.0-or-later",
      dependencies: {
        "@utsu-ri/core": "workspace:*",
        fflate: "0.8.2",
        yaml: "2.8.1"
      }
    };
    assert.deepEqual(validateCliSourceManifest(sourceManifest, "0.1.0"), []);
    assert.match(
      validateCliSourceManifest(
        {
          ...sourceManifest,
          private: false,
          dependencies: { ...sourceManifest.dependencies, fflate: "latest" }
        },
        "0.1.0"
      ).join("\n"),
      /must be private|not pinned/u
    );
  });

  test("accepts only the exact platform helper package metadata", () => {
    const manifest = {
      name: "@utsu-ri/cli-linux-arm64",
      version: "0.1.0",
      description: "Atomic filesystem helper for Utsuri on linux-arm64",
      license: "AGPL-3.0-or-later",
      author: { name: "hokupod" },
      repository: {
        type: "git",
        url: "git+https://github.com/hokupod/utsuri.git"
      },
      os: ["linux"],
      cpu: ["arm64"],
      files: ["bin", "integrity.json", "proof.json", "LICENSE"],
      publishConfig: { access: "public" }
    };
    assert.deepEqual(validateNativeHelperManifest(manifest, "0.1.0", "linux-arm64"), []);
    assert.match(
      validateNativeHelperManifest({ ...manifest, cpu: ["x64"] }, "0.1.0", "linux-arm64").join(
        "\n"
      ),
      /CPU selector/u
    );
  });
});
