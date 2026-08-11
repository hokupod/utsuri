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
import { fullShaActionErrors, publishedCliSmokeErrors } from "../../scripts/workflow-contract.mjs";

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
  test("requires commented third-party actions to use a full SHA", () => {
    assert.deepEqual(
      fullShaActionErrors(
        "workflow.yml",
        [
          "jobs:",
          "  verify:",
          "    steps:",
          "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
          "  reusable:",
          "    uses: ./.github/workflows/local.yml"
        ].join("\n"),
        { allowedLocalReferences: ["./.github/workflows/local.yml"] }
      ),
      []
    );
    assert.match(
      fullShaActionErrors(
        "workflow.yml",
        [
          "jobs:",
          "  verify:",
          "    steps:",
          "      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
          "      - { uses: actions/checkout@v7 }"
        ].join("\n")
      ).join("\n"),
      /not pinned to a full SHA/u
    );
    assert.match(
      fullShaActionErrors(
        "workflow.yml",
        "jobs: { verify: { steps: [ { uses: actions/checkout@v7 trailing } ] } }"
      ).join("\n"),
      /not pinned to a full SHA/u
    );
    assert.match(
      fullShaActionErrors(
        "workflow.yml",
        "jobs: { reusable: { uses: ./.github/workflows/local.yml } }"
      ).join("\n"),
      /unapproved local action/u
    );
  });

  test("scopes published CLI smoke ordering to its release job", () => {
    const workflow = [
      "jobs:",
      "  published-smoke:",
      "    needs: publish",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
      "        with:",
      "          persist-credentials: false",
      "      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
      "        with:",
      "          node-version: 24",
      "          package-manager-cache: false",
      "      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
      "        with:",
      "          bun-version: 1.3.14",
      "      - run: node scripts/verify-published-cli.mjs --version-from-package",
      "  later-job:",
      "    steps:",
      "      - name: Install and verify Safe-chain trust anchor"
    ].join("\n");
    assert.deepEqual(publishedCliSmokeErrors("release.yml", workflow), []);
    assert.match(
      publishedCliSmokeErrors(
        "release.yml",
        workflow.replace(
          "      - run: node scripts/verify-published-cli.mjs --version-from-package",
          [
            "      - name: Renamed setup",
            "        run: node scripts/safe-chain.mjs setup-ci",
            "      - run: node scripts/verify-published-cli.mjs --version-from-package"
          ].join("\n")
        )
      ).join("\n"),
      /unapproved command/u
    );
    assert.match(
      publishedCliSmokeErrors(
        "release.yml",
        workflow.replace(
          "      - run: node scripts/verify-published-cli.mjs --version-from-package",
          [
            "      - name: Verify published CLI",
            "        env:",
            "          NODE_OPTIONS: --require ./scripts/inject.cjs",
            "        run: node scripts/verify-published-cli.mjs --version-from-package"
          ].join("\n")
        )
      ).join("\n"),
      /unapproved keys: env/u
    );
    assert.match(
      publishedCliSmokeErrors(
        "release.yml",
        workflow.replace("          node-version: 24", "          node-version: 23")
      ).join("\n"),
      /wrong setup action or inputs/u
    );
    assert.match(
      publishedCliSmokeErrors(
        "release.yml",
        workflow.replace(
          "    runs-on: ubuntu-24.04",
          "    runs-on: ubuntu-24.04\n    env: { NODE_OPTIONS: --require ./scripts/inject.cjs }"
        )
      ).join("\n"),
      /job has unapproved keys: env/u
    );
  });

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

  test("uses one synchronized release version for Plugin promotion", async () => {
    const [promotionWorkflow, compatibilityText] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/plugin-promotion.yml"), "utf8"),
      readFile(path.join(repositoryRoot, "docs/compatibility/plugin-runtime.json"), "utf8")
    ]);
    const compatibility = JSON.parse(compatibilityText);
    assert.match(promotionWorkflow, /plugin-promote\.mjs --version/u);
    assert.doesNotMatch(promotionWorkflow, /plugin_version|--cli-version|--plugin-version/u);
    assert.doesNotMatch(promotionWorkflow, /bun run plugin:verify/u);
    assert.equal(compatibility.minimumSupported.claude, compatibility.hosts.claude.version);
    const claudePin = `@anthropic-ai/claude-code@${compatibility.hosts.claude.version}`;
    assert.equal(promotionWorkflow.split(claudePin).length - 1, 2);
  });

  test("preserves hidden Plugin manifests in the release candidate artifact", async () => {
    const candidateWorkflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"),
      "utf8"
    );
    const uploadStep = candidateWorkflow.match(
      /^ {6}- name: Upload the release candidate\n(?: {8,}.*\n?)*/mu
    );
    assert.ok(uploadStep);
    assert.match(uploadStep[0], /path: \.artifacts\/release-candidate/u);
    assert.match(uploadStep[0], /include-hidden-files: true/u);
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
  test("pins the exact Safe-chain release assets and digests", async () => {
    const policy = JSON.parse(
      await readFile(path.join(repositoryRoot, "toolchain-policy.json"), "utf8")
    );
    assert.deepEqual(policy.safeChain.assets, {
      "darwin-arm64": "safe-chain-macos-arm64",
      "darwin-x64": "safe-chain-macos-x64",
      "linux-arm64": "safe-chain-linux-arm64",
      "linux-x64": "safe-chain-linux-x64"
    });
    assert.deepEqual(policy.safeChain.sha256, {
      "darwin-arm64": "a1a827589c46db5600c5a96d5efc5fea7c5431df6bc4d28db90bd971988075ff",
      "darwin-x64": "c250cf0a5b7b0f75a5d10566ec10638d0e0a75fa9719db3055afb78ca1fab2d0",
      "linux-arm64": "ae5b758820a2bf317ee843c6c4d032be04907c7d7a7579be3373372504108f94",
      "linux-x64": "565d62360c7d17e1508e76c88319b6b58940bce5495071dca133f51eb30768cf"
    });
  });

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
    const [workflow, candidateWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"), "utf8")
    ]);
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

    const candidateAggregate = candidateWorkflow.slice(
      candidateWorkflow.indexOf("  aggregate:"),
      candidateWorkflow.indexOf("  isolated-install:")
    );
    const installAndBuildStep = candidateAggregate.match(
      /^ {6}- name: Install and build from the exact lockfile\n(?: {8,}.*\n?)*/mu
    );
    assert.ok(installAndBuildStep);
    assert.match(installAndBuildStep[0], /env:\n\s+UTSURI_BROWSER_TESTS: disabled/u);
    assert.match(installAndBuildStep[0], /run: \|\n(?:\s+.*\n)*?\s+bun run check/u);
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
        yaml: "2.8.3"
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
