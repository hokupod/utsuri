import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { createConnection } from "node:net";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { stableHash } from "../../packages/core/src";
import type { Annotations, UtsuriConfig, UtsuriReport } from "../../packages/report-model/src";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import { startStaticReportServer } from "../../packages/interactive-server/src";
import {
  computeReportCacheKey,
  evaluateCiPolicy,
  packReport,
  previewPackReport
} from "../../packages/cli/src/pack";
import { executeCli } from "../../packages/cli/src/cli";

const root = path.resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];

beforeAll(() => {
  execFileSync(process.execPath, [path.join(root, "scripts/build-native-helper.mjs")], {
    cwd: root,
    stdio: "ignore"
  });
});

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function reportRun(): Promise<{
  root: string;
  reportDirectory: string;
  report: UtsuriReport;
}> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "utsuri-phase5-"));
  temporaryDirectories.push(temporary);
  const run = path.join(temporary, "run");
  await mkdir(run, { mode: 0o700 });
  await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n', { mode: 0o600 });
  const report = await createInitialReport(run);
  const built = await buildReport(run, report, {
    now: new Date(0),
    toolVersion: "0.1.0"
  });
  return { root: temporary, reportDirectory: built.reportDirectory, report };
}

async function verificationReportRun() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "utsuri-preview-"));
  temporaryDirectories.push(temporary);
  const run = path.join(temporary, "run");
  await mkdir(path.join(run, "verification"), { recursive: true });
  await writeFile(
    path.join(run, "input.json"),
    JSON.stringify({ mode: "empty", head: "a".repeat(40) })
  );
  const logs = {
    "verification/check.log": "SYNTHETIC_LOG_BODY_150 <script>not executable</script>\n",
    "verification/check.txt": "Synthetic text verification\n",
    "verification/check.ndjson": '{"synthetic":true}\n'
  };
  for (const [name, text] of Object.entries(logs)) await writeFile(path.join(run, name), text);
  const annotations: Annotations = {
    schemaVersion: "1.0",
    language: "en",
    overview: "Reference text ./verification/check.log remains a reference, not embedded bytes.",
    changes: [],
    verificationResults: Object.entries(logs).map(([name, text], index) => ({
      id: `verification:log-${index}`,
      kind: "unit-tests",
      environment: "Synthetic ./verification/check.log environment",
      command: ["synthetic-runner", "SYNTHETIC_PRIVATE_ARG_150"],
      subjectSha: "a".repeat(40),
      exitCode: 0,
      passedCount: 1,
      warnings: [],
      changeRefs: [],
      completedAt: "2026-10-02T00:00:00Z",
      logRef: name,
      logSha256: createHash("sha256").update(text).digest("hex")
    }))
  };
  const report = await createInitialReport(run, annotations);
  const built = await buildReport(run, report, {
    annotations,
    now: new Date(0),
    toolVersion: "0.1.0"
  });
  return { root: temporary, reportDirectory: built.reportDirectory, report, logs };
}

async function treeSnapshot(directory: string) {
  const entries: {
    path: string;
    mode: number;
    mtime: number;
    content: string | null;
  }[] = [];
  async function visit(relative: string) {
    const filename = path.join(directory, relative);
    const info = await lstat(filename);
    entries.push({
      path: relative,
      mode: info.mode,
      mtime: info.mtimeMs,
      content: info.isFile()
        ? createHash("sha256")
            .update(await readFile(filename))
            .digest("hex")
        : info.isSymbolicLink()
          ? await readlink(filename)
          : null
    });
    if (info.isDirectory()) {
      for (const name of (await readdir(filename)).sort()) await visit(path.join(relative, name));
    }
  }
  await visit(".");
  return entries;
}

async function packConfig(): Promise<UtsuriConfig> {
  return JSON.parse(
    await readFile(path.join(root, "fixtures/schemas/valid/config.minimal.json"), "utf8")
  ) as UtsuriConfig;
}

