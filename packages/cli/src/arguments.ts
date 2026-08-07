import { ExitCode, UtsuriError } from "@utsu-ri/core";

export interface ParsedArguments {
  command: string | null;
  positionals: string[];
  options: Map<string, string | boolean>;
  json: boolean;
}

const valueOptions = new Set([
  "--annotations",
  "--batch",
  "--base",
  "--config",
  "--format",
  "--head",
  "--input",
  "--merge-base",
  "--max-bytes",
  "--output",
  "--patch",
  "--run",
  "--status"
]);
const booleanOptions = new Set([
  "--allow-project-code",
  "--help",
  "--interactive",
  "--json",
  "--open",
  "--reanchor",
  "--single-file",
  "--strict",
  "--version",
  "--worktree"
]);

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const options = new Map<string, string | boolean>();
  const positionals: string[] = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) continue;
    if (value.startsWith("--")) {
      const separator = value.indexOf("=");
      const name = separator === -1 ? value : value.slice(0, separator);
      const inline = separator === -1 ? undefined : value.slice(separator + 1);
      if (options.has(name)) {
        throw new UtsuriError(
          "CLI_DUPLICATE_OPTION",
          `${name} may be provided only once`,
          ExitCode.Arguments
        );
      }
      if (booleanOptions.has(name)) {
        if (inline !== undefined)
          throw new UtsuriError(
            "CLI_BOOLEAN_VALUE",
            `${name} does not accept a value`,
            ExitCode.Arguments
          );
        options.set(name, true);
      } else if (valueOptions.has(name)) {
        const next = inline ?? argv[index + 1];
        if (!next || (inline === undefined && next.startsWith("--"))) {
          throw new UtsuriError(
            "CLI_MISSING_VALUE",
            `${name} requires a value`,
            ExitCode.Arguments
          );
        }
        options.set(name, next);
        if (inline === undefined) index += 1;
      } else {
        throw new UtsuriError("CLI_UNKNOWN_OPTION", `Unknown option: ${name}`, ExitCode.Arguments);
      }
    } else if (!command) command = value;
    else positionals.push(value);
  }

  return { command, positionals, options, json: options.has("--json") };
}

export function optionString(arguments_: ParsedArguments, name: string): string | undefined {
  const value = arguments_.options.get(name);
  return typeof value === "string" ? value : undefined;
}
