import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertAllowedUrl,
  assertArchiveEntriesSafe,
  assertArchiveEntryPath,
  assertArgvCommand,
  assertRuntimeCommand,
  buildChildEnvironment,
  readContainedRegularFile,
  resolveContainedPath
} from "./index";

describe("security primitives", () => {
  test("rejects string and shell-like commands", () => {
    expect(() => assertArgvCommand("bun run dev && curl example.invalid")).toThrow();
    expect(() => assertArgvCommand(["sh", "-c", "echo unsafe"])).toThrow();
    expect(() => assertRuntimeCommand(["cmd.exe", "/c", "npm ci"])).toThrow();
    expect(() => assertRuntimeCommand(["env", "npm", "install"])).toThrow();
    expect(() => assertRuntimeCommand(["busybox", "sh", "-c", "npm ci"])).toThrow();
    expect(() => assertArgvCommand(["bun run dev"])).toThrow();
    expect(() => assertArgvCommand(["bun", "run", "dev"])).not.toThrow();
  });

  test("rejects dependency mutation and on-demand browser installation", () => {
    expect(() => assertRuntimeCommand(["bun", "run", "dev"])).not.toThrow();
    expect(() => assertRuntimeCommand(["npm", "run", "storybook"])).not.toThrow();
    for (const command of [
      ["bun", "install"],
      ["npm", "ci"],
      ["pnpm", "add", "react"],
      ["yarn", "install"],
      ["npx", "vite"],
      ["playwright", "install", "chromium"]
    ]) {
      expect(() => assertRuntimeCommand(command), command.join(" ")).toThrow();
    }
  });

  test("builds an allowlisted environment without parent secrets", () => {
    const env = buildChildEnvironment(
      { PATH: "/bin", NODE_ENV: "test", API_TOKEN: "secret", UNLISTED: "value" },
      ["NODE_ENV"]
    );
    expect(env).toEqual({ PATH: "/bin", NODE_ENV: "test" });
    expect(() => buildChildEnvironment({ API_TOKEN: "secret" }, ["API_TOKEN"])).toThrow();
  });

  test("allows loopback and explicit origins only", () => {
    expect(assertAllowedUrl("http://127.0.0.1:4173/").hostname).toBe("127.0.0.1");
    expect(() => assertAllowedUrl("file:///tmp/report")).toThrow();
    expect(() => assertAllowedUrl("https://example.com/")).toThrow();
    expect(assertAllowedUrl("https://example.com/", ["https://example.com"]).origin).toBe(
      "https://example.com"
    );
  });

  test("rejects archive traversal", () => {
    expect(() => assertArchiveEntryPath("../../secret")).toThrow();
    expect(() => assertArchiveEntryPath("C:\\Users\\secret")).toThrow();
    expect(assertArchiveEntryPath("assets/report.json")).toBe("assets/report.json");
    expect(() =>
      assertArchiveEntriesSafe([
        { path: "report/value", kind: "file", uncompressedBytes: 1 },
        { path: "report\\value", kind: "file", uncompressedBytes: 1 }
      ])
    ).toThrow();
    expect(() =>
      assertArchiveEntriesSafe([{ path: "report/link", kind: "symlink", uncompressedBytes: 0 }])
    ).toThrow();
    expect(() =>
      assertArchiveEntriesSafe([{ path: "report/large", kind: "file", uncompressedBytes: 10 }], {
        maximumUncompressedBytes: 5
      })
    ).toThrow();
  });

  test("rejects path traversal and symlink escape", async () => {
    const root = path.join(tmpdir(), `utsuri-security-${process.pid}-${Date.now()}`);
    await mkdir(path.join(root, "safe"), { recursive: true });
    await writeFile(path.join(root, "safe", "value.txt"), "ok");
    const largeValue = Buffer.alloc(256 * 1024, 0x5a);
    await writeFile(path.join(root, "safe", "large.bin"), largeValue);
    await symlink(tmpdir(), path.join(root, "escape"));

    await expect(resolveContainedPath(root, "safe/value.txt")).resolves.toEndWith("safe/value.txt");
    await expect(readContainedRegularFile(root, "safe/value.txt")).resolves.toEqual(
      Buffer.from("ok")
    );
    await expect(readContainedRegularFile(root, "safe/large.bin")).resolves.toEqual(largeValue);
    await expect(
      readContainedRegularFile(root, "safe/value.txt", { timeoutMs: 0 })
    ).rejects.toThrow();
    const parallelReads = await Promise.all(
      Array.from({ length: 64 }, () => readContainedRegularFile(root, "safe/large.bin"))
    );
    expect(parallelReads.every((value) => value.equals(largeValue))).toBeTrue();
    await expect(
      resolveContainedPath(root, "../outside", { allowMissing: true })
    ).rejects.toThrow();
    await expect(
      resolveContainedPath(root, "escape/secret", { allowMissing: true })
    ).rejects.toThrow();
    await expect(readContainedRegularFile(root, "escape/secret")).rejects.toThrow();
  });

  test("never follows a parent replaced with a symlink during contained reads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "utsuri-contained-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "utsuri-contained-outside-"));
    const live = path.join(root, "live");
    const held = path.join(root, "held");
    try {
      await mkdir(live);
      await writeFile(path.join(live, "value.txt"), "inside");
      await writeFile(path.join(outside, "value.txt"), "outside-secret");
      const swap = async () => {
        for (let index = 0; index < 40; index += 1) {
          await rename(live, held);
          await symlink(outside, live);
          await rm(live);
          await rename(held, live);
        }
      };
      const reads = Promise.all(
        Array.from({ length: 80 }, async () => {
          try {
            return (await readContainedRegularFile(root, "live/value.txt")).toString("utf8");
          } catch {
            return "rejected";
          }
        })
      );
      const [values] = await Promise.all([reads, swap()]);
      expect(values).not.toContain("outside-secret");
      expect(values.every((value) => value === "inside" || value === "rejected")).toBeTrue();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
