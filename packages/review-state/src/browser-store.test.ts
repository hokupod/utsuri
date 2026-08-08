import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UtsuriReport } from "@utsu-ri/report-model";
import {
  browserSetJudgment,
  browserSetViewed,
  createBrowserReviewBundle,
  createBrowserReviewStore,
  importBrowserReviewBundle,
  loadBrowserReviewStore,
  saveBrowserReviewStore
} from "./browser-store";
import { buildLegacyVisualAnchorCatalog } from "./anchors";
import { browserReviewDigest } from "./browser-digest";
import type { ReviewAnchor } from "./types";

const root = path.resolve(import.meta.dir, "../../..");
const now = "2026-08-07T00:00:00.000Z";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class SerialLocks {
  private tail: Promise<unknown> = Promise.resolve();

  request<T>(
    _name: string,
    _options: { mode: "exclusive" },
    callback: () => T | Promise<T>
  ): Promise<T> {
    const result = this.tail.then(callback);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

let storageDescriptor: PropertyDescriptor | undefined;
let navigatorDescriptor: PropertyDescriptor | undefined;

async function report(): Promise<UtsuriReport> {
  return JSON.parse(
    await readFile(path.join(root, "fixtures/code-only-review/expected/report/report.json"), "utf8")
  ) as UtsuriReport;
}

async function visualReport(): Promise<UtsuriReport> {
  const source = await report();
  source.targets = [{ id: "target:button", before: {}, after: {} }] as UtsuriReport["targets"];
  source.comparisons = [
    {
      id: "comparison:button",
      targetRef: "target:button",
      images: [
        {
          id: "image:desktop",
          label: "desktop",
          width: 200,
          height: 100,
          beforeRef: "visual/before.png",
          afterRef: "visual/after.png",
          diffRef: "visual/diff.png",
          regions: [{ id: "region:1", x: 50, y: 25, width: 100, height: 50, pixels: 5000 }]
        }
      ]
    }
  ] as UtsuriReport["comparisons"];
  return source;
}

function replaceVisualAnchor<T>(value: T, replacement: ReviewAnchor): T {
  const result = structuredClone(value);
  if (!result || typeof result !== "object") return result;
  const pending: object[] = [result];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const candidate = pending.pop()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      for (const child of candidate) if (child && typeof child === "object") pending.push(child);
      continue;
    }
    const item = candidate as Record<string, unknown>;
    if (item.type === "visual-region" && item.ref === replacement.ref) {
      item.targetRef = replacement.targetRef;
      item.region = structuredClone(replacement.region);
      item.fingerprint = replacement.fingerprint;
    }
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return result;
}

beforeEach(() => {
  storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: new SerialLocks() }
  });
});

afterEach(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete (globalThis as { navigator?: Navigator }).navigator;
});

describe("browser review storage", () => {
  test("rejects malformed bundles before changing review state", async () => {
    const current = await createBrowserReviewStore(await report(), now);
    await expect(
      importBrowserReviewBundle(current, {
        schemaVersion: "1.0",
        source: {},
        state: { viewed: {}, judgments: {} },
        threads: [],
        events: [],
        anchorCatalog: []
      })
    ).rejects.toMatchObject({ name: "REVIEW_BUNDLE_INVALID" });
    expect(localStorage.length).toBe(0);
  });

  test("rejects a bundle whose embedded anchor is absent from its catalog", async () => {
    const current = await createBrowserReviewStore(await report(), now);
    const anchor = current.anchorCatalog.find((entry) => entry.type === "hunk")!;
    const viewed = await browserSetViewed(current, anchor, "viewed", now);
    const bundle = createBrowserReviewBundle(viewed, { base: null, head: null }, now);
    bundle.anchorCatalog = bundle.anchorCatalog.filter(
      (entry) => entry.type !== anchor.type || entry.ref !== anchor.ref
    );

    await expect(importBrowserReviewBundle(current, bundle)).rejects.toMatchObject({
      name: "REVIEW_BUNDLE_INVALID"
    });
  });

  test("requires explicit re-anchoring for another report", async () => {
    const source = await report();
    const current = await createBrowserReviewStore(source, now);
    const otherReport = structuredClone(source);
    otherReport.reportId = "report-other";
    otherReport.origin.reportId = otherReport.reportId;
    const other = await createBrowserReviewStore(otherReport, now);
    const bundle = createBrowserReviewBundle(other, { base: null, head: null }, now);

    await expect(importBrowserReviewBundle(current, bundle)).rejects.toMatchObject({
      name: "REVIEW_REPORT_MISMATCH"
    });
    const imported = await importBrowserReviewBundle(current, bundle, {
      reanchor: true,
      importedAt: "2026-08-07T00:00:01.000Z"
    });
    expect(imported.store.state.revision).toBe(1);
    expect(imported.store.events[0]?.type).toBe("state.imported");
  });

  test("rejects a stale concurrent save instead of overwriting it", async () => {
    const source = await report();
    const current = await createBrowserReviewStore(source, now);
    const anchor = current.anchorCatalog.find((entry) => entry.type === "hunk")!;
    const viewed = await browserSetViewed(current, anchor, "viewed", "2026-08-07T00:00:01.000Z");
    const judged = await browserSetJudgment(
      current,
      source.changes[0]!.id,
      "reviewed",
      "2026-08-07T00:00:02.000Z"
    );

    await saveBrowserReviewStore(viewed, 0);
    const persisted = [...(localStorage as MemoryStorage).values.values()];
    await expect(saveBrowserReviewStore(judged, 0)).rejects.toMatchObject({
      name: "REVIEW_REVISION_CONFLICT"
    });
    expect([...(localStorage as MemoryStorage).values.values()]).toEqual(persisted);
    const loaded = await loadBrowserReviewStore(source);
    expect(loaded.state.revision).toBe(1);
  });

  test("migrates Phase 5 pixel anchors from browser storage before validation", async () => {
    const source = await visualReport();
    const current = await createBrowserReviewStore(source, now);
    const currentAnchor = current.anchorCatalog.find((entry) => entry.type === "visual-region")!;
    const viewed = await browserSetViewed(
      current,
      currentAnchor,
      "viewed",
      "2026-08-07T00:00:01.000Z"
    );
    await saveBrowserReviewStore(viewed, 0);
    const storage = localStorage as MemoryStorage;
    const [key, serialized] = [...storage.values.entries()][0]!;
    const legacyAnchor = (await buildLegacyVisualAnchorCatalog(source, browserReviewDigest))[0]!;
    storage.setItem(
      key,
      JSON.stringify(replaceVisualAnchor(JSON.parse(serialized) as unknown, legacyAnchor))
    );

    const loaded = await loadBrowserReviewStore(source);
    expect(Object.values(loaded.state.viewed)[0]?.anchor).toEqual(currentAnchor);
    expect(loaded.events[0]?.anchor).toEqual(currentAnchor);
  });
});
