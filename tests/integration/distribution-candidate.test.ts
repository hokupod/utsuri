import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assembleDistributionCandidate,
  restorePluginArtifactModes,
  verifyDistributionCandidate
} from "../../scripts/assemble-distribution-candidate.mjs";
import { nativeProofTests, nativeTargets } from "../../scripts/assemble-release-package.mjs";
import {
  expectedPackageTarballs,
  finalizeReleaseAssets,
  verifyReleaseAssets
} from "../../scripts/release-assets.mjs";
import { expectedInstalledCliIdentity } from "../../scripts/verify-installed-cli.mjs";
import { nativeHelperPackageVersion } from "../../packages/security/src/native-helper";
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

function runCommand(executable: string, arguments_: string[], cwd: string) {
  const result = spawnSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR
    },
    shell: false,
    timeout: 30_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) {
    throw new Error(`${executable} failed: ${result.stderr || result.stdout}`);
  }
  return result;
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
          tests: nativeProofTests(target)
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
    [
      ".codex-plugin",
      ".claude-plugin",
      "assets",
      "docs/assets",
      "skills",
      "native",
      "packages/cli/dist"
    ].map((entry) =>
      cp(path.join(repositoryRoot, entry), path.join(root, entry), { recursive: true })
    )
  );
  await Promise.all(
    ["README.md", "LICENSE", "toolchain-policy.json"].map((entry) =>
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
  test("keeps the isolated install identity synchronized with the CLI", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-candidate-install-test-"));
    temporaryDirectories.push(scratch);
    const nativeRoot = await nativeFixtureRoot(scratch);
    const candidate = path.join(scratch, "candidate");
    const { manifest } = await assembleDistributionCandidate(candidate, nativeRoot, repositoryRoot);
    const target = `${process.platform}-${process.arch}`;
    if (!nativeTargets.includes(target)) throw new Error(`unsupported test target: ${target}`);

    const tarballs = path.join(scratch, "tarballs");
    const installRoot = path.join(scratch, "install");
    const npmCache = path.join(scratch, "npm-cache");
    const npmUserConfig = path.join(scratch, "npmrc");
    const npmGlobalConfig = path.join(scratch, "npmrc-global");
    await Promise.all([
      mkdir(tarballs, { mode: 0o700 }),
      mkdir(installRoot, { mode: 0o700 }),
      writeFile(npmUserConfig, "", { mode: 0o600 }),
      writeFile(npmGlobalConfig, "", { mode: 0o600 })
    ]);
    const npmIsolation = [
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--update-notifier=false",
      "--cache",
      npmCache,
      "--userconfig",
      npmUserConfig,
      "--globalconfig",
      npmGlobalConfig
    ];
    for (const packageRoot of [
      path.join(candidate, "packages/native", target),
      path.join(candidate, "packages/cli")
    ]) {
      runCommand(
        "npm",
        ["pack", packageRoot, "--json", "--pack-destination", tarballs, ...npmIsolation],
        scratch
      );
    }

    const packageTarballs = new Map<string, string>(
      expectedPackageTarballs(manifest.version).map(
        ({ packageName, relative }) => [packageName, path.join(scratch, relative)] as const
      )
    );
    const nativeTarball = packageTarballs.get(`@utsu-ri/cli-${target}`);
    const cliTarball = packageTarballs.get("@utsu-ri/cli");
    if (!nativeTarball || !cliTarball) throw new Error("expected host and CLI tarballs");
    runCommand(
      "npm",
      ["install", "--prefix", installRoot, ...npmIsolation, nativeTarball, cliTarball],
      scratch
    );

    const result = runCommand(
      path.join(installRoot, "node_modules/.bin/utsuri"),
      ["--version", "--json"],
      installRoot
    );

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(expectedInstalledCliIdentity(manifest.version));
    expect(nativeHelperPackageVersion).toBe(manifest.version);
  }, 30_000);

  test("requires and binds all four helper packages and aggregate Plugin copies", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "utsuri-candidate-test-"));
    temporaryDirectories.push(scratch);
    const nativeRoot = await nativeFixtureRoot(scratch);
    const candidate = path.join(scratch, "candidate");
    const assembled = await assembleDistributionCandidate(candidate, nativeRoot, repositoryRoot);
    const rootManifest = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8")
    ) as { version: string };
    const candidateVersions = await Promise.all(
      [
        "packages/cli/package.json",
        ...nativeTargets.map((target) => `packages/native/${target}/package.json`),
        "plugin/.codex-plugin/plugin.json",
        "plugin/.claude-plugin/plugin.json"
      ].map(async (relative) => {
        const manifest = JSON.parse(await readFile(path.join(candidate, relative), "utf8")) as {
          version: string;
        };
        return manifest.version;
      })
    );

    expect(candidateVersions).toEqual(candidateVersions.map(() => rootManifest.version));
    expect(assembled.manifest.targets).toEqual(nativeTargets);
    const candidateCodexManifest = JSON.parse(
      await readFile(path.join(candidate, "plugin/.codex-plugin/plugin.json"), "utf8")
    ) as { interface: { composerIcon: string; logo: string } };
    expect(candidateCodexManifest.interface).toMatchObject({
      composerIcon: "./assets/utsuri.jpg",
      logo: "./assets/utsuri.jpg"
    });
    expect(
      (await readFile(path.join(candidate, "plugin/assets/utsuri.jpg"))).equals(
        await readFile(path.join(repositoryRoot, "docs/assets/utsuri.jpg"))
      )
    ).toBe(true);
    expect(assembled.manifest.files["plugin/assets/utsuri.jpg"]).toBeDefined();
    expect(assembled.manifest.files["plugin/.claude-plugin/marketplace.json"]).toBeUndefined();
    expect(
      Object.keys(assembled.manifest.files).some((relative) =>
        relative.startsWith("plugin/plugins/")
      )
    ).toBe(false);
    await expect(verifyDistributionCandidate(candidate, repositoryRoot)).resolves.toBeDefined();

    const releaseCandidate = path.join(scratch, "release-candidate");
    await mkdir(path.join(releaseCandidate, "tarballs"), { recursive: true, mode: 0o700 });
    await Promise.all([
      cp(path.join(candidate, "plugin"), path.join(releaseCandidate, "plugin"), {
        recursive: true
      }),
      cp(
        path.join(candidate, "candidate-manifest.json"),
        path.join(releaseCandidate, "candidate-manifest.json")
      ),
      ...expectedPackageTarballs(assembled.manifest.version).map(({ packageName, relative }) =>
        writeFile(path.join(releaseCandidate, relative), `fixture tarball for ${packageName}\n`)
      )
    ]);
    const releaseManifest = await finalizeReleaseAssets(releaseCandidate, repositoryRoot);
    expect(Object.keys(releaseManifest.files)).toHaveLength(7);
    await expect(verifyReleaseAssets(releaseCandidate, repositoryRoot)).resolves.toBeDefined();
    const [firstTarball] = expectedPackageTarballs(assembled.manifest.version);
    if (!firstTarball) throw new Error("expected a release tarball fixture");
    const tamperedTarball = path.join(releaseCandidate, firstTarball.relative);
    await writeFile(tamperedTarball, "tampered\n");
    await expect(verifyReleaseAssets(releaseCandidate, repositoryRoot)).rejects.toThrow(
      "differs from its manifest"
    );

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
