import path from "node:path";
import {
  classifyLowSignal,
  createGitFileId,
  createGitHunk,
  normalizeRepositoryPath,
  type GitDiffDocument,
  type GitDiffFile,
  type GitFileStatus,
  type GitHunk,
  type GitInputMode
} from "@utsu-ri/core";
import { ExitCode, UtsuriError } from "@utsu-ri/core";

const maximumPatchBytes = 64 * 1024 * 1024;
const maximumFiles = 20_000;
const maximumHunks = 100_000;
const maximumLines = 2_000_000;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

interface MutableFile {
  status: GitFileStatus;
  oldPath: string | null;
  newPath: string | null;
  binary: boolean;
  submodule: boolean;
  oldMode: string | null;
  newMode: string | null;
  oldOid: string | null;
  newOid: string | null;
  similarity: number | null;
  hunks: GitHunk[];
}

interface MutableHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  heading: string;
  oldCursor: number;
  newCursor: number;
  lines: GitHunk["lines"];
}

export interface PatchDocumentInput {
  mode: GitInputMode;
  base: string | null;
  head: string | null;
  mergeBase: string | null;
  patchPath: string | null;
  repositoryFingerprint: string;
  sourceDigests: GitDiffDocument["sourceDigests"];
}

function patchError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Artifact);
}

function decodeGitQuoted(value: string): string {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"')) patchError("PATCH_PATH_QUOTE", "Git path has an unterminated quote");
  const buffers: Buffer[] = [];
  const literal: string[] = [];
  const flush = () => {
    if (literal.length > 0) buffers.push(Buffer.from(literal.splice(0).join(""), "utf8"));
  };
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index]!;
    if (character !== "\\") {
      literal.push(character);
      continue;
    }
    flush();
    const escaped = value[++index];
    if (escaped === undefined) patchError("PATCH_PATH_ESCAPE", "Git path has an invalid escape");
    const simple: Record<string, number> = {
      a: 7,
      b: 8,
      t: 9,
      n: 10,
      v: 11,
      f: 12,
      r: 13,
      '"': 34,
      "\\": 92
    };
    if (simple[escaped] !== undefined) {
      buffers.push(Buffer.from([simple[escaped]]));
      continue;
    }
    if (/[0-7]/u.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/u.test(value[index + 1] ?? "")) {
        octal += value[++index];
      }
      buffers.push(Buffer.from([Number.parseInt(octal, 8)]));
      continue;
    }
    patchError("PATCH_PATH_ESCAPE", `Git path contains unsupported escape \\${escaped}`);
  }
  flush();
  try {
    return utf8Decoder.decode(Buffer.concat(buffers));
  } catch {
    return patchError("PATCH_PATH_ENCODING", "Git path is not valid UTF-8");
  }
}

function tokenizeGitHeader(value: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < value.length;) {
    while (value[index] === " ") index += 1;
    if (index >= value.length) break;
    const start = index;
    if (value[index] === '"') {
      index += 1;
      let escaped = false;
      while (index < value.length) {
        const character = value[index++]!;
        if (character === '"' && !escaped) break;
        if (character === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
    } else {
      while (index < value.length && value[index] !== " ") index += 1;
    }
    tokens.push(decodeGitQuoted(value.slice(start, index)));
  }
  return tokens;
}

function normalizePatchPath(value: string, prefix?: "a/" | "b/"): string | null {
  const decoded = decodeGitQuoted(value);
  if (decoded === "/dev/null") return null;
  const withoutPrefix =
    prefix && decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
  if (withoutPrefix.includes("\\")) {
    throw new UtsuriError(
      "PATCH_PATH_BACKSLASH",
      "Git patch paths must use forward slashes",
      ExitCode.Security
    );
  }
  const slashPath = withoutPrefix;
  if (
    path.posix.isAbsolute(slashPath) ||
    slashPath.includes("\0") ||
    slashPath.split("/").includes("..")
  ) {
    throw new UtsuriError(
      "PATCH_PATH_INVALID",
      `Patch path escapes the repository: ${withoutPrefix}`,
      ExitCode.Security
    );
  }
  const normalized = normalizeRepositoryPath(slashPath);
  if (!normalized || normalized === ".") patchError("PATCH_PATH_INVALID", "Patch path is empty");
  return normalized;
}

function initialFile(oldPath: string | null, newPath: string | null): MutableFile {
  return {
    status: "modified",
    oldPath,
    newPath,
    binary: false,
    submodule: false,
    oldMode: null,
    newMode: null,
    oldOid: null,
    newOid: null,
    similarity: null,
    hunks: []
  };
}

function statusFromCode(code: string): GitFileStatus {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code.startsWith("R")) return "renamed";
  if (code.startsWith("C")) return "copied";
  if (code === "T") return "type-changed";
  if (code === "U") return "unmerged";
  if (code === "M") return "modified";
  return "unknown";
}

