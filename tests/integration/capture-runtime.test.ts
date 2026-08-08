import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureRun, normalizeCaptureConfig } from "../../packages/capture/src";
import {
  currentTrackedBrowserProcessIds,
  resolveTrackedBrowserExecutablePaths,
  terminateOwnedBrowserProcesses,
  trackedBrowserProcessIds
} from "../../packages/capture/src/browser-process";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import {
  approvedBrowserAvailable,
  assertPortReleased,
  captureConfig,
  freePort,
  repositoryRoot,
  startFixtureServer,
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

describe("capture-runtime", () => {
  test("canonicalizes a Linux browser symlink before pidfd cleanup", async () => {
    if (process.platform !== "linux") return;

    const root = await temporaryRoot("utsuri-browser-link-");
    const link = path.join(root, "browser");
    await symlink(process.execPath, link);
    const executablePaths = await resolveTrackedBrowserExecutablePaths(link);
    const executable = executablePaths.values().next().value!;
    const token = randomUUID();
    const child = spawn(
      executable,
      [
        "-e",
        "setInterval(() => {}, 1000)",
        "--",
        `--utsuri-capture-token=${token}`,
        "--remote-debugging-pipe"
      ],
      { stdio: "ignore" }
    );
    await once(child, "spawn");
    const exited = once(child, "exit");
    try {
      await expect(
        terminateOwnedBrowserProcesses(new Set([child.pid!]), executablePaths, token)
      ).resolves.toBeTrue();
      await exited;
      expect(() => process.kill(child.pid!, 0)).toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
  }, 10_000);

  test("never signals multiple same-executable Linux candidates", async () => {
    if (process.platform !== "linux") return;

    const executablePaths = await resolveTrackedBrowserExecutablePaths(process.execPath);
    const token = randomUUID();
    const args = [
      "-e",
      "setInterval(() => {}, 1000)",
      "--",
      `--utsuri-capture-token=${token}`,
      "--remote-debugging-pipe"
    ];
    const children = [
      spawn(process.execPath, args, { stdio: "ignore" }),
      spawn(process.execPath, args, { stdio: "ignore" })
    ];
    await Promise.all(children.map((child) => once(child, "spawn")));
    try {
      await expect(
        terminateOwnedBrowserProcesses(
          new Set(children.map((child) => child.pid!)),
          executablePaths,
          token
        )
      ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
      for (const child of children) expect(() => process.kill(child.pid!, 0)).not.toThrow();
    } finally {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
      await Promise.all(
        children.map((child) =>
          child.exitCode === null && child.signalCode === null
            ? once(child, "exit")
            : Promise.resolve()
        )
      );
    }
  }, 10_000);

  test("rejects a forged Linux argv without matching executable identity", async () => {
    if (process.platform !== "linux") return;

    const executablePaths = new Set(["/bin/sh"]);
    const token = randomUUID();
    const marker = `--utsuri-capture-token=${token}`;
    const forged = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)", "--", marker, "--remote-debugging-pipe"],
      { argv0: "/bin/sh", stdio: "ignore" }
    );
    await once(forged, "spawn");
    try {
      let textMatchedProcessIds = new Set<number>();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const processList = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
          encoding: "utf8",
          shell: false
        });
        textMatchedProcessIds = trackedBrowserProcessIds(
          processList,
          executablePaths,
          token,
          process.pid
        );
        if (textMatchedProcessIds.has(forged.pid!)) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      expect(textMatchedProcessIds.has(forged.pid!)).toBeTrue();
      expect(() => currentTrackedBrowserProcessIds(executablePaths, token)).toThrow();
    } finally {
      if (forged.exitCode === null && forged.signalCode === null) {
        forged.kill("SIGKILL");
        await once(forged, "exit");
      }
    }
  }, 10_000);

  browserTest(
    "captures dual-url evidence in isolated contexts with a stable hash",
    async () => {
      const root = await temporaryRoot("utsuri-dual-url-");
      const beforePort = await freePort();
      const afterPort = await freePort();
      const beforeServer = await startFixtureServer(beforePort, "before");
      const afterServer = await startFixtureServer(afterPort, "after");
      try {
        const config = normalizeCaptureConfig(
          captureConfig({ mode: "dual-url", beforePort, afterPort })
        );
        const run = path.join(root, "run");
        await mkdir(run, { mode: 0o700 });
        const first = await captureRun(root, run, config);
        const second = await captureRun(root, run, config);
        expect(first.complete).toBeTrue();
        expect(first.manifest.targets[0]?.before.status).toBe("success");
        expect(first.manifest.targets[0]?.after.status).toBe("success");
        expect(second.reusedSides).toBe(2);
        expect(first.manifest.captureHash).toBe(second.manifest.captureHash);
        const beforeResult = first.manifest.targets[0]!.before;
        for (const reference of [beforeResult.domRef, beforeResult.consoleRef]) {
          const evidence = await readFile(path.join(run, reference!), "utf8");
          expect(evidence).not.toMatch(
            /user:password|token=(?:secret|relative|root|filename|parenthesized)|code=bare|access_token=|#fragment/u
          );
          expect(evidence).toContain("https://example.test/private");
          expect(evidence).toContain("//example.test/protocol");
          expect(evidence).toContain("/callback");
        }

        const report = await createInitialReport(run);
        const built = await buildReport(run, report, {
          now: new Date(0),
          toolVersion: "0.1.0"
        });
        for (const reference of [
          report.targets[0]?.before.domRef,
          report.targets[0]?.before.consoleRef
        ]) {
          expect(reference).toBeString();
          const persistedEvidence = await readFile(
            path.join(built.reportDirectory, reference!),
            "utf8"
          );
          expect(persistedEvidence).not.toMatch(
            /user:password|token=(?:secret|relative|root|filename|parenthesized)|code=bare|access_token=|#fragment/u
          );
        }

        const beforeDom = first.manifest.targets[0]?.before.domRef;
        expect(beforeDom).toBeString();
        await writeFile(path.join(run, beforeDom!), '{"tampered":true}\n');
        const repaired = await captureRun(root, run, config);
        expect(repaired.reusedSides).toBe(1);

        const changedConfig = normalizeCaptureConfig(
          captureConfig({ mode: "dual-url", beforePort, afterPort })
        );
        changedConfig.stabilization.waitAfterReadyMs += 1;
        const invalidated = await captureRun(root, run, changedConfig);
        expect(invalidated.reusedSides).toBe(0);
      } finally {
        await Promise.all([stopFixtureServer(beforeServer), stopFixtureServer(afterServer)]);
      }
    },
    120_000
  );

  browserTest(
    "captures sanitized static fragments with JavaScript disabled",
    async () => {
      const root = await temporaryRoot("utsuri-static-fragment-");
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      await Promise.all([
        copyFile(
          path.join(repositoryRoot, "fixtures/dynamic-content/before.html"),
          path.join(root, "before.html")
        ),
        copyFile(
          path.join(repositoryRoot, "fixtures/dynamic-content/after.html"),
          path.join(root, "after.html")
        )
      ]);
      const config = normalizeCaptureConfig(
        captureConfig({
          mode: "static-fragment",
          fragments: { before: "before.html", after: "after.html" }
        })
      );
      const result = await captureRun(root, run, config);
      expect(result.complete).toBeTrue();
      const axeRef = result.manifest.targets[0]?.before.axeRef;
      expect(axeRef).toBeString();
      const axe = JSON.parse(await readFile(path.join(run, axeRef!), "utf8")) as {
        status: string;
        reason?: string;
      };
      expect(axe).toEqual({ status: "skipped", reason: "javascript-disabled-static-fragment" });
      const domRef = result.manifest.targets[0]?.before.domRef;
      const dom = await readFile(path.join(run, domRef!), "utf8");
      expect(dom).not.toContain("utsuriUnsafeScriptExecuted");
    },
    60_000
  );

  browserTest(
    "turns an exhausted capture-side deadline into typed incomplete evidence",
    async () => {
      const root = await temporaryRoot("utsuri-capture-deadline-");
      const run = path.join(root, "run");
      await mkdir(run, { mode: 0o700 });
      await Promise.all([
        writeFile(path.join(root, "before.html"), "<main>before</main>\n"),
        writeFile(path.join(root, "after.html"), "<main>after</main>\n")
      ]);
      const raw = captureConfig({
        mode: "static-fragment",
        fragments: { before: "before.html", after: "after.html" }
      });
      const config = normalizeCaptureConfig(raw);
      config.limits.maxTimeMs = 1;
      const result = await captureRun(root, run, config);

      expect(result.complete).toBeFalse();
      expect(result.manifest.targets[0]?.before.failure).toMatchObject({
        code: "CAPTURE_TIME_LIMIT",
        retryable: false
      });
      expect(result.manifest.targets[0]?.after.failure).toMatchObject({
        code: "CAPTURE_TIME_LIMIT",
        retryable: false
      });
    },
    30_000
  );

  browserTest(
    "starts only explicit worktree commands and cleans both process groups",
    async () => {
      const root = await temporaryRoot("utsuri-worktree-");
      const run = path.join(root, "run");
      const before = path.join(root, "before");
      const after = path.join(root, "after");
      await Promise.all([mkdir(run, { mode: 0o700 }), mkdir(before), mkdir(after)]);
      const fixture = path.join(repositoryRoot, "fixtures/dynamic-content/server.mjs");
      await Promise.all([
        copyFile(fixture, path.join(before, "server.mjs")),
        copyFile(fixture, path.join(after, "server.mjs"))
      ]);
      const beforePort = await freePort();
      const afterPort = await freePort();
      const config = normalizeCaptureConfig(
        captureConfig({
          mode: "worktree",
          beforePort,
          afterPort,
          beforeCommand: [
            process.execPath,
            "server.mjs",
            String(beforePort),
            "before.pid",
            "before"
          ],
          afterCommand: [process.execPath, "server.mjs", String(afterPort), "after.pid", "after"],
          beforeCwd: "before",
          afterCwd: "after"
        })
      );
      await expect(captureRun(root, run, config)).rejects.toMatchObject({
        diagnosticId: "CAPTURE_WORKTREE_CONSENT_REQUIRED"
      });
      const result = await captureRun(root, run, config, { allowProjectCode: true });
      expect(result.complete).toBeTrue();
      await Promise.all([assertPortReleased(beforePort), assertPortReleased(afterPort)]);
      for (const [directory, filename] of [
        [before, "before.pid"],
        [after, "after.pid"]
      ] as const) {
        const pid = Number((await readFile(path.join(directory, filename), "utf8")).trim());
        expect(() => process.kill(pid, 0)).toThrow();
      }
    },
    60_000
  );
});
