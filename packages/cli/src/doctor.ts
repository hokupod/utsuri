import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { platform } from "node:os";
import { parse } from "yaml";
import { isWritableDirectory } from "@utsu-ri/report-builder";
import { validateArtifact } from "@utsu-ri/report-model";

export interface DoctorCheck {
  id: string;
  status: "pass" | "missing" | "invalid" | "optional";
  detail: string;
}

function run(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function isExecutable(filename: string): Promise<boolean> {
  try {
    await access(filename, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function browserCheck(): Promise<DoctorCheck> {
  if (
    process.env.UTSURI_BROWSER_EXECUTABLE &&
    (await isExecutable(process.env.UTSURI_BROWSER_EXECUTABLE))
  ) {
    return { id: "browser", status: "pass", detail: "explicit executable" };
  }
  if (platform() === "darwin") {
    for (const [name, executable] of [
      ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
      ["Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    ] as const) {
      if (await isExecutable(executable)) return { id: "browser", status: "pass", detail: name };
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    if (run("which", [name])) return { id: "browser", status: "pass", detail: name };
  }
  return { id: "browser", status: "optional", detail: "No existing Chrome or Chromium found" };
}

async function configCheck(cwd: string, configName: string): Promise<DoctorCheck> {
  const filename = path.resolve(cwd, configName);
  try {
    const value = parse(await readFile(filename, "utf8")) as unknown;
    const result = validateArtifact("config", value);
    return result.ok
      ? { id: "config", status: "pass", detail: configName }
      : { id: "config", status: "invalid", detail: result.errors.join("; ") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { id: "config", status: "optional", detail: `${configName} not present` };
    }
    return {
      id: "config",
      status: "invalid",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function doctor(cwd: string, configName = "utsuri.yml") {
  const gitVersion = run("git", ["--version"]);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const container = run("docker", ["--version"]) ?? run("podman", ["--version"]);
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"]);
  const outputPath = path.join(cwd, ".artifacts", "utsuri");
  const checks: DoctorCheck[] = [
    {
      id: "git",
      status: gitVersion ? "pass" : "missing",
      detail: gitVersion ?? "Git is unavailable"
    },
    {
      id: "node",
      status: nodeMajor >= 22 ? "pass" : "invalid",
      detail: process.versions.node
    },
    await browserCheck(),
    {
      id: "container",
      status: container ? "pass" : "optional",
      detail: container ?? "Docker and Podman are unavailable"
    },
    {
      id: "repository",
      status: gitRoot ? "pass" : "invalid",
      detail: gitRoot ? "Git repository detected" : "Git repository root could not be resolved"
    },
    await configCheck(cwd, configName),
    {
      id: "output",
      status: (await isWritableDirectory(outputPath)) ? "pass" : "invalid",
      detail: "Artifact parent directory"
    },
    {
      id: "dependencies",
      status: (await access(path.join(cwd, "node_modules"))
        .then(() => true)
        .catch(() => false))
        ? "pass"
        : "optional",
      detail: "Existing dependency directory"
    }
  ];
  return {
    ok: checks.every((check) => check.status !== "missing" && check.status !== "invalid"),
    command: "doctor",
    version: "0.1.0",
    checks
  };
}
