import { executeCli } from "./cli";
import { parseArguments, optionString } from "./arguments";
import { prepareFeedbackRuntime } from "./feedback";
import { runReviewMcpStdio } from "@utsu-ri/review-mcp-server";
import { ExitCode, toUtsuriError, UtsuriError } from "@utsu-ri/core";

const argv = process.argv.slice(2);
if (argv[0] === "review-mcp") {
  try {
    const arguments_ = parseArguments(argv);
    if (
      arguments_.positionals.length !== 0 ||
      [...arguments_.options.keys()].some((name) => name !== "--run")
    ) {
      throw new UtsuriError(
        "CLI_REVIEW_MCP_ARGUMENTS",
        "review-mcp accepts only --run",
        ExitCode.Arguments
      );
    }
    const run = optionString(arguments_, "--run");
    if (!run) {
      throw new UtsuriError("CLI_RUN_REQUIRED", "review-mcp requires --run", ExitCode.Arguments);
    }
    const runtime = await prepareFeedbackRuntime(process.cwd(), run);
    await runReviewMcpStdio(runtime.service);
  } catch (error) {
    const normalized = toUtsuriError(error);
    process.stderr.write(`${normalized.diagnosticId}: ${normalized.message}\n`);
    process.exitCode = normalized.exitCode;
  }
} else {
  const result = await executeCli(argv);
  if (result.json) process.stdout.write(`${JSON.stringify(result.data)}\n`);
  else process.stdout.write(result.human.endsWith("\n") ? result.human : `${result.human}\n`);
  process.exitCode = result.exitCode;
}
