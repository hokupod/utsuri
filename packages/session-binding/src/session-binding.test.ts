import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertOriginSessionMatch,
  createOriginSessionBinding,
  currentSessionIdentityFromEnvironment,
  opaqueSessionRef
} from "./index";

describe("Origin Session binding", () => {
  test("stores only opaque session and project references", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-session-binding-"));
    try {
      const binding = await createOriginSessionBinding({
        host: "codex",
        sessionId: "host-session-123",
        projectRoot: root,
        repositoryFingerprint: "repository-123",
        reportId: "report:123",
        createdAt: "2026-08-08T00:00:00.000Z"
      });
      expect(binding.sessionRef).toMatch(/^session:[a-f0-9]{64}$/u);
      expect(binding.projectFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(JSON.stringify(binding)).not.toContain(root);
      expect(JSON.stringify(binding)).not.toContain("host-session-123");
      expect(binding.bindingMode).toBe("return-to-session");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a different current conversation", async () => {
    const sessionRef = await opaqueSessionRef("claude-code", "origin");
    const binding = {
      host: "claude-code" as const,
      sessionRef,
      projectFingerprint: "a".repeat(64),
      reportId: "report:123",
      bindingMode: "return-to-session" as const,
      createdAt: "2026-08-08T00:00:00.000Z"
    };
    expect(() =>
      assertOriginSessionMatch(binding, {
        host: "claude-code",
        sessionRef: `session:${"b".repeat(64)}`,
        projectFingerprint: "a".repeat(64),
        reportId: "report:123"
      })
    ).toThrow("does not match");
  });

  test("does not accept a published opaque reference as current-session proof", async () => {
    const published = await opaqueSessionRef("codex", "origin");
    expect(await opaqueSessionRef("codex", published)).not.toBe(published);
    const current = await currentSessionIdentityFromEnvironment({
      environment: { UTSURI_CODEX_SESSION_REF: published },
      projectFingerprint: "a".repeat(64),
      reportId: "report:123"
    });
    expect(current.host).toBe("unknown");
    expect(() =>
      assertOriginSessionMatch(
        {
          host: "codex",
          sessionRef: published,
          projectFingerprint: "a".repeat(64),
          reportId: "report:123",
          bindingMode: "return-to-session",
          createdAt: "2026-08-08T00:00:00.000Z"
        },
        current
      )
    ).toThrow("does not match");
  });

  test("never creates a bound session for an unknown host", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-session-binding-"));
    try {
      await expect(
        createOriginSessionBinding({
          host: "unknown",
          sessionId: "unattributed-session",
          projectRoot: root,
          repositoryFingerprint: "fixture-repository",
          reportId: "report:fixture",
          createdAt: "2026-08-07T00:00:00.000Z"
        })
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
