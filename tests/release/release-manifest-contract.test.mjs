import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  validateCliManifest,
  validateExactFileInventory
} from "../../scripts/release-manifest-contract.mjs";

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
  homepage: "https://github.com/hokupod/utsuri#readme",
  bugs: { url: "https://github.com/hokupod/utsuri/issues" },
  type: "module",
  engines: { node: ">=22" },
  bin: { utsuri: "dist/utsuri.mjs" },
  files: ["dist", "README.md", "LICENSE"],
  publishConfig: { access: "public" },
  dependencies: {
    "@utsu-ri/core": "workspace:*",
    "@utsu-ri/report-builder": "workspace:*",
    "@utsu-ri/report-model": "workspace:*",
    "@utsu-ri/security": "workspace:*",
    yaml: "2.8.1"
  }
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
