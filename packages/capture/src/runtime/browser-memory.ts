import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, realpath, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { resolveNativeHelper as resolveDistributedNativeHelper } from "@utsu-ri/security";

export interface BrowserMemoryBoundary {
  supported: true;
  launcherPath: string;
  environment: Readonly<Record<string, string>>;
  cleanup(): Promise<void>;
}

export interface BrowserMemoryBoundaryUnavailable {
  supported: false;
  reason: "browser-memory-isolation-requires-delegated-cgroup-v2";
}

export type BrowserMemoryBoundaryResult = BrowserMemoryBoundary | BrowserMemoryBoundaryUnavailable;

const unavailable = Object.freeze({
  supported: false,
  reason: "browser-memory-isolation-requires-delegated-cgroup-v2"
} satisfies BrowserMemoryBoundaryUnavailable);

function currentUnifiedCgroup(value: string): string | null {
  const entries = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("0::"));
  if (entries.length !== 1) return null;
  const membership = entries[0]!.slice(3);
  if (!membership.startsWith("/") || membership.includes("\0") || membership.includes("..")) {
    return null;
  }
  return membership;
}

async function resolveNativeHelper(): Promise<string | null> {
  return resolveDistributedNativeHelper();
}

async function writeOptionalControl(filename: string, value: string): Promise<void> {
  try {
    await access(filename, constants.W_OK);
    await writeFile(filename, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function destroyBoundary(directory: string): Promise<void> {
  try {
    await writeFile(path.join(directory, "cgroup.kill"), "1");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        await lstat(directory);
      } catch (directoryError) {
        if ((directoryError as NodeJS.ErrnoException).code === "ENOENT") return;
      }
    }
    throw new UtsuriError(
      "CAPTURE_BROWSER_CLEANUP_FAILED",
      "Browser cgroup could not terminate its process tree",
      ExitCode.Environment
    );
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const events = await readFile(path.join(directory, "cgroup.events"), "utf8");
      const populated = /^populated ([01])$/mu.exec(events)?.[1];
      if (!populated) throw new Error("browser cgroup has invalid lifecycle state");
      if (populated === "1") {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      await rmdir(directory);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        try {
          await lstat(directory);
        } catch (directoryError) {
          if ((directoryError as NodeJS.ErrnoException).code === "ENOENT") return;
        }
      }
      if (code !== "EBUSY" && code !== "ENOTEMPTY") {
        throw new UtsuriError(
          "CAPTURE_BROWSER_CLEANUP_FAILED",
          "Browser cgroup cleanup could not be verified",
          ExitCode.Environment
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new UtsuriError(
    "CAPTURE_BROWSER_CLEANUP_FAILED",
    "Browser cgroup remained populated after bounded cleanup",
    ExitCode.Environment
  );
}

export async function prepareBrowserMemoryBoundary(
  browserExecutable: string,
  maximumMemoryMiB: number
): Promise<BrowserMemoryBoundaryResult> {
  if (process.platform !== "linux") return unavailable;
  let directory: string | null = null;
  try {
    const [cgroupRoot, membershipText, launcherPath] = await Promise.all([
      realpath("/sys/fs/cgroup"),
      readFile("/proc/self/cgroup", "utf8"),
      resolveNativeHelper()
    ]);
    const membership = currentUnifiedCgroup(membershipText);
    if (!membership || !launcherPath) return unavailable;
    const parent = path.resolve(cgroupRoot, membership.slice(1));
    const relativeParent = path.relative(cgroupRoot, parent);
    if (
      relativeParent === ".." ||
      relativeParent.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeParent)
    ) {
      return unavailable;
    }
    directory = path.join(parent, `utsuri-browser-${process.pid}-${randomUUID()}`);
    await mkdir(directory, { mode: 0o700 });
    const identity = await lstat(directory);
    if (!identity.isDirectory() || identity.isSymbolicLink()) throw new Error("invalid cgroup");
    const maximumBytes = maximumMemoryMiB * 1024 * 1024;
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new Error("invalid limit");
    await writeFile(path.join(directory, "memory.max"), String(maximumBytes));
    await Promise.all([
      access(path.join(directory, "cgroup.procs"), constants.W_OK),
      access(path.join(directory, "cgroup.events"), constants.R_OK),
      access(path.join(directory, "cgroup.kill"), constants.W_OK)
    ]);
    await writeOptionalControl(path.join(directory, "memory.swap.max"), "0");
    await writeOptionalControl(path.join(directory, "memory.oom.group"), "1");
    await writeOptionalControl(path.join(directory, "pids.max"), "128");
    return {
      supported: true,
      launcherPath,
      environment: Object.freeze({
        UTSURI_BROWSER_EXECUTABLE: browserExecutable,
        UTSURI_BROWSER_CGROUP_PROCS: path.join(directory, "cgroup.procs")
      }),
      cleanup: async () => destroyBoundary(directory!)
    };
  } catch {
    if (directory) await destroyBoundary(directory);
    return unavailable;
  }
}
