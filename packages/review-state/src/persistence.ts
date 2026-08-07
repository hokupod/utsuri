import { constants, type Dirent } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { ReviewEvent, ReviewState, ReviewThread, UtsuriReport } from "@utsu-ri/report-model";
import { assertArtifact } from "@utsu-ri/report-model";
import { parseBoundedJson, readContainedRegularFile } from "@utsu-ri/security";
import { createReviewStore, nodeReviewDigest } from "./model";
import { buildAnchorCatalog } from "./anchors";
import type { ReviewDigest, ReviewStore } from "./types";

const maximumStateBytes = 8 * 1024 * 1024;
const maximumEventBytes = 16 * 1024 * 1024;
const maximumThreadBytes = 1024 * 1024;
const maximumCommitBytes = 64 * 1024;
const maximumSidecarBytes = 64 * 1024 * 1024;
const maximumSidecarFileBytes = 8 * 1024 * 1024;
const sidecarDirectories = new Set(["answers", "batches", "contexts"]);

interface ReviewCommitRecord {
  schemaVersion: "1.0";
  generation: string;
  revision: number;
  reportId: string;
  reportFingerprint: string;
}

export interface ReviewPersistenceHooks {
  beforeCommit?: (generationDirectory: string) => Promise<void>;
}

function persistenceError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}

function threadFilename(threadId: string): string {
  return `${createHash("sha256").update(threadId).digest("hex")}.json`;
}

function assertSidecarPath(relative: string): void {
  if (relative === "review-inbox.json") return;
  const parts = relative.split("/");
  if (
    parts.length !== 2 ||
    !sidecarDirectories.has(parts[0] ?? "") ||
    !/^[a-f0-9]{64}\.json$/u.test(parts[1] ?? "")
  ) {
    persistenceError("REVIEW_SIDECAR_PATH", `Review sidecar path is invalid: ${relative}`);
  }
}

async function assertPrivateDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    persistenceError("REVIEW_DIRECTORY_INVALID", "Review storage must be a real directory");
  }
  const getUid = process.getuid;
  if (getUid && stat.uid !== getUid()) {
    persistenceError("REVIEW_DIRECTORY_OWNER", "Review storage must belong to the current user");
  }
  if ((stat.mode & 0o077) !== 0) {
    persistenceError("REVIEW_DIRECTORY_PERMISSIONS", "Review storage permissions must be 0700");
  }
}

async function ensureDirectory(parent: string, name: string): Promise<string> {
  if (!/^[a-z][a-z-]*$/u.test(name)) {
    persistenceError("REVIEW_DIRECTORY_NAME", "Review directory name is invalid");
  }
  const directory = path.join(parent, name);
  await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await assertPrivateDirectory(directory);
  return directory;
}

async function optionalContainedFile(
  root: string,
  relative: string,
  maximumBytes: number
): Promise<Buffer | null> {
  try {
    return await readContainedRegularFile(root, relative, { maximumBytes });
  } catch (error) {
    if (error instanceof UtsuriError && error.diagnosticId === "SEC_PATH_MISSING") return null;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function readJson<T>(
  root: string,
  relative: string,
  label: string,
  maximumBytes: number
): Promise<T | null> {
  const bytes = await optionalContainedFile(root, relative, maximumBytes);
  if (!bytes) return null;
  return parseBoundedJson(bytes.toString("utf8"), { label, maximumBytes }) as T;
}

function parseEvents(bytes: Buffer | null): ReviewEvent[] {
  if (!bytes) return [];
  const text = bytes.toString("utf8");
  if (text && !text.endsWith("\n")) {
    persistenceError("REVIEW_EVENT_TRUNCATED", "Review event journal is not newline terminated");
  }
  return text
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      const value = parseBoundedJson(line, {
        label: `review event ${index + 1}`,
        maximumBytes: maximumThreadBytes
      });
      assertArtifact("review-event", value);
      return value as ReviewEvent;
    });
}

async function atomicWrite(directory: string, filename: string, content: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(filename)) {
    persistenceError("REVIEW_FILENAME_INVALID", "Review filename is invalid");
  }
  const suffix = randomBytes(12).toString("hex");
  const temporary = path.join(directory, `.${filename}.${suffix}.tmp`);
  const destination = path.join(directory, filename);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    );
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function loadSidecarFiles(
  review: string,
  generationRoot: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let totalBytes = 0;
  const read = async (relative: string): Promise<void> => {
    assertSidecarPath(relative);
    const bytes = await optionalContainedFile(
      review,
      `${generationRoot}/${relative}`,
      maximumSidecarFileBytes
    );
    if (!bytes) return;
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumSidecarBytes) {
      persistenceError("REVIEW_SIDECAR_LIMIT", "Review sidecars exceed 64 MiB");
    }
    files[relative] = bytes.toString("utf8");
  };
  await read("review-inbox.json");
  for (const directory of [...sidecarDirectories].sort()) {
    const absolute = path.join(review, generationRoot, directory);
    let entries: Dirent[];
    try {
      const stat = await lstat(absolute);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        persistenceError("REVIEW_SIDECAR_DIRECTORY", "Review sidecar directory is invalid");
      }
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) {
        persistenceError("REVIEW_SIDECAR_ENTRY", "Review sidecar entry is invalid");
      }
      await read(`${directory}/${entry.name}`);
    }
  }
  return files;
}

