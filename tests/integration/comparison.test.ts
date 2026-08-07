import { afterAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import { compareRun } from "../../packages/compare/src";
import {
  approvedBrowserAvailable,
  captureConfig,
  freePort,
  repositoryRoot,
  stopFixtureServer
} from "./capture-helpers";

const temporaryDirectories: string[] = [];
const browserTest = (await approvedBrowserAvailable()) ? test : test.skip;

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true })));
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

async function htmlServer(port: number, html: string): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function compareStaticFixture(
  fixture: string,
  configure?: (config: ReturnType<typeof captureConfig>) => void
) {
  const root = await temporaryRoot(`utsuri-compare-${fixture}-`);
  const run = path.join(root, "run");
  await mkdir(run, { mode: 0o700 });
  await Promise.all(
    (["before", "after"] as const).map((side) =>
      copyFile(
        path.join(repositoryRoot, `fixtures/${fixture}/${side}.html`),
        path.join(root, `${side}.html`)
      )
    )
  );
  const raw = captureConfig({
    mode: "static-fragment",
    fragments: { before: "before.html", after: "after.html" }
  });
  configure?.(raw);
  const captured = await captureRun(root, run, normalizeCaptureConfig(raw));
  expect(captured.complete).toBeTrue();
  return compareRun(run);
}

async function compareDualFixture(fixture: string) {
  const root = await temporaryRoot(`utsuri-compare-${fixture}-`);
  const run = path.join(root, "run");
  await mkdir(run, { mode: 0o700 });
  const beforePort = await freePort();
  const afterPort = await freePort();
  const [beforeHtml, afterHtml] = await Promise.all([
    readFile(path.join(repositoryRoot, `fixtures/${fixture}/before.html`), "utf8"),
    readFile(path.join(repositoryRoot, `fixtures/${fixture}/after.html`), "utf8")
  ]);
  const [before, after] = await Promise.all([
    htmlServer(beforePort, beforeHtml),
    htmlServer(afterPort, afterHtml)
  ]);
  try {
    const raw = captureConfig({ mode: "dual-url", beforePort, afterPort });
    raw.targets![0]!.states[0]!.steps = [];
    const captured = await captureRun(root, run, normalizeCaptureConfig(raw));
    expect(captured.complete).toBeTrue();
    return await compareRun(run);
  } finally {
    await Promise.all([stopFixtureServer(before), stopFixtureServer(after)]);
  }
}

