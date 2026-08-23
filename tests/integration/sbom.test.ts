import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildSupplyChainDocuments,
  serializedSupplyChainDocuments
} from "../../scripts/generate-sbom.mjs";
import { repositoryRoot } from "./capture-helpers";

describe("deterministic supply-chain metadata", () => {
  test("rebuilds byte-identical SPDX and license documents", async () => {
    const first = serializedSupplyChainDocuments(await buildSupplyChainDocuments(repositoryRoot));
    const second = serializedSupplyChainDocuments(await buildSupplyChainDocuments(repositoryRoot));
    expect(first).toEqual(second);
    expect(
      await readFile(path.join(repositoryRoot, "packages/cli/dist/sbom.spdx.json"), "utf8")
    ).toBe(first.sbom);
    expect(
      await readFile(
        path.join(repositoryRoot, "packages/cli/dist/third-party-licenses.json"),
        "utf8"
      )
    ).toBe(first.licenses);
  });

  test("records exact package versions, licenses, checksums, and relationships", async () => {
    const { sbom, licenses } = await buildSupplyChainDocuments(repositoryRoot);
    expect(sbom.spdxVersion).toBe("SPDX-2.3");
    expect(sbom.packages.length).toBeGreaterThan(1);
    expect(sbom.packages.every((entry) => /^SPDXRef-/u.test(entry.SPDXID))).toBeTrue();
    expect(
      sbom.packages.every(
        (entry) =>
          typeof entry.versionInfo === "string" &&
          (/^[a-f0-9]{64}$/u.test(entry.checksums[0]?.checksumValue ?? "") ||
            /^[a-f0-9]{128}$/u.test(entry.checksums[0]?.checksumValue ?? ""))
      )
    ).toBeTrue();
    expect(
      sbom.packages
        .filter(
          (
            entry
          ): entry is typeof entry & {
            packageVerificationCode: { packageVerificationCodeValue: string };
          } => "packageVerificationCode" in entry
        )
        .every(
          (entry) =>
            entry.filesAnalyzed === true &&
            /^[a-f0-9]{40}$/u.test(
              entry.packageVerificationCode?.packageVerificationCodeValue ?? ""
            )
        )
    ).toBeTrue();
    expect(licenses.schemaVersion).toBe("1.2");
    expect(licenses.dependencyBaselineSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(licenses.productionDependencySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect("lockfileSha256" in licenses).toBeFalse();
    expect(licenses.packages.some((entry) => entry.license === "NOASSERTION")).toBeFalse();
    expect(sbom.relationships.some((entry) => entry.relationshipType === "DEPENDS_ON")).toBeTrue();
  });

  test("ignores dev-only changes while binding production lock integrity", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "utsuri-sbom-dev-only-"));
    try {
      const [manifestText, lockText] = await Promise.all([
        readFile(path.join(repositoryRoot, "package.json"), "utf8"),
        readFile(path.join(repositoryRoot, "bun.lock"), "utf8")
      ]);
      const manifest = JSON.parse(manifestText);
      manifest.devDependencies.globals = "16.5.1";
      const updatedLock = lockText
        .replace('"globals": "16.5.0"', '"globals": "16.5.1"')
        .replace('"globals@16.5.0"', '"globals@16.5.1"');
      expect(updatedLock).not.toBe(lockText);
      await Promise.all([
        writeFile(
          path.join(temporaryRoot, "package.json"),
          `${JSON.stringify(manifest, null, 2)}\n`
        ),
        writeFile(path.join(temporaryRoot, "bun.lock"), updatedLock),
        symlink(path.join(repositoryRoot, "node_modules"), path.join(temporaryRoot, "node_modules"))
      ]);

      const current = serializedSupplyChainDocuments(
        await buildSupplyChainDocuments(repositoryRoot, { verifyDependencyBaseline: false })
      );
      const devOnlyUpdate = serializedSupplyChainDocuments(
        await buildSupplyChainDocuments(temporaryRoot, { verifyDependencyBaseline: false })
      );
      expect(devOnlyUpdate).toEqual(current);

      const productionLock = updatedLock.replace(
        /("yaml": \[[^\n]*"sha512-)([A-Za-z])/u,
        (_match, prefix, first) => `${prefix}${first === "A" ? "B" : "A"}`
      );
      expect(productionLock).not.toBe(updatedLock);
      await writeFile(path.join(temporaryRoot, "bun.lock"), productionLock);
      const productionUpdate = serializedSupplyChainDocuments(
        await buildSupplyChainDocuments(temporaryRoot, { verifyDependencyBaseline: false })
      );
      expect(productionUpdate).not.toEqual(current);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  test("makes byte-level tampering observable", async () => {
    const serialized = serializedSupplyChainDocuments(
      await buildSupplyChainDocuments(repositoryRoot)
    );
    const tampered = serialized.sbom.replace(
      '"spdxVersion": "SPDX-2.3"',
      '"spdxVersion": "SPDX-2.2"'
    );
    expect(tampered).not.toBe(serialized.sbom);
    expect(tampered).not.toBe(
      await readFile(path.join(repositoryRoot, "packages/cli/dist/sbom.spdx.json"), "utf8")
    );
  });
});
