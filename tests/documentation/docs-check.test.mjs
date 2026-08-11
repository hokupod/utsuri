import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const fixtureRoot = path.join(repositoryRoot, "fixtures/documentation/valid");
const checker = path.join(repositoryRoot, "scripts/docs-check.mjs");

async function makeFixture() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "utsuri-docs-"));
  await cp(fixtureRoot, temporaryRoot, { recursive: true });
  return temporaryRoot;
}

function run(root) {
  const result = spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8"
  });
  return { ...result, combined: `${result.stdout}${result.stderr}` };
}

test("valid fixture keeps its linked implementation plan tracked", () => {
  const relativePath = "fixtures/documentation/valid/docs/plans/v1-implementation.md";
  const result = spawnSync("git", ["ls-files", "--error-unmatch", relativePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

async function rewrite(root, relativePath, mutator) {
  const file = path.join(root, relativePath);
  const before = await readFile(file, "utf8");
  const after = mutator(before);
  assert.notEqual(after, before, `mutation for ${relativePath} must change content`);
  await writeFile(file, after, "utf8");
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

await withFixture("accepts the valid fixture", async (root) => {
  const result = run(root);
  assert.equal(result.status, 0, result.combined);
});

await withFixture("rejects a superseded npm scope", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\nLegacy: @utsuri/cli\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_OLD_SCOPE/u);
});

await withFixture("rejects synchronized command drift", async (root) => {
  await rewrite(root, "README.ja.md", (value) =>
    value.replace("codex plugin add utsuri@utsuri", "codex plugin add utsuri@utsuri --json")
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_COMMAND_DRIFT/u);
});

await withFixture("rejects a missing user-facing section", async (root) => {
  await rewrite(root, "README.md", (value) =>
    value.replace('<a id="first-review"></a><!-- section:first-review -->\n', "")
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_SECTION_MISSING/u);
});

await withFixture("rejects developer commands in a user README", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\nnix develop\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_DEVELOPER_CONTENT/u);
});

await withFixture("rejects release numbers in a user README", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\nRelease v9.9.9\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_RELEASE_VERSION/u);
});

await withFixture("rejects a native Windows support overclaim", async (root) => {
  await rewrite(root, "README.md", (value) =>
    value.replace("Native Windows is unsupported", "Native Windows is supported")
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_SUPPORT_OVERCLAIM/u);
});

await withFixture("rejects a broken contributor target", async (root) => {
  await rewrite(root, "README.md", (value) =>
    value.replace(
      "](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)",
      "](https://github.com/hokupod/utsuri/blob/main/missing-contributor.md)"
    )
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_CONTRIBUTOR_LINK/u);
});

await withFixture("rejects a broken local file link", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n[Missing](docs/missing.md)\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_LINK_FILE_MISSING/u);
});

await withFixture("rejects a broken local fragment link", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n[Missing](README.md#missing-fragment)\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_LINK_FRAGMENT_MISSING/u);
});

await withFixture("rejects untranslated CJK prose in English", async (root) => {
  await rewrite(root, "README.md", (value) => `${value}\n未翻訳の本文\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.combined, /DOC_UNTRANSLATED_CJK/u);
});
