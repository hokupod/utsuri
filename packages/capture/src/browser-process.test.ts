import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  browserProcessOwnershipAmbiguous,
  nixChromiumWrapperTarget,
  resolveTrackedBrowserExecutablePaths,
  retainLinuxExecutableIdentityMatches,
  terminateObservedBrowserProcesses,
  terminateTrackedBrowserProcesses,
  trackedBrowserProcessIds,
  waitForTrackedBrowserProcesses
} from "./browser-process";

describe("browser process tracking", () => {
  test("canonicalizes a non-Nix browser symlink before tracking and launch", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "utsuri-browser-link-"));
    const link = path.join(directory, "browser");
    try {
      await symlink(process.execPath, link);
      await expect(resolveTrackedBrowserExecutablePaths(link)).resolves.toEqual(
        new Set([await realpath(process.execPath)])
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("selects only the marked browser parent process", () => {
    const executable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const token = "7e03802d-3670-4c68-a3e5-b82186cbc79c";
    const processList = `
      101 1 ps -o pid=,ppid=,command= -P 99
      102 99 ${executable} --utsuri-capture-token=${token} --remote-debugging-pipe
      103 99 ${executable} --remote-debugging-pipe
      104 99 /tmp/fake --utsuri-capture-token=${token} --remote-debugging-pipe
      105 99 ${executable} --utsuri-capture-token=other --remote-debugging-pipe
      106 99 ${executable} --utsuri-capture-token=${token}
      107 98 ${executable} --utsuri-capture-token=${token} --remote-debugging-pipe
    `;

    expect(trackedBrowserProcessIds(processList, executable, token, 99)).toEqual(new Set([102]));
  });

  test("tracks the immutable exec target of a Nix Chromium wrapper", () => {
    const wrapper = "/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-chromium/bin/chromium";
    const target =
      "/nix/store/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-chromium-unwrapped/libexec/chromium/chromium";
    const source = `#!/nix/store/cccccccccccccccccccccccccccccccc-bash/bin/bash -e
export CHROME_WRAPPER='chromium'
exec "${target}" "$@"
`;
    expect(nixChromiumWrapperTarget(wrapper, source)).toBe(target);
    expect(nixChromiumWrapperTarget(wrapper, `#!/bin/sh\nexec -a "$0" "${target}" "$@"\n`)).toBe(
      target
    );
    expect(
      trackedBrowserProcessIds(
        `201 42 ${target} --utsuri-capture-token=token --remote-debugging-pipe`,
        new Set([wrapper, target]),
        "token",
        42
      )
    ).toEqual(new Set([201]));
  });

  test("rejects ambiguous or non-Nix Chromium wrapper targets", () => {
    const wrapper = "/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-chromium/bin/chromium";
    const first =
      "/nix/store/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-chromium-unwrapped/libexec/chromium/chromium";
    const second =
      "/nix/store/cccccccccccccccccccccccccccccccc-chromium-unwrapped/libexec/chromium/chromium";
    expect(
      nixChromiumWrapperTarget(wrapper, `#!/bin/sh\nexec "${first}" "$@"\nexec "${second}" "$@"\n`)
    ).toBeNull();
    expect(
      nixChromiumWrapperTarget("/tmp/chromium", `#!/bin/sh\nexec "${first}" "$@"\n`)
    ).toBeNull();
    expect(
      nixChromiumWrapperTarget(wrapper, `#!/bin/sh\nexec -a "chromium" "${first}" "$@"\n`)
    ).toBeNull();
    expect(
      nixChromiumWrapperTarget(
        wrapper,
        `#!/bin/sh\nexec "/nix/store/dddddddddddddddddddddddddddddddd-x/../../../tmp/x/libexec/chromium/chromium" "$@"\n`
      )
    ).toBeNull();
  });

  test("retains multiple wrapper and target parents as ambiguous", () => {
    const wrapper = "/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-chromium/bin/chromium";
    const target =
      "/nix/store/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-chromium-unwrapped/libexec/chromium/chromium";
    const observed = trackedBrowserProcessIds(
      `301 42 ${wrapper} --utsuri-capture-token=token --remote-debugging-pipe
302 42 ${target} --utsuri-capture-token=token --remote-debugging-pipe`,
      new Set([wrapper, target]),
      "token",
      42
    );
    expect(observed).toEqual(new Set([301, 302]));
    expect(browserProcessOwnershipAmbiguous(observed)).toBeTrue();
    expect(browserProcessOwnershipAmbiguous(new Set([301]), new Set([302]))).toBeTrue();
  });

  test("observes an empty tracked process set as fully reaped", async () => {
    await expect(waitForTrackedBrowserProcesses(new Set(), 10)).resolves.toBeTrue();
    await expect(terminateTrackedBrowserProcesses(new Set())).resolves.toBeTrue();
  });

  test("terminates a browser parent first observed after cleanup starts", async () => {
    const terminations: number[][] = [];
    const observations = [new Set([302]), new Set<number>()];
    const result = await terminateObservedBrowserProcesses(
      new Set([301]),
      () => observations.shift() ?? new Set(),
      (processIds) => {
        terminations.push([...processIds]);
        return Promise.resolve(true);
      }
    );

    expect(terminations).toEqual([[301], [302]]);
    expect(result.complete).toBeTrue();
    expect(result.observedProcessIds).toEqual(new Set([301, 302]));
  });

  test("attempts termination for the final parent observed within the bound", async () => {
    const terminations: number[][] = [];
    const observations = [new Set([302]), new Set([303]), new Set([304])];
    const result = await terminateObservedBrowserProcesses(
      new Set([301]),
      () => observations.shift() ?? new Set(),
      (processIds) => {
        terminations.push([...processIds]);
        return Promise.resolve(true);
      }
    );

    expect(terminations).toEqual([[301], [302], [303], [304]]);
    expect(result.complete).toBeFalse();
    expect(result.observedProcessIds).toEqual(new Set([301, 302, 303, 304]));
  });

  test("drops a failed PID after authoritative ownership is lost", async () => {
    const terminations: number[][] = [];
    const observations = [new Set([302]), new Set([303]), new Set([304])];
    const result = await terminateObservedBrowserProcesses(
      new Set([301]),
      () => observations.shift() ?? new Set(),
      (processIds) => {
        terminations.push([...processIds]);
        return Promise.resolve(false);
      }
    );

    expect(terminations).toEqual([[301], [302], [303], [304]]);
    expect(result.complete).toBeFalse();
  });

  test("does not retry a failed PID absent from the authoritative observation", async () => {
    const terminations: number[][] = [];
    const result = await terminateObservedBrowserProcesses(
      new Set([301]),
      () => new Set(),
      (processIds) => {
        terminations.push([...processIds]);
        return Promise.resolve(false);
      }
    );

    expect(terminations).toEqual([[301]]);
    expect(result.complete).toBeTrue();
  });

  test("does not signal a live PID without an approved platform path", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore"
    });
    await once(child, "spawn");
    try {
      const termination = terminateTrackedBrowserProcesses(new Set([child.pid!]), () => false);
      if (process.platform === "linux") {
        await expect(termination).rejects.toMatchObject({
          diagnosticId: "CAPTURE_BROWSER_TRACKING_UNAVAILABLE"
        });
      } else {
        await expect(termination).resolves.toBeTrue();
      }
      expect(() => process.kill(child.pid!, 0)).not.toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
  });

  test("fails closed when a Nix executable identity cannot be verified", () => {
    const wrapper = "/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-chromium/bin/chromium";
    const target =
      "/nix/store/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-chromium-unwrapped/libexec/chromium/chromium";
    const candidates = new Set([401]);

    expect(() =>
      retainLinuxExecutableIdentityMatches(candidates, new Set([wrapper, target]), () => false)
    ).toThrow();
  });

  test("requires executable identity for a non-Nix Linux path", () => {
    const candidates = new Set([501]);

    expect(() =>
      retainLinuxExecutableIdentityMatches(candidates, new Set([process.execPath]), () => false)
    ).toThrow();
    expect(
      retainLinuxExecutableIdentityMatches(candidates, new Set([process.execPath]), () => true)
    ).toEqual(candidates);
  });

  test("fails closed when an approved Linux executable identity disappears", () => {
    expect(() =>
      retainLinuxExecutableIdentityMatches(
        new Set([501]),
        new Set(["/utsuri-missing-browser-executable"]),
        () => true
      )
    ).toThrow();
  });

  test("observes the full empty settling window before accepting cleanup", async () => {
    const terminations: number[][] = [];
    const observations = [new Set<number>(), new Set([302]), new Set<number>()];
    const result = await terminateObservedBrowserProcesses(
      new Set(),
      () => observations.shift() ?? new Set(),
      (processIds) => {
        terminations.push([...processIds]);
        return Promise.resolve(true);
      },
      () => Promise.resolve()
    );

    expect(terminations).toEqual([[302]]);
    expect(result.complete).toBeTrue();
    expect(result.observedProcessIds).toEqual(new Set([302]));
  });
});
