import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256 } from "@utsu-ri/core";
import { collectGit, parseGitPatch } from "./index";
import { gitBuffer } from "./git-command";
import { applyNumstat } from "./patch";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    encoding: "utf8"
  }).trim();
}

async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-git-collector-"));
  temporaryDirectories.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.email", "utsuri@example.invalid");
  git(root, "config", "user.name", "Utsuri Test");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/app.ts"), "export const value = 1;\n");
  git(root, "add", "src/app.ts");
  git(root, "commit", "-q", "-m", "base");
  return root;
}

describe("Git patch parser", () => {
  test("preserves rename, binary, deletion, submodule, mode, and low-signal metadata", async () => {
    const fixture = path.resolve(
      import.meta.dir,
      "../../../fixtures/git-diff/rename-and-binary.patch"
    );
    const expected = JSON.parse(
      await readFile(fixture.replace(".patch", ".expected.json"), "utf8")
    ) as {
      filesChanged: number;
      additions: number;
      deletions: number;
      binaryFiles: number;
      lowSignalFiles: number;
      hunks: number;
      statuses: string[];
    };
    const patch = await readFile(fixture, "utf8");
    const document = parseGitPatch(patch, {
      mode: "patch",
      base: null,
      head: null,
      mergeBase: null,
      patchPath: "fixtures/git-diff/rename-and-binary.patch",
      repositoryFingerprint: "fixture-repository",
      sourceDigests: {
        patch: sha256(patch),
        numstat: null,
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      }
    });

    expect(document.summary).toEqual({
      filesChanged: expected.filesChanged,
      additions: expected.additions,
      deletions: expected.deletions,
      binaryFiles: expected.binaryFiles,
      lowSignalFiles: expected.lowSignalFiles
    });
    expect(document.hunks).toHaveLength(expected.hunks);
    expect(document.files.map((file) => file.status) as string[]).toEqual(expected.statuses);
    expect(document.files[0]).toMatchObject({
      oldPath: "src/old-name.ts",
      newPath: "src/new-name.ts",
      similarity: 70
    });
    expect(document.files[1]).toMatchObject({ binary: true, additions: null, deletions: null });
    expect(document.files[3]).toMatchObject({ submodule: true });
    expect(document.files[4]).toMatchObject({ oldMode: "100644", newMode: "100755" });
    expect(document.hunks.map((hunk) => hunk.id)).toEqual(
      parseGitPatch(patch, {
        ...document.input,
        repositoryFingerprint: "fixture-repository",
        sourceDigests: document.sourceDigests
      }).hunks.map((hunk) => hunk.id)
    );
  });

  test("rejects repository traversal and malformed hunk ranges", () => {
    const input = {
      mode: "patch" as const,
      base: null,
      head: null,
      mergeBase: null,
      patchPath: "bad.patch",
      repositoryFingerprint: "fixture-repository",
      sourceDigests: {
        patch: "0".repeat(64),
        numstat: null,
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      }
    };
    expect(() => parseGitPatch("diff --git a/../secret b/../secret\n", input)).toThrow(
      "escapes the repository"
    );
    expect(() =>
      parseGitPatch(
        "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n",
        input
      )
    ).toThrow("Hunk range declares");
  });

  test("rejects lossy or ambiguous patch path encodings", () => {
    const input = {
      mode: "patch" as const,
      base: null,
      head: null,
      mergeBase: null,
      patchPath: "bad.patch",
      repositoryFingerprint: "fixture-repository",
      sourceDigests: {
        patch: "0".repeat(64),
        numstat: null,
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      }
    };
    expect(() => parseGitPatch('diff --git "a/\\377" "b/\\377"\n', input)).toThrow(
      "not valid UTF-8"
    );
    expect(() => parseGitPatch('diff --git "a/name\\\\part" "b/name\\\\part"\n', input)).toThrow(
      "must use forward slashes"
    );
  });

  test("keeps numstat on the correct file when a renamed path is re-added", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/b.ts",
      "similarity index 100%",
      "rename from src/a.ts",
      "rename to src/b.ts",
      "diff --git a/src/a.ts b/src/a.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/a.ts",
      "@@ -0,0 +1,2 @@",
      "+new",
      "+line",
      ""
    ].join("\n");
    const input = {
      mode: "worktree",
      base: "a".repeat(40),
      head: "worktree",
      mergeBase: null,
      patchPath: null,
      repositoryFingerprint: "fixture-repository",
      sourceDigests: {
        patch: sha256(patch),
        numstat: "0".repeat(64),
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      }
    } as const;
    const document = parseGitPatch(patch, input);

    applyNumstat(document, ["0\t0\t", "src/a.ts", "src/b.ts", "2\t0\tsrc/a.ts", ""].join("\0"));

    expect(document.files.find((file) => file.status === "renamed")).toMatchObject({
      oldPath: "src/a.ts",
      newPath: "src/b.ts",
      additions: 0,
      deletions: 0
    });
    expect(document.files.find((file) => file.status === "added")).toMatchObject({
      oldPath: null,
      newPath: "src/a.ts",
      additions: 2,
      deletions: 0
    });
    expect(document.summary).toMatchObject({ additions: 2, deletions: 0 });
    expect(() =>
      applyNumstat(parseGitPatch(patch, input), ["0\t0\t", "src/a.ts", "src/b.ts", ""].join("\0"))
    ).toThrow("do not cover every parsed diff file");
  });

  test("preserves tabs in numstat paths and rejects unmatched entries", () => {
    const encodedPath = "src/a\\tb.ts";
    const decodedPath = "src/a\tb.ts";
    const patch = [
      `diff --git "a/${encodedPath}" "b/${encodedPath}"`,
      "index 1111111..2222222 100644",
      `--- "a/${encodedPath}"`,
      `+++ "b/${encodedPath}"`,
      "@@ -1 +1 @@",
      "-old",
      "+new",
      ""
    ].join("\n");
    const input = {
      mode: "worktree" as const,
      base: "a".repeat(40),
      head: "worktree",
      mergeBase: null,
      patchPath: null,
      repositoryFingerprint: "fixture-repository",
      sourceDigests: {
        patch: sha256(patch),
        numstat: "0".repeat(64),
        nameStatus: null,
        summary: null,
        raw: null,
        commits: null
      }
    };
    const document = parseGitPatch(patch, input);

    applyNumstat(document, `1\t1\t${decodedPath}\0`);

    expect(document.files[0]).toMatchObject({
      oldPath: decodedPath,
      newPath: decodedPath,
      additions: 1,
      deletions: 1
    });
    expect(() => applyNumstat(parseGitPatch(patch, input), "1\t1\tmissing.ts\0")).toThrow(
      "does not match a parsed diff file"
    );
  });
});

