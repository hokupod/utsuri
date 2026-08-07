#!/usr/bin/env node

import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { resolveSafeChain } from "./safe-chain.mjs";

const root = new URL("../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("toolchain-policy.json", root), "utf8"));

function command(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

async function executable(pathname) {
  if (!pathname) return null;
  try {
    await access(pathname, constants.X_OK);
    return await realpath(pathname);
  } catch {
    return null;
  }
}

async function detectBrowser() {
  const explicit = await executable(process.env.UTSURI_BROWSER_EXECUTABLE);
  if (explicit) return { available: true, source: "explicit", executable: explicit };

  if (platform() === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    for (const candidate of candidates) {
      const found = await executable(candidate);
      if (found) return { available: true, source: "system-app", executable: found };
    }
  }

  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    const found = command("which", [name]);
    const resolved = await executable(found);
    if (resolved) return { available: true, source: "path", executable: resolved };
  }

  return { available: false, source: "none", executable: null };
}

async function main() {
  const allowNonNix = process.argv.includes("--allow-non-nix");
  const nodePath = await realpath(process.execPath);
  const nodeVersion = process.version.replace(/^v/u, "");
  const nodeMajor = Number(nodeVersion.split(".")[0]);
  const bunVersion = command("bun", ["--version"]);
  const bunPath = await executable(command("which", ["bun"]));
  const safeChain = await resolveSafeChain();
  const browser = await detectBrowser();

  const failures = [];
  if (nodeMajor !== policy.node.developmentMajor) {
    failures.push(`Node ${policy.node.developmentMajor}.x is required`);
  }
  if (bunVersion !== policy.bun.flake) {
    failures.push(`Bun ${policy.bun.flake} is required in the Nix development shell`);
  }
  if (
    !allowNonNix &&
    (!nodePath.startsWith("/nix/store/") || !bunPath?.startsWith("/nix/store/"))
  ) {
    failures.push("Node and Bun must resolve from the pinned Nix store");
  }

  const output = {
    ok: failures.length === 0,
    node: { version: nodeVersion, source: nodePath.startsWith("/nix/store/") ? "nix" : "ambient" },
    bun: { version: bunVersion, source: bunPath?.startsWith("/nix/store/") ? "nix" : "ambient" },
    safeChain: {
      version: safeChain.version,
      source: policy.safeChain.discovery,
      sha256: safeChain.sha256
    },
    browser,
    failures
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    console.log(output.ok ? "Development environment is valid" : failures.join("\n"));
  }

  if (!output.ok) process.exitCode = 3;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ ok: false, failures: [message] })}\n`);
  } else {
    console.error(message);
  }
  process.exitCode = 3;
});
