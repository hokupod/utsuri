import { execFileSync, spawn } from "node:child_process";
import { constants, realpathSync, statSync, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { resolveNativeHelper } from "@utsu-ri/security";

const maximumNixWrapperBytes = 1024 * 1024;
const maximumTrackedBrowserParents = 8;
const nixChromiumWrapperPattern = /^\/nix\/store\/[0-9a-z]{32}-[^/]+\/bin\/chromium(?:-browser)?$/u;
const nixChromiumExecutablePattern =
  /^\/nix\/store\/[0-9a-z]{32}-[^/]+\/libexec\/chromium\/chromium$/u;
const nixChromiumTargetPattern =
  /^exec(?: -a "\$0")? "(\/nix\/store\/[0-9a-z]{32}-[^"\r\n]+\/libexec\/chromium\/chromium)"(?:\s|$)/gmu;

function trackingUnavailable(message: string): UtsuriError {
  return new UtsuriError("CAPTURE_BROWSER_TRACKING_UNAVAILABLE", message, ExitCode.Environment);
}

function ownershipAmbiguous(message: string): UtsuriError {
  return new UtsuriError("CAPTURE_BROWSER_PROCESS_AMBIGUOUS", message, ExitCode.Environment);
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function verifyReadOnlyNixExecutable(
  filename: string,
  label: string,
  maximumBytes?: number
): Promise<Buffer | null> {
  if ((await realpath(filename)) !== filename) {
    throw trackingUnavailable(`${label} path is not canonical`);
  }
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const [openedStat, pathStat] = await Promise.all([handle.stat(), lstat(filename)]);
    if (
      !openedStat.isFile() ||
      !sameFileIdentity(openedStat, pathStat) ||
      (openedStat.mode & 0o222) !== 0 ||
      (openedStat.mode & 0o111) === 0 ||
      (maximumBytes !== undefined && openedStat.size > maximumBytes)
    ) {
      throw trackingUnavailable(`${label} is not a bounded read-only executable file`);
    }
    const bytes = maximumBytes === undefined ? null : await handle.readFile();
    const [openedAfter, pathAfter, canonicalAfter] = await Promise.all([
      handle.stat(),
      lstat(filename),
      realpath(filename)
    ]);
    if (
      canonicalAfter !== filename ||
      !sameFileIdentity(openedStat, openedAfter) ||
      !sameFileIdentity(openedStat, pathAfter) ||
      openedAfter.size !== openedStat.size ||
      openedAfter.mode !== openedStat.mode ||
      (bytes !== null &&
        maximumBytes !== undefined &&
        (bytes.byteLength !== openedStat.size || bytes.byteLength > maximumBytes))
    ) {
      throw trackingUnavailable(`${label} changed while its identity was being verified`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export function nixChromiumWrapperTarget(
  executablePath: string,
  wrapperSource: string
): string | null {
  if (!nixChromiumWrapperPattern.test(executablePath) || !wrapperSource.startsWith("#!")) {
    return null;
  }
  const targets = new Set(
    [...wrapperSource.matchAll(nixChromiumTargetPattern)].map((match) => match[1]!)
  );
  if (targets.size !== 1) return null;
  const target = [...targets][0]!;
  return path.posix.normalize(target) === target ? target : null;
}

export async function resolveTrackedBrowserExecutablePaths(
  executablePath: string
): Promise<ReadonlySet<string>> {
  try {
    const canonicalExecutablePath = await realpath(executablePath);
    const paths = new Set([canonicalExecutablePath]);
    if (!nixChromiumWrapperPattern.test(canonicalExecutablePath)) return paths;
    const wrapperBytes = await verifyReadOnlyNixExecutable(
      canonicalExecutablePath,
      "The Nix Chromium wrapper",
      maximumNixWrapperBytes
    );
    const target = nixChromiumWrapperTarget(
      canonicalExecutablePath,
      wrapperBytes!.toString("utf8")
    );
    if (!target) {
      throw trackingUnavailable("The Nix Chromium wrapper has no unique immutable exec target");
    }
    await verifyReadOnlyNixExecutable(target, "The Nix Chromium exec target");
    paths.add(target);
    return paths;
  } catch (error) {
    if (error instanceof UtsuriError) throw error;
    throw trackingUnavailable(
      `Browser executable process tracking failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function browserProcessOwnershipAmbiguous(...observations: ReadonlySet<number>[]): boolean {
  return new Set(observations.flatMap((processIds) => [...processIds])).size > 1;
}

function processArgument(command: string, argument: string): boolean {
  return command.split(/\s+/u).includes(argument);
}

export function trackedBrowserProcessIds(
  processList: string,
  executablePaths: string | ReadonlySet<string>,
  captureToken: string,
  expectedParentProcessId: number
): Set<number> {
  const marker = `--utsuri-capture-token=${captureToken}`;
  const approvedPaths =
    typeof executablePaths === "string" ? new Set([executablePaths]) : executablePaths;
  const processIds = new Set<number>();
  for (const line of processList.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    const processId = Number(match[1]);
    const parentProcessId = Number(match[2]);
    const command = match[3]!;
    if (
      Number.isSafeInteger(processId) &&
      processId > 0 &&
      parentProcessId === expectedParentProcessId &&
      [...approvedPaths].some(
        (executablePath) => command === executablePath || command.startsWith(`${executablePath} `)
      ) &&
      processArgument(command, marker) &&
      processArgument(command, "--remote-debugging-pipe")
    ) {
      processIds.add(processId);
    }
  }
  return processIds;
}

interface LinuxExecutableIdentity {
  path: string;
  stat: Stats;
}

function linuxProcessExecutableIdentityMatches(
  processId: number,
  expected: LinuxExecutableIdentity
): boolean {
  const processExecutable = `/proc/${processId}/exe`;
  try {
    const canonicalBefore = realpathSync(processExecutable);
    const identityBefore = statSync(processExecutable);
    if (canonicalBefore !== expected.path || !sameFileIdentity(identityBefore, expected.stat)) {
      return false;
    }
    const canonicalAfter = realpathSync(processExecutable);
    const identityAfter = statSync(processExecutable);
    return canonicalAfter === expected.path && sameFileIdentity(identityBefore, identityAfter);
  } catch {
    return false;
  }
}

export interface LinuxExecutableIdentityInspection {
  processIds: Set<number>;
  rejectedProcessIds: Set<number>;
}

export function inspectLinuxExecutableIdentityMatches(
  processIds: ReadonlySet<number>,
  executablePaths: ReadonlySet<string>,
  identityMatches?: (processId: number, executablePath: string) => boolean
): LinuxExecutableIdentityInspection {
  const wrapperPaths = [...executablePaths].filter((entry) =>
    nixChromiumWrapperPattern.test(entry)
  );
  const executableTargets = [...executablePaths].filter((entry) =>
    nixChromiumExecutablePattern.test(entry)
  );
  if (wrapperPaths.length > 0 && executableTargets.length !== 1) {
    throw trackingUnavailable("The Nix Chromium process identity is incomplete or ambiguous");
  }
  let identities: LinuxExecutableIdentity[];
  try {
    const identityPaths =
      wrapperPaths.length > 0
        ? executableTargets
        : [...new Set([...executablePaths].map((entry) => realpathSync(entry)))];
    identities = identityPaths.map((executablePath) => {
      const identity = statSync(executablePath);
      if (!identity.isFile() || (identity.mode & 0o111) === 0) {
        throw new Error("approved browser executable identity is invalid");
      }
      return { path: executablePath, stat: identity };
    });
  } catch (error) {
    throw trackingUnavailable(
      `The approved Linux browser executable identity is unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const retained = new Set<number>();
  const rejectedProcessIds = new Set<number>();
  for (const processId of processIds) {
    const matched = identityMatches
      ? identities.some(({ path: executablePath }) => identityMatches(processId, executablePath))
      : identities.some((identity) => linuxProcessExecutableIdentityMatches(processId, identity));
    if (!matched) {
      rejectedProcessIds.add(processId);
      continue;
    }
    retained.add(processId);
  }
  return { processIds: retained, rejectedProcessIds };
}

export function retainLinuxExecutableIdentityMatches(
  processIds: ReadonlySet<number>,
  executablePaths: ReadonlySet<string>,
  identityMatches?: (processId: number, executablePath: string) => boolean
): Set<number> {
  const inspection = inspectLinuxExecutableIdentityMatches(
    processIds,
    executablePaths,
    identityMatches
  );
  if (inspection.rejectedProcessIds.size > 0) {
    throw trackingUnavailable(
      "A text-matched Linux browser process did not retain its approved executable identity"
    );
  }
  return inspection.processIds;
}

export interface BrowserProcessObservation {
  processIds: Set<number>;
  candidateProcessIds: Set<number>;
  error: UtsuriError | null;
}

function browserTrackingError(error: unknown): UtsuriError {
  if (error instanceof UtsuriError) return error;
  return trackingUnavailable(
    `Browser process tracking failed: ${error instanceof Error ? error.message : String(error)}`
  );
}

export function observeTrackedBrowserProcessIds(
  executablePaths: string | ReadonlySet<string>,
  captureToken: string
): BrowserProcessObservation {
  if (process.platform === "win32") {
    return {
      processIds: new Set(),
      candidateProcessIds: new Set(),
      error: trackingUnavailable("Browser process tracking is unavailable on Windows")
    };
  }
  try {
    const output = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    });
    const processIds = trackedBrowserProcessIds(output, executablePaths, captureToken, process.pid);
    if (process.platform !== "linux") {
      return { processIds, candidateProcessIds: new Set(processIds), error: null };
    }
    const approvedPaths =
      typeof executablePaths === "string" ? new Set([executablePaths]) : executablePaths;
    const inspection = inspectLinuxExecutableIdentityMatches(processIds, approvedPaths);
    return {
      processIds: inspection.processIds,
      candidateProcessIds: processIds,
      error:
        inspection.rejectedProcessIds.size > 0
          ? trackingUnavailable(
              "A text-matched Linux browser process did not retain its approved executable identity"
            )
          : null
    };
  } catch (error) {
    return {
      processIds: new Set(),
      candidateProcessIds: new Set(),
      error: browserTrackingError(error)
    };
  }
}

export function currentTrackedBrowserProcessIds(
  executablePaths: string | ReadonlySet<string>,
  captureToken: string
): Set<number> {
  const observation = observeTrackedBrowserProcessIds(executablePaths, captureToken);
  if (observation.error) throw observation.error;
  return observation.processIds;
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
  timeoutMs: number,
  stillTracked: (processId: number) => boolean = () => true
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while ([...processIds].some((processId) => processAlive(processId) && stillTracked(processId))) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

export async function terminateTrackedBrowserProcesses(
  processIds: ReadonlySet<number>,
  stillTracked: (processId: number) => boolean = () => true
): Promise<boolean> {
  if (processIds.size === 0) return true;
  if (process.platform === "linux") {
    throw trackingUnavailable("Linux browser processes require pidfd cleanup");
  }
  for (const processId of processIds) {
    try {
      if (processAlive(processId) && stillTracked(processId)) process.kill(processId, "SIGTERM");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const processId of processIds) {
    try {
      if (processAlive(processId) && stillTracked(processId)) process.kill(processId, "SIGKILL");
    } catch {
      // The process exited between the liveness check and signal.
    }
  }
  return await waitForTrackedBrowserProcesses(processIds, 1000, stillTracked);
}

async function runPidfdBrowserTermination(
  helper: string,
  processId: number,
  executablePaths: ReadonlySet<string>,
  captureToken: string
): Promise<void> {
  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    timedOut: boolean;
  }>((resolve, reject) => {
    const child = spawn(
      helper,
      ["browser-terminate", String(processId), captureToken, ...executablePaths],
      { env: {}, shell: false, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    let timedOut = false;
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      if (stderr.length < 8_192) stderr += chunk;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 3000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stderr: stderr.trim(), timedOut });
    });
  });
  if (result.code === 0 && !result.timedOut) return;
  if (result.code === 66 || result.code === 67 || result.code === 73) {
    throw trackingUnavailable(
      result.stderr || "Stable Linux browser process ownership could not be established"
    );
  }
  throw new UtsuriError(
    "CAPTURE_BROWSER_CLEANUP_FAILED",
    result.stderr ||
      `The pidfd browser cleanup helper exited with ${result.timedOut ? "a timeout" : (result.signal ?? result.code ?? "an unknown result")}`,
    ExitCode.Environment
  );
}

export async function terminateOwnedBrowserProcesses(
  processIds: ReadonlySet<number>,
  executablePaths: ReadonlySet<string>,
  captureToken: string
): Promise<boolean> {
  if (processIds.size === 0) return true;
  if (processIds.size > maximumTrackedBrowserParents) {
    throw trackingUnavailable("The tracked browser parent count exceeds the cleanup bound");
  }
  if (processIds.size > 1) {
    throw ownershipAmbiguous("Multiple browser parents cannot be safely terminated");
  }
  if (process.platform !== "linux") {
    return await terminateTrackedBrowserProcesses(processIds, (processId) =>
      currentTrackedBrowserProcessIds(executablePaths, captureToken).has(processId)
    );
  }
  if (executablePaths.size < 1 || executablePaths.size > 2) {
    throw trackingUnavailable("Linux browser cleanup requires one or two executable identities");
  }
  const helper = await resolveNativeHelper();
  if (!helper) {
    throw trackingUnavailable("The pidfd browser cleanup helper is unavailable");
  }

  const results = await Promise.allSettled(
    [...processIds].map((processId) =>
      runPidfdBrowserTermination(helper, processId, executablePaths, captureToken)
    )
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failed) throw failed.reason;
  return true;
}

export async function terminateObservedBrowserProcesses(
  initialProcessIds: ReadonlySet<number>,
  observeProcessIds: () => ReadonlySet<number>,
  terminateProcessIds: (processIds: ReadonlySet<number>) => Promise<boolean>,
  settle: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 25))
): Promise<{ complete: boolean; observedProcessIds: ReadonlySet<number> }> {
  const observedProcessIds = new Set(initialProcessIds);
  let pendingProcessIds = new Set(initialProcessIds);

  for (let pass = 0; pass < 3; pass += 1) {
    if (pendingProcessIds.size > 0) await terminateProcessIds(pendingProcessIds);
    await settle();
    const currentProcessIds = observeProcessIds();
    for (const processId of currentProcessIds) observedProcessIds.add(processId);
    pendingProcessIds = new Set(currentProcessIds);
  }

  if (pendingProcessIds.size > 0) {
    await terminateProcessIds(pendingProcessIds);
    return { complete: false, observedProcessIds };
  }
  return { complete: true, observedProcessIds };
}