describe("repository collection modes", () => {
  test("collects tracked and untracked worktree changes into a non-replacing run", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src/app.ts"), "export const value = 2;\n");
    await writeFile(path.join(root, "src/new.ts"), "export const added = true;\n");

    const run = await collectGit({ cwd: root, worktree: true, output: ".artifacts/worktree" });

    expect(run.diff.input.mode).toBe("worktree");
    expect(run.diff.summary.filesChanged).toBe(2);
    expect(run.diff.hunks.length).toBe(2);
    await expect(
      collectGit({ cwd: root, worktree: true, output: ".artifacts/worktree" })
    ).rejects.toThrow("will not be replaced");
  });

  test("collects explicit range and merge-base modes with resolved object IDs", async () => {
    const root = await repository();
    const base = git(root, "rev-parse", "HEAD");
    await writeFile(path.join(root, "src/app.ts"), "export const value = 3;\n");
    git(root, "add", "src/app.ts");
    git(root, "commit", "-q", "-m", "head");
    const head = git(root, "rev-parse", "HEAD");

    const range = await collectGit({
      cwd: root,
      base,
      head,
      output: ".artifacts/range"
    });
    const merged = await collectGit({
      cwd: root,
      mergeBase: base,
      head,
      output: ".artifacts/merge-base"
    });

    expect(range.diff.input).toMatchObject({ mode: "range", base, head });
    expect(merged.diff.input).toMatchObject({ mode: "merge-base", mergeBase: base, head });
    expect(range.diff.hunks.map((hunk) => hunk.id)).toEqual(
      merged.diff.hunks.map((hunk) => hunk.id)
    );
  });

  test("rejects option-like refs and output paths outside the repository", async () => {
    const root = await repository();
    await expect(
      collectGit({ cwd: root, base: "-p", head: "HEAD", output: ".artifacts/ref" })
    ).rejects.toThrow("plain non-option");
    await expect(collectGit({ cwd: root, worktree: true, output: "../outside" })).rejects.toThrow(
      "escapes the allowed root"
    );
    await expect(
      collectGit({ cwd: root, worktree: true, head: "HEAD", output: ".artifacts/conflict" })
    ).rejects.toThrow("does not accept options from another input mode");
  });

  test("handles stdin closure when Git exits before reading input", async () => {
    const root = await repository();

    await expect(
      gitBuffer(root, ["utsuri-command-that-does-not-exist"], [0], "x".repeat(1024 * 1024))
    ).rejects.toThrow("is not a git command");
  });

  test("rejects untracked POSIX paths that would alias through a backslash rewrite", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src", "a\\b.ts"), "export const hidden = true;\n");

    await expect(
      collectGit({ cwd: root, worktree: true, output: ".artifacts/backslash" })
    ).rejects.toThrow("unsafe untracked path");
  });
});
