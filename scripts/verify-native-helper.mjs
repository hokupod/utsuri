#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeBinary, nativeProofTests } from "./assemble-release-package.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(helper, args) {
  return spawnSync(helper, args, {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000
  });
}

function requireResult(result, expectedStatus, label) {
  if (result.error) throw result.error;
  if (result.signal || result.status !== expectedStatus) {
    throw new Error(
      `${label} failed: status=${result.status ?? "none"} signal=${result.signal ?? "none"} stderr=${result.stderr.trim()}`
    );
  }
}

async function writeProof(filename, proof) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_TRUNC |
    constants.O_CLOEXEC |
    constants.O_NOFOLLOW;
  const handle = await open(filename, flags, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(proof, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(filename, 0o600);
}

export async function verifyNativeHelper({ helper, output, source, target }) {
  const currentTarget = `${process.platform}-${process.arch}`;
  if (target !== currentTarget) {
    throw new Error(`Native helper target ${target} does not match runner ${currentTarget}`);
  }
  const [helperStat, helperBytes, sourceBytes] = await Promise.all([
    lstat(helper),
    readFile(helper),
    readFile(source)
  ]);
  if (!helperStat.isFile() || helperStat.isSymbolicLink() || (helperStat.mode & 0o111) === 0) {
    throw new Error("Native helper must be a regular executable file");
  }
  assertNativeBinary(helperBytes, target);
  const sourceText = sourceBytes.toString("utf8");
  if (/\brename\s*\(|\brenameat\s*\(/u.test(sourceText)) {
    throw new Error("Native helper source contains a replace-capable rename fallback");
  }

  const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-native-proof-"));
  await chmod(scratch, 0o700);
  try {
    await mkdir(path.join(scratch, "data"), { mode: 0o700 });
    await writeFile(path.join(scratch, "data/value.txt"), "native-proof\n", { mode: 0o600 });
    const rootIdentity = await stat(scratch, { bigint: true });
    const readResult = run(helper, [
      "read-contained-root",
      scratch,
      "data/value.txt",
      "1024",
      String(rootIdentity.dev),
      String(rootIdentity.ino)
    ]);
    requireResult(readResult, 0, "contained read");
    if (readResult.stdout !== "native-proof\n" || readResult.stderr !== "") {
      throw new Error("Contained read did not preserve the exact byte protocol");
    }

    const traversalResult = run(helper, [
      "read-contained-root",
      scratch,
      "../value.txt",
      "1024",
      String(rootIdentity.dev),
      String(rootIdentity.ino)
    ]);
    requireResult(traversalResult, 69, "path rejection");

    await mkdir(path.join(scratch, "staging"), { mode: 0o700 });
    const sourceIdentity = await stat(path.join(scratch, "staging"), { bigint: true });
    const publishArgs = [
      "publish-contained",
      scratch,
      "staging",
      "report",
      String(rootIdentity.dev),
      String(rootIdentity.ino),
      String(sourceIdentity.dev),
      String(sourceIdentity.ino)
    ];
    requireResult(run(helper, publishArgs), 0, "no-replace publication");
    const publishedIdentity = await stat(path.join(scratch, "report"), { bigint: true });
    if (
      publishedIdentity.dev !== sourceIdentity.dev ||
      publishedIdentity.ino !== sourceIdentity.ino
    ) {
      throw new Error("Published directory identity changed");
    }

    await mkdir(path.join(scratch, "staging-second"), { mode: 0o700 });
    const secondIdentity = await stat(path.join(scratch, "staging-second"), { bigint: true });
    requireResult(
      run(helper, [
        "publish-contained",
        scratch,
        "staging-second",
        "report",
        String(rootIdentity.dev),
        String(rootIdentity.ino),
        String(secondIdentity.dev),
        String(secondIdentity.ino)
      ]),
      65,
      "destination collision"
    );

    const proofTests = nativeProofTests(target);
    if (process.platform === "linux") {
      const executable = await realpath(process.execPath);
      const token = "native-proof-token";
      const marker = `--utsuri-capture-token=${token}`;
      const child = spawn(
        executable,
        ["-e", "setInterval(() => {}, 1000)", "--", marker, "--remote-debugging-pipe"],
        { stdio: "ignore" }
      );
      await once(child, "spawn");
      const childExit = once(child, "exit");
      requireResult(
        run(helper, ["browser-terminate", String(child.pid), token, executable]),
        0,
        "pidfd browser termination"
      );
      await childExit;

      const forgedExecutable = await realpath("/bin/sh");
      const forged = spawn(
        executable,
        ["-e", "setInterval(() => {}, 1000)", "--", marker, "--remote-debugging-pipe"],
        { argv0: forgedExecutable, stdio: "ignore" }
      );
      await once(forged, "spawn");
      try {
        requireResult(
          run(helper, ["browser-terminate", String(forged.pid), token, forgedExecutable]),
          66,
          "pidfd forged executable rejection"
        );
        process.kill(forged.pid, 0);
      } finally {
        if (forged.exitCode === null && forged.signalCode === null) {
          forged.kill("SIGKILL");
          await once(forged, "exit");
        }
      }

      const foreignParent = spawn(
        executable,
        [
          "-e",
          [
            'const { spawn } = require("node:child_process");',
            'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "--", ...process.argv.slice(1)], { stdio: "ignore" });',
            "process.stdout.write(`${child.pid}\\n`);",
            'process.on("SIGTERM", () => child.kill("SIGKILL"));',
            'child.on("exit", () => process.exit(0));',
            "setInterval(() => {}, 1000);"
          ].join("\n"),
          "--",
          marker,
          "--remote-debugging-pipe"
        ],
        { stdio: ["ignore", "pipe", "ignore"] }
      );
      await once(foreignParent, "spawn");
      const [foreignPidBytes] = await once(foreignParent.stdout, "data");
      const foreignPid = Number(String(foreignPidBytes).trim());
      if (!Number.isSafeInteger(foreignPid) || foreignPid <= 0) {
        throw new Error("foreign browser proof did not report a valid process identifier");
      }
      try {
        requireResult(
          run(helper, ["browser-terminate", String(foreignPid), token, executable]),
          66,
          "pidfd foreign parent rejection"
        );
        process.kill(foreignPid, 0);
      } finally {
        const foreignParentExit = once(foreignParent, "exit");
        try {
          process.kill(foreignPid, "SIGKILL");
        } catch {
          foreignParent.kill("SIGKILL");
        }
        await foreignParentExit;
      }
    }

    const proof = {
      schemaVersion: "1.0",
      target,
      sourceSha256: sha256(sourceBytes),
      helperSha256: sha256(helperBytes),
      tests: proofTests
    };
    await writeProof(output, proof);
    return proof;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = option("--target") ?? `${process.platform}-${process.arch}`;
  const helper =
    option("--helper") ?? path.join(repositoryRoot, ".artifacts/native", target, "utsuri-fs-ops");
  const output =
    option("--output") ?? path.join(repositoryRoot, ".artifacts/native", target, "proof.json");
  const source = option("--source") ?? path.join(repositoryRoot, "native/utsuri-fs-ops.c");
  await verifyNativeHelper({ helper, output, source, target });
  console.log(`Verified native helper for ${target}`);
}
