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
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { executeCli } from "./cli";
import { validateArtifact } from "@utsu-ri/report-model";
import { readMcpRunRegistrations } from "@utsu-ri/review-mcp-server";
import { PluginBrokerMcpService } from "./mcp";

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
    expect(result.data).toEqual({
      ok: true,
      command: "version",
      package: "@utsu-ri/cli",
      version: "0.2.0",
      protocolVersion: "1.1"
    });
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

  test("initializes a non-executable configuration proposal without overwriting", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "utsuri-init-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "fixture", packageManager: "bun@1.3.14", scripts: { dev: "vite" } })
    );

    const initialized = await executeCli(["init", "--output", "utsuri.yml", "--json"], root);
    expect(initialized.exitCode).toBe(0);
    const config = parse(await readFile(path.join(root, "utsuri.yml"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(validateArtifact("config", config).errors).toEqual([]);
    expect(config.proposedCommands).toEqual([
      {
        source: "package.json#scripts.dev",
        command: ["bun", "run", "dev"],
        reason: "Project script may start a reviewable local UI"
      }
    ]);
    expect(config.servers).toEqual({
      before: {
        readyUrl: "http://127.0.0.1:4173/",
        readySelector: "[data-app-ready]"
      },
      after: {
        readyUrl: "http://127.0.0.1:4174/",
        readySelector: "[data-app-ready]"
      }
    });

    const repeated = await executeCli(["init", "--output", "utsuri.yml", "--json"], root);
    expect(repeated.exitCode).toBe(2);
    expect(errorId(repeated)).toBe("INIT_OUTPUT_EXISTS");
  });

  test("finalizes and strictly validates an empty run", async () => {
    const { root, run } = await createRun();

    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root, {});
    expect(finalized.exitCode).toBe(0);
    const repeated = await executeCli(["finalize", "--run", "run", "--json"], root, {
      CODEX_THREAD_ID: "late-origin-session"
    });
    expect(repeated).toMatchObject({
      exitCode: 0,
      data: { reused: true, mcpRegistration: "not-registered", mcpRegistrationReused: false }
    });
    const report = JSON.parse(await readFile(path.join(run, "report/report.json"), "utf8")) as {
      origin: { bindingMode: string };
    };
    expect(report.origin.bindingMode).toBe("unbound");
    const validated = await executeCli(["validate", "run/report", "--strict", "--json"], root);
    expect(validated.exitCode).toBe(0);
  });

  test("fixes an opaque Origin Session in the immutable report", async () => {
    const { root, run } = await createRun();

    const environment = {
      CODEX_THREAD_ID: "fixture-origin-session"
    };
    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root, environment);
    const repeated = await executeCli(["finalize", "--run", "run", "--json"], root, environment);
    const report = JSON.parse(await readFile(path.join(run, "report/report.json"), "utf8")) as {
      reportId: string;
      origin: {
        host: string;
        sessionRef?: string;
        bindingMode: string;
      };
    };

    expect(finalized.exitCode, JSON.stringify(finalized.data)).toBe(0);
    expect(repeated).toMatchObject({
      exitCode: 0,
      data: { reused: true, mcpRegistration: "registered", mcpRegistrationReused: true }
    });
    expect(report.origin.host).toBe("codex");
    expect(report.origin.bindingMode).toBe("return-to-session");
    expect(report.origin.sessionRef).toMatch(/^session:[a-f0-9]{64}$/u);
    expect(JSON.stringify(report.origin)).not.toContain("fixture-origin-session");
    const registrations = await readMcpRunRegistrations(root);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.reportId).toBe(report.reportId);
    expect(JSON.stringify(registrations)).not.toContain("fixture-origin-session");
    expect(JSON.stringify(registrations)).not.toContain(root);

    const mismatched = await executeCli(["finalize", "--run", "run", "--json"], root, {
      CODEX_THREAD_ID: "another-origin-session"
    });
    expect(mismatched.exitCode).toBe(6);
    expect(errorId(mismatched)).toBe("ORIGIN_SESSION_MISMATCH");
  });

  test("keeps legacy fixed-run finalize identities compatible", async () => {
    for (const environment of [
      { UTSURI_CODEX_SESSION_ID: "legacy-finalize-codex" },
      { CLAUDE_SESSION_ID: "legacy-finalize-claude" }
    ]) {
      const { root } = await createRun();
      const finalized = await executeCli(["finalize", "--run", "run", "--json"], root, environment);
      expect(finalized.exitCode, JSON.stringify(finalized.data)).toBe(0);
      expect(finalized.data).toMatchObject({ mcpRegistration: "registered" });
    }
  });

  test("binds Claude finalize from a child cwd to the canonical host project root", async () => {
    const { root } = await createRun();
    const child = path.join(root, "child");
    await mkdir(child);
    const environment = {
      CLAUDE_CODE_SESSION_ID: "claude-child-session",
      CLAUDE_PROJECT_DIR: await realpath(root)
    };
    const finalized = await executeCli(["finalize", "--run", "run", "--json"], child, environment);
    expect(finalized.exitCode, JSON.stringify(finalized.data)).toBe(0);
    const reportId = (finalized.data as { reportId: string }).reportId;
    expect(await readMcpRunRegistrations(root)).toHaveLength(1);
    const visible = await new PluginBrokerMcpService(root, environment).callTool(
      "review_list_batches",
      {}
    );
    expect(visible).toMatchObject({ reportId });
  });

  test("rejects missing, filesystem-root, symlinked, and unrelated Claude project roots", async () => {
    const { root } = await createRun();
    const child = path.join(root, "child");
    await mkdir(child);
    const linked = `${root}-link`;
    temporaryDirectories.push(linked);
    await symlink(root, linked);
    const other = await mkdtemp(path.join(tmpdir(), "utsuri-cli-other-project-"));
    temporaryDirectories.push(other);
    for (const [projectRoot, expected] of [
      [undefined, "ORIGIN_PROJECT_CONTEXT_REQUIRED"],
      [path.parse(root).root, "ORIGIN_PROJECT_INVALID"],
      [linked, "ORIGIN_PROJECT_AMBIGUOUS"],
      [await realpath(other), "ORIGIN_PROJECT_MISMATCH"]
    ] as const) {
      const result = await executeCli(["finalize", "--run", "run", "--json"], child, {
        CLAUDE_CODE_SESSION_ID: "claude-invalid-project",
        ...(projectRoot ? { CLAUDE_PROJECT_DIR: projectRoot } : {})
      });
      expect(errorId(result)).toBe(expected);
    }
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

  test("exports and imports canonical review state without modifying the report", async () => {
    const { root, run } = await createCollectedRun();
    const finalized = await executeCli(["finalize", "--run", "run", "--json"], root);
    expect(finalized.exitCode).toBe(0);
    const reportBefore = await readFile(path.join(run, "report/report.json"), "utf8");

    const exported = await executeCli(
      ["review", "export", "--run", "run", "--output", "review-bundle.json", "--json"],
      root
    );
    expect(exported.exitCode, JSON.stringify(exported.data)).toBe(0);
    expect(
      validateArtifact(
        "review-bundle",
        JSON.parse(await readFile(path.join(root, "review-bundle.json"), "utf8"))
      ).errors
    ).toEqual([]);

    const imported = await executeCli(
      ["review", "import", "--run", "run", "--input", "review-bundle.json", "--json"],
      root
    );
    expect(imported.exitCode, JSON.stringify(imported.data)).toBe(0);
    expect((imported.data as { conflicts: number }).conflicts).toBe(0);
    expect(await readFile(path.join(run, "report/report.json"), "utf8")).toBe(reportBefore);
    const pointer = JSON.parse(
      await readFile(path.join(run, "review/commits/revision-000000000001.json"), "utf8")
    ) as {
      generation: string;
    };
    const state = JSON.parse(
      await readFile(
        path.join(run, "review/generations", pointer.generation, "review-state.json"),
        "utf8"
      )
    ) as {
      revision: number;
    };
    expect(state.revision).toBe(1);
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
        language: "ja",
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
      language: string;
      changes: Array<{ intent: { text: string } }>;
      unclassifiedHunkRefs: string[];
    };
    expect(report.changes[0]?.intent.text).toBe("Fixture intent");
    expect(report.language).toBe("ja");
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
