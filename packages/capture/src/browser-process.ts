import { execFileSync } from "node:child_process";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

function processArgument(command: string, argument: string): boolean {
  return command.split(/\s+/u).includes(argument);
}

export function trackedBrowserProcessIds(
  processList: string,
  executablePath: string,
  captureToken: string
): Set<number> {
  const marker = `--utsuri-capture-token=${captureToken}`;
  const processIds = new Set<number>();
  for (const line of processList.split("\n")) {
    const match = /^\s*(\d+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    const processId = Number(match[1]);
    const command = match[2]!;
    if (
      Number.isSafeInteger(processId) &&
      processId > 0 &&
      (command === executablePath || command.startsWith(`${executablePath} `)) &&
      processArgument(command, marker) &&
      processArgument(command, "--remote-debugging-pipe")
    ) {
      processIds.add(processId);
    }
  }
  return processIds;
}

export function currentTrackedBrowserProcessIds(
  executablePath: string,
  captureToken: string
): Set<number> {
  if (process.platform === "win32") {
    throw new UtsuriError(
      "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
      "Browser process tracking is unavailable on Windows",
      ExitCode.Environment
    );
  }
  try {
    const output = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    });
    return trackedBrowserProcessIds(output, executablePath, captureToken);
  } catch (error) {
    throw new UtsuriError(
      "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
      `Browser process tracking failed: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.Environment
    );
  }
}

function processAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitForTrackedBrowserProcesses(
  processIds: ReadonlySet<number>,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while ([...processIds].some(processAlive)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

export async function terminateTrackedBrowserProcesses(
  processIds: ReadonlySet<number>
): Promise<boolean> {
  if (processIds.size === 0) return true;
  for (const processId of processIds) {
    try {
      if (processAlive(processId)) process.kill(processId, "SIGTERM");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const processId of processIds) {
    try {
      if (processAlive(processId)) process.kill(processId, "SIGKILL");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
  return await waitForTrackedBrowserProcesses(processIds, 1000);
}