function finalizeHunk(file: MutableFile, hunk: MutableHunk | null): null {
  if (!hunk) return null;
  const oldObserved = hunk.lines.filter(
    (line) => line.kind === "context" || line.kind === "deletion"
  ).length;
  const newObserved = hunk.lines.filter(
    (line) => line.kind === "context" || line.kind === "addition"
  ).length;
  if (oldObserved !== hunk.oldLines || newObserved !== hunk.newLines) {
    patchError(
      "PATCH_HUNK_RANGE",
      `Hunk range declares -${hunk.oldLines}/+${hunk.newLines} but contains -${oldObserved}/+${newObserved}`
    );
  }
  const selectedPath = file.newPath ?? file.oldPath;
  if (!selectedPath) patchError("PATCH_PATH_MISSING", "Hunk has no repository path");
  file.hunks.push(
    createGitHunk({
      path: selectedPath,
      oldPath: file.oldPath,
      newPath: file.newPath,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      heading: hunk.heading,
      lines: hunk.lines
    })
  );
  return null;
}

function materializeFile(file: MutableFile): { file: GitDiffFile; hunks: GitHunk[] } {
  const selectedPath = file.newPath ?? file.oldPath;
  if (!selectedPath) patchError("PATCH_PATH_MISSING", "Diff file has no repository path");
  const additions = file.binary
    ? null
    : file.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "addition").length;
  const deletions = file.binary
    ? null
    : file.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "deletion").length;
  const content = file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.content));
  const lowSignalReasons = classifyLowSignal(selectedPath, { binary: file.binary, content });
  const hunks = file.hunks.map((hunk) => ({ ...hunk, lowSignal: lowSignalReasons.length > 0 }));
  return {
    file: {
      id: createGitFileId(file.oldPath, file.newPath),
      status: file.status,
      oldPath: file.oldPath,
      newPath: file.newPath,
      additions,
      deletions,
      binary: file.binary,
      submodule: file.submodule || file.oldMode === "160000" || file.newMode === "160000",
      oldMode: file.oldMode,
      newMode: file.newMode,
      oldOid: file.oldOid,
      newOid: file.newOid,
      similarity: file.similarity,
      lowSignal: lowSignalReasons.length > 0,
      lowSignalReasons,
      hunkRefs: hunks.map((hunk) => hunk.id)
    },
    hunks
  };
}

export function applyNameStatus(document: GitDiffDocument, raw: string): GitDiffDocument {
  const tokens = raw.split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const separator = token.indexOf("\t");
    const code = separator === -1 ? token : token.slice(0, separator);
    const encodedFirstPath =
      separator === -1 ? (tokens[++index] ?? "") : token.slice(separator + 1);
    const firstPath = normalizePatchPath(encodedFirstPath);
    const secondPath =
      code.startsWith("R") || code.startsWith("C")
        ? normalizePatchPath(tokens[++index] ?? "")
        : null;
    const oldPath = secondPath ? firstPath : code === "D" ? firstPath : null;
    const newPath = secondPath ?? (code === "D" ? null : firstPath);
    const match = document.files.find(
      (file) =>
        (oldPath === null || file.oldPath === oldPath) &&
        (newPath === null || file.newPath === newPath)
    );
    if (!match) continue;
    match.status = statusFromCode(code[0] ?? "?");
    if ((code.startsWith("R") || code.startsWith("C")) && /^\d+$/u.test(code.slice(1))) {
      match.similarity = Number(code.slice(1));
    }
  }
  return document;
}

