# Distribution candidate

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
