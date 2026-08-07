import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import { compareRun } from "../../packages/compare/src";
import { createEvidenceIndex, createReviewPlan, sha256 } from "../../packages/core/src";
import { discoverRun } from "../../packages/discovery/src";
import { parseGitPatch } from "../../packages/git-collector/src/patch";
import type { UtsuriConfig } from "../../packages/report-model/src";
import {
  buildReport,
  createInitialReport,
  validateReportDirectory
} from "../../packages/report-builder/src";
import { approvedBrowserAvailable, captureConfig, repositoryRoot } from "./capture-helpers";

const temporaryDirectories: string[] = [];
const browserTest = (await approvedBrowserAvailable()) ? test : test.skip;

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true })));
});

describe("visual target discovery", () => {
  browserTest(
    "keeps known 12, verified 7, and unknown usage as separate values",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "utsuri-discovery-"));
      temporaryDirectories.push(root);
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      const fixture = path.join(repositoryRoot, "fixtures/global-token-change");
      await Promise.all([
        copyFile(path.join(fixture, "before.html"), path.join(root, "before.html")),
        copyFile(path.join(fixture, "after.html"), path.join(root, "after.html")),
        copyFile(path.join(fixture, "selector-usage.json"), path.join(root, "selector-usage.json"))
      ]);
      const patch = await readFile(path.join(fixture, "changes.patch"), "utf8");
      const diff = parseGitPatch(patch, {
        mode: "patch",
        base: null,
        head: null,
        mergeBase: null,
        patchPath: "changes.patch",
        repositoryFingerprint: "global-token-fixture",
        sourceDigests: {
          patch: sha256(patch),
          numstat: null,
          nameStatus: null,
          summary: null,
          raw: null,
          commits: null
        }
      });
      const evidence = createEvidenceIndex(diff);
      const plan = createReviewPlan(diff, evidence);
      await Promise.all([
        writeFile(path.join(run, "input.json"), '{"schemaVersion":"1.0","mode":"patch"}\n'),
        writeFile(path.join(run, "diff.json"), `${JSON.stringify(diff, null, 2)}\n`),
        writeFile(path.join(run, "evidence-index.json"), `${JSON.stringify(evidence, null, 2)}\n`),
        writeFile(path.join(run, "review-plan.json"), `${JSON.stringify(plan, null, 2)}\n`)
      ]);

      const config = captureConfig({
        mode: "static-fragment",
        fragments: { before: "before.html", after: "after.html" }
      }) as UtsuriConfig;
      config.targets![0]!.id = "palette";
      config.discovery = {
        knownUsages: 12,
        unknownPossible: true,
        sources: { selectorUsage: "selector-usage.json" }
      };
      await writeFile(path.join(root, "utsuri.yml"), `${JSON.stringify(config, null, 2)}\n`);
      await captureRun(root, run, normalizeCaptureConfig(config));
      const discovered = await discoverRun(root, run, "utsuri.yml");

      expect(discovered.manifest.coverage).toEqual({
        knownUsages: 12,
        verifiedUsages: 7,
        unknownPossible: true,
        planned: 1,
        succeeded: 1,
        failed: 0
      });
      expect(discovered.manifest.candidates[0]).toEqual(
        expect.objectContaining({
          targetId: "palette",
          source: "selector",
          confidence: "weak",
          knownUsageCount: 7,
          changeRefs: [plan.candidates[0]!.id]
        })
      );
      expect(discovered.manifest.unmappedChangeRefs).toEqual([]);

      await compareRun(run);
      for (const filename of ["comparison.json", "discovery.json"]) {
        const artifact = path.join(run, filename);
        const heldArtifact = `${artifact}.held`;
        await rename(artifact, heldArtifact);
        try {
          await expect(createInitialReport(run)).rejects.toMatchObject({
            diagnosticId: "PHASE3_ARTIFACT_MISSING"
          });
        } finally {
          await rename(heldArtifact, artifact);
        }
      }
      const heldArtifacts = ["diff.json", "discovery.json"].map((filename) => ({
        artifact: path.join(run, filename),
        held: path.join(run, `${filename}.held`)
      }));
      for (const { artifact, held } of heldArtifacts) await rename(artifact, held);
      try {
        await expect(createInitialReport(run)).rejects.toMatchObject({
          diagnosticId: "PHASE3_ARTIFACT_MISSING"
        });
      } finally {
        for (const { artifact, held } of heldArtifacts) await rename(held, artifact);
      }
      const report = await createInitialReport(run);
      expect(report.status).toBe("INCOMPLETE");
      expect(report.coverage).toEqual(discovered.manifest.coverage);
      expect(report.comparisons).toHaveLength(1);
      expect(report.changes[0]?.targetRefs).toEqual([report.targets[0]!.id]);
      expect(report.findings).toContainEqual(
        expect.objectContaining({ category: "a11y", state: "incomplete" })
      );
      const staleReport = structuredClone(report);
      staleReport.status = "PASS";
      staleReport.summary.statement = "No findings remain.";
      staleReport.findings = [];
      staleReport.changes = staleReport.changes.map((change) => ({
        ...change,
        findingRefs: []
      }));
      await expect(buildReport(run, staleReport, { now: new Date(0) })).rejects.toMatchObject({
        diagnosticId: "REPORT_SOURCE_MISMATCH"
      });
      const built = await buildReport(run, report, { now: new Date(0) });
      expect(await validateReportDirectory(built.reportDirectory, { strict: true })).toEqual({
        ok: true,
        reportId: report.reportId,
        errors: []
      });
    },
    30_000
  );
});