export function applyNumstat(document: GitDiffDocument, raw: string): GitDiffDocument {
  const tokens = raw.split("\0");
  const appliedFileIds = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const firstTab = token.indexOf("\t");
    const secondTab = token.indexOf("\t", firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      patchError("GIT_NUMSTAT", "numstat output is malformed");
    }
    const added = token.slice(0, firstTab);
    const deleted = token.slice(firstTab + 1, secondTab);
    const pathname = token.slice(secondTab + 1);
    const renamed = pathname === "";
    const oldPath = normalizePatchPath(renamed ? (tokens[++index] ?? "") : pathname);
    const newPath = renamed ? normalizePatchPath(tokens[++index] ?? "") : oldPath;
    const match = document.files.find(
      (file) =>
        !appliedFileIds.has(file.id) &&
        (renamed
          ? file.oldPath === oldPath && file.newPath === newPath
          : file.newPath === null
            ? file.oldPath === oldPath
            : file.newPath === newPath)
    );
    if (!match) {
      patchError("GIT_NUMSTAT_MATCH", "numstat entry does not match a parsed diff file");
    }
    appliedFileIds.add(match.id);
    match.additions = added === "-" ? null : Number(added);
    match.deletions = deleted === "-" ? null : Number(deleted);
    match.binary = added === "-" || deleted === "-";
  }
  if (appliedFileIds.size !== document.files.length) {
    patchError("GIT_NUMSTAT_MATCH", "numstat entries do not cover every parsed diff file");
  }
  document.summary.additions = document.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  document.summary.deletions = document.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  document.summary.binaryFiles = document.files.filter((file) => file.binary).length;
  return document;
}

