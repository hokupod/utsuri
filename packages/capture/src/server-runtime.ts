import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import {
  assertRuntimeCommand,
  buildChildEnvironment,
  resolveContainedPath
} from "@utsu-ri/security";
import type { ServerConfiguration } from "./types";

export interface ServerHandle {
  pid: number;
  readyUrl?: string;
  requestHeaders?: Readonly<Record<string, string>>;
  assertHealthy?(): void;
  stdout(): string;
  stderr(): string;
  stop(): Promise<void>;
}

const MAX_LOG_BYTES = 64 * 1024;

function appendBounded(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(-MAX_LOG_BYTES);
}

async function terminateProcessTree(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit").then(() => true);
  if (process.platform === "win32") child.kill("SIGTERM");
  else if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  const graceful = await Promise.race([
    exited,
    new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
  if (graceful) return;
  if (process.platform === "win32") child.kill("SIGKILL");
  else if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, Math.min(timeoutMs, 1000)))
  ]);
}

async function waitUntilReady(
  child: ChildProcess,
  readyUrl: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new UtsuriError(
        "CAPTURE_SERVER_EXITED",
        `Configured server exited before ${readyUrl} became ready`,
        ExitCode.Incomplete
      );
    }
    try {
      const response = await fetch(readyUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now())))
      });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Poll until the bounded server timeout expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new UtsuriError(
    "CAPTURE_SERVER_TIMEOUT",
    `Configured server did not become ready within ${timeoutMs}ms`,
    ExitCode.Incomplete
  );
}

export async function startConfiguredServer(
  repositoryRoot: string,
  configuration: ServerConfiguration,
  envAllowlist: readonly string[],
  timeoutMs: number
): Promise<ServerHandle> {
  if (!configuration.command || !configuration.cwd) {
    throw new UtsuriError(
      "CAPTURE_SERVER_NOT_EXPLICIT",
      "Server execution requires an explicit command and working directory",
      ExitCode.Arguments
    );
  }
  assertRuntimeCommand(configuration.command);
  const cwd = await resolveContainedPath(repositoryRoot, configuration.cwd);
  const command = configuration.command[0]!;
  const args = configuration.command.slice(1);
  const child = spawn(command, args, {
    cwd,
    env: buildChildEnvironment(process.env, envAllowlist),
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = appendBounded(stderr, chunk);
  });
  const spawnError = new Promise<never>((_, reject) => child.once("error", reject));
  try {
    await Promise.race([waitUntilReady(child, configuration.readyUrl, timeoutMs), spawnError]);
  } catch (error) {
    await terminateProcessTree(child, configuration.shutdownTimeoutMs);
    throw error;
  }
  if (!child.pid) {
    await terminateProcessTree(child, configuration.shutdownTimeoutMs);
    throw new UtsuriError(
      "CAPTURE_SERVER_PID_MISSING",
      "Configured server did not expose a process ID",
      ExitCode.Incomplete
    );
  }
  let stopped = false;
  return {
    pid: child.pid,
    readyUrl: configuration.readyUrl,
    stdout: () => stdout,
    stderr: () => stderr,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await terminateProcessTree(child, configuration.shutdownTimeoutMs);
    }
  };
}
