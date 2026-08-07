import path from "node:path";
import { hunkId, normalizeRepositoryPath, stableId } from "./hash";

export const gitInputModes = ["worktree", "range", "merge-base", "patch"] as const;
export type GitInputMode = (typeof gitInputModes)[number];

export const gitFileStatuses = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type-changed",
  "unmerged",
  "unknown"
] as const;
export type GitFileStatus = (typeof gitFileStatuses)[number];

export type DiffLineKind = "context" | "addition" | "deletion" | "no-newline";

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface GitHunk {
  id: string;
  path: string;
  oldPath: string | null;
  newPath: string | null;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  heading: string;
  lines: DiffLine[];
  lowSignal: boolean;
}

export interface GitDiffFile {
  id: string;
  status: GitFileStatus;
  oldPath: string | null;
  newPath: string | null;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  submodule: boolean;
  oldMode: string | null;
  newMode: string | null;
  oldOid: string | null;
  newOid: string | null;
  similarity: number | null;
  lowSignal: boolean;
  lowSignalReasons: string[];
  hunkRefs: string[];
}

export interface GitDiffDocument {
  schemaVersion: "1.0";
  input: {
    mode: GitInputMode;
    base: string | null;
    head: string | null;
    mergeBase: string | null;
    patchPath: string | null;
  };
  repository: {
    fingerprint: string;
  };
  sourceDigests: {
    patch: string;
    numstat: string | null;
    nameStatus: string | null;
    summary: string | null;
    raw: string | null;
    commits: string | null;
  };
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    binaryFiles: number;
    lowSignalFiles: number;
  };
  files: GitDiffFile[];
  hunks: GitHunk[];
}

export interface EvidenceRecord {
  id: string;
  type: "code" | "test" | "style" | "configuration" | "generated" | "binary";
  path: string;
  range: { start: number; end: number } | null;
  summary: string;
  hunkRefs: string[];
}

export interface EvidenceIndex {
  schemaVersion: "1.0";
  evidence: EvidenceRecord[];
}

export interface SemanticChangeCandidate {
  id: string;
  title: string;
  reason: string;
  fileRefs: string[];
  hunkRefs: [string, ...string[]];
  evidenceRefs: string[];
}

export interface ReviewPlan {
  schemaVersion: "1.0";
  candidates: SemanticChangeCandidate[];
  unclassifiedHunkRefs: string[];
}

const lowSignalPathPatterns: ReadonlyArray<[string, RegExp]> = [
  ["vendor", /(?:^|\/)(?:vendor|vendors|third[_-]party|node_modules)(?:\/|$)/iu],
  ["generated-path", /(?:^|\/)(?:dist|build|coverage|generated)(?:\/|$)/iu],
  ["minified", /\.min\.(?:css|js|mjs|cjs)$/iu],
  [
    "lockfile",
    /(?:^|\/)(?:bun\.lock|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Gemfile\.lock|go\.sum)$/u
  ],
  ["snapshot", /(?:\.snap$|(?:^|\/)__snapshots__(?:\/|$))/u],
  ["source-map", /\.map$/u]
];

export function classifyLowSignal(
  filePath: string,
  options: { binary?: boolean; content?: readonly string[] } = {}
): string[] {
  const normalized = normalizeRepositoryPath(filePath);
  const reasons = lowSignalPathPatterns
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([reason]) => reason);
  if (options.binary) reasons.push("binary");
  const header = (options.content ?? []).slice(0, 8).join("\n");
  if (/(?:@generated|generated (?:code|file)|do not edit)/iu.test(header))
    reasons.push("generated-header");
  return [...new Set(reasons)].sort();
}

export function createGitHunk(input: Omit<GitHunk, "id" | "lowSignal">): GitHunk {
  const selectedPath = normalizeRepositoryPath(input.path);
  const content = input.lines.map((line) => `${line.kind}:${line.content}`);
  return {
    ...input,
    path: selectedPath,
    oldPath: input.oldPath ? normalizeRepositoryPath(input.oldPath) : null,
    newPath: input.newPath ? normalizeRepositoryPath(input.newPath) : null,
    id: hunkId(selectedPath, input.oldStart, input.newStart, content),
    lowSignal: classifyLowSignal(selectedPath, { content }).length > 0
  };
}

export function createGitFileId(oldPath: string | null, newPath: string | null): string {
  const selectedPath = normalizeRepositoryPath(newPath ?? oldPath ?? "unknown");
  return stableId("file", { oldPath, newPath, selectedPath });
}

export function displayPath(file: Pick<GitDiffFile, "oldPath" | "newPath">): string {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.newPath ?? file.oldPath ?? "unknown";
}

export function fileStem(filePath: string): string {
  const normalized = normalizeRepositoryPath(filePath);
  const extension = path.posix.extname(normalized);
  return path.posix
    .join(path.posix.dirname(normalized), path.posix.basename(normalized, extension))
    .replace(/(?:\.(?:test|spec|stories)|[-_.](?:test|spec)|\.module)$/iu, "")
    .replace(/(?:^|\/)__tests__\//u, "/")
    .replace(/\/index$/u, "");
}
