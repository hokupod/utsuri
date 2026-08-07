import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

export interface FileIdentity {
  dev: number | bigint;
  ino: number | bigint;
}

const helperExit = {
  destinationExists: 65,
  identityMismatch: 66,
  unsupported: 67
} as const;

async function resolveNativeHelper(): Promise<string> {
  const target = `${process.platform}-${process.arch}`;
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDirectory, "native", target, "utsuri-fs-ops"),
    path.resolve(moduleDirectory, "../../..", ".artifacts/native", target, "utsuri-fs-ops")
  ];

  for (const candidate of candidates) {
    try {
      const candidateStat = await lstat(candidate);
      if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) continue;
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw new UtsuriError(
    "REPORT_ATOMIC_PUBLISH_UNAVAILABLE",
    `The atomic publication helper is unavailable for ${target}`,
    ExitCode.Environment
  );
}

async function runNativeHelper(
  helper: string,
  args: string[]
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(helper, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    const errorStream = child.stderr;
    if (!errorStream) {
      reject(new Error("Atomic publication helper stderr is unavailable"));
      return;
    }
    errorStream.setEncoding("utf8");
    errorStream.on("data", (chunk: string) => {
      if (stderr.length < 8_192) stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stderr: stderr.trim() }));
  });
}

export async function publishDirectoryNoReplace(
  parentPath: string,
  parentHandle: FileHandle,
  parentIdentity: FileIdentity,
  sourceName: string,
  destinationName: string,
  sourceIdentity: FileIdentity
): Promise<void> {
  const helper = await resolveNativeHelper();
  const retainedIdentity = await parentHandle.stat({ bigint: true });
  if (
    !retainedIdentity.isDirectory() ||
    String(retainedIdentity.dev) !== String(parentIdentity.dev) ||
    String(retainedIdentity.ino) !== String(parentIdentity.ino)
  ) {
    throw new UtsuriError(
      "REPORT_PUBLISH_IDENTITY_CHANGED",
      "The retained report publication directory changed before helper execution",
      ExitCode.Security
    );
  }
  const result = await runNativeHelper(helper, [
    "publish-contained",
    parentPath,
    sourceName,
    destinationName,
    String(parentIdentity.dev),
    String(parentIdentity.ino),
    String(sourceIdentity.dev),
    String(sourceIdentity.ino)
  ]);

  if (result.code === 0) return;
  if (result.code === helperExit.destinationExists) {
    throw new UtsuriError(
      "REPORT_IMMUTABLE",
      "The immutable report destination appeared during generation",
      ExitCode.Artifact
    );
  }
  if (result.code === helperExit.identityMismatch) {
    throw new UtsuriError(
      "REPORT_PUBLISH_IDENTITY_CHANGED",
      "The report publication namespace or validated staging directory changed",
      ExitCode.Security
    );
  }
  if (result.code === helperExit.unsupported) {
    throw new UtsuriError(
      "REPORT_ATOMIC_PUBLISH_UNAVAILABLE",
      result.stderr || "The filesystem does not support atomic no-replace publication",
      ExitCode.Environment
    );
  }
  throw new UtsuriError(
    "REPORT_ATOMIC_PUBLISH_FAILED",
    result.stderr ||
      `The atomic publication helper exited with ${result.signal ?? result.code ?? "unknown"}`,
    ExitCode.Environment
  );
}
