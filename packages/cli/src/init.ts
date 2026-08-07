import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { resolveContainedPath } from "@utsu-ri/security";
import { stringify } from "yaml";

interface ProposedCommand {
  source: string;
  command: string[];
  reason: string;
}

async function readProjectFile(cwd: string, relative: string): Promise<string | null> {
  try {
    const filename = await resolveContainedPath(cwd, relative);
    return await readFile(filename, "utf8");
  } catch (error) {
    if (
      error instanceof UtsuriError &&
      new Set(["SEC_PATH_MISSING", "SEC_PATH_SYMLINK"]).has(error.diagnosticId)
    ) {
      return null;
    }
    throw error;
  }
}

async function packageManager(cwd: string, packageJson: Record<string, unknown>): Promise<string> {
  if (typeof packageJson.packageManager === "string") {
    return packageJson.packageManager.split("@")[0] || "npm";
  }
  for (const [lockfile, manager] of [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"]
  ] as const) {
    if (
      await access(path.join(cwd, lockfile))
        .then(() => true)
        .catch(() => false)
    )
      return manager;
  }
  return "npm";
}

async function proposedCommands(cwd: string): Promise<ProposedCommand[]> {
  const proposals: ProposedCommand[] = [];
  const packageText = await readProjectFile(cwd, "package.json");
  if (packageText) {
    try {
      const packageJson = JSON.parse(packageText) as Record<string, unknown>;
      const scripts =
        typeof packageJson.scripts === "object" && packageJson.scripts !== null
          ? (packageJson.scripts as Record<string, unknown>)
          : {};
      const manager = await packageManager(cwd, packageJson);
      for (const name of ["storybook", "dev", "start"]) {
        if (typeof scripts[name] === "string") {
          proposals.push({
            source: `package.json#scripts.${name}`,
            command: [manager, "run", name],
            reason: "Project script may start a reviewable local UI"
          });
        }
      }
    } catch {
      throw new UtsuriError(
        "INIT_PACKAGE_JSON_INVALID",
        "package.json is not valid JSON",
        ExitCode.Arguments
      );
    }
  }

  const makefile = (await readProjectFile(cwd, "Makefile")) ?? "";
  for (const target of ["storybook", "dev", "serve"]) {
    if (new RegExp(`^${target}:`, "mu").test(makefile)) {
      proposals.push({
        source: `Makefile#${target}`,
        command: ["make", target],
        reason: "Make target may start a reviewable local UI"
      });
    }
  }

  await Promise.all(
    [
      "README.md",
      "playwright.config.ts",
      "playwright.config.js",
      ".storybook/main.ts",
      ".storybook/main.js"
    ].map((filename) => readProjectFile(cwd, filename))
  );
  return proposals;
}

export async function initializeConfig(cwd: string, output = "utsuri.yml") {
  const filename = await resolveContainedPath(cwd, output, { allowMissing: true });
  const projectName = path.basename(cwd);
  const proposals = await proposedCommands(cwd);
  const config = {
    version: 1,
    project: { name: projectName, locale: "en-US" },
    proposedCommands: proposals,
    diff: { base: "origin/main", head: "worktree", mergeBase: true },
    execution: {
      mode: "dual-url",
      trust: "configured",
      install: "never",
      shell: false,
      timeoutMs: 120000
    },
    servers: {
      before: { readyUrl: "http://127.0.0.1:4173/", readySelector: "[data-app-ready]" },
      after: { readyUrl: "http://127.0.0.1:4174/", readySelector: "[data-app-ready]" }
    },
    browser: {
      engine: "chromium",
      headless: true,
      serviceWorkers: "block",
      locale: "en-US",
      timezone: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce"
    },
    viewports: { desktop: { width: 1440, height: 900, deviceScaleFactor: 1 } },
    targets: [
      {
        id: "home",
        path: "/",
        viewports: ["desktop"],
        roots: ["main"],
        states: [{ name: "default" }]
      }
    ],
    stabilization: {
      disableAnimations: true,
      hideCaret: true,
      waitForFonts: true,
      waitAfterReadyMs: 100,
      maxRetries: 1,
      masks: []
    },
    network: {
      browserPolicy: "block-external",
      allowedOrigins: ["http://127.0.0.1:4173", "http://127.0.0.1:4174"],
      blockMethods: ["POST", "PUT", "PATCH", "DELETE"],
      recordBlocked: true
    },
    security: {
      envAllowlist: ["NODE_ENV"],
      followSymlinks: false,
      allowArbitraryScriptSteps: false,
      allowRemoteAuthState: false,
      sanitizeHtmlPreview: true
    },
    capture: {
      fullPage: true,
      elementCrops: true,
      maxFullPageHeight: 30000,
      maxMegapixels: 80,
      screenshotFormat: "png",
      includeDom: "normalized",
      includeRawDom: false,
      includeAria: true,
      includeComputedStyles: "changed-and-layout",
      includeAxe: true
    },
    discovery: {
      knownUsages: null,
      unknownPossible: true,
      mappings: []
    },
    report: {
      outputDirectory: ".artifacts/utsuri",
      language: "en",
      theme: "system",
      singleFile: false,
      includeReviewNotes: true,
      includeRawLogs: false,
      includeAbsolutePaths: false
    },
    review: {
      enabled: true,
      viewedMode: "manual",
      staleOnFingerprintChange: true,
      autoResolveAgentAnswer: false
    },
    feedback: {
      target: "origin-session",
      delivery: "return-to-session",
      directSameSessionBridge: "auto",
      neverCreateNewSession: true,
      contextPreview: "required",
      maxBatchItems: 20,
      maxContextBytes: 524288
    },
    policy: {
      failOn: ["capture-incomplete"],
      warnOn: ["uncovered-ui-change", "partial-coverage"]
    }
  };
  const content = [
    "# Generated from read-only project inspection.",
    "# proposedCommands are suggestions and are never executed by Utsuri.",
    stringify(config, { lineWidth: 100 })
  ].join("\n");
  try {
    await writeFile(filename, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UtsuriError(
        "INIT_OUTPUT_EXISTS",
        `${output} already exists and will not be overwritten`,
        ExitCode.Arguments
      );
    }
    throw error;
  }
  return { filename, proposals };
}
