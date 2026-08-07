import { afterAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import {
  buildReport,
  createInitialReport,
  validateReportDirectory
} from "../../packages/report-builder/src";
import {
  approvedBrowserAvailable,
  captureConfig,
  freePort,
  startFixtureServer,
  stopFixtureServer
} from "./capture-helpers";

const temporaryDirectories: string[] = [];
const browserTest = (await approvedBrowserAvailable()) ? test : test.skip;

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true })));
});

describe("network", () => {
  browserTest(
    "blocks external origins and mutation methods while preserving evidence",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "utsuri-network-"));
      temporaryDirectories.push(root);
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      const beforePort = await freePort();
      const afterPort = await freePort();
      const externalPort = await freePort();
      let redirectedRequests = 0;
      const externalServer = createServer((_request, response) => {
        redirectedRequests += 1;
        response.writeHead(204).end();
      });
      externalServer.listen(externalPort, "127.0.0.1");
      await once(externalServer, "listening");
      const redirectUrl = `http://127.0.0.1:${externalPort}/redirected?token=secret#fragment`;
      const beforeServer = await startFixtureServer(beforePort, "before", {
        network: true,
        redirectUrl,
        webSocket: true
      });
      const afterServer = await startFixtureServer(afterPort, "after", {
        network: true,
        redirectUrl,
        webSocket: true
      });
      try {
        const config = normalizeCaptureConfig(
          captureConfig({ mode: "dual-url", beforePort, afterPort })
        );
        const result = await captureRun(root, run, config);
        expect(result.complete).toBeFalse();
        expect(result.manifest.blockedRequestCount).toBe(8);
        expect(redirectedRequests).toBe(0);
        const references = result.manifest.targets.flatMap((target) => [
          target.before.networkRef,
          target.after.networkRef
        ]);
        const evidence = (
          await Promise.all(
            references.map(
              async (reference) =>
                JSON.parse(await readFile(path.join(run, reference!), "utf8")) as Array<{
                  disposition: string;
                  reason: string;
                  resourceType: string;
                }>
            )
          )
        ).flat();
        expect(evidence.filter((entry) => entry.reason === "external-origin")).toHaveLength(4);
        expect(
          evidence.filter(
            (entry) => entry.reason === "external-origin" && entry.resourceType === "websocket"
          )
        ).toHaveLength(2);
        expect(evidence.filter((entry) => entry.reason === "mutation-method")).toHaveLength(2);
        expect(evidence.filter((entry) => entry.reason === "external-redirect")).toHaveLength(2);
        expect(
          evidence.every((entry) => !entry.reason || entry.disposition === "blocked")
        ).toBeTrue();

        const failedRun = path.join(root, "run-failed-action");
        await mkdir(failedRun, { mode: 0o700 });
        const failedConfig = normalizeCaptureConfig(
          captureConfig({ mode: "dual-url", beforePort, afterPort })
        );
        failedConfig.targets[0]!.states[0]!.steps.push({
          assertText: {
            locator: { by: "testId", testId: "status" },
            expected: "Never present",
            exact: true,
            timeoutMs: 250
          }
        });
        const failed = await captureRun(root, failedRun, failedConfig);
        expect(failed.complete).toBeFalse();
        for (const target of failed.manifest.targets) {
          for (const side of [target.before, target.after]) {
            expect(side.status).toBe("failed");
            expect(side.networkRef).toBeString();
          }
        }
        const partial = await createInitialReport(failedRun);
        const built = await buildReport(failedRun, partial, {
          now: new Date(0),
          toolVersion: "0.1.0"
        });
        expect(
          (await validateReportDirectory(built.reportDirectory, { strict: true })).ok
        ).toBeTrue();
      } finally {
        await Promise.all([
          stopFixtureServer(beforeServer),
          stopFixtureServer(afterServer),
          stopFixtureServer(externalServer)
        ]);
      }
    },
    60_000
  );
});