async function writeSidecarFiles(
  staging: string,
  sidecarFiles: Readonly<Record<string, string>>
): Promise<void> {
  let totalBytes = 0;
  for (const [relative, content] of Object.entries(sidecarFiles).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    assertSidecarPath(relative);
    const bytes = Buffer.byteLength(content);
    totalBytes += bytes;
    if (bytes > maximumSidecarFileBytes || totalBytes > maximumSidecarBytes) {
      persistenceError("REVIEW_SIDECAR_LIMIT", "Review sidecars exceed their byte limit");
    }
    const parts = relative.split("/");
    const directory =
      parts.length === 1 ? staging : await ensureDirectory(staging, parts[0] ?? "invalid");
    await atomicWrite(directory, parts.at(-1) ?? "invalid", content);
  }
}

function assertCommitRecord(value: unknown): asserts value is ReviewCommitRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    persistenceError("REVIEW_COMMIT_INVALID", "Review commit record is invalid");
  }
  const pointer = value as Partial<ReviewCommitRecord>;
  if (
    pointer.schemaVersion !== "1.0" ||
    typeof pointer.generation !== "string" ||
    !/^generation-[a-f0-9]{32}$/u.test(pointer.generation) ||
    !Number.isSafeInteger(pointer.revision) ||
    (pointer.revision ?? -1) < 0 ||
    typeof pointer.reportId !== "string" ||
    !/^report[-:]/u.test(pointer.reportId) ||
    typeof pointer.reportFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(pointer.reportFingerprint)
  ) {
    persistenceError("REVIEW_COMMIT_INVALID", "Review commit record is invalid");
  }
}

function commitFilename(revision: number): string {
  return `revision-${String(revision).padStart(12, "0")}.json`;
}

