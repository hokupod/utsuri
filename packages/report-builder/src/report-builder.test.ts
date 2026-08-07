import { afterEach, describe, expect, test } from "bun:test";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildReport,
  createInitialReport,
  isWritableDirectory,
  validateReportDirectory
} from "./index";
import { publishDirectoryNoReplace } from "./native-publish";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createReportRun() {
  const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-report-"));
  temporaryDirectories.push(root);
  const run = path.join(root, "run");
  await mkdir(run);
  await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n');
  return { root, run, report: await createInitialReport(run) };
}

describe("report output preflight", () => {
  test("accepts a nested output path whose nearest existing ancestor is writable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-report-output-"));
    temporaryDirectories.push(root);
    expect(await isWritableDirectory(path.join(root, "not-created", "report"))).toBe(true);
  });

  test("rejects an existing regular file as an output directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-report-output-"));
    temporaryDirectories.push(root);
    const filename = path.join(root, "report");
    await writeFile(filename, "not a directory");
    expect(await isWritableDirectory(filename)).toBe(false);
  });
});

describe("immutable report generation", () => {
  test("allows a sticky shared ancestor when its child belongs to the current user", async () => {
    const stickyRoot = process.platform === "darwin" ? "/private/tmp" : os.tmpdir();
    const root = await mkdtemp(path.join(stickyRoot, "utsuri-report-sticky-"));
    temporaryDirectories.push(root);
    const run = path.join(root, "run");
    await mkdir(run, { mode: 0o700 });
    await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n');
    const report = await createInitialReport(run);

    await expect(buildReport(run, report)).resolves.toMatchObject({ reused: false });
  });

  test("rejects a publication path whose ancestor can be renamed by another user", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-report-shared-"));
    temporaryDirectories.push(root);
    const shared = path.join(root, "shared");
    const run = path.join(shared, "run");
    await mkdir(shared);
    await chmod(shared, 0o777);
    await mkdir(run, { mode: 0o700 });
    await writeFile(path.join(run, "input.json"), '{"mode":"empty"}\n');
    const report = await createInitialReport(run);

    await expect(buildReport(run, report)).rejects.toThrow("ancestor that another user can rename");
  });

  test("moves the validated staging directory without leaving publication state", async () => {
    const { run, report } = await createReportRun();

    await buildReport(run, report);

    const entries = await readdir(run);
    expect(entries.some((entry) => entry.startsWith(".report-") && entry.endsWith(".tmp"))).toBe(
      false
    );
    expect(entries).not.toContain("report.publish-lock");
  });

  test("does not replace an already-created empty destination", async () => {
    const { run, report } = await createReportRun();
    const reportDirectory = path.join(run, "report");
    await mkdir(reportDirectory);

    await expect(buildReport(run, report)).rejects.toThrow("immutable report destination");
    await expect(readdir(reportDirectory)).resolves.toEqual([]);
  });

  test("rejects a pre-existing destination without incorporating foreign files", async () => {
    const { run, report } = await createReportRun();
    const reportDirectory = path.join(run, "report");
    await mkdir(reportDirectory);
    const foreignFile = path.join(reportDirectory, "foreign.txt");
    await writeFile(foreignFile, "operator-owned\n");

    await expect(buildReport(run, report)).rejects.toThrow("immutable report destination");
    await expect(readFile(foreignFile, "utf8")).resolves.toBe("operator-owned\n");
  });

  test("rejects an asset removed from the manifest inventory", async () => {
    const { run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    const manifestFile = path.join(reportDirectory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
      assetHashes: Record<string, string>;
    };
    delete manifest.assetHashes["assets/app.js"];
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await validateReportDirectory(reportDirectory, { strict: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Unregistered asset: assets/app.js");
  });

  test("rejects extra files not declared by the manifest", async () => {
    const { run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    await writeFile(path.join(reportDirectory, "unexpected.txt"), "unexpected\n");

    const result = await validateReportDirectory(reportDirectory, { strict: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Unregistered asset: unexpected.txt");
    expect(result.errors).toContain("Strict Phase 0 artifact inventory mismatch");
  });

  test("does not reuse a report whose bundled asset was modified", async () => {
    const { run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    await writeFile(path.join(reportDirectory, "assets/app.js"), "// modified\n");

    await expect(buildReport(run, report)).rejects.toThrow(
      "Existing report failed strict validation"
    );
  });

  test("returns validation errors for malformed report JSON", async () => {
    const { run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    await writeFile(path.join(reportDirectory, "report.json"), "{");

    const result = await validateReportDirectory(reportDirectory, { strict: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("report.json is not valid JSON");
  });

  test("rejects a manifest symlink before reading its target", async () => {
    const { root, run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    const manifestFile = path.join(reportDirectory, "manifest.json");
    const external = path.join(root, "external.json");
    await writeFile(external, "{");
    await unlink(manifestFile);
    await symlink(external, manifestFile);

    const result = await validateReportDirectory(reportDirectory, { strict: true });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["Report contains a symbolic link: manifest.json"]);
  });

  test("rejects a report symlink before immutable reuse reads it", async () => {
    const { root, run, report } = await createReportRun();
    const { reportDirectory } = await buildReport(run, report);
    const reportFile = path.join(reportDirectory, "report.json");
    const external = path.join(root, "external.json");
    await writeFile(external, "{}");
    await unlink(reportFile);
    await symlink(external, reportFile);

    await expect(buildReport(run, report)).rejects.toThrow(
      "Report contains a symbolic link: report.json"
    );
  });
});

describe("atomic publication helper", () => {
  test("does not replace a destination created before the no-replace syscall", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-publish-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const destination = path.join(root, "report");
    await mkdir(source);
    await writeFile(path.join(source, "source.txt"), "validated\n");
    await mkdir(destination);
    await writeFile(path.join(destination, "foreign.txt"), "foreign\n");
    const parentHandle = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );

    try {
      await expect(
        publishDirectoryNoReplace(
          parentHandle,
          await parentHandle.stat({ bigint: true }),
          "source",
          "report",
          await lstat(source, { bigint: true })
        )
      ).rejects.toThrow("destination appeared");
    } finally {
      await parentHandle.close();
    }

    expect(await readFile(path.join(source, "source.txt"), "utf8")).toBe("validated\n");
    expect(await readFile(path.join(destination, "foreign.txt"), "utf8")).toBe("foreign\n");
  });

  test("rejects a staging entry swapped after validation without deleting either directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "utsuri-publish-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const validated = path.join(root, "validated");
    await mkdir(source);
    await writeFile(path.join(source, "source.txt"), "validated\n");
    const sourceIdentity = await lstat(source, { bigint: true });
    await rename(source, validated);
    await mkdir(source);
    await writeFile(path.join(source, "foreign.txt"), "foreign\n");
    const parentHandle = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );

    try {
      await expect(
        publishDirectoryNoReplace(
          parentHandle,
          await parentHandle.stat({ bigint: true }),
          "source",
          "report",
          sourceIdentity
        )
      ).rejects.toThrow("namespace or validated staging directory changed");
    } finally {
      await parentHandle.close();
    }

    expect(await readFile(path.join(validated, "source.txt"), "utf8")).toBe("validated\n");
    expect(await readFile(path.join(source, "foreign.txt"), "utf8")).toBe("foreign\n");
    await expect(lstat(path.join(root, "report"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
