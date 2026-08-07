import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os, { arch, platform } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertSafeChainUnchanged,
  isDirectExecution,
  validateSafeChainExecutable
} from "./safe-chain.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Safe-chain trust boundary", () => {
  test("recognizes direct execution from an encoded checkout path", () => {
    const filename = path.join(os.tmpdir(), "utsuri path # encoded", "safe-chain.mjs");
    expect(isDirectExecution(pathToFileURL(filename).href, filename)).toBe(true);
  });

  test("rejects an unapproved digest before executing the candidate", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "utsuri-safe-chain-"));
    temporaryDirectories.push(directory);
    const candidate = path.join(directory, "safe-chain");
    const marker = path.join(directory, "executed");
    await writeFile(
      candidate,
      `#!/bin/sh\nprintf executed > "${marker}"\nprintf 'Current safe-chain version: 1.5.14\\n'\n`
    );
    await chmod(candidate, 0o755);

    await expect(
      validateSafeChainExecutable(candidate, {
        safeChain: {
          version: "1.5.14",
          sha256: { [`${platform()}-${arch()}`]: "0".repeat(64) }
        }
      })
    ).rejects.toThrow("digest mismatch");
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("rejects replacement after digest and version verification", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "utsuri-safe-chain-"));
    temporaryDirectories.push(directory);
    const candidate = path.join(directory, "safe-chain");
    const executable = "#!/bin/sh\nprintf 'Current safe-chain version: 1.5.14\\n'\n";
    await writeFile(candidate, executable);
    await chmod(candidate, 0o755);
    const verified = await validateSafeChainExecutable(candidate, {
      safeChain: {
        version: "1.5.14",
        sha256: {
          [`${platform()}-${arch()}`]: createHash("sha256").update(executable).digest("hex")
        }
      }
    });

    await writeFile(candidate, `${executable}# replaced\n`);
    await chmod(candidate, 0o755);

    await expect(assertSafeChainUnchanged(candidate, verified.identity)).rejects.toThrow(
      "changed after digest verification"
    );
  });
});
