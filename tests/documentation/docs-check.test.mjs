import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const fixtureRoot = path.join(repositoryRoot, "fixtures/documentation/valid");
const checker = path.join(repositoryRoot, "scripts/docs-check.mjs");
const documents = [
  "docs/design.md",
  "docs/release.md",
  "README.md",
  "README.ja.md",
  "README.zh-CN.md"
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function makeFixture() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "utsuri-docs-"));
  await cp(fixtureRoot, temporaryRoot, { recursive: true });
  return temporaryRoot;
}

function run(root, mode) {
  const result = spawnSync(process.execPath, [checker, "--mode", mode, "--root", root], {
    encoding: "utf8"
  });
  return { ...result, combined: `${result.stdout}${result.stderr}` };
}

async function rewrite(root, relativePath, mutator) {
  const file = path.join(root, relativePath);
  const before = await readFile(file, "utf8");
  const after = mutator(before);
  assert.notEqual(after, before, `mutation for ${relativePath} must change content`);
  await writeFile(file, after, "utf8");
}

async function updateState(root, mutator) {
  const file = path.join(root, "docs/documentation-state.json");
  const state = JSON.parse(await readFile(file, "utf8"));
  mutator(state);
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function prepareRelease(root) {
  const hashes = {};
  for (const relativePath of documents) {
    hashes[relativePath] = sha256(await readFile(path.join(root, relativePath), "utf8"));
  }
  const evidencePath = "ai/log/tests/release-review.md";
  const evidence = "Fixture human review: PASS\n";
  await mkdir(path.dirname(path.join(root, evidencePath)), { recursive: true });
  await writeFile(path.join(root, evidencePath), evidence, "utf8");
  await updateState(root, (state) => {
    state.currentHashes = hashes;
    state.humanReviewedHashes = { ...hashes };
    state.reviewEvidencePath = evidencePath;
    state.reviewEvidenceSha256 = sha256(evidence);
    state.reviewedPhase = state.currentPhase;
    state.publicationMetadata = {
      publisher: "Utsuri fixture publisher",
      spdxLicense: "MIT"
    };
  });
}

async function withFixture(name, callback) {
  await test(name, async () => {
    const root = await makeFixture();
    try {
      await callback(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

await withFixture("bootstrap accepts the valid fixture", async (root) => {
  const result = run(root, "bootstrap");
  assert.equal(result.status, 0, result.combined);
});

await withFixture("development accepts current document hashes", async (root) => {
  const result = run(root, "development");
  assert.equal(result.status, 0, result.combined);
});

await withFixture("release-candidate accepts fresh independent-review evidence", async (root) => {
  await prepareRelease(root);
  const result = run(root, "release-candidate");
  assert.equal(result.status, 0, result.combined);
});

for (const [name, mutate] of [
  ["missing numbered heading", (value) => value.replace("## 47. Final definition\n", "")],
  [
    "duplicate numbered heading",
    (value) =>
      value.replace("## 47. Final definition\n", "## 47. Final definition\n## 47. Duplicate\n")
  ],
  [
    "reordered numbered heading",
    (value) => value.replace("## 1. Background and problem", "## 1.5 Background and problem")
  ]
]) {
  await withFixture(`bootstrap rejects ${name}`, async (root) => {
    await rewrite(root, "docs/design.md", mutate);
    const result = run(root, "bootstrap");
    assert.notEqual(result.status, 0);
    assert.match(result.combined, /DOC_HEADING_MANIFEST_MISMATCH/u);
  });
}

await withFixture("bootstrap rejects a superseded npm scope", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\nLegacy: @utsuri/cli\n`);
  const result = run(root, "bootstrap");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_OLD_SCOPE/u);
});

await withFixture("bootstrap rejects synchronized command drift", async (root) => {
  await rewrite(root, "README.ja.md", (value) => value.replace("nix develop", "nix develop ."));
  const result = run(root, "bootstrap");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_COMMAND_DRIFT/u);
});

await withFixture("bootstrap rejects a broken local file link", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n[Missing](docs/missing.md)\n`);
  const result = run(root, "bootstrap");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_LINK_FILE_MISSING/u);
});

await withFixture("bootstrap rejects a broken local fragment link", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n[Missing](README.md#missing-fragment)\n`);
  const result = run(root, "bootstrap");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_LINK_FRAGMENT_MISSING/u);
});

await withFixture("bootstrap rejects untranslated CJK prose in English", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n未翻訳の本文\n`);
  const result = run(root, "bootstrap");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_UNTRANSLATED_CJK/u);
});

await withFixture("development rejects design-version drift", async (root) => {
  await updateState(root, (state) => {
    state.designVersion = "1.4";
  });
  const result = run(root, "development");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_VERSION_MISMATCH/u);
});

await withFixture("development rejects missing change-log state", async (root) => {
  await updateState(root, (state) => {
    state.changeLogEntryId = "missing-entry";
  });
  const result = run(root, "development");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_CHANGELOG_MISSING/u);
});

await withFixture("development rejects stale current hashes", async (root) => {
  await rewrite(root, "README.md", (value) => value.replace("Utsuri v1", "Utsuri version 1"));
  const result = run(root, "development");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_HASH_STALE/u);
});

await withFixture("development rejects a Phase and availability mismatch", async (root) => {
  await updateState(root, (state) => {
    state.currentPhase = 1;
  });
  const result = run(root, "development");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_PHASE_MISMATCH/u);
});

await withFixture("release-candidate rejects unresolved publication metadata", async (root) => {
  await prepareRelease(root);
  await updateState(root, (state) => {
    state.publicationMetadata.spdxLicense = null;
  });
  const result = run(root, "release-candidate");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_PLACEHOLDER/u);
});

await withFixture("release-candidate rejects stale human review", async (root) => {
  await prepareRelease(root);
  await rewrite(root, "README.md", (value) => value.replace("Utsuri v1", "Utsuri version 1"));
  const result = run(root, "release-candidate");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_HUMAN_REVIEW_STALE/u);
});

await withFixture("release-candidate rejects a changed release guide", async (root) => {
  await prepareRelease(root);
  await rewrite(root, "docs/release.md", (value) => `${value}\nChanged release instruction.\n`);
  const result = run(root, "release-candidate");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_HUMAN_REVIEW_STALE/u);
});

await withFixture("release-candidate rejects changed review evidence", async (root) => {
  await prepareRelease(root);
  await rewrite(root, "ai/log/tests/release-review.md", (value) => `${value}changed\n`);
  const result = run(root, "release-candidate");
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_REVIEW_EVIDENCE_HASH/u);
});
