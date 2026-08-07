import { execFileSync } from "node:child_process";

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

export function directTrackedBrowserProcessIds(
  executablePath: string,
  captureToken: string
): Set<number> {
  if (process.platform === "win32") return new Set();
  try {
    const output = execFileSync("ps", ["-o", "pid=,command=", "-P", String(process.pid)], {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return trackedBrowserProcessIds(output, executablePath, captureToken);
  } catch {
    return new Set();
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

export async function terminateTrackedBrowserProcesses(
  processIds: ReadonlySet<number>
): Promise<void> {
  if (processIds.size === 0) return;
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
}
