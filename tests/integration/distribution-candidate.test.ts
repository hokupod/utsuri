import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assembleDistributionCandidate,
  restorePluginArtifactModes,
  verifyDistributionCandidate
} from "../../scripts/assemble-distribution-candidate.mjs";
import { nativeTargets } from "../../scripts/assemble-release-package.mjs";
import { repositoryRoot } from "./capture-helpers";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureBinary(target: string): Buffer {
  const bytes = Buffer.alloc(64, 0);
  if (target.startsWith("linux-")) {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    bytes.writeUInt16LE(target.endsWith("-arm64") ? 183 : 62, 18);
  } else {
    bytes.set([0xcf, 0xfa, 0xed, 0xfe]);
    bytes.writeUInt32LE(target.endsWith("-arm64") ? 0x0100000c : 0x01000007, 4);
  }
  bytes.write(`fixture-${target}`, 32, "utf8");
  return bytes;
}

async function nativeFixtureRoot(base: string, targets = nativeTargets): Promise<string> {
  const root = path.join(base, "native");
  const sourceSha256 = sha256(await readFile(path.join(repositoryRoot, "native/utsuri-fs-ops.c")));
  for (const target of targets) {
    const targetRoot = path.join(root, target);
    await mkdir(targetRoot, { recursive: true, mode: 0o700 });
    const helper = fixtureBinary(target);
    await writeFile(path.join(targetRoot, "utsuri-fs-ops"), helper, { mode: 0o755 });
    await chmod(path.join(targetRoot, "utsuri-fs-ops"), 0o755);
    await writeFile(
      path.join(targetRoot, "proof.json"),
      `${JSON.stringify(
        {
          schemaVersion: "1.0",
          target,
          sourceSha256,
          helperSha256: sha256(helper),
          tests: ["architecture", "contained-read", "no-replace-publication", "path-rejection"]
        },
        null,
        2
      )}\n`,
      { mode: 0o600 }
    );
  }
  return root;
}

async function repositoryFixtureRoot(base: string, version: string): Promise<string> {
  const root = path.join(base, "repository");
  await mkdir(path.join(root, "packages/cli"), { recursive: true, mode: 0o700 });
  await Promise.all(
    [".codex-plugin", ".claude-plugin", "skills", "native", "packages/cli/dist"].map((entry) =>
      cp(path.join(repositoryRoot, entry), path.join(root, entry), { recursive: true })
    )
  );
  await Promise.all(
    ["README.md", "LICENSE"].map((entry) =>
      cp(path.join(repositoryRoot, entry), path.join(root, entry))
    )
  );
  const rootManifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8")
  );
  const cliManifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "packages/cli/package.json"), "utf8")
  );
  rootManifest.version = version;
  cliManifest.version = version;
  await Promise.all([
    writeFile(path.join(root, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`),
    writeFile(
      path.join(root, "packages/cli/package.json"),
      `${JSON.stringify(cliManifest, null, 2)}\n`
    )
  ]);
  return root;
}

describe("distribution candidate assembly", () => {
  test("requires and binds all four helper packages and aggregate Plugin copies", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-candidate-test-"));
    temporaryDirectories.push(scratch);
    const nativeRoot = await nativeFixtureRoot(scratch);
    const candidate = path.join(scratch, "candidate");
    const assembled = await assembleDistributionCandidate(candidate, nativeRoot, repositoryRoot);
    expect(assembled.manifest.targets).toEqual(nativeTargets);
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).resolves.toBeDefined();

    const pluginHelper = path.join(
      candidate,
      "plugin/skills/utsuri-review/scripts/native/linux-x64/utsuri-fs-ops"
    );
    await chmod(pluginHelper, 0o644);
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).rejects.toThrow(
      "does not match its manifest"
    );
    await expect(
      restorePluginArtifactModes(path.join(candidate, "plugin"), assembled.manifest, repositoryRoot)
    ).resolves.toBeDefined();
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).resolves.toBeDefined();

    await writeFile(pluginHelper, Buffer.from("tampered"));
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).rejects.toThrow(
      "does not match its manifest"
    );

    const escapedManifest = structuredClone(assembled.manifest);
    escapedManifest.files["plugin/../../escape"] = { sha256: "0".repeat(64), mode: "644" };
    await expect(
      restorePluginArtifactModes(path.join(candidate, "plugin"), escapedManifest, repositoryRoot)
    ).rejects.toThrow("file entry is invalid");
  });

  test("fails closed when any platform proof is missing", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-candidate-missing-"));
    temporaryDirectories.push(scratch);
    const nativeRoot = await nativeFixtureRoot(
      scratch,
      nativeTargets.filter((target) => target !== "linux-arm64")
    );
    await expect(
      assembleDistributionCandidate(path.join(scratch, "candidate"), nativeRoot, repositoryRoot)
    ).rejects.toThrow();
  });

  test("binds the candidate identity to the supplied source root", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-candidate-root-test-"));
    temporaryDirectories.push(scratch);
    const fixtureRoot = await repositoryFixtureRoot(scratch, "9.8.7");
    const nativeRoot = await nativeFixtureRoot(scratch);
    const candidate = path.join(scratch, "candidate");

    const assembled = await assembleDistributionCandidate(candidate, nativeRoot, fixtureRoot);

    expect(assembled.manifest.version).toBe("9.8.7");
    await expect(verifyDistributionCandidate(candidate, fixtureRoot)).resolves.toBeDefined();
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).rejects.toThrow(
      "Distribution candidate manifest is invalid"
    );
  });
});
