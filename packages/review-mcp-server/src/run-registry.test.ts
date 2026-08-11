import { describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { UtsuriReport } from "@utsu-ri/report-model";
import {
  assertSafeRegistrationRunPath,
  maximumRegistrationEntries,
  mcpRegistrationDirectory,
  readMcpRunRegistrations,
  registerMcpRun
} from "./run-registry";

const reportFixture = path.resolve(
  import.meta.dir,
  "../../../fixtures/schemas/valid/report.empty.json"
);
const sessionRef = `session:${"1".repeat(64)}`;
const projectFingerprint = "2".repeat(64);

async function fixture(
  bound = true,
  options: { root?: string; name?: string; reportId?: string } = {}
) {
  const root = options.root ?? (await mkdtemp(path.join(tmpdir(), "utsuri-run-registry-")));
  const run = path.join(root, options.name ?? "run");
  const reportDirectory = path.join(run, "report");
  await mkdir(reportDirectory, { recursive: true });
  const report = JSON.parse(await readFile(reportFixture, "utf8")) as UtsuriReport;
  if (options.reportId) report.reportId = options.reportId;
  report.origin = bound
    ? {
        host: "codex",
        sessionRef,
        projectFingerprint,
        reportId: report.reportId,
        bindingMode: "return-to-session",
        createdAt: "2026-08-11T00:00:00.000Z"
      }
    : {
        host: "unknown",
        projectFingerprint,
        reportId: report.reportId,
        bindingMode: "unbound",
        createdAt: "2026-08-11T00:00:00.000Z"
      };
  await writeFile(path.join(reportDirectory, "report.json"), `${JSON.stringify(report)}\n`);
  return { root, run, report };
}

async function seedSlotRegistration(directory: string, index: number, reportId: string) {
  const registration = {
    schemaVersion: "1.0",
    sessionRef,
    projectFingerprint,
    reportId,
    runPath: "run",
    reportSha256: "3".repeat(64),
    createdAt: "2026-08-11T00:00:00.000Z"
  };
  const filename = `${createHash("sha256").update(reportId).digest("hex")}.json`;
  const final = path.join(directory, filename);
  await writeFile(final, `${JSON.stringify(registration)}\n`, { mode: 0o600 });
  await link(final, path.join(directory, `.slot-${String(index).padStart(2, "0")}`));
}

describe("MCP run registry", () => {
  test("writes one private, digest-named registration and reuses identical bytes", async () => {
    const current = await fixture();
    try {
      const [first, second] = await Promise.all([
        registerMcpRun({
          projectRoot: current.root,
          runDirectory: current.run,
          report: current.report
        }),
        registerMcpRun({
          projectRoot: current.root,
          runDirectory: current.run,
          report: current.report
        })
      ]);
      expect([first.reused, second.reused].sort()).toEqual([false, true]);
      const registrations = await readMcpRunRegistrations(current.root);
      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toMatchObject({
        schemaVersion: "1.0",
        sessionRef,
        projectFingerprint,
        reportId: current.report.reportId,
        runPath: "run"
      });
      const filename = `${createHash("sha256").update(current.report.reportId).digest("hex")}.json`;
      const stat = await lstat(path.join(current.root, mcpRegistrationDirectory, filename));
      expect(stat.isFile()).toBeTrue();
      expect(stat.mode & 0o077).toBe(0);
      expect(JSON.stringify(registrations)).not.toContain("00000000-0000");
      expect(JSON.stringify(registrations)).not.toContain(current.root);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("does not register an unbound report", async () => {
    const current = await fixture(false);
    try {
      const result = await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      expect(result.state).toBe("not-registered");
      expect(await readMcpRunRegistrations(current.root)).toEqual([]);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("rejects conflicting bytes without exposing the session or project path", async () => {
    const current = await fixture();
    try {
      await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      const changed = structuredClone(current.report);
      changed.origin.projectFingerprint = "3".repeat(64);
      await writeFile(
        path.join(current.run, "report", "report.json"),
        `${JSON.stringify(changed)}\n`
      );
      const error = await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: changed
      }).catch((caught: unknown) => caught as Error);
      if (!(error instanceof Error)) throw new Error("Expected registration conflict");
      expect(error.message).toContain("differs");
      expect(error.message).not.toContain(sessionRef);
      expect(error.message).not.toContain(current.root);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("accepts bounded POSIX names and rejects traversal, separators, NUL, and ambiguous components", () => {
    for (const value of [
      "",
      ".",
      "..",
      "./run",
      "../run",
      "run/.",
      "run/../other",
      "run\\other",
      "/run",
      "run/",
      "run\0x",
      "run//x",
      "a".repeat(4097)
    ])
      expect(() => assertSafeRegistrationRunPath(value)).toThrow();
    expect(assertSafeRegistrationRunPath(".artifacts/utsuri/run-1")).toBe(
      ".artifacts/utsuri/run-1"
    );
    expect(assertSafeRegistrationRunPath("レビュー run/結果 1")).toBe("レビュー run/結果 1");
    expect(assertSafeRegistrationRunPath("a".repeat(4096))).toBe("a".repeat(4096));
  });

  test("rejects symlinked registry paths", async () => {
    const current = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "utsuri-run-registry-outside-"));
    try {
      await mkdir(path.join(current.root, ".artifacts"));
      await symlink(outside, path.join(current.root, ".artifacts", "utsuri"));
      await expect(readMcpRunRegistrations(current.root)).rejects.toThrow(
        "regular project directory"
      );
    } finally {
      await rm(current.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("rejects oversized files and excessive inventories before parsing", async () => {
    const oversized = await fixture();
    const excessive = await fixture();
    try {
      await registerMcpRun({
        projectRoot: oversized.root,
        runDirectory: oversized.run,
        report: oversized.report
      });
      const directory = path.join(oversized.root, mcpRegistrationDirectory);
      const [filename] = await import("node:fs/promises").then(({ readdir }) => readdir(directory));
      await writeFile(path.join(directory, filename!), "x".repeat(16 * 1024 + 1));
      await expect(readMcpRunRegistrations(oversized.root)).rejects.toThrow("file is invalid");

      const excessiveDirectory = path.join(excessive.root, mcpRegistrationDirectory);
      await mkdir(excessiveDirectory, { recursive: true });
      for (let index = 0; index <= maximumRegistrationEntries; index += 1) {
        await writeFile(
          path.join(excessiveDirectory, `${index.toString(16).padStart(64, "0")}.json`),
          "{}"
        );
      }
      await expect(readMcpRunRegistrations(excessive.root)).rejects.toThrow("entry limit");
    } finally {
      await rm(oversized.root, { recursive: true, force: true });
      await rm(excessive.root, { recursive: true, force: true });
    }
  });

  test("keeps the 64-entry cap when a paused slot owner resumes after recovery", async () => {
    const current = await fixture();
    try {
      await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      const directory = path.join(current.root, mcpRegistrationDirectory);
      for (let index = 1; index < maximumRegistrationEntries - 1; index += 1) {
        await seedSlotRegistration(directory, index, `report-placeholder-${index}`);
      }
      const left = await fixture(true, {
        root: current.root,
        name: "left",
        reportId: "report-boundary-left"
      });
      const right = await fixture(true, {
        root: current.root,
        name: "right",
        reportId: "report-boundary-right"
      });
      let resumeOwner!: () => void;
      const ownerPaused = new Promise<void>((resolve) => {
        resumeOwner = resolve;
      });
      let ownerReachedLink!: () => void;
      const ownerReady = new Promise<void>((resolve) => {
        ownerReachedLink = resolve;
      });
      let paused = false;
      const leftRegistration = registerMcpRun(
        {
          projectRoot: current.root,
          runDirectory: left.run,
          report: left.report
        },
        {
          async beforeOperation(operation) {
            if (operation === "link-registration" && !paused) {
              paused = true;
              ownerReachedLink();
              await ownerPaused;
            }
          }
        }
      );
      await ownerReady;
      const rightRegistration = registerMcpRun({
        projectRoot: current.root,
        runDirectory: right.run,
        report: right.report
      });
      await expect(rightRegistration).rejects.toMatchObject({
        diagnosticId: "MCP_REGISTRATION_LIMIT"
      });
      resumeOwner();
      await expect(leftRegistration).resolves.toMatchObject({ state: "registered" });
      expect(
        (await readdir(directory)).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name))
      ).toHaveLength(maximumRegistrationEntries);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("ignores in-flight own temp files and recovers stale own temp files", async () => {
    const current = await fixture();
    let releaseLink!: () => void;
    const linkBlocked = new Promise<void>((resolve) => {
      releaseLink = resolve;
    });
    let observedTemp!: () => void;
    const tempReady = new Promise<void>((resolve) => {
      observedTemp = resolve;
    });
    let blocked = false;
    try {
      const registration = registerMcpRun(
        {
          projectRoot: current.root,
          runDirectory: current.run,
          report: current.report
        },
        {
          beforeOperation: async (operation) => {
            if (operation === "claim-registration-slot" && !blocked) {
              blocked = true;
              observedTemp();
              await linkBlocked;
            }
          }
        }
      );
      await tempReady;
      expect(await readMcpRunRegistrations(current.root)).toEqual([]);
      releaseLink();
      await registration;
      const directory = path.join(current.root, mcpRegistrationDirectory);
      const stale = `.${"a".repeat(64)}.json.${randomUUID()}.tmp`;
      await writeFile(path.join(directory, stale), "stale\n");
      const old = new Date(Date.now() - 10 * 60 * 1_000);
      await utimes(path.join(directory, stale), old, old);
      expect(await readMcpRunRegistrations(current.root)).toHaveLength(1);
      expect(await readdir(directory)).not.toContain(stale);
    } finally {
      releaseLink?.();
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("promotes a crash-left slot without freeing its bounded capacity", async () => {
    const current = await fixture();
    try {
      await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      const directory = path.join(current.root, mcpRegistrationDirectory);
      const filename = `${createHash("sha256").update(current.report.reportId).digest("hex")}.json`;
      await unlink(path.join(directory, filename));
      expect(await readdir(directory)).not.toContain(filename);
      await expect(readMcpRunRegistrations(current.root)).resolves.toHaveLength(1);
      expect(await readdir(directory)).toContain(filename);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("preserves the primary failure and leaves a recoverable slot when temp cleanup fails", async () => {
    const current = await fixture();
    try {
      const error = (await registerMcpRun(
        {
          projectRoot: current.root,
          runDirectory: current.run,
          report: current.report
        },
        {
          beforeOperation(operation) {
            if (operation === "link-registration") {
              throw new UtsuriError("TEST_PRIMARY", "primary", ExitCode.Security);
            }
            if (operation === "remove-registration-temp") {
              throw new UtsuriError("TEST_CLEANUP", "cleanup", ExitCode.Security);
            }
          }
        }
      ).catch((caught) => caught as UtsuriError)) as UtsuriError;
      expect(error.diagnosticId).toBe("TEST_PRIMARY");
      expect(await readMcpRunRegistrations(current.root)).toHaveLength(1);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });

  test("sanitizes injected filesystem failures and detects a parent-directory swap", async () => {
    const current = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "utsuri-run-registry-swap-"));
    try {
      await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      const raw = `${current.root}/secret-file ${sessionRef} ambient-value`;
      const injected = (await readMcpRunRegistrations(current.root, {
        beforeOperation(operation) {
          if (operation === "read-inventory") {
            const error = new Error(raw) as NodeJS.ErrnoException;
            error.code = "EACCES";
            error.path = raw;
            throw error;
          }
        }
      }).catch((caught) => caught as UtsuriError)) as UtsuriError;
      expect(injected.diagnosticId).toBe("MCP_REGISTRATION_FILESYSTEM");
      expect(injected.message).not.toContain(current.root);
      expect(injected.message).not.toContain(sessionRef);
      expect(injected.message).not.toContain("ambient-value");

      const utsuri = path.join(current.root, ".artifacts", "utsuri");
      const backup = path.join(current.root, ".artifacts", "utsuri-real");
      await mkdir(path.join(outside, "mcp", "registrations"), { recursive: true });
      let swapped = false;
      const swapError = (await readMcpRunRegistrations(current.root, {
        async beforeOperation(operation) {
          if (operation === "read-inventory" && !swapped) {
            swapped = true;
            await rename(utsuri, backup);
            await symlink(outside, utsuri);
          }
        }
      }).catch((caught) => caught as UtsuriError)) as UtsuriError;
      expect(swapError.diagnosticId).toBe("MCP_REGISTRATION_DIRECTORY_CHANGED");
      expect(swapError.message).not.toContain(current.root);
      expect(await readdir(path.join(outside, "mcp", "registrations"))).toEqual([]);
      await unlink(utsuri);
      await rename(backup, utsuri);
    } finally {
      await rm(current.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("still fails closed for unrelated registry inventory", async () => {
    const current = await fixture();
    try {
      await registerMcpRun({
        projectRoot: current.root,
        runDirectory: current.run,
        report: current.report
      });
      await writeFile(path.join(current.root, mcpRegistrationDirectory, "unrelated"), "x");
      await expect(readMcpRunRegistrations(current.root)).rejects.toMatchObject({
        diagnosticId: "MCP_REGISTRATION_INVENTORY"
      });
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });
});
