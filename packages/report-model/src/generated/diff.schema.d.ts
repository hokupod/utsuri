/* Generated from schemas/diff.schema.json. Do not edit directly. */

export interface GitDiffDocument {
  schemaVersion: "1.0";
  input: {
    mode: "worktree" | "range" | "merge-base" | "patch";
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
  files: File[];
  hunks: Hunk[];
}
export interface File {
  id: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed" | "unmerged" | "unknown";
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
export interface Hunk {
  id: string;
  path: string;
  oldPath: string | null;
  newPath: string | null;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  heading: string;
  lines: Line[];
  lowSignal: boolean;
}
export interface Line {
  kind: "context" | "addition" | "deletion" | "no-newline";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}
