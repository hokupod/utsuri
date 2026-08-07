import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeCli } from "./cli";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createRun(): Promise<{ root: string; run: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "utsuri-cli-"));
  temporaryDirectories.push(root);
  const run = path.join(root, "run");
  await mkdir(run);
  await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n');
  return { root, run };
}

function errorId(result: Awaited<ReturnType<typeof executeCli>>): string | undefined {
  return (result.data as { error?: { id?: string } }).error?.id;
}

describe("phase-zero CLI", () => {
  test("returns machine-readable version metadata", async () => {
    const result = await executeCli(["--version", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual({ version: "0.1.0" });
  });

  test("rejects unknown commands with argument exit code", async () => {
    const result = await executeCli(["unknown", "--json"]);
    expect(result.exitCode).toBe(2);
  });

  test("finalizes and strictly validates an empty run", async () => {
    const { root } = await createRun();

    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root);
    expect(finalized.exitCode).toBe(0);
    const validated = await executeCli(["validate", "run/report", "--strict", "--json"], root);
    expect(validated.exitCode).toBe(0);
  });

  test("returns artifact exit code for malformed annotations JSON", async () => {
    const { root } = await createRun();
    await writeFile(path.join(root, "annotations.json"), "{");

    const result = await executeCli(
      ["finalize", "--run", "run", "--annotations", "annotations.json", "--json"],
      root
    );

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("ARTIFACT_JSON_INVALID");
  });

  test("rejects non-empty annotations until the collect workflow is available", async () => {
    const { root } = await createRun();
    await writeFile(
      path.join(root, "annotations.json"),
      `${JSON.stringify({
        schemaVersion: "1.0",
        changes: [
          {
            id: "change:one",
            title: "Example change",
            kind: "visual",
            summary: "Changes the example",
            intent: { text: "Example", source: "declared", evidenceRefs: [] },
            implementation: "Example implementation",
            userImpact: [],
            technicalImpact: [],
            risk: { level: "low", reasons: [] },
            hunkRefs: [],
            targetRefs: [],
            findingRefs: [],
            verification: { verified: [], gaps: [] }
          }
        ]
      })}\n`
    );

    const result = await executeCli(
      ["finalize", "--run", "run", "--annotations", "annotations.json", "--json"],
      root
    );

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("ANNOTATIONS_REQUIRE_COLLECT");
  });

  test("returns artifact exit code for malformed diff JSON", async () => {
    const { root, run } = await createRun();
    await writeFile(path.join(run, "diff.json"), "{");

    const result = await executeCli(["finalize", "--run", "run", "--json"], root);

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("ARTIFACT_JSON_INVALID");
  });

  test("rejects non-empty diff evidence until the collect workflow is available", async () => {
    const { root, run } = await createRun();
    await writeFile(
      path.join(run, "diff.json"),
      '{"summary":{"filesChanged":1,"additions":0,"deletions":0},"hunks":[]}\n'
    );

    const result = await executeCli(["finalize", "--run", "run", "--json"], root);

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("REPORT_DIFF_REQUIRES_COLLECT");
  });

  for (const [label, value] of [
    ["string", '"non-empty diff"'],
    [
      "unknown-field object",
      '{"summary":{"filesChanged":0,"additions":0,"deletions":0},"hunks":[],"content":["lost"]}'
    ]
  ] as const) {
    test(`rejects a structurally invalid ${label} diff without creating a report`, async () => {
      const { root, run } = await createRun();
      await writeFile(path.join(run, "diff.json"), `${value}\n`);

      const result = await executeCli(["finalize", "--run", "run", "--json"], root);

      expect(result.exitCode).toBe(5);
      expect(errorId(result)).toBe("SCHEMA_INVALID");
      await expect(access(path.join(run, "report"))).rejects.toMatchObject({ code: "ENOENT" });
    });
  }
});