function rawRequest(options: {
  host: string;
  port: number;
  path: string;
  hostHeader?: string;
}): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: "GET",
        headers: options.hostHeader ? { host: options.hostHeader } : undefined
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers
          })
        );
      }
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function rawTcpRequest(options: {
  host: string;
  port: number;
  path: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port });
    const chunks: Buffer[] = [];
    socket.once("error", reject);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf8");
      const [headers = "", body = ""] = response.split("\r\n\r\n", 2);
      const status = Number(/^HTTP\/1\.1 (\d{3})/u.exec(headers)?.[1] ?? 0);
      resolve({ status, body });
    });
    socket.once("connect", () => {
      socket.end(
        `GET ${options.path} HTTP/1.1\r\nHost: ${options.host}:${options.port}\r\nConnection: close\r\n\r\n`
      );
    });
  });
}

describe("serve integration", () => {
  test("serves a strict report only from a random loopback origin", async () => {
    const fixture = await reportRun();
    const server = await startStaticReportServer(fixture.reportDirectory);
    try {
      expect(server.host).toBe("127.0.0.1");
      expect(server.port).toBeGreaterThan(0);
      const response = await fetch(server.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Utsuri review");
      expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");

      const traversal = await rawTcpRequest({
        host: server.host,
        port: server.port,
        path: "/%2e%2e/report.json"
      });
      expect(traversal.status).not.toBe(200);
      expect(traversal.body).not.toContain(fixture.report.reportId);
      const wrongHost = await rawRequest({
        host: server.host,
        port: server.port,
        path: "/report.json",
        hostHeader: "attacker.invalid"
      });
      expect(wrongHost.status).toBe(421);
    } finally {
      await server.close();
    }
  });

  test("rejects a non-loopback bind before opening a socket", async () => {
    const fixture = await reportRun();
    await expect(
      startStaticReportServer(fixture.reportDirectory, { host: "0.0.0.0" })
    ).rejects.toMatchObject({ diagnosticId: "SERVE_NON_LOOPBACK" });
  });
});

describe("ci-policy and pack integration", () => {
  test("returns exit 10 for configured machine-readable conditions", async () => {
    const fixture = await reportRun();
    const result = evaluateCiPolicy(fixture.report, {
      failOn: ["capture-incomplete"],
      warnOn: []
    });
    expect(result).toEqual({
      observed: ["capture-incomplete"],
      failures: ["capture-incomplete"],
      warnings: [],
      exitCode: 10
    });

    const config = JSON.parse(
      await readFile(path.join(root, "fixtures/schemas/valid/config.minimal.json"), "utf8")
    ) as UtsuriConfig;
    config.policy = { failOn: ["capture-incomplete"], warnOn: [] };
    const configFile = path.join(fixture.root, "utsuri.json");
    await writeFile(configFile, `${JSON.stringify(config)}\n`, { mode: 0o600 });
    const packed = await packReport(fixture.root, "run/report", "ci-policy", {
      config: "utsuri.json",
      singleFile: false
    });
    expect(packed.exitCode).toBe(10);
    const summary = JSON.parse(
      await readFile(path.join(fixture.root, "ci-policy/ci-summary.json"), "utf8")
    ) as { policy: { exitCode: number; failures: string[] } };
    expect(summary.policy).toMatchObject({
      exitCode: 10,
      failures: ["capture-incomplete"]
    });
  });

  test("creates deterministic multi-file and bounded single-file artifacts", async () => {
    const fixture = await reportRun();
    const first = await packReport(fixture.root, "run/report", "first", {
      singleFile: true,
      maximumSingleFileBytes: 64 * 1024 * 1024
    });
    const second = await packReport(fixture.root, "run/report", "second", {
      singleFile: true,
      maximumSingleFileBytes: 64 * 1024 * 1024
    });
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.data.cacheKey).toBe(second.data.cacheKey);
    expect(await readFile(path.join(fixture.root, "first/report.zip"))).toEqual(
      await readFile(path.join(fixture.root, "second/report.zip"))
    );
    const archive = unzipSync(await readFile(path.join(fixture.root, "first/report.zip")));
    expect(Object.keys(archive)).toContain("report/manifest.json");
    expect(Object.keys(archive)).toContain("report/report.json");
    expect((await stat(path.join(fixture.root, "first/report.single.html"))).isFile()).toBe(true);
    const single = await readFile(path.join(fixture.root, "first/report.single.html"), "utf8");
    expect(single).toContain("connect-src 'none'");
    expect(single).toContain("data-utsuri-report");

    const fallback = await packReport(fixture.root, "run/report", "fallback", {
      singleFile: true,
      maximumSingleFileBytes: 65_536
    });
    expect(fallback.data.singleFile).toMatchObject({
      requested: true,
      included: false
    });
    await expect(
      stat(path.join(fixture.root, "fallback/report.single.html"))
    ).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  test("preserves verification logs as plain text in archive and single-file reports", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "utsuri-verification-pack-"));
    temporaryDirectories.push(temporary);
    const run = path.join(temporary, "run");
    await mkdir(path.join(run, "verification"), { recursive: true });
    await writeFile(
      path.join(run, "input.json"),
      JSON.stringify({ mode: "empty", head: "a".repeat(40) })
    );
    const log = "<script>untrusted log text</script>\n12 pass\n0 fail\n";
    await writeFile(path.join(run, "verification/check.log"), log);
    const annotations = {
      schemaVersion: "1.0" as const,
      language: "en",
      overview: "Registered verification without visual evidence",
      changes: [],
      verificationResults: [
        {
          id: "verification:unit",
          kind: "unit-tests" as const,
          environment: "Local mocked tests",
          command: ["bun", "test"],
          subjectSha: "a".repeat(40),
          exitCode: 0,
          passedCount: 12,
          warnings: ["External service not exercised"],
          changeRefs: [],
          completedAt: "2026-10-02T00:00:00Z",
          logRef: "verification/check.log",
          logSha256: createHash("sha256").update(log).digest("hex")
        }
      ]
    };
    const report = await createInitialReport(run, annotations);
    await buildReport(run, report, { annotations });
    expect(report.status).toBe("SKIPPED");
    expect(report.verificationResults![0]!.shaMatch).toBe("match");
    await packReport(temporary, "run/report", "packed", { singleFile: true });
    const html = await readFile(path.join(temporary, "packed/report.single.html"), "utf8");
    const data = html.match(
      /<script type="application\/json" data-utsuri-report>(.*?)<\/script>/su
    )![1]!;
    const packedReport = JSON.parse(data) as UtsuriReport;
    const logRef = packedReport.verificationResults![0]!.logRef!;
    expect(logRef).toBe(
      `data:text/plain;charset=utf-8;base64,${Buffer.from(log).toString("base64")}`
    );
    expect(packedReport.status).toBe("SKIPPED");
    const archive = unzipSync(await readFile(path.join(temporary, "packed/report.zip")));
    expect(Buffer.from(archive["report/verification/check.log"]!).toString("utf8")).toBe(log);
    const server = await startStaticReportServer(path.join(run, "report"));
    try {
      const response = await fetch(new URL("./verification/check.log", server.url));
      expect(response.headers.get("content-type")).toStartWith("text/plain");
      expect(await response.text()).toBe(log);
    } finally {
      await server.close();
    }
  });

  test("excludes timestamps, temporary paths, and ports from the cache key", async () => {
    const fixture = await reportRun();
    const config = JSON.parse(
      await readFile(path.join(root, "fixtures/schemas/valid/config.minimal.json"), "utf8")
    ) as UtsuriConfig;
    const first = structuredClone(config) as UtsuriConfig & Record<string, unknown>;
    const second = structuredClone(config) as UtsuriConfig & Record<string, unknown>;
    first.report.outputDirectory = "/private/tmp/first";
    second.report.outputDirectory = "/private/tmp/second";
    first.servers = { before: { readyUrl: "http://127.0.0.1:41001/" } };
    second.servers = { before: { readyUrl: "http://127.0.0.1:52002/" } };
    first.createdAt = "2026-08-07T00:00:00.000Z";
    second.createdAt = "2026-08-08T00:00:00.000Z";
    const manifest = { toolVersion: "0.1.0" };
    expect(computeReportCacheKey(fixture.report, manifest, first)).toBe(
      computeReportCacheKey(fixture.report, manifest, second)
    );
    second.browser = { ...second.browser, locale: "ja-JP" };
    expect(computeReportCacheKey(fixture.report, manifest, first)).not.toBe(
      computeReportCacheKey(fixture.report, manifest, second)
    );
  });
});

