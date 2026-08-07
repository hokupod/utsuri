import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureConfig } from "../integration/capture-helpers";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundledCli = path.join(repositoryRoot, "skills/utsuri-review/scripts/utsuri.mjs");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function runBundle(cwd: string, args: string[]): Record<string, unknown> {
  const result = spawnSync("node", [bundledCli, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) throw result.error;
  expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("installed CLI bundle", () => {
  test("finalizes from an unrelated project without checkout-relative schemas", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "utsuri-installed-bundle-"));
    temporaryDirectories.push(project);
    const run = path.join(project, "run");
    await mkdir(run);
    await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n');
    await expect(access(path.join(project, "schemas"))).rejects.toMatchObject({ code: "ENOENT" });

    const finalized = runBundle(project, ["finalize", "--run", "run", "--json"]);
    expect(finalized.ok).toBe(true);
    expect(finalized.reportDirectory).toBe("run/report");

    const validated = runBundle(project, ["validate", "run/report", "--strict", "--json"]);
    expect(validated.ok).toBe(true);
    const copiedSchema = JSON.parse(
      await readFile(path.join(run, "report/review-answer.schema.json"), "utf8")
    ) as { title?: string };
    expect(copiedSchema.title).toBe("ReviewAnswer");
  });

  test("captures static evidence without checkout-relative Playwright runtime files", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "utsuri-installed-capture-"));
    temporaryDirectories.push(project);
    await mkdir(path.join(project, "run"), { mode: 0o700 });
    await Promise.all([
      writeFile(path.join(project, "before.html"), "<main>before</main>\n"),
      writeFile(path.join(project, "after.html"), "<main>after</main>\n")
    ]);
    const config = captureConfig({
      mode: "static-fragment",
      fragments: { before: "before.html", after: "after.html" }
    });
    await writeFile(path.join(project, "utsuri.yml"), `${JSON.stringify(config, null, 2)}\n`);

    const captured = runBundle(project, [
      "capture",
      "--run",
      "run",
      "--config",
      "utsuri.yml",
      "--json"
    ]);
    expect(captured.ok).toBe(true);
    expect(captured.failedSides).toBe(0);
    expect(captured.targets).toBe(1);
  }, 30_000);
});
