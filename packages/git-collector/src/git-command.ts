import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

const maximumGitOutputBytes = 64 * 1024 * 1024;
const gitTimeoutMilliseconds = 60_000;

interface GitExecution {
  stdout: Buffer;
  stderr: Buffer;
  status: number;
}

async function execute(
  cwd: string,
  args: readonly string[],
  options: { expectedStatuses?: readonly number[]; stdin?: string } = {}
): Promise<GitExecution> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timeout = { value: undefined as ReturnType<typeof setTimeout> | undefined };
    const finish = (error?: Error, result?: GitExecution) => {
      if (settled) return;
      settled = true;
      if (timeout.value) clearTimeout(timeout.value);
      if (error) reject(error);
      else resolve(result!);
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maximumGitOutputBytes) {
        child.kill("SIGKILL");
        finish(
          new UtsuriError(
            "GIT_OUTPUT_LIMIT",
            `Git output exceeds ${maximumGitOutputBytes} bytes`,
            ExitCode.Artifact
          )
        );
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") finish(error);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (status) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        status: status ?? 1
      };
      const expected = options.expectedStatuses ?? [0];
      if (!expected.includes(result.status)) {
        const diagnostic = result.stderr.toString("utf8").trim().slice(0, 2_000);
        finish(
          new UtsuriError(
            "GIT_COMMAND_FAILED",
            diagnostic || `git ${args[0] ?? "command"} exited ${result.status}`,
            ExitCode.Artifact
          )
        );
      } else finish(undefined, result);
    });
    timeout.value = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        new UtsuriError(
          "GIT_COMMAND_TIMEOUT",
          `Git command exceeded ${gitTimeoutMilliseconds} ms`,
          ExitCode.Environment
        )
      );
    }, gitTimeoutMilliseconds);
    child.stdin.end(options.stdin ?? "");
  });
}

export async function repositoryRoot(cwd: string): Promise<string> {
  const requested = await realpath(cwd);
  const result = await execute(requested, ["rev-parse", "--show-toplevel"]);
  const root = await realpath(result.stdout.toString("utf8").trim());
  const relative = path.relative(root, requested);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new UtsuriError(
      "GIT_ROOT_MISMATCH",
      "Current directory is outside the resolved repository root",
      ExitCode.Security
    );
  }
  return root;
}

export async function resolveCommit(root: string, reference: string): Promise<string> {
  const containsControlCharacter = [...reference].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });
  if (
    !reference ||
    reference.length > 1024 ||
    containsControlCharacter ||
    reference.startsWith("-")
  ) {
    throw new UtsuriError(
      "GIT_REF_INVALID",
      "Git references must be plain non-option values",
      ExitCode.Arguments
    );
  }
  const result = await execute(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${reference}^{commit}`
  ]);
  return result.stdout.toString("utf8").trim();
}

export async function emptyTree(root: string): Promise<string> {
  const result = await execute(root, ["mktree"], { stdin: "" });
  return result.stdout.toString("utf8").trim();
}

export async function gitBuffer(
  root: string,
  args: readonly string[],
  expectedStatuses: readonly number[] = [0],
  stdin?: string
): Promise<Buffer> {
  return (await execute(root, args, { expectedStatuses, stdin })).stdout;
}
