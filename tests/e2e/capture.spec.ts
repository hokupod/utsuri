import { expect, test } from "@playwright/test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { captureConfig, repositoryRoot } from "../integration/capture-helpers";

const bundledCli = path.join(repositoryRoot, "skills/utsuri-review/scripts/utsuri.mjs");

function runCli(cwd: string, arguments_: string[]) {
  const result = spawnSync(process.execPath, [bundledCli, ...arguments_, "--json"], {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return { ...result, json: JSON.parse(result.stdout) as Record<string, unknown> };
}

test("capture emits separated synthetic evidence artifacts", async () => {
  test.setTimeout(60_000);
  const root = await mkdtemp(path.join(tmpdir(), "utsuri-capture-e2e-"));
  try {
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await Promise.all([
      copyFile(
        path.join(repositoryRoot, "fixtures/dynamic-content/before.html"),
        path.join(root, "before.html")
      ),
      copyFile(
        path.join(repositoryRoot, "fixtures/dynamic-content/after.html"),
        path.join(root, "after.html")
      )
    ]);
    const config = captureConfig({
      mode: "static-fragment",
      fragments: { before: "before.html", after: "after.html" }
    });
    await writeFile(path.join(root, "utsuri.yml"), stringify(config));
    const execution = runCli(root, ["capture", "--run", "run", "--config", "utsuri.yml"]);
    expect(execution.status, execution.stderr).toBe(0);
    expect(execution.json.ok).toBe(true);
    const captured = JSON.parse(await readFile(path.join(run, "capture.json"), "utf8")) as {
      targets: Array<{
        before: Record<string, unknown> & { status: string; screenshotRefs: string[] };
        after: Record<string, unknown> & { status: string; screenshotRefs: string[] };
      }>;
    };
    const target = captured.targets[0]!;
    for (const side of [target.before, target.after]) {
      expect(side.status).toBe("success");
      expect(side.screenshotRefs.length).toBe(2);
      for (const reference of [
        ...side.screenshotRefs,
        side.domRef as string,
        side.ariaRef as string,
        side.styleRef as string,
        side.axeRef as string,
        side.consoleRef as string,
        side.networkRef as string,
        side.metadataRef as string
      ]) {
        expect(reference).toBeTruthy();
        expect((await readFile(path.join(run, reference!))).byteLength).toBeGreaterThan(0);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