async function latestCommit(review: string): Promise<ReviewCommitRecord | null> {
  const commits = path.join(review, "commits");
  try {
    await assertPrivateDirectory(commits);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const revisions = (await readdir(commits))
    .map((name) => name.match(/^revision-(\d{12})\.json$/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
  for (const [index, revision] of revisions.entries()) {
    if (revision !== index + 1) {
      persistenceError("REVIEW_COMMIT_SEQUENCE", "Review commit sequence is not contiguous");
    }
  }
  const revision = revisions.at(-1);
  if (!revision) return null;
  const record = await readJson<unknown>(
    review,
    `commits/${commitFilename(revision)}`,
    "review commit record",
    maximumCommitBytes
  );
  if (!record) persistenceError("REVIEW_COMMIT_MISSING", "Latest review commit is missing");
  assertCommitRecord(record);
  if (record.revision !== revision) {
    persistenceError("REVIEW_COMMIT_SEQUENCE", "Review commit revision does not match its name");
  }
  return record;
}

async function existingReviewDirectory(runDirectory: string): Promise<string | null> {
  const run = await realpath(runDirectory);
  const review = path.join(run, "review");
  try {
    await assertPrivateDirectory(review);
    return review;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadReviewStore(
  runDirectory: string,
  report: UtsuriReport,
  initializedAt: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<ReviewStore> {
  const review = await existingReviewDirectory(runDirectory);
  if (!review) return createReviewStore(report, initializedAt, digest);
  const commit = await latestCommit(review);
  if (!commit) {
    const entries = (await readdir(review)).filter(
      (name) => !new Set(["commits", "generations", "diagnostics"]).has(name)
    );
    if (entries.length > 0) {
      persistenceError(
        "REVIEW_SNAPSHOT_MISSING",
        "Review storage contains data without a committed generation"
      );
    }
    return createReviewStore(report, initializedAt, digest);
  }
  const generationRoot = `generations/${commit.generation}`;
  const state = await readJson<ReviewState>(
    review,
    `${generationRoot}/review-state.json`,
    "review state",
    maximumStateBytes
  );
  if (!state) {
    persistenceError("REVIEW_SNAPSHOT_MISSING", "Committed review snapshot is missing");
  }
  assertArtifact("review-state", state);
  const expectedFingerprint = await digest(report);
  if (
    state.reportId !== report.reportId ||
    state.reportFingerprint !== expectedFingerprint ||
    commit.reportId !== state.reportId ||
    commit.reportFingerprint !== state.reportFingerprint ||
    commit.revision !== state.revision
  ) {
    persistenceError("REVIEW_REPORT_MISMATCH", "Stored review state belongs to another report");
  }
  const threads: ReviewThread[] = [];
  for (const threadId of state.threadIds) {
    const value = await readJson<ReviewThread>(
      review,
      `${generationRoot}/threads/${threadFilename(threadId)}`,
      `review thread ${threadId}`,
      maximumThreadBytes
    );
    if (!value)
      persistenceError("REVIEW_THREAD_MISSING", `Stored review thread is missing: ${threadId}`);
    assertArtifact("review-thread", value);
    if (value.id !== threadId || value.reportId !== report.reportId) {
      persistenceError(
        "REVIEW_THREAD_IDENTITY",
        `Stored review thread identity is invalid: ${threadId}`
      );
    }
    threads.push(value);
  }
  const events = parseEvents(
    await optionalContainedFile(review, `${generationRoot}/review-events.ndjson`, maximumEventBytes)
  );
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1 || event.reportId !== report.reportId) {
      persistenceError("REVIEW_EVENT_SEQUENCE", "Review event journal sequence is invalid");
    }
  }
  if (state.revision !== events.length) {
    persistenceError("REVIEW_REVISION_MISMATCH", "Review snapshot and event journal disagree");
  }
  const sidecarFiles = await loadSidecarFiles(review, generationRoot);
  return {
    report: structuredClone(report),
    state,
    threads,
    events,
    anchorCatalog: await buildAnchorCatalog(report, digest),
    sidecarFiles
  };
}

export async function persistReviewStore(
  runDirectory: string,
  store: ReviewStore,
  expectedRevision: number,
  digest: ReviewDigest = nodeReviewDigest,
  hooks: ReviewPersistenceHooks = {}
): Promise<void> {
  if (store.state.revision !== expectedRevision + 1) {
    persistenceError("REVIEW_REVISION_INVALID", "Review mutation must advance one revision");
  }
  assertArtifact("review-state", store.state);
  for (const thread of store.threads) assertArtifact("review-thread", thread);
  for (const event of store.events) assertArtifact("review-event", event);
  const run = await realpath(runDirectory);
  const review = await ensureDirectory(run, "review");
  const current = await loadReviewStore(run, store.report, store.state.updatedAt, digest);
  if (current.state.revision !== expectedRevision || current.events.length !== expectedRevision) {
    persistenceError("REVIEW_REVISION_CONFLICT", "Review state changed before this mutation");
  }
  const generations = await ensureDirectory(review, "generations");
  const commits = await ensureDirectory(review, "commits");
  const generation = `generation-${randomBytes(16).toString("hex")}`;
  const staging = path.join(generations, `.${generation}.tmp`);
  const committed = path.join(generations, generation);
  let renamed = false;
  await mkdir(staging, { mode: 0o700 });
  await assertPrivateDirectory(staging);
  try {
    const threadsDirectory = await ensureDirectory(staging, "threads");
    for (const thread of store.threads) {
      await atomicWrite(
        threadsDirectory,
        threadFilename(thread.id),
        `${JSON.stringify(thread, null, 2)}\n`
      );
    }
    await atomicWrite(
      staging,
      "review-events.ndjson",
      store.events.map((event) => `${JSON.stringify(event)}\n`).join("")
    );
    await atomicWrite(staging, "review-state.json", `${JSON.stringify(store.state, null, 2)}\n`);
    await writeSidecarFiles(staging, store.sidecarFiles);
    await syncDirectory(staging);
    await rename(staging, committed);
    renamed = true;
    await syncDirectory(generations);
    await hooks.beforeCommit?.(committed);
    const record: ReviewCommitRecord = {
      schemaVersion: "1.0",
      generation,
      revision: store.state.revision,
      reportId: store.report.reportId,
      reportFingerprint: store.state.reportFingerprint
    };
    const candidateName = `candidate-${randomBytes(16).toString("hex")}.json`;
    const candidate = path.join(commits, candidateName);
    const destination = path.join(commits, commitFilename(store.state.revision));
    await atomicWrite(commits, candidateName, `${JSON.stringify(record, null, 2)}\n`);
    try {
      try {
        await link(candidate, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          persistenceError(
            "REVIEW_REVISION_CONFLICT",
            "Review revision was committed concurrently"
          );
        }
        throw error;
      }
      await syncDirectory(commits);
    } finally {
      await unlink(candidate).catch(() => undefined);
    }
  } catch (error) {
    if (!renamed) await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function writeReviewDiagnostic(
  runDirectory: string,
  filename: string,
  value: unknown
): Promise<string> {
  const run = await realpath(runDirectory);
  const review = await ensureDirectory(run, "review");
  const diagnostics = await ensureDirectory(review, "diagnostics");
  await atomicWrite(diagnostics, filename, `${JSON.stringify(value, null, 2)}\n`);
  return path.join(diagnostics, filename);
}
