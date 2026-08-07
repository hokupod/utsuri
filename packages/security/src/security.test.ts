import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertAllowedUrl,
  assertArchiveEntryPath,
  assertArgvCommand,
  buildChildEnvironment,
  resolveContainedPath
} from "./index";

describe("security primitives", () => {
  test("rejects string and shell-like commands", () => {
    expect(() => assertArgvCommand("bun run dev && curl example.invalid")).toThrow();
    expect(() => assertArgvCommand(["sh", "-c", "echo unsafe"])).toThrow();
    expect(() => assertArgvCommand(["bun run dev"])).toThrow();
    expect(() => assertArgvCommand(["bun", "run", "dev"])).not.toThrow();
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
    expect(assertArchiveEntryPath("assets/report.json")).toBe("assets/report.json");
  });

  test("rejects path traversal and symlink escape", async () => {
    const root = path.join(tmpdir(), `utsuri-security-${process.pid}-${Date.now()}`);
    await mkdir(path.join(root, "safe"), { recursive: true });
    await writeFile(path.join(root, "safe", "value.txt"), "ok");
    await symlink(tmpdir(), path.join(root, "escape"));

    await expect(resolveContainedPath(root, "safe/value.txt")).resolves.toEndWith("safe/value.txt");
    await expect(
      resolveContainedPath(root, "../outside", { allowMissing: true })
    ).rejects.toThrow();
    await expect(
      resolveContainedPath(root, "escape/secret", { allowMissing: true })
    ).rejects.toThrow();
  });
});
