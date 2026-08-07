import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, toUtsuriError, UtsuriError } from "@utsu-ri/core";
import { collectGit } from "@utsu-ri/git-collector";
import { buildReport, createInitialReport, validateReportDirectory } from "@utsu-ri/report-builder";
import { assertArtifact } from "@utsu-ri/report-model";
import { resolveContainedPath } from "@utsu-ri/security";
import { optionString, parseArguments } from "./arguments";
import { doctor } from "./doctor";

async function readArtifactJson(filename: string, label: string): Promise<unknown> {
  const content = await readFile(filename, "utf8");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new UtsuriError("ARTIFACT_JSON_INVALID", `${label} is not valid JSON`, ExitCode.Artifact);
  }
}

const help = `Utsuri 0.1.0

Usage: utsuri <command> [options]

Commands:
  doctor                 Inspect prerequisites without changing the environment
  collect                Collect a Git diff into a review run
  finalize --run <path>  Build an immutable report
  validate <report>      Validate report schema, CSP, assets, and hashes

Global options:
  --json                  Emit one strict JSON value
  --help                  Show this help
  --version               Show the version
`;

export interface CliExecution {
  exitCode: number;
  data: unknown;
  human: string;
  json: boolean;
}

export async function executeCli(
  argv: readonly string[],
  cwd = process.cwd()
): Promise<CliExecution> {
  let json = argv.includes("--json");
  try {
    const args = parseArguments(argv);
    json = args.json;
    if (args.options.has("--version") || args.command === "version") {
      return { exitCode: 0, data: { version: "0.1.0" }, human: "0.1.0", json };
    }
    if (args.options.has("--help") || !args.command || args.command === "help") {
      return { exitCode: 0, data: { help }, human: help, json };
    }

    if (args.command === "doctor") {
      const data = await doctor(cwd, optionString(args, "--config"));
      return {
        exitCode: data.ok ? ExitCode.Success : ExitCode.Environment,
        data,
        human: data.ok ? "Environment checks passed" : "Environment checks failed",
        json
      };
    }

    if (args.command === "collect") {
      const output = optionString(args, "--output");
      if (!output) {
        throw new UtsuriError(
          "CLI_OUTPUT_REQUIRED",
          "collect requires --output",
          ExitCode.Arguments
        );
      }
      const collected = await collectGit({
        cwd,
        output,
        patch: optionString(args, "--patch"),
        worktree: args.options.has("--worktree"),
        base: optionString(args, "--base"),
        head: optionString(args, "--head"),
        mergeBase: optionString(args, "--merge-base")
      });
      const runDirectory =
        path.relative(cwd, collected.runDirectory).replaceAll(path.sep, "/") || ".";
      const data = {
        ok: true,
        command: "collect",
        mode: collected.diff.input.mode,
        runDirectory,
        filesChanged: collected.diff.summary.filesChanged,
        additions: collected.diff.summary.additions,
        deletions: collected.diff.summary.deletions,
        hunks: collected.diff.hunks.length,
        lowSignalFiles: collected.diff.summary.lowSignalFiles
      };
      return { exitCode: 0, data, human: `Collected review input: ${runDirectory}`, json };
    }

    if (args.command === "finalize") {
      const runValue = optionString(args, "--run");
      if (!runValue)
        throw new UtsuriError("CLI_RUN_REQUIRED", "finalize requires --run", ExitCode.Arguments);
      const runDirectory = await resolveContainedPath(cwd, runValue);
      const annotationsValue = optionString(args, "--annotations");
      let annotations: unknown | null = null;
      if (annotationsValue) {
        const filename = await resolveContainedPath(cwd, annotationsValue);
        annotations = await readArtifactJson(filename, "annotations");
        assertArtifact("annotations", annotations);
      }
      const report = await createInitialReport(runDirectory, annotations);
      const built = await buildReport(runDirectory, report, { toolVersion: "0.1.0" });
      const relative = path.relative(cwd, built.reportDirectory).replaceAll(path.sep, "/");
      const data = {
        ok: true,
        command: "finalize",
        reportId: built.manifest.reportId,
        reportDirectory: relative,
        reused: built.reused
      };
      return { exitCode: 0, data, human: `Report ready: ${relative}`, json };
    }

    if (args.command === "validate") {
      const reportValue = args.positionals[0];
      if (!reportValue)
        throw new UtsuriError(
          "CLI_REPORT_REQUIRED",
          "validate requires a report path",
          ExitCode.Arguments
        );
      const reportDirectory = await resolveContainedPath(cwd, reportValue);
      const result = await validateReportDirectory(reportDirectory, {
        strict: args.options.has("--strict")
      });
      return {
        exitCode: result.ok ? 0 : ExitCode.Artifact,
        data: { command: "validate", ...result },
        human: result.ok ? `Report valid: ${result.reportId}` : result.errors.join("\n"),
        json
      };
    }

    throw new UtsuriError(
      "CLI_UNKNOWN_COMMAND",
      `Unknown command: ${args.command}`,
      ExitCode.Arguments
    );
  } catch (error) {
    const normalized = toUtsuriError(error);
    return {
      exitCode: normalized.exitCode,
      data: {
        ok: false,
        error: {
          id: normalized.diagnosticId,
          message: normalized.message,
          exitCode: normalized.exitCode
        }
      },
      human: `${normalized.diagnosticId}: ${normalized.message}`,
      json
    };
  }
}
