import { readFile } from "node:fs/promises";
import path from "node:path";
import { captureCapabilities, captureRun, loadCaptureConfig } from "@utsu-ri/capture";
import { compareRun } from "@utsu-ri/compare";
import { ExitCode, toUtsuriError, UtsuriError } from "@utsu-ri/core";
import { discoverRun } from "@utsu-ri/discovery";
import { collectGit } from "@utsu-ri/git-collector";
import { buildReport, createInitialReport, validateReportDirectory } from "@utsu-ri/report-builder";
import { assertArtifact } from "@utsu-ri/report-model";
import { resolveContainedPath } from "@utsu-ri/security";
import { optionString, parseArguments } from "./arguments";
import { doctor } from "./doctor";
import { initializeConfig } from "./init";
import { packReport } from "./pack";
import { reviewExport, reviewImport } from "./review";
import { serveReport } from "./serve";

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
  init [--output path]   Propose a safe capture configuration without overwriting
  collect                Collect a Git diff into a review run
  capture                Capture configured before/after browser evidence
                         Worktree mode also requires --allow-project-code
  discover               Map code changes to captured targets and coverage
  compare                Compare captured visual, structural, and runtime evidence
  finalize --run <path>  Build an immutable report
  validate <report>      Validate report schema, CSP, assets, and hashes
  serve <report>         Serve a report on a random loopback port
  pack <report>          Create deterministic CI artifacts and apply policy
  review export          Export review state, comments, and event journal
  review import          Import review state with optional --reanchor

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
      return {
        exitCode: 0,
        data: {
          ok: true,
          command: "version",
          package: "@utsu-ri/cli",
          version: "0.1.0",
          protocolVersion: "1.0"
        },
        human: "0.1.0",
        json
      };
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

    if (args.command === "init") {
      const output = optionString(args, "--output") ?? "utsuri.yml";
      const initialized = await initializeConfig(cwd, output);
      const relative = path.relative(cwd, initialized.filename).replaceAll(path.sep, "/");
      const data = {
        ok: true,
        command: "init",
        output: relative,
        proposedCommands: initialized.proposals,
        executableCommandsConfigured: false,
        defaultCaptureMode: "dual-url"
      };
      return { exitCode: 0, data, human: `Configuration proposal written: ${relative}`, json };
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
      const built = await buildReport(runDirectory, report, {
        toolVersion: "0.1.0",
        annotations
      });
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

    if (args.command === "capture") {
      const runValue = optionString(args, "--run");
      const configValue = optionString(args, "--config");
      if (!runValue || !configValue) {
        throw new UtsuriError(
          "CLI_CAPTURE_INPUT_REQUIRED",
          "capture requires --run and --config",
          ExitCode.Arguments
        );
      }
      const runDirectory = await resolveContainedPath(cwd, runValue);
      const { config } = await loadCaptureConfig(cwd, configValue);
      const captured = await captureRun(cwd, runDirectory, config, {
        allowProjectCode: args.options.has("--allow-project-code")
      });
      const data = {
        ok: captured.complete,
        command: "capture",
        mode: captured.manifest.mode,
        capability: captureCapabilities[captured.manifest.mode],
        captureHash: captured.manifest.captureHash,
        targets: captured.manifest.targets.length,
        failedSides: captured.manifest.targets.reduce(
          (count, target) =>
            count +
            Number(target.before.status !== "success") +
            Number(target.after.status !== "success"),
          0
        ),
        blockedRequests: captured.manifest.blockedRequestCount,
        reusedSides: captured.reusedSides,
        manifest: path.relative(cwd, captured.manifestPath).replaceAll(path.sep, "/")
      };
      return {
        exitCode: captured.complete ? ExitCode.Success : ExitCode.Incomplete,
        data,
        human: captured.complete ? "Browser capture completed" : "Browser capture is incomplete",
        json
      };
    }

    if (args.command === "discover") {
      const runValue = optionString(args, "--run");
      const configValue = optionString(args, "--config");
      if (!runValue || !configValue) {
        throw new UtsuriError(
          "CLI_DISCOVERY_INPUT_REQUIRED",
          "discover requires --run and --config",
          ExitCode.Arguments
        );
      }
      const runDirectory = await resolveContainedPath(cwd, runValue);
      const discovered = await discoverRun(cwd, runDirectory, configValue);
      const data = {
        ok: true,
        command: "discover",
        discoveryHash: discovered.manifest.discoveryHash,
        candidates: discovered.manifest.candidates.length,
        unmappedChanges: discovered.manifest.unmappedChangeRefs.length,
        coverage: discovered.manifest.coverage,
        manifest: path.relative(cwd, discovered.manifestPath).replaceAll(path.sep, "/")
      };
      return { exitCode: ExitCode.Success, data, human: "Visual target discovery completed", json };
    }

    if (args.command === "compare") {
      const runValue = optionString(args, "--run");
      if (!runValue) {
        throw new UtsuriError(
          "CLI_COMPARE_INPUT_REQUIRED",
          "compare requires --run",
          ExitCode.Arguments
        );
      }
      const runDirectory = await resolveContainedPath(cwd, runValue);
      const compared = await compareRun(runDirectory);
      const findings = compared.manifest.targets.flatMap((target) => target.findings);
      const data = {
        ok: compared.complete,
        command: "compare",
        comparisonHash: compared.manifest.comparisonHash,
        targets: compared.manifest.targets.length,
        incompleteTargets: compared.manifest.targets.filter(
          (target) => target.status === "incomplete"
        ).length,
        newFindings: findings.filter((finding) => finding.state === "new").length,
        resolvedFindings: findings.filter((finding) => finding.state === "resolved").length,
        manifest: path.relative(cwd, compared.manifestPath).replaceAll(path.sep, "/")
      };
      return {
        exitCode: compared.complete ? ExitCode.Success : ExitCode.Incomplete,
        data,
        human: compared.complete
          ? "Evidence comparison completed"
          : "Evidence comparison is incomplete",
        json
      };
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

    if (args.command === "serve") {
      const reportValue = args.positionals[0];
      if (!reportValue || args.positionals.length !== 1) {
        throw new UtsuriError(
          "CLI_REPORT_REQUIRED",
          "serve requires exactly one report directory",
          ExitCode.Arguments
        );
      }
      const served = await serveReport(cwd, reportValue, {
        interactive: args.options.has("--interactive"),
        openBrowser: args.options.has("--open")
      });
      return { exitCode: ExitCode.Success, ...served, json };
    }

    if (args.command === "pack") {
      const reportValue = args.positionals[0];
      const output = optionString(args, "--output");
      if (!reportValue || args.positionals.length !== 1 || !output) {
        throw new UtsuriError(
          "CLI_PACK_INPUT_REQUIRED",
          "pack requires exactly one report directory and --output",
          ExitCode.Arguments
        );
      }
      const maximumValue = optionString(args, "--max-bytes");
      if (maximumValue && !/^\d+$/u.test(maximumValue)) {
        throw new UtsuriError(
          "CLI_MAX_BYTES_INVALID",
          "--max-bytes must be a positive integer",
          ExitCode.Arguments
        );
      }
      const packed = await packReport(cwd, reportValue, output, {
        config: optionString(args, "--config"),
        singleFile: args.options.has("--single-file"),
        maximumSingleFileBytes: maximumValue ? Number(maximumValue) : undefined
      });
      return { exitCode: packed.exitCode, data: packed.data, human: packed.human, json };
    }

    if (args.command === "review") {
      const subcommand = args.positionals[0];
      const runValue = optionString(args, "--run");
      if (!runValue) {
        throw new UtsuriError("CLI_RUN_REQUIRED", "review requires --run", ExitCode.Arguments);
      }
      if (subcommand === "export") {
        const output = optionString(args, "--output");
        if (!output) {
          throw new UtsuriError(
            "CLI_OUTPUT_REQUIRED",
            "review export requires --output",
            ExitCode.Arguments
          );
        }
        const result = await reviewExport(cwd, runValue, output);
        return { exitCode: ExitCode.Success, data: result.data, human: result.human, json };
      }
      if (subcommand === "import") {
        const input = optionString(args, "--input");
        if (!input) {
          throw new UtsuriError(
            "CLI_INPUT_REQUIRED",
            "review import requires --input",
            ExitCode.Arguments
          );
        }
        const result = await reviewImport(cwd, runValue, input, args.options.has("--reanchor"));
        return { exitCode: ExitCode.Success, data: result.data, human: result.human, json };
      }
      throw new UtsuriError(
        "CLI_REVIEW_SUBCOMMAND",
        "review requires export or import",
        ExitCode.Arguments
      );
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
          exitCode: normalized.exitCode,
          details: normalized.details
        }
      },
      human: `${normalized.diagnosticId}: ${normalized.message}`,
      json
    };
  }
}
