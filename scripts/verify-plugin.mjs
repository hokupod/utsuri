#!/usr/bin/env node

import { verifyPluginDistribution } from "./plugin-distribution.mjs";

try {
  const result = verifyPluginDistribution();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      pluginId: result.pluginId,
      pluginVersion: result.pluginVersion,
      cliPackage: `${result.packageName}@${result.cliVersion}`,
      canonicalSha256: result.canonicalSha256
    })}\n`
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