export function parseGitPatch(patch: string, input: PatchDocumentInput): GitDiffDocument {
  if (Buffer.byteLength(patch) > maximumPatchBytes) {
    patchError("PATCH_TOO_LARGE", `Patch exceeds ${maximumPatchBytes} bytes`);
  }
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  const materialized: Array<{ file: GitDiffFile; hunks: GitHunk[] }> = [];
  let file: MutableFile | null = null;
  let hunk: MutableHunk | null = null;
  let lineCount = 0;

  const closeFile = () => {
    if (!file) return;
    hunk = finalizeHunk(file, hunk);
    materialized.push(materializeFile(file));
    file = null;
    if (materialized.length > maximumFiles)
      patchError("PATCH_FILE_LIMIT", "Patch has too many files");
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      closeFile();
      const paths = tokenizeGitHeader(line.slice("diff --git ".length));
      if (paths.length !== 2)
        patchError("PATCH_DIFF_HEADER", "diff --git header must contain two paths");
      file = initialFile(normalizePatchPath(paths[0]!, "a/"), normalizePatchPath(paths[1]!, "b/"));
      continue;
    }
    if (!file) {
      if (line.trim() !== "") patchError("PATCH_PREAMBLE", "Only Git-format patches are accepted");
      continue;
    }
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/u);
    if (hunkHeader) {
      hunk = finalizeHunk(file, hunk);
      const oldStart = Number(hunkHeader[1]);
      const oldLines = Number(hunkHeader[2] ?? "1");
      const newStart = Number(hunkHeader[3]);
      const newLines = Number(hunkHeader[4] ?? "1");
      hunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        heading: hunkHeader[5] ?? "",
        oldCursor: oldStart,
        newCursor: newStart,
        lines: []
      };
      continue;
    }
    if (hunk) {
      const prefix = line[0];
      if (
        prefix === " " ||
        prefix === "+" ||
        prefix === "-" ||
        line === "\\ No newline at end of file"
      ) {
        if (line === "\\ No newline at end of file") {
          hunk.lines.push({ kind: "no-newline", content: line, oldLine: null, newLine: null });
        } else if (prefix === " ") {
          hunk.lines.push({
            kind: "context",
            content: line.slice(1),
            oldLine: hunk.oldCursor++,
            newLine: hunk.newCursor++
          });
        } else if (prefix === "+") {
          hunk.lines.push({
            kind: "addition",
            content: line.slice(1),
            oldLine: null,
            newLine: hunk.newCursor++
          });
        } else {
          hunk.lines.push({
            kind: "deletion",
            content: line.slice(1),
            oldLine: hunk.oldCursor++,
            newLine: null
          });
        }
        lineCount += 1;
        if (lineCount > maximumLines) patchError("PATCH_LINE_LIMIT", "Patch has too many lines");
        continue;
      }
      hunk = finalizeHunk(file, hunk);
    }

    if (line.startsWith("new file mode ")) {
      file.status = "added";
      file.oldPath = null;
      file.newMode = line.slice("new file mode ".length);
    } else if (line.startsWith("deleted file mode ")) {
      file.status = "deleted";
      file.newPath = null;
      file.oldMode = line.slice("deleted file mode ".length);
    } else if (line.startsWith("old mode ")) {
      file.oldMode = line.slice("old mode ".length);
    } else if (line.startsWith("new mode ")) {
      file.newMode = line.slice("new mode ".length);
    } else if (line.startsWith("similarity index ")) {
      file.similarity = Number.parseInt(line.slice("similarity index ".length), 10);
    } else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = normalizePatchPath(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.newPath = normalizePatchPath(line.slice("rename to ".length));
    } else if (line.startsWith("copy from ")) {
      file.status = "copied";
      file.oldPath = normalizePatchPath(line.slice("copy from ".length));
    } else if (line.startsWith("copy to ")) {
      file.status = "copied";
      file.newPath = normalizePatchPath(line.slice("copy to ".length));
    } else if (line.startsWith("index ")) {
      const match = line.match(/^index ([a-f0-9]+)\.\.([a-f0-9]+)(?: ([0-7]{6}))?$/u);
      if (!match) patchError("PATCH_INDEX", "Git index metadata is malformed");
      file.oldOid = match[1]!;
      file.newOid = match[2]!;
      if (match[3]) {
        file.oldMode ??= match[3];
        file.newMode ??= match[3];
      }
    } else if (line.startsWith("--- ")) {
      file.oldPath = normalizePatchPath(line.slice(4), "a/");
    } else if (line.startsWith("+++ ")) {
      file.newPath = normalizePatchPath(line.slice(4), "b/");
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      file.binary = true;
    } else if (line.startsWith("Subproject commit ")) {
      file.submodule = true;
    }
  }
  closeFile();
  const hunks = materialized.flatMap((entry) => entry.hunks);
  if (hunks.length > maximumHunks) patchError("PATCH_HUNK_LIMIT", "Patch has too many hunks");
  const files = materialized.map((entry) => entry.file);
  return {
    schemaVersion: "1.0",
    input: {
      mode: input.mode,
      base: input.base,
      head: input.head,
      mergeBase: input.mergeBase,
      patchPath: input.patchPath
    },
    repository: { fingerprint: input.repositoryFingerprint },
    sourceDigests: input.sourceDigests,
    summary: {
      filesChanged: files.length,
      additions: files.reduce((sum, entry) => sum + (entry.additions ?? 0), 0),
      deletions: files.reduce((sum, entry) => sum + (entry.deletions ?? 0), 0),
      binaryFiles: files.filter((entry) => entry.binary).length,
      lowSignalFiles: files.filter((entry) => entry.lowSignal).length
    },
    files,
    hunks
  };
}
