import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findForbiddenText, scanPublicHistory } from "../../scripts/scan-public-history.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runGit(root, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
}

test("finds private local paths without rejecting reserved examples", () => {
  assert.deepEqual(findForbiddenText("fixture /Users/example/project"), []);
  assert.deepEqual(findForbiddenText(["source /Users/", "hokuto/project"].join("")), [
    "macOS user home"
  ]);
  assert.deepEqual(findForbiddenText(["state .codex/", "memories/MEMORY.md"].join("")), [
    "Codex private memory path"
  ]);
});

test("scanner implementation and fixtures do not contain their forbidden literals", async () => {
  const sources = await Promise.all([
    readFile(path.join(repositoryRoot, "scripts/scan-public-history.mjs"), "utf8"),
    readFile(path.join(repositoryRoot, "tests/release/scan-public-history.test.mjs"), "utf8")
  ]);
  for (const source of sources) assert.deepEqual(findForbiddenText(source), []);
});

test("scans every commit reachable from the selected public ref", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-public-history-"));
  try {
    runGit(root, "init", "-b", "main");
    runGit(root, "config", "user.name", "Utsuri Test");
    runGit(root, "config", "user.email", "test@example.invalid");
    await writeFile(path.join(root, "state.txt"), "safe\n");
    runGit(root, "add", "state.txt");
    runGit(root, "commit", "-m", "safe");
    assert.deepEqual(scanPublicHistory({ root, ref: "HEAD" }).findings, []);

    await writeFile(path.join(root, "state.txt"), ["source=/Users/", "hokuto/project\n"].join(""));
    runGit(root, "add", "state.txt");
    runGit(root, "commit", "-m", "unsafe");
    const result = scanPublicHistory({ root, ref: "HEAD" });
    assert.equal(result.commits, 2);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].path, "state.txt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
