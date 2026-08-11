import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { UtsuriReport } from "../../packages/report-model/src";
import {
  startInteractiveReportServer,
  type InteractiveReportServer
} from "../../packages/interactive-server/src";
import {
  createReviewStore,
  loadReviewStore,
  persistReviewStore,
  setJudgment
} from "../../packages/review-state/src";
import { buildReport, createInitialReport } from "../../packages/report-builder/src";
import { bindReportToCurrentSession } from "../../packages/cli/src/feedback";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const temporaryDirectories: string[] = [];
const servers: InteractiveReportServer[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function fixture(): Promise<{
  root: string;
  run: string;
  reportDirectory: string;
  report: UtsuriReport;
  server: InteractiveReportServer;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-localhost-"));
  temporaryDirectories.push(root);
  const run = path.join(root, "run");
  await mkdir(run);
  const source = path.join(repositoryRoot, "fixtures/code-only-review/expected");
  for (const filename of [
    "input.json",
    "diff.json",
    "diff.patch",
    "evidence-index.json",
    "review-plan.json"
  ]) {
    await cp(path.join(source, filename), path.join(run, filename));
  }
  await mkdir(path.join(run, "logs"));
  await cp(path.join(source, "logs/collect.ndjson"), path.join(run, "logs/collect.ndjson"));
  const initial = await createInitialReport(run);
  const bound = await bindReportToCurrentSession(root, initial, {
    CODEX_THREAD_ID: "localhost-origin-session"
  });
  const built = await buildReport(run, bound, {
    toolVersion: "0.1.0",
    origin: bound.origin
  });
  const reportDirectory = built.reportDirectory;
  const report = JSON.parse(
    await readFile(path.join(reportDirectory, "report.json"), "utf8")
  ) as UtsuriReport;
  const server = await startInteractiveReportServer(reportDirectory, {
    originBinding: report.origin
  });
  servers.push(server);
  return { root, run, reportDirectory, report, server };
}

function headers(server: InteractiveReportServer, reportId: string): Record<string, string> {
  return {
    authorization: `Bearer ${server.capabilityToken}`,
    origin: server.origin,
    "sec-fetch-site": "same-origin",
    "x-utsuri-report-id": reportId
  };
}

describe("localhost interactive review boundary", () => {
  test("rejects missing capability, cross-origin, and arbitrary-session requests", async () => {
    const { reportDirectory, report, server } = await fixture();
    const unboundOrigin = structuredClone(report.origin);
    delete unboundOrigin.sessionRef;
    await expect(
      startInteractiveReportServer(reportDirectory, {
        originBinding: {
          ...unboundOrigin,
          host: "unknown",
          bindingMode: "unbound"
        }
      })
    ).rejects.toThrow("Origin Session binding do not match");
    await expect(
      startInteractiveReportServer(reportDirectory, {
        originBinding: {
          ...report.origin,
          sessionRef: `session:${"f".repeat(64)}`
        }
      })
    ).rejects.toThrow("Origin Session binding do not match");
    const missing = await fetch(`${server.origin}/api/v1/review-state`, {
      headers: {
        origin: server.origin,
        "sec-fetch-site": "same-origin",
        "x-utsuri-report-id": report.reportId
      }
    });
    expect(missing.status).toBe(403);

    const crossOrigin = await fetch(`${server.origin}/api/v1/review-state`, {
      headers: { ...headers(server, report.reportId), origin: "https://attacker.invalid" }
    });
    expect(crossOrigin.status).toBe(403);

    const browserRead = await fetch(`${server.origin}/api/v1/review-state`, {
      headers: {
        authorization: `Bearer ${server.capabilityToken}`,
        "sec-fetch-site": "same-origin",
        "x-utsuri-report-id": report.reportId
      }
    });
    expect(browserRead.status).toBe(200);

    const forgedRead = await fetch(`${server.origin}/api/v1/review-state`, {
      headers: {
        authorization: `Bearer ${server.capabilityToken}`,
        referer: "https://attacker.invalid/",
        "sec-fetch-site": "same-origin",
        "x-utsuri-report-id": report.reportId
      }
    });
    expect(forgedRead.status).toBe(403);

    const arbitrary = await fetch(`${server.origin}/api/v1/feedback-batches`, {
      method: "POST",
      headers: { ...headers(server, report.reportId), "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        reportId: report.reportId,
        expectedRevision: 0,
        idempotencyKey: "attempt",
        sessionId: "arbitrary-session"
      })
    });
    expect(arbitrary.status).toBe(403);
  });

  test("stores one idempotent batch without mutating the immutable report", async () => {
    const { reportDirectory, report, server } = await fixture();
    const reportBefore = await readFile(path.join(reportDirectory, "report.json"), "utf8");
    const store = await createReviewStore(report, "2026-08-08T00:00:00.000Z");
    const anchor = store.anchorCatalog.find((entry) => entry.type === "hunk")!;
    const requestHeaders = {
      ...headers(server, report.reportId),
      "content-type": "application/json"
    };
    const comment = await fetch(`${server.origin}/api/v1/review-events`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        schemaVersion: "1.0",
        reportId: report.reportId,
        expectedRevision: 0,
        action: {
          type: "thread.created",
          anchor: { type: anchor.type, ref: anchor.ref, fingerprint: anchor.fingerprint },
          body: "Check @codex as literal text.",
          kind: "question",
          requestAgentAttention: true
        }
      })
    });
    expect(comment.status).toBe(200);

    const preview = await fetch(`${server.origin}/api/v1/feedback-batches/preview`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        schemaVersion: "1.0",
        reportId: report.reportId,
        expectedRevision: 1,
        deliveryMode: "return-to-session"
      })
    });
    expect(preview.status).toBe(200);
    const previewValue = (await preview.json()) as {
      preview: { batch: { items: Array<{ question: string }> } };
    };
    expect(previewValue.preview.batch.items[0]?.question).toContain("@codex");

    const requestBody = JSON.stringify({
      schemaVersion: "1.0",
      reportId: report.reportId,
      expectedRevision: 1,
      idempotencyKey: "browser-submit-1",
      deliveryMode: "return-to-session"
    });
    const first = await fetch(`${server.origin}/api/v1/feedback-batches`, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody
    });
    expect(first.status).toBe(201);
    const firstValue = (await first.json()) as {
      batch: { id: string };
      state: { revision: number };
    };
    const duplicate = await fetch(`${server.origin}/api/v1/feedback-batches`, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody
    });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()) as { created: boolean }).toMatchObject({ created: false });

    const batch = await fetch(
      `${server.origin}/api/v1/feedback-batches/${encodeURIComponent(firstValue.batch.id)}`,
      { headers: headers(server, report.reportId) }
    );
    expect(batch.status).toBe(200);
    expect((await batch.json()) as { batch: { id: string } }).toMatchObject({
      batch: { id: firstValue.batch.id }
    });

    const exported = await fetch(`${server.origin}/api/v1/review/export`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        schemaVersion: "1.0",
        reportId: report.reportId,
        expectedRevision: firstValue.state.revision
      })
    });
    expect(exported.status).toBe(200);
    expect((await exported.json()) as { schemaVersion: string }).toMatchObject({
      schemaVersion: "1.0"
    });
    expect(await readFile(path.join(reportDirectory, "report.json"), "utf8")).toBe(reportBefore);
  });

  test("notifies an open viewer when CLI or MCP commits a new review generation", async () => {
    const { run, report, server } = await fixture();
    const controller = new AbortController();
    const events = await fetch(`${server.origin}/api/v1/events`, {
      headers: headers(server, report.reportId),
      signal: controller.signal
    });
    expect(events.status).toBe(200);
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const nextEvent = async (): Promise<{ type: string; revision?: number }> => {
      while (true) {
        const boundary = pending.indexOf("\n\n");
        if (boundary !== -1) {
          const message = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const data = message
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
          if (data) return JSON.parse(data) as { type: string; revision?: number };
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE stream ended before an event arrived");
        pending += decoder.decode(chunk.value, { stream: true });
      }
    };
    expect(await nextEvent()).toMatchObject({ type: "ready" });

    const store = await loadReviewStore(run, report, "2026-08-08T00:05:00.000Z");
    const changed = await setJudgment(
      store,
      report.changes[0]!.id,
      "follow-up",
      "2026-08-08T00:05:01.000Z"
    );
    await persistReviewStore(run, changed, store.state.revision);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const update = await Promise.race([
        nextEvent(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("SSE revision notification timed out")),
            3000
          );
        })
      ]);
      expect(update).toMatchObject({ type: "review.updated", revision: 1 });
    } finally {
      if (timeout) clearTimeout(timeout);
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });
});