describe("pack preview", () => {
  test("matches real ZIP, directory and HTML log payloads without writing", async () => {
    const fixture = await verificationReportRun();
    const before = await treeSnapshot(fixture.root);
    const args = [
      "pack",
      "run/report",
      "--preview",
      "--single-file",
      "--output",
      "packed",
      "--json"
    ];
    const preview = await executeCli(args, fixture.root);
    expect(preview.exitCode).toBe(0);
    expect(await treeSnapshot(fixture.root)).toEqual(before);
    expect((await executeCli(args, fixture.root)).data).toEqual(preview.data);
    expect(await treeSnapshot(fixture.root)).toEqual(before);
    const data = preview.data as {
      verificationLogs: { path: string; directory: string; zip: string; singleFile: string }[];
      singleFile: { actualBytes: number };
    };
    expect(preview.data).toMatchObject({
      ok: true,
      command: "pack",
      preview: true,
      standaloneReportJson: "references-only",
      singleFile: { requested: true, included: true, omissionReason: null }
    });
    const printed = JSON.stringify(preview.data) + preview.human;
    expect(printed).not.toContain("SYNTHETIC_LOG_BODY_150");
    expect(printed).not.toContain("SYNTHETIC_PRIVATE_ARG_150");
    expect(printed).not.toContain(fixture.root);
    expect(printed).not.toContain("data:text/plain");
    expect(preview.human).toStartWith("Pack preview. No files written.");
    const packed = await packReport(fixture.root, "run/report", "packed", { singleFile: true });
    expect(packed.exitCode).toBe(0);
    expect(packed.data).not.toHaveProperty("preview");
    const archive = unzipSync(await readFile(path.join(fixture.root, "packed/report.zip")));
    const html = await readFile(path.join(fixture.root, "packed/report.single.html"), "utf8");
    const embedded = JSON.parse(
      html.match(/<script type="application\/json" data-utsuri-report>(.*?)<\/script>/su)![1]!
    ) as UtsuriReport;
    const standalone = JSON.parse(
      await readFile(path.join(fixture.root, "packed/report.json"), "utf8")
    ) as UtsuriReport;
    expect(Buffer.byteLength(html)).toBe(data.singleFile.actualBytes);
    expect(data.verificationLogs.map((log) => log.path)).toEqual(Object.keys(fixture.logs).sort());
    for (const log of data.verificationLogs) {
      const expected = fixture.logs[log.path as keyof typeof fixture.logs];
      expect(log.directory).toBe(`report/${log.path}`);
      expect(log.zip).toBe(`report/${log.path}`);
      expect(log.singleFile).toBe("embedded");
      expect(Buffer.from(archive[log.zip]!).toString("utf8")).toBe(expected);
      expect(await readFile(path.join(fixture.root, "packed", log.directory), "utf8")).toBe(
        expected
      );
      const original = standalone.verificationResults!.find(
        (result) => result.logRef === log.path
      )!;
      const reference = embedded.verificationResults!.find(
        (result) => result.id === original.id
      )!.logRef!;
      expect(reference).toStartWith("data:text/plain;charset=utf-8;base64,");
      expect(Buffer.from(reference.split(",")[1]!, "base64").toString("utf8")).toBe(expected);
      expect(original.logRef).toBe(log.path);
    }
    expect(embedded.verificationResults![0]!.environment).toBe(
      fixture.report.verificationResults![0]!.environment
    );
    expect(embedded.verificationResults![0]!.environment).toContain("./verification/check.log");
  });

  test("handles no logs and a single-file report that was not requested", async () => {
    const empty = await reportRun();
    const before = await treeSnapshot(empty.root);
    const preview = await previewPackReport(empty.root, "run/report", { singleFile: false });
    expect(preview.data).toMatchObject({
      verificationLogs: [],
      singleFile: {
        requested: false,
        included: false,
        actualBytes: null,
        omissionReason: "not-requested"
      }
    });
    expect(preview.human).toContain("Verification logs: none.");
    expect(await treeSnapshot(empty.root)).toEqual(before);
    const fixture = await verificationReportRun();
    const result = await previewPackReport(fixture.root, "run/report", { singleFile: false });
    expect(
      (result.data.verificationLogs as { singleFile: string }[]).every(
        (log) => log.singleFile === "not-requested"
      )
    ).toBe(true);
  });

  test("uses real HTML bytes at the exact size boundary and config precedence", async () => {
    const fixture = await verificationReportRun();
    const first = await previewPackReport(fixture.root, "run/report", { singleFile: true });
    const bytes = (first.data.singleFile as { actualBytes: number }).actualBytes;
    const exact = await previewPackReport(fixture.root, "run/report", {
      singleFile: true,
      maximumSingleFileBytes: bytes
    });
    expect(exact.data.singleFile).toMatchObject({
      included: true,
      actualBytes: bytes,
      maximumBytes: bytes
    });
    await packReport(fixture.root, "run/report", "exact", {
      singleFile: true,
      maximumSingleFileBytes: bytes
    });
    expect((await stat(path.join(fixture.root, "exact/report.single.html"))).size).toBe(bytes);
    const smaller = await previewPackReport(fixture.root, "run/report", {
      singleFile: true,
      maximumSingleFileBytes: bytes - 1,
      output: "smaller"
    });
    expect(smaller.data.singleFile).toMatchObject({
      included: false,
      actualBytes: bytes,
      maximumBytes: bytes - 1,
      omissionReason: "size-limit"
    });
    expect(
      (smaller.data.verificationLogs as { singleFile: string }[]).every(
        (log) => log.singleFile === "size-limit"
      )
    ).toBe(true);
    const fallback = await packReport(fixture.root, "run/report", "smaller", {
      singleFile: true,
      maximumSingleFileBytes: bytes - 1
    });
    expect(fallback.data.singleFile).toMatchObject({ included: false, actualBytes: bytes });
    await expect(stat(path.join(fixture.root, "smaller/report.single.html"))).rejects.toMatchObject(
      { code: "ENOENT" }
    );
    const config = await packConfig();
    config.report.singleFile = true;
    config.report.singleFileMaxBytes = 65_536;
    await writeFile(path.join(fixture.root, "config.json"), JSON.stringify(config));
    const before = await treeSnapshot(fixture.root);
    const configured = await executeCli(
      ["pack", "run/report", "--preview", "--config", "config.json", "--json"],
      fixture.root
    );
    expect(configured.data).toMatchObject({
      singleFile: {
        requested: true,
        included: false,
        maximumBytes: 65_536,
        omissionReason: "size-limit"
      }
    });
    const overridden = await executeCli(
      [
        "pack",
        "run/report",
        "--preview",
        "--config",
        "config.json",
        "--max-bytes",
        String(bytes),
        "--json"
      ],
      fixture.root
    );
    expect(overridden.data).toMatchObject({ singleFile: { included: true, maximumBytes: bytes } });
    expect(await treeSnapshot(fixture.root)).toEqual(before);
  });

  test("preserves policy exit 10 without creating artifacts", async () => {
    const fixture = await reportRun();
    const config = await packConfig();
    config.policy = { failOn: ["capture-incomplete"], warnOn: [] };
    await writeFile(path.join(fixture.root, "config.json"), JSON.stringify(config));
    const before = await treeSnapshot(fixture.root);
    const result = await executeCli(
      [
        "pack",
        "run/report",
        "--preview",
        "--output",
        "policy-output",
        "--config",
        "config.json",
        "--json"
      ],
      fixture.root
    );
    expect(result.exitCode).toBe(10);
    expect(result.data).toMatchObject({ ok: false, preview: true });
    expect(result.human).toContain("CI policy failed.");
    expect(await treeSnapshot(fixture.root)).toEqual(before);
  });

  test.each(["manifest", "hash", "missing", "unreferenced"])(
    "rejects %s corruption without writing or exposing input data",
    async (kind) => {
      const fixture = await verificationReportRun();
      const manifestPath = path.join(fixture.reportDirectory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (kind === "manifest") {
        manifest.assetHashes["/sensitive/SYNTHETIC_MANIFEST_150"] = "0".repeat(64);
        await writeFile(manifestPath, JSON.stringify(manifest));
      } else if (kind === "hash") {
        await writeFile(
          path.join(fixture.reportDirectory, "verification/check.log"),
          "Altered synthetic bytes"
        );
      } else if (kind === "missing") {
        await rm(path.join(fixture.reportDirectory, "verification/check.log"));
      } else {
        const orphan = "verification/orphan.log";
        const content = "Synthetic orphan is not part of the report";
        await writeFile(path.join(fixture.reportDirectory, orphan), content);
        manifest.assetHashes[orphan] = createHash("sha256").update(content).digest("hex");
        manifest.semanticHash = stableHash({
          report: fixture.report,
          sourceSnapshotHash: manifest.sourceSnapshotHash,
          assetHashes: manifest.assetHashes
        });
        await writeFile(manifestPath, JSON.stringify(manifest));
      }
      const before = await treeSnapshot(fixture.root);
      const result = await executeCli(
        ["pack", "run/report", "--preview", "--output", "invalid", "--json"],
        fixture.root
      );
      expect(result.exitCode).toBe(5);
      expect(result.data).toEqual({
        ok: false,
        error: { id: "PACK_REPORT_INVALID", message: "Pack preview failed.", exitCode: 5 }
      });
      expect(JSON.stringify(result.data) + result.human).not.toContain("SYNTHETIC_MANIFEST_150");
      expect(JSON.stringify(result.data) + result.human).not.toContain(fixture.root);
      await expect(
        packReport(fixture.root, "run/report", "invalid", { singleFile: false })
      ).rejects.toMatchObject({ diagnosticId: "PACK_REPORT_INVALID", exitCode: 5 });
      expect(await treeSnapshot(fixture.root)).toEqual(before);
    }
  );

  test("keeps output containment, existing-target and symlink rejection", async () => {
    const fixture = await verificationReportRun();
    await mkdir(path.join(fixture.root, "exists"));
    await symlink("run/report", path.join(fixture.root, "report-link"));
    const before = await treeSnapshot(fixture.root);
    for (const [output, diagnosticId] of [
      ["run/report/new", "PACK_OUTPUT_INSIDE_REPORT"],
      ["exists", "PACK_OUTPUT_EXISTS"],
      ["report-link/new", "SEC_PATH_SYMLINK"],
      ["../outside", "SEC_PATH_TRAVERSAL"],
      ["missing/new", "SEC_PATH_MISSING"]
    ]) {
      const result = await executeCli(
        ["pack", "run/report", "--preview", "--output", output!, "--json"],
        fixture.root
      );
      expect(result.data).toMatchObject({ error: { id: diagnosticId } });
      expect(result.exitCode).not.toBe(0);
      await expect(
        packReport(fixture.root, "run/report", output!, { singleFile: false })
      ).rejects.toMatchObject({ diagnosticId });
    }
    for (const [report, diagnosticId] of [
      ["report-link", "SEC_PATH_SYMLINK"],
      ["../outside", "SEC_PATH_TRAVERSAL"]
    ]) {
      const result = await executeCli(["pack", report!, "--preview", "--json"], fixture.root);
      expect(result.data).toMatchObject({ error: { id: diagnosticId } });
    }
    expect(await treeSnapshot(fixture.root)).toEqual(before);
  });

  test.each([0, 65_535, 67_108_865, Number.NaN])(
    "retains invalid single-file limit rejection for %s",
    async (maximumSingleFileBytes) => {
      const fixture = await reportRun();
      const before = await treeSnapshot(fixture.root);
      await expect(
        previewPackReport(fixture.root, "run/report", { singleFile: true, maximumSingleFileBytes })
      ).rejects.toMatchObject({ diagnosticId: "PACK_SINGLE_FILE_LIMIT", exitCode: 2 });
      expect(await treeSnapshot(fixture.root)).toEqual(before);
    }
  );
});
