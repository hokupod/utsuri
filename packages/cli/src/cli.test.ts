import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  access,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeCli } from "./cli";

const temporaryDirectories: string[] = [];

afterAll(async () => {
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

async function createCollectedRun(): Promise<{ root: string; run: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "utsuri-cli-collected-"));
  temporaryDirectories.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  const initializedRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  if ((await realpath(initializedRoot)) !== (await realpath(root))) {
    throw new Error(`git init targeted the wrong directory: ${initializedRoot}`);
  }
  await copyFile(
    path.resolve(import.meta.dir, "../../../fixtures/git-diff/rename-and-binary.patch"),
    path.join(root, "changes.patch")
  );
  const collected = await executeCli(
    ["collect", "--patch", "changes.patch", "--output", "run", "--json"],
    root
  );
  if (collected.exitCode !== 0) {
    throw new Error(`collect failed: ${JSON.stringify(collected.data)}`);
  }
  return { root, run: path.join(root, "run") };
}

function errorId(result: Awaited<ReturnType<typeof executeCli>>): string | undefined {
  return (result.data as { error?: { id?: string } }).error?.id;
}

describe("CLI", () => {
  test("returns machine-readable version metadata", async () => {
    const result = await executeCli(["--version", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual({ version: "0.1.0" });
  });

  test("rejects unknown commands with argument exit code", async () => {
    const result = await executeCli(["unknown", "--json"]);
    expect(result.exitCode).toBe(2);
  });

  test("rejects duplicate options instead of silently taking the last value", async () => {
    const result = await executeCli(["doctor", "--json", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(errorId(result)).toBe("CLI_DUPLICATE_OPTION");
  });

  test("finalizes and strictly validates an empty run", async () => {
    const { root } = await createRun();

    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root);
    expect(finalized.exitCode).toBe(0);
    const validated = await executeCli(["validate", "run/report", "--strict", "--json"], root);
    expect(validated.exitCode).toBe(0);
  });

  test("collects a patch and finalizes an uncovered code-only report", async () => {
    const { root, run } = await createCollectedRun();

    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root);
    expect(finalized.exitCode).toBe(0);
    const report = JSON.parse(await readFile(path.join(run, "report/report.json"), "utf8")) as {
      status: string;
      files: unknown[];
      hunks: unknown[];
      changes: unknown[];
      diagnostics: { incompleteReasons: string[] };
    };
    expect(report.status).toBe("UNCOVERED");
    expect(report.files).toHaveLength(6);
    expect(report.hunks).toHaveLength(4);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.diagnostics.incompleteReasons).toContain("visual-capture-not-run");
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

  test("preserves validated annotations and leaves omitted hunks unclassified", async () => {
    const { root, run } = await createCollectedRun();
    const plan = JSON.parse(await readFile(path.join(run, "review-plan.json"), "utf8")) as {
      candidates: Array<{ id: string; title: string; hunkRefs: string[]; evidenceRefs: string[] }>;
    };
    const candidate = plan.candidates[0]!;
    await writeFile(
      path.join(root, "annotations.json"),
      `${JSON.stringify({
        schemaVersion: "1.0",
        changes: [
          {
            id: candidate.id,
            title: candidate.title,
            kind: "unknown",
            summary: "Reviews one collected change group.",
            intent: {
              text: "Fixture intent",
              source: "declared",
              evidenceRefs: candidate.evidenceRefs
            },
            implementation: "Uses the collected hunks.",
            userImpact: ["Requires review."],
            technicalImpact: ["Changes fixture files."],
            risk: { level: "low", reasons: ["Runtime was not executed."] },
            hunkRefs: candidate.hunkRefs,
            targetRefs: [],
            findingRefs: [],
            verification: {
              verified: ["Patch parsed."],
              gaps: ["Visual behavior was not captured."]
            }
          }
        ]
      })}\n`
    );

    const result = await executeCli(
      ["finalize", "--run", "run", "--annotations", "annotations.json", "--json"],
      root
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(await readFile(path.join(run, "report/report.json"), "utf8")) as {
      changes: Array<{ intent: { text: string } }>;
      unclassifiedHunkRefs: string[];
    };
    expect(report.changes[0]?.intent.text).toBe("Fixture intent");
    expect(report.unclassifiedHunkRefs.length).toBeGreaterThanOrEqual(0);
  });

  test("returns artifact exit code for malformed diff JSON", async () => {
    const { root, run } = await createRun();
    await writeFile(path.join(run, "diff.json"), "{");

    const result = await executeCli(["finalize", "--run", "run", "--json"], root);

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("ARTIFACT_JSON_INVALID");
  });

  test("rejects incomplete legacy diff evidence instead of discarding it", async () => {
    const { root, run } = await createRun();
    await writeFile(
      path.join(run, "diff.json"),
      '{"summary":{"filesChanged":1,"additions":0,"deletions":0},"hunks":[]}\n'
    );

    const result = await executeCli(["finalize", "--run", "run", "--json"], root);

    expect(result.exitCode).toBe(5);
    expect(errorId(result)).toBe("SCHEMA_INVALID");
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