describe("comparison runtime", () => {
  browserTest(
    "produces deterministic pixel regions without declaring a pixel-only regression",
    async () => {
      const root = await temporaryRoot("utsuri-compare-pixel-");
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      await Promise.all([
        copyFile(
          path.join(repositoryRoot, "fixtures/css-color-change/before.html"),
          path.join(root, "before.html")
        ),
        copyFile(
          path.join(repositoryRoot, "fixtures/css-color-change/after.html"),
          path.join(root, "after.html")
        )
      ]);
      const config = normalizeCaptureConfig(
        captureConfig({
          mode: "static-fragment",
          fragments: { before: "before.html", after: "after.html" }
        })
      );
      const captured = await captureRun(root, run, config);
      expect(captured.manifest.targets[0]?.before).toMatchObject({ status: "success" });
      expect(captured.manifest.targets[0]?.after).toMatchObject({ status: "success" });
      const first = await compareRun(run);
      const second = await compareRun(run);
      expect(first.manifest.targets[0]).toMatchObject({ status: "compared" });
      const image = first.manifest.targets[0]?.images[0];
      expect(image?.diffPixelCount).toBeGreaterThan(0);
      expect(image?.regions.length).toBeGreaterThan(0);
      expect(first.manifest.targets[0]?.findings).toContainEqual(
        expect.objectContaining({
          category: "visual",
          state: "new",
          severity: "info"
        })
      );
      expect(first.manifest.targets[0]?.findings).toContainEqual(
        expect.objectContaining({ category: "a11y", state: "incomplete" })
      );
      expect(first.manifest.comparisonHash).toBe(second.manifest.comparisonHash);
    },
    30_000
  );

  browserTest(
    "classifies a new mobile overflow with screenshot evidence",
    async () => {
      const compared = await compareStaticFixture("mobile-overflow", (config) => {
        config.viewports!.test!.width = 375;
      });
      expect(compared.manifest.targets[0]?.findings).toContainEqual(
        expect.objectContaining({
          category: "layout",
          state: "new",
          severity: "medium",
          title: "Document horizontal overflow"
        })
      );
      const finding = compared.manifest.targets[0]?.findings.find(
        (entry) => entry.fingerprint === "document-horizontal-overflow"
      );
      expect(finding?.evidencePaths.some((entry) => entry.endsWith(".png"))).toBeTrue();
    },
    30_000
  );

  browserTest(
    "retains a focused-control style regression as measured evidence",
    async () => {
      const compared = await compareStaticFixture("hidden-focus-outline", (config) => {
        config.targets![0]!.states[0]!.steps = [
          { focus: { locator: { by: "role", role: "button", name: "Continue" } } }
        ];
      });
      expect(compared.manifest.targets[0]?.findings).toContainEqual(
        expect.objectContaining({ category: "style", state: "new", severity: "info" })
      );
    },
    30_000
  );

  browserTest(
    "classifies an icon button accessible-name removal as new",
    async () => {
      const compared = await compareDualFixture("aria-label-removal");
      expect(compared.manifest.targets[0]?.findings).toContainEqual(
        expect.objectContaining({ category: "a11y", state: "new", severity: "critical" })
      );
    },
    30_000
  );

  browserTest(
    "classifies new accessibility and console fingerprints",
    async () => {
      const root = await temporaryRoot("utsuri-compare-runtime-");
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      const beforePort = await freePort();
      const afterPort = await freePort();
      const before = await htmlServer(
        beforePort,
        '<!doctype html><html lang="en"><body><main data-app-ready data-testid="root"><button id="new-a11y" aria-label="Close"><span aria-hidden="true">×</span></button><button id="unchanged-a11y"><span aria-hidden="true">×</span></button><button id="resolved-a11y"><span aria-hidden="true">×</span></button><script>console.error("Persistent error"); console.error("Resolved error")</script></main></body></html>'
      );
      const after = await htmlServer(
        afterPort,
        '<!doctype html><html lang="en"><body><main data-app-ready data-testid="root"><button id="new-a11y"><span aria-hidden="true">×</span></button><button id="unchanged-a11y"><span aria-hidden="true">×</span></button><button id="resolved-a11y" aria-label="Close"><span aria-hidden="true">×</span></button><script>console.error("Persistent error"); console.error("Checkout failed"); setTimeout(() => { throw new Error("Checkout failed"); }, 0)</script></main></body></html>'
      );
      try {
        const config = normalizeCaptureConfig(
          captureConfig({ mode: "dual-url", beforePort, afterPort })
        );
        config.targets[0]!.states[0]!.steps = [];
        const captured = await captureRun(root, run, config);
        expect(captured.complete).toBeTrue();
        const compared = await compareRun(run);
        const statesFor = (category: "a11y" | "console") =>
          compared.manifest.targets[0]!.findings.filter((finding) => finding.category === category)
            .map((finding) => finding.state)
            .sort();
        expect(statesFor("a11y")).toEqual([
          "new",
          "resolved",
          "unchanged",
          "unchanged",
          "unchanged"
        ]);
        expect(statesFor("console")).toEqual(["new", "resolved", "unchanged"]);
        const newFindings = compared.manifest.targets[0]!.findings.filter(
          (finding) => finding.state === "new"
        );
        expect(newFindings).toContainEqual(
          expect.objectContaining({ category: "a11y", severity: "critical" })
        );
        expect(newFindings).toContainEqual(
          expect.objectContaining({ category: "console", severity: "high" })
        );
        expect(newFindings).toContainEqual(
          expect.objectContaining({ category: "page-error", severity: "high" })
        );
      } finally {
        await Promise.all([stopFixtureServer(before), stopFixtureServer(after)]);
      }
    },
    60_000
  );
});
