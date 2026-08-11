# Distribution surfaces

## Local candidate boundary

Build and verify without publishing:

```bash
node scripts/safe-chain.mjs bun run build
node scripts/safe-chain.mjs bun run verify:release-layout
node scripts/safe-chain.mjs bun run verify:sbom
node scripts/safe-chain.mjs bun run eval:skills
```

One host proves only its current native helper. A complete candidate requires architecture-matched CI proofs for `darwin-arm64`, `darwin-x64`, `linux-arm64`, and `linux-x64`.

## Required properties

- public CLI assembled in a new private staging directory;
- no private workspace runtime dependency or install lifecycle script;
- exact recursive package inventory and version-tagged documentation links;
- helper architecture, source hash, executable mode, integrity, and no-replace proof;
- aggregate Plugin file hashes and modes bound by `candidate-manifest.json`;
- isolated exact-tarball install under Node 22 and Node 24; and
- no registry, tag, push, upload, or promotion operation from local Skill execution.

The default workflow mode creates a private candidate artifact only. Registry staging and post-publication promotion require separate operator authorization and must not be inferred from a request to review or package locally.

## Git Marketplace Plugin

The Git Plugin under `plugins/utsuri/` is separate from the aggregate candidate. It contains host manifests and a deterministic documentation-only transform of this Skill. It must not contain the compiled CLI, native helpers, report UI assets, schemas, SBOM files, absolute local paths, secrets, or `ai/`.

Both host MCP manifests use native `npx` with the same complete exact `@utsu-ri/cli` SemVer. Codex forwards only its current thread input. Claude Code supplies its current project/session inputs and the Plugin clears a nested Codex thread input. A floating version or extra identity input fails verification.

Generate and verify the Git Plugin Skill only from the canonical root Skill:

```bash
node scripts/plugin-distribution.mjs --sync-skill
node scripts/verify-plugin.mjs
```

Promotion first verifies the exact published CLI through strict native version JSON and MCP NDJSON. Its default is a no-write dry-run. A separately authorized `--write` rechecks preimages, uses atomic replacement, verifies the complete distribution, and restores original bytes on failure. It never commits, pushes, opens a pull request, publishes, tags, or creates a release.
