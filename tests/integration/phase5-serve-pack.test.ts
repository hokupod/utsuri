import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { createConnection } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import type { UtsuriConfig, UtsuriReport } from "../../packages/report-model/src";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import { startStaticReportServer } from "../../packages/interactive-server/src";
import { computeReportCacheKey, evaluateCiPolicy, packReport } from "../../packages/cli/src/pack";

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
