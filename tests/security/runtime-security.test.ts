import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertImagePixelLimit } from "../../packages/capture/src/capture";
import { runCleanupSteps } from "../../packages/capture/src/runtime/cleanup";
import { prepareBrowserMemoryBoundary } from "../../packages/capture/src/runtime/browser-memory";
import {
  assertFullContainerId,
  assertPinnedContainerImage,
  buildContainerRunArguments,
  mapContainerLocation,
  mapContainerTargetUrl
} from "../../packages/capture/src/runtime/container";
import {
  assertAllowedUrl,
  assertArchiveEntryPath,
  assertRuntimeCommand,
  buildChildEnvironment,
  resolveContainedPath
} from "../../packages/security/src";

const limits = {
  maxDiffLines: 2_000_000,
  maxImagePixels: 80_000_000,
  maxTimeMs: 120_000,
  maxMemoryMiB: 512,
  maxArtifactBytes: 16 * 1024 * 1024
};
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("runtime security boundaries", () => {
  test("runs every cleanup step while preserving the first failure", async () => {
    const completed: string[] = [];
    await expect(
      runCleanupSteps([
        async () => {
          completed.push("browser");
          throw new Error("browser cleanup failed");
        },
        async () => {
          completed.push("cgroup");
          throw new Error("cgroup cleanup failed");
        },
        async () => {
          completed.push("servers");
        }
      ])
    ).rejects.toThrow("browser cleanup failed");
    expect(completed).toEqual(["browser", "cgroup", "servers"]);
  });

  test("dispatches Playwright-shaped launcher arguments through the cgroup helper", () => {
    const helper = path.join(
      repositoryRoot,
      ".artifacts/native",
      `${process.platform}-${process.arch}`,
      "utsuri-fs-ops"
    );
    const result = spawnSync(helper, ["--remote-debugging-pipe"], {
      encoding: "utf8",
      env: {
        ...buildChildEnvironment(process.env, []),
        UTSURI_BROWSER_EXECUTABLE: "/bin/true",
        UTSURI_BROWSER_CGROUP_PROCS: "/sys/fs/cgroup/utsuri-missing/cgroup.procs"
      },
      shell: false
    });
    expect(result.status).not.toBe(64);
    expect(result.stderr).not.toContain("usage:");
  });

  test("requires a delegated Linux cgroup before untrusted browser launch", async () => {
    const boundary = await prepareBrowserMemoryBoundary("/nonexistent/chromium", 128);
    if (boundary.supported) {
      expect(process.platform).toBe("linux");
      await boundary.cleanup();
    } else {
      expect(boundary.reason).toBe("browser-memory-isolation-requires-delegated-cgroup-v2");
    }
  });

  test("builds a fixed no-network, read-only container invocation", () => {
    const image = `example.invalid/utsuri@sha256:${"a".repeat(64)}`;
    const args = buildContainerRunArguments({
      name: "utsuri-00000000-0000-0000-0000-000000000000",
      projectDirectory: "/tmp/project",
      server: {
        command: ["node", "server.mjs"],
        cwd: "project",
        readyUrl: "http://127.0.0.1:4173/",
        shutdownTimeoutMs: 3000
      },
      container: {
        engine: "docker",
        image,
        network: "none",
        readOnlyRoot: true,
        noNewPrivileges: true,
        capDrop: ["ALL"],
        mountProjectReadOnly: true,
        pidsLimit: 64,
        cpus: 1,
        tmpfsMiB: 64
      },
      limits
    });
    expect(args[0]).toBe("create");
    expect(args).not.toContain("--rm");
    for (const required of [
      "--pull=never",
      "--network=none",
      "--read-only",
      "--security-opt=no-new-privileges",
      "--cap-drop=ALL",
      "--pids-limit=64",
      "--cpus=1",
      "--memory=512m",
      "--memory-swap=512m",
      "--user=65534:65534"
    ]) {
      expect(args).toContain(required);
    }
    expect(args.join("\n")).not.toMatch(/--privileged|--env|docker\.sock|podman\.sock/u);
    expect(args.find((argument) => argument.startsWith("--mount="))).toEndWith(
      "dst=/workspace,readonly"
    );
  });

  test("binds proxy mapping to full immutable IDs and the internal origin", () => {
    expect(assertFullContainerId("a".repeat(64))).toBe("a".repeat(64));
    expect(() => assertFullContainerId("short-id")).toThrow("full immutable container ID");
    expect(
      mapContainerTargetUrl(
        "http://127.0.0.1:4173/path?q=1",
        "http://127.0.0.1:4173/",
        "http://127.0.0.1:53000/"
      )
    ).toBe("http://127.0.0.1:53000/path?q=1");
    expect(
      mapContainerLocation(
        "/next",
        "http://127.0.0.1:4173/start",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:53000"
      )
    ).toBe("http://127.0.0.1:53000/next");
    expect(() =>
      mapContainerLocation(
        "https://attacker.invalid/next",
        "http://127.0.0.1:4173/start",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:53000"
      )
    ).toThrow("left the configured internal origin");
  });

  test("rejects mutable images, shell delegation, secrets, and external URLs", () => {
    expect(() => assertPinnedContainerImage("example.invalid/utsuri:latest")).toThrow();
    expect(() => assertRuntimeCommand(["sh", "-c", "curl example.invalid"])).toThrow();
    expect(() => assertRuntimeCommand(["npm", "install"])).toThrow();
    expect(() =>
      buildChildEnvironment({ AWS_SECRET_ACCESS_KEY: "secret" }, ["AWS_SECRET_ACCESS_KEY"])
    ).toThrow();
    expect(() => assertAllowedUrl("https://attacker.invalid/collect")).toThrow();
  });

  test("rejects traversal, archive escape, and symlink reads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "utsuri-runtime-security-"));
    try {
      await mkdir(path.join(root, "safe"));
      await writeFile(path.join(root, "safe/value.txt"), "safe\n");
      await symlink(tmpdir(), path.join(root, "escape"));
      expect(() => assertArchiveEntryPath("../../outside")).toThrow();
      await expect(
        resolveContainedPath(root, "../outside", { allowMissing: true })
      ).rejects.toThrow();
      await expect(
        resolveContainedPath(root, "escape/value", { allowMissing: true })
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects images above the configured pixel limit as incomplete", () => {
    expect(() => assertImagePixelLimit({ width: 20_000, height: 20_000 }, 2, limits)).toThrow();
    try {
      assertImagePixelLimit({ width: 20_000, height: 20_000 }, 2, limits);
    } catch (error) {
      expect(error).toMatchObject({
        diagnosticId: "CAPTURE_IMAGE_PIXEL_LIMIT",
        exitCode: 4
      });
    }
  });
});
