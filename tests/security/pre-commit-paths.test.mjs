import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const config = parse(readFileSync(path.join(repositoryRoot, "lefthook.yml"), "utf8"));
const prettierCli = path.join(repositoryRoot, "node_modules/prettier/bin/prettier.cjs");

function stagedFormattingArguments(file) {
  const job = config["pre-commit"]?.jobs?.find(
    (candidate) => candidate.name === "staged formatting"
  );
  assert.ok(job, "staged formatting job is required");

  const tokens = job.run.trim().split(/\s+/u);
  const prettier = tokens.indexOf("prettier");
  assert.notEqual(prettier, -1, "staged formatting must invoke Prettier");
  const placeholder = tokens.indexOf("{staged_files}");
  assert.notEqual(placeholder, -1, "staged formatting must consume staged files");
  tokens.splice(placeholder, 1, file);

  return tokens.slice(prettier + 1);
}

test("staged formatting treats option-like paths as file operands", () => {
  const optionLikePath = "--config=utsuri-option-injection-probe.mjs";
  const arguments_ = stagedFormattingArguments(optionLikePath);
  const result = spawnSync(process.execPath, [prettierCli, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.error, undefined, output);
  assert.notEqual(result.status, 0, "the deliberately missing probe file must not pass formatting");
  assert.match(output, /No files matching the pattern/u);
  assert.match(output, /--config=utsuri-option-injection-probe\.mjs/u);
});
