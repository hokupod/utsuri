import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedNativeOptionalDependencies,
  isCompleteSemver,
  validateCliManifest,
  validateCliSourceManifest,
  validateExactFileInventory,
  validateNativeHelperManifest
} from "../../scripts/release-manifest-contract.mjs";
import { dependencyBaselineMismatchMessage } from "../../scripts/generate-sbom.mjs";
import {
  fullShaActionErrors,
  publishedCliSmokeErrors,
  readOnlyPermissionErrors
} from "../../scripts/workflow-contract.mjs";

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
  engines: { node: ">=20" },
  bin: { utsuri: "dist/utsuri.mjs" },
  files: ["dist", "README.md", "LICENSE"],
  publishConfig: { access: "public" },
  dependencies: {},
  optionalDependencies: expectedNativeOptionalDependencies("0.1.0")
};

const expectedNodeEngine = validManifest.engines.node;

describe("CLI release manifest contract", () => {
  test("accepts the exact public metadata and package allowlist", () => {
    assert.deepEqual(validateCliManifest(validManifest, "0.1.0", expectedNodeEngine), []);
  });

  test("rejects missing and extra package files", () => {
    assert.match(
      validateCliManifest(
        { ...validManifest, files: ["dist", "README.md"] },
        "0.1.0",
        expectedNodeEngine
      ).join("\n"),
      /must exactly match/u
    );
    assert.match(
      validateCliManifest(
        { ...validManifest, files: [...validManifest.files, "src"] },
        "0.1.0",
        expectedNodeEngine
      ).join("\n"),
      /must exactly match/u
    );
  });

  test("rejects install scripts and additional executables", () => {
    assert.match(
      validateCliManifest(
        { ...validManifest, scripts: { postinstall: "node install.mjs" } },
        "0.1.0",
        expectedNodeEngine
      ).join("\n"),
      /exact allowlist/u
    );
    assert.match(
      validateCliManifest(
        { ...validManifest, bin: { ...validManifest.bin, hidden: "dist/hidden.mjs" } },
        "0.1.0",
        expectedNodeEngine
      ).join("\n"),
      /wrong executable/u
    );
  });

  test("rejects dependency drift", () => {
    assert.match(
      validateCliManifest(
        { ...validManifest, dependencies: { ...validManifest.dependencies, unknown: "1.0.0" } },
        "0.1.0",
        expectedNodeEngine
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
    assert.deepEqual(validateCliManifest(reorderedManifest, "0.1.0", expectedNodeEngine), []);
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
      assert.match(
        validateCliManifest(mutate(validManifest), "0.1.0", expectedNodeEngine).join("\n"),
        expected
      );
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

  test("parses read-only workflow permissions without regex bypasses", () => {
    const valid = [
      "permissions:",
      "  actions: read",
      "  contents: read",
      "jobs:",
      "  verify:",
      "    permissions:",
      "      contents: none",
      "    steps: []"
    ].join("\n");
    assert.deepEqual(readOnlyPermissionErrors("workflow.yml", valid), []);
    assert.match(
      readOnlyPermissionErrors(
        "workflow.yml",
        valid.replace("      contents: none", "      id-token: write")
      ).join("\n"),
      /job verify id-token permission is not read-only/u
    );
    assert.match(
      readOnlyPermissionErrors(
        "workflow.yml",
        valid.replace("permissions:\n  actions: read\n  contents: read", "permissions: read-all")
      ).join("\n"),
      /top-level contents: read|permissions must be a mapping/u
    );
    assert.match(
      readOnlyPermissionErrors(
        "workflow.yml",
        valid.replace("  contents: read", "  contents: write # contents: read")
      ).join("\n"),
      /contents permission is not read-only/u
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
      "      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76",
      "        with:",
      "          bun-version: 1.3.14",
      "          no-cache: true",
      "      - run: node scripts/verify-published-cli.mjs --version-from-package",
      "  later-job:",
      "    steps:",
      "      - name: Install and verify Safe-chain trust anchor"
    ].join("\n");
    const smokeErrors = (candidate) =>
      publishedCliSmokeErrors("release.yml", candidate, {
        nodeVersion: 24,
        bunVersion: "1.3.14"
      });
    assert.deepEqual(smokeErrors(workflow), []);
    assert.match(
      publishedCliSmokeErrors("release.yml", workflow, {
        nodeVersion: 24,
        bunVersion: "1.4.0"
      }).join("\n"),
      /wrong setup action or inputs/u
    );
    assert.match(
      smokeErrors(
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
      smokeErrors(
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
      smokeErrors(
        workflow.replace("          node-version: 24", "          node-version: 23")
      ).join("\n"),
      /wrong setup action or inputs/u
    );
    assert.match(
      smokeErrors(
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

  test("isolates npm user and global configuration for release-candidate installs", async () => {
    const workflowPaths = [
      ".github/workflows/distribution-candidate.yml",
      ".github/workflows/plugin-promotion.yml"
    ];
    for (const workflowPath of workflowPaths) {
      const workflow = await readFile(path.join(repositoryRoot, workflowPath), "utf8");
      assert.match(workflow, /: > "\$\{utsuri_install_root\}\/npmrc"/u, workflowPath);
      assert.match(workflow, /: > "\$\{utsuri_install_root\}\/npmrc-global"/u, workflowPath);
      assert.match(workflow, /--userconfig "\$\{utsuri_install_root\}\/npmrc"/u, workflowPath);
      assert.match(
        workflow,
        /--globalconfig "\$\{utsuri_install_root\}\/npmrc-global"/u,
        workflowPath
      );
    }
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

  test("verifies published packages and the promotion preflight before Safe-chain filtering", async () => {
    const promotionWorkflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/plugin-promotion.yml"),
      "utf8"
    );
    const promotionCommand =
      '        run: node scripts/plugin-promote.mjs --version "${UTSURI_VERSION}"';
    const publishedHelper = promotionWorkflow.match(
      /^ {6}- name: Verify the exact published helper package and immutable report path\n(?: {8,}.*\n?)*/mu
    );
    assert.ok(publishedHelper);
    for (const required of [
      /--ignore-scripts/u,
      /--no-audit/u,
      /--no-fund/u,
      /--package-lock=false/u,
      /--cache "\$\{utsuri_install_root\}\/cache"/u,
      /--userconfig "\$\{utsuri_install_root\}\/npmrc"/u,
      /--globalconfig "\$\{utsuri_install_root\}\/npmrc-global"/u,
      /"@utsu-ri\/cli-linux-x64@\$\{UTSURI_VERSION\}"/u,
      /"@utsu-ri\/cli@\$\{UTSURI_VERSION\}"/u,
      /node scripts\/verify-installed-cli\.mjs/u
    ]) {
      assert.match(publishedHelper[0], required);
    }

    const assertPromotionOrder = (workflow) => {
      const publishedCliOffset = workflow.indexOf(
        "      - name: Verify the exact published CLI before Safe-chain or dependency setup"
      );
      const publishedHelperOffset = workflow.indexOf(
        "      - name: Verify the exact published helper package and immutable report path"
      );
      const safeChainSetup = workflow.indexOf(
        "      - name: Install and verify Safe-chain trust anchor"
      );
      const promotionPreflights = [
        ...workflow.matchAll(
          /^ {6}- name: Run the controlled Git Plugin promotion preflight\n(?: {8,}.*\n?)*/gmu
        )
      ];
      assert.equal(promotionPreflights.length, 1);
      const promotionPreflight = promotionPreflights[0];
      const promotionPreflightOffset = promotionPreflight.index ?? -1;
      assert.equal(workflow.split(promotionCommand).length - 1, 1);
      assert.equal(promotionPreflight[0].split(promotionCommand).length - 1, 1);
      assert.doesNotMatch(promotionPreflight[0], /--write/u);
      assert.ok(publishedCliOffset >= 0);
      assert.ok(publishedHelperOffset > publishedCliOffset);
      assert.ok(promotionPreflightOffset > publishedHelperOffset);
      assert.ok(safeChainSetup > promotionPreflightOffset);
    };

    assertPromotionOrder(promotionWorkflow);
    const skillStep = "      - name: Run Skill evals and Claude Plugin strict validation";
    const regressedWorkflow = promotionWorkflow
      .replace(promotionCommand, "        run: node --version")
      .replace(
        skillStep,
        ["      - name: Late promotion command", promotionCommand, skillStep].join("\n")
      );
    assert.throws(() => assertPromotionOrder(regressedWorkflow));
    assert.doesNotMatch(promotionWorkflow, /safe-chain-skip-minimum-package-age/u);
  });

  test("stages only the verified published helper before Skill evals", async () => {
    const promotionWorkflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/plugin-promotion.yml"),
      "utf8"
    );
    const helperSource =
      '"${utsuri_install_root}/node_modules/@utsu-ri/cli-linux-x64/bin/utsuri-fs-ops"';
    const helperTarget = ".artifacts/native/linux-x64/utsuri-fs-ops";
    const verifierOffset = promotionWorkflow.indexOf("node scripts/verify-installed-cli.mjs");
    const stagingOffset = promotionWorkflow.indexOf(
      `install -m 0755 \\\n            ${helperSource} \\\n            ${helperTarget}`
    );
    const copyCheckOffset = promotionWorkflow.indexOf(
      `cmp --silent \\\n            ${helperSource} \\\n            ${helperTarget}`
    );
    const evalOffset = promotionWorkflow.indexOf("node scripts/safe-chain.mjs bun run eval:skills");

    assert.ok(verifierOffset >= 0);
    assert.ok(stagingOffset > verifierOffset);
    assert.ok(copyCheckOffset > stagingOffset);
    assert.ok(evalOffset > copyCheckOffset);
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

describe("toolchain and CI contract", () => {
  test("pins the exact Safe-chain release assets and digests", async () => {
    const [policy, pluginWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, "toolchain-policy.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, ".github/workflows/git-plugin-verification.yml"), "utf8")
    ]);
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
    assert.match(pluginWorkflow, /safeChain\.version/u);
    assert.match(pluginWorkflow, /releases\/download\/\$\{utsuri_safe_chain_version\}\//u);
    assert.equal(pluginWorkflow.includes(`releases/download/${policy.safeChain.version}/`), false);
  });

  test("uses one Node policy for package support and Plugin CI", async () => {
    const [policy, rootManifest, cliManifest, pluginWorkflow] = await Promise.all([
      readFile(path.join(repositoryRoot, "toolchain-policy.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "packages/cli/package.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, ".github/workflows/git-plugin-verification.yml"), "utf8")
    ]);
    const minimum = Number(/^>=(\d+)$/u.exec(policy.node.packageEngine)?.[1]);
    assert.equal(minimum, Math.min(...policy.node.bundleCompatibilityMajors));
    assert.ok(policy.node.bundleCompatibilityMajors.includes(policy.node.developmentMajor));
    assert.equal(rootManifest.engines.node, policy.node.packageEngine);
    assert.equal(cliManifest.engines.node, policy.node.packageEngine);
    assert.match(
      pluginWorkflow,
      new RegExp(`node-version: ${policy.node.developmentMajor}\\n`, "u")
    );
    assert.doesNotMatch(
      pluginWorkflow,
      new RegExp(`node-version: ${policy.node.developmentMajor}\\.`, "u")
    );
  });

  test("keeps Renovate toolchain updates complete without hosted post-upgrade scripts", async () => {
    const [config, policy, manifest] = await Promise.all(
      ["renovate.json", "toolchain-policy.json", "package.json"].map((filename) =>
        readFile(path.join(repositoryRoot, filename), "utf8").then(JSON.parse)
      )
    );
    assert.equal(config.postUpgradeTasks, undefined);
    assert.ok(config.extends.includes(":preserveSemverRanges"));
    assert.equal(config.rangeStrategy, undefined);
    assert.equal(manifest.packageManager, `bun@${policy.bun.ciPrimary}`);
    assert.equal(manifest.devDependencies["@types/bun"], policy.bun.ciPrimary);
    const engineRule = config.packageRules.find((rule) => rule.matchDepTypes?.includes("engines"));
    assert.equal(engineRule?.enabled, false);
    const bunManager = config.customManagers.find(
      (manager) =>
        manager.depNameTemplate === "oven-sh/bun" &&
        manager.matchStrings.some((pattern) => pattern.includes('"ciPrimary"'))
    );
    assert.ok(bunManager, "Renovate must update the canonical primary Bun policy");
    assert.equal(bunManager.datasourceTemplate, "github-releases");
    assert.ok(bunManager.managerFilePatterns.includes("/^\\.github/workflows/ci\\.yml$/"));
    assert.ok(bunManager.managerFilePatterns.includes("/^package\\.json$/"));
    assert.ok(bunManager.matchStrings.some((pattern) => pattern.includes('"packageManager"')));
    assert.ok(bunManager.matchStrings.some((pattern) => pattern.includes("bun: \\[")));

    const bunRule = config.packageRules.find((rule) => rule.groupName === "Bun toolchain");
    assert.ok(bunRule, "Renovate must keep primary Bun pins in one PR");
    for (const dependency of ["bun", "oven-sh/bun", "@types/bun"]) {
      assert.ok(bunRule.matchPackageNames.includes(dependency));
    }

    const svelteViteRule = config.packageRules.find(
      (rule) => rule.groupName === "Svelte Vite toolchain"
    );
    assert.ok(svelteViteRule, "Renovate must keep Vite and its Svelte plugin in one PR");
    for (const dependency of ["@sveltejs/vite-plugin-svelte", "vite"]) {
      assert.ok(svelteViteRule.matchPackageNames.includes(dependency));
    }

    const nodeTypesRule = config.packageRules.find(
      (rule) =>
        rule.matchPackageNames?.includes("@types/node") && rule.matchUpdateTypes?.includes("major")
    );
    assert.equal(nodeTypesRule?.enabled, false);
  });

  test("uses one explicit installation-free dependency artifact refresh path", async () => {
    const manifest = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
    const refresh = manifest.scripts?.["deps:refresh"];
    assert.equal(typeof refresh, "string");
    let previous = -1;
    for (const step of [
      "generate-schemas.mjs",
      "generate-dependency-baseline.mjs",
      "build.mjs",
      "refresh-report-fixture-assets.mjs",
      "validate-fixtures.mjs"
    ]) {
      const current = refresh.indexOf(step);
      assert.ok(current > previous, `deps:refresh must run ${step} in order`);
      previous = current;
    }
    assert.doesNotMatch(refresh, /\b(?:bun|npm) install\b|curl|wget/u);
  });

  test("reports one actionable remediation for dependency baseline drift", () => {
    const installIndex = dependencyBaselineMismatchMessage.indexOf(
      "node scripts/safe-chain.mjs bun install --frozen-lockfile"
    );
    const refreshIndex = dependencyBaselineMismatchMessage.indexOf(
      "node scripts/safe-chain.mjs bun run deps:refresh"
    );
    assert.ok(installIndex >= 0);
    assert.ok(refreshIndex > installIndex);
    assert.match(dependencyBaselineMismatchMessage, /review every generated supply-chain diff/u);
  });

  test("makes the full check own release builds without duplicate workflow work", async () => {
    const [ciWorkflow, candidateWorkflow, checkScript] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/distribution-candidate.yml"), "utf8"),
      readFile(path.join(repositoryRoot, "scripts/check.mjs"), "utf8")
    ]);
    const buildIndex = checkScript.indexOf('"build"');
    const testIndex = checkScript.indexOf('"test"');
    assert.ok(buildIndex >= 0, "full check must build release inputs");
    assert.ok(testIndex >= 0, "full check must run tests");
    assert.ok(buildIndex < testIndex, "full check must build before tests");
    assert.equal((checkScript.match(/"build"/gu) ?? []).length, 1);
    assert.doesNotMatch(checkScript, /"native:build"/u);

    const bunMatrix = ciWorkflow.slice(
      ciWorkflow.indexOf("  bun-matrix:"),
      ciWorkflow.indexOf("  nix-compatibility:")
    );
    const nixCompatibility = ciWorkflow.slice(
      ciWorkflow.indexOf("  nix-compatibility:"),
      ciWorkflow.indexOf("  browser-e2e:")
    );
    for (const [name, workflow] of [
      ["Bun matrix", bunMatrix],
      ["Nix compatibility", nixCompatibility],
      ["distribution candidate", candidateWorkflow]
    ]) {
      assert.match(workflow, /bun run check/u, `${name} must run the full check`);
      assert.doesNotMatch(workflow, /bun run build/u, `${name} must not duplicate its build`);
    }

    const browserE2e = ciWorkflow.slice(ciWorkflow.indexOf("  browser-e2e:"));
    const browserBuildIndex = browserE2e.indexOf("bun run build");
    const browserTestIndex = browserE2e.indexOf("tests/cli/installed-bundle.test.ts");
    assert.ok(browserBuildIndex >= 0, "browser E2E must build its installed bundle");
    assert.ok(browserTestIndex >= 0, "browser E2E must run its installed-bundle test");
    assert.ok(browserBuildIndex < browserTestIndex, "browser E2E must build before its test");
  });

  test("builds native inputs before the Git Plugin focused tests", async () => {
    const workflow = await readFile(
      path.join(repositoryRoot, ".github/workflows/git-plugin-verification.yml"),
      "utf8"
    );
    const buildIndex = workflow.indexOf("bun run native:build");
    const testIndex = workflow.indexOf("bun test");
    assert.ok(buildIndex >= 0, "Git Plugin verification must build the native helper");
    assert.ok(testIndex >= 0, "Git Plugin verification must run its focused tests");
    assert.ok(buildIndex < testIndex, "Git Plugin verification must build before focused tests");
  });

  test("runs the manifest-derived native CLI identity smoke in the full check", async () => {
    const [manifestText, cliManifestText, checkScript, verifier] = await Promise.all([
      readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      readFile(path.join(repositoryRoot, "packages/cli/package.json"), "utf8"),
      readFile(path.join(repositoryRoot, "scripts/check.mjs"), "utf8"),
      readFile(path.join(repositoryRoot, "scripts/verify-native-cli-json.mjs"), "utf8")
    ]);
    const manifest = JSON.parse(manifestText);
    const cliManifest = JSON.parse(cliManifestText);
    assert.equal(cliManifest.name, "@utsu-ri/cli");
    assert.equal(manifest.version, cliManifest.version);
    assert.equal(
      manifest.scripts["verify:native-cli-json"],
      "node scripts/verify-native-cli-json.mjs"
    );
    assert.match(checkScript, /"verify:native-cli-json"/u);
    assert.match(verifier, /rootManifest\.version !== cliManifest\.version/u);
    assert.match(verifier, /version\.version !== cliManifest\.version/u);
    assert.doesNotMatch(verifier, /version\.version !== "\d+\.\d+\.\d+"/u);
    assert.equal(isCompleteSemver("1.2.3-0"), true);
    assert.equal(isCompleteSemver("1.2.3-alpha.1+build.01"), true);
    assert.equal(isCompleteSemver("1.2.3+01"), true);
    assert.equal(isCompleteSemver("1.2.3-01"), false);
    assert.equal(isCompleteSemver("1.2.3-alpha.01"), false);
    assert.equal(isCompleteSemver("1.2.3\n"), false);
    assert.equal(isCompleteSemver("1.2.3\r\n"), false);
  });

  test("runs native CLI verification through a symlink without skipping main", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "utsuri-native-json-"));
    const linkedVerifier = path.join(temporaryRoot, "verify-native-cli-json.mjs");
    try {
      await symlink(
        path.join(repositoryRoot, "scripts/verify-native-cli-json.mjs"),
        linkedVerifier
      );
      const result = spawnSync(process.execPath, [linkedVerifier], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          LANG: process.env.LANG ?? "C.UTF-8",
          NODE_NO_WARNINGS: "1",
          PATH: "",
          TMPDIR: process.env.TMPDIR
        },
        shell: false,
        timeout: 30000
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      assert.equal(
        result.stdout,
        "Native Node CLI strict JSON and Bun-free command startup smoke passed\n"
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("disables setup-bun caching for public release jobs", async () => {
    const [workflow, policy] = await Promise.all([
      readFile(path.join(repositoryRoot, ".github/workflows/release.yml"), "utf8"),
      readFile(path.join(repositoryRoot, "toolchain-policy.json"), "utf8").then(JSON.parse)
    ]);
    const bunVersion = policy.bun.ciPrimary.replaceAll(".", "\\.");
    const uncachedSetups =
      workflow.match(
        new RegExp(
          `uses: oven-sh/setup-bun@[a-f0-9]{40}[^\\n]*\\n\\s+with:\\n\\s+bun-version: ${bunVersion}\\n\\s+no-cache: true`,
          "gu"
        )
      ) ?? [];
    const allSetups = workflow.match(/uses: oven-sh\/setup-bun@/gu) ?? [];
    assert.ok(allSetups.length >= 2);
    assert.equal(uncachedSetups.length, allSetups.length);
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
      2
    );
    assert.match(workflow, /nix develop --command which chromium/u);
    assert.match(workflow, /\/nix\/store\/\*\/bin\/chromium/u);
    assert.match(workflow, /UTSURI_BROWSER_EXECUTABLE=.*GITHUB_ENV/u);
    assert.match(workflow, /tests\/cli\/installed-bundle\.test\.ts/u);
    assert.match(workflow, /bun run test:e2e/u);
    assert.doesNotMatch(workflow, /playwright(?:-core)?(?:\/cli\.js)? install/u);

    const candidateAggregate = candidateWorkflow.slice(
      candidateWorkflow.indexOf("  aggregate:"),
      candidateWorkflow.indexOf("  isolated-install:")
    );
    const installAndCheckStep = candidateAggregate.match(
      /^ {6}- name: Install and check the exact lockfile\n(?: {8,}.*\n?)*/mu
    );
    assert.ok(installAndCheckStep);
    assert.match(installAndCheckStep[0], /env:\n\s+UTSURI_BROWSER_TESTS: disabled/u);
    assert.match(installAndCheckStep[0], /run: \|\n(?:\s+.*\n)*?\s+bun run check/u);
  });
});

describe("source and native package contracts", () => {
  test("keeps the workspace CLI private while pinning configured external inputs", () => {
    const sourceNodeEngine = ">=20";
    const workspaceDependencies = {
      fflate: "9.8.7",
      yaml: "6.5.4"
    };
    const sourceManifest = {
      name: "@utsu-ri/cli",
      version: "0.1.0",
      private: true,
      license: "AGPL-3.0-or-later",
      engines: { node: sourceNodeEngine },
      dependencies: {
        "@utsu-ri/core": "workspace:*",
        ...workspaceDependencies
      }
    };
    assert.deepEqual(
      validateCliSourceManifest(sourceManifest, "0.1.0", sourceNodeEngine, workspaceDependencies),
      []
    );
    assert.match(
      validateCliSourceManifest(
        {
          ...sourceManifest,
          private: false,
          dependencies: { ...sourceManifest.dependencies, fflate: "latest" }
        },
        "0.1.0",
        sourceNodeEngine,
        workspaceDependencies
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
