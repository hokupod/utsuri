import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
    expect(licenses.schemaVersion).toBe("1.1");
    expect(licenses.dependencyBaselineSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(licenses.packages.some((entry) => entry.license === "NOASSERTION")).toBeFalse();
    expect(sbom.relationships.some((entry) => entry.relationshipType === "DEPENDS_ON")).toBeTrue();
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
