# Utsuri release and distribution guide

- **Current status**: CLI and Git Plugin `0.3.3` publicly available
- **Public availability**: verified `0.3.3` npm packages, GitHub Release, and public Git Marketplace Plugin
- **Version source**: root `package.json`
- **Publisher**: `hokupod`
- **npm maintainer**: `hokupod-npm`
- **License**: `AGPL-3.0-or-later`

## Release boundary

`.github/workflows/distribution-candidate.yml` is the default, manually dispatched release check. It produces a private GitHub Actions artifact and has no registry-write or OIDC permission. It does not publish, tag, promote, or approve an npm version.

`.github/workflows/release.yml` runs only after an operator pushes an annotated `v*` tag. It requires the tag to match the root and CLI versions and to point to the exact `origin/main` commit. Registry writes are confined to its protected `release` environment and use GitHub OIDC trusted publishing without an npm token.

All five package identities now exist publicly through `0.3.3`; release `0.3.3` was published only through the protected tag workflow. Tag creation and release-environment approval remain separate operator actions. A missing package identity or trusted-publisher configuration is release drift: stop and restore the protected configuration instead of falling back to a manual publish.

## Two distribution surfaces and authorization

The aggregate Plugin and Git Marketplace Plugin are independent outputs:

- The aggregate Plugin is assembled only inside a verified release candidate from the root manifests and bundled `skills/` tree. It contains compiled CLI/runtime assets and all four architecture-matched native helpers in the multi-platform candidate.
- The Git Marketplace Plugin is tracked under `plugins/utsuri/`. It contains only manifests plus a deterministic documentation-only Skill, and starts an exact published CLI through native `npx`. Git catalog files and `plugins/utsuri/` must never enter the aggregate artifact.

CLI release and Git Plugin promotion are always separate operations and approvals. One complete SemVer identifies both surfaces, so the authorized version-change transaction updates the CLI version, Plugin version, and exact Plugin pin together. Promotion preflight may observe only one controlled skew: synchronized root/CLI package manifests at the target while every old Plugin version and MCP pin still matches. The normal verifier rejects that transient state, and promotion must end with complete synchronization. No source change authorizes npm publication, Plugin promotion, a Git commit, push, pull request, merge, tag, GitHub Release, or live Git installation test.

The current source decision is one synchronized CLI/root aggregate/Git Plugin version: `0.3.3`. Both Codex and Claude MCP manifests must pin exactly `@utsu-ri/cli@0.3.3`. Public availability is verified at `0.3.3` after every publication and Plugin gate completed. Complete SemVer is mandatory; `latest`, tags, ranges, and workspace specifiers fail verification.

## Package identities

| Artifact         | Package or directory        | Runtime target        |
| ---------------- | --------------------------- | --------------------- |
| CLI              | `@utsu-ri/cli`              | Node 22 and 24        |
| Native helper    | `@utsu-ri/cli-darwin-arm64` | macOS arm64           |
| Native helper    | `@utsu-ri/cli-darwin-x64`   | macOS x64             |
| Native helper    | `@utsu-ri/cli-linux-arm64`  | Linux arm64           |
| Native helper    | `@utsu-ri/cli-linux-x64`    | Linux x64             |
| Aggregate Plugin | `plugin/` in the candidate  | Codex and Claude Code |
| Git Plugin       | `plugins/utsuri/` in Git    | Codex and Claude Code |

The CLI JavaScript is bundled. Private workspace packages are never registry runtime dependencies. Each native package contains exactly `LICENSE`, `package.json`, `bin/utsuri-fs-ops`, `integrity.json`, and `proof.json` according to the release manifest contract. The proof binds the separately reviewed source hash used to build the helper.

## Candidate workflow

`.github/workflows/distribution-candidate.yml` is manually dispatched or called by the tag-triggered release workflow.

1. Build and execute the native-helper proof on matching GitHub-hosted runners for all four targets.
2. Pack each exact native optional package.
3. Reconstruct the four verified helper directories in the aggregate job.
4. Assemble the private-staged CLI and aggregate Plugin.
5. Verify exact recursive inventories, file hashes, source/proof binding, architecture, and executable modes.
6. Pack all npm tarballs and carry the manifest-bound Plugin tree without extracting an intermediate archive.
7. Create the deterministic aggregate Plugin archive, `release-assets.json`, and `SHA256SUMS`; verify their exact inventory and bytes.
8. Install only the exact local CLI and current-platform helper tarballs under Node 22 and Node 24 with registry fallback disabled.
9. Upload the candidate artifact with seven-day retention.

Candidate assembly explicitly omits `.claude-plugin/marketplace.json`, `.agents/`, and `plugins/utsuri/`. The aggregate verifier rejects any Git Marketplace catalog or Plugin source path in its manifest.

Local structural verification uses:

```bash
node scripts/safe-chain.mjs bun run build
node scripts/safe-chain.mjs bun run verify:release-layout
node scripts/safe-chain.mjs bun run verify:sbom
node scripts/safe-chain.mjs bun run eval:skills
claude plugin validate . --strict
```

The four-platform aggregate cannot be claimed from one host. The workflow must provide the architecture-matched proof for every target.

## Exact artifact rules

- Assemble public packages only in a newly created private staging directory.
- Reject symlinks, extra files, missing files, install lifecycle scripts, private workspace dependencies, mutable-branch documentation links, and former identifiers.
- Preserve native helper mode `0755`; preserve ordinary file mode `0644`.
- Bind every candidate file in `candidate-manifest.json` by SHA-256 and mode.
- Bind each npm tarball and the deterministic Plugin archive in `release-assets.json` by SHA-256, byte size, and npm SHA-512 integrity where applicable. Generate exact `SHA256SUMS` from that manifest.
- Transport regular files through Actions artifacts, verify their hashes, then restore only manifest-declared `0644` / `0755` modes. Never extract a downloaded Plugin or helper tarball in the candidate or promotion workflow.
- Create the promoted Plugin archive only from the exact tree that passed manifest, release-layout, Skill, and Claude strict validation.
- Verify the helper architecture from its executable bytes, not its directory name.
- Require the audited platform no-replace operation; never fall back to ordinary `rename`.
- Install generated tarballs in an isolated directory with an empty user config, isolated cache, `--ignore-scripts`, and no workspace or ambient CLI fallback.

## CI review artifacts

`utsuri pack` writes `report.zip`, `report.json`, and `ci-summary.json` to a new output directory. A configured `failOn` match returns exit code `10` after preserving all artifacts. The CLI never uploads them; `.github/workflows/ci.yml` owns artifact upload and retention.

## Protected release workflow

The tag-triggered workflow performs these ordered gates:

1. Require an annotated `v<version>` tag at the exact `main` commit, a dated CHANGELOG entry, and successful exact-main CI.
2. Scan the complete release history for private local paths and secrets with the repository scanner and Gitleaks.
3. Call the same read-only four-platform Distribution Candidate workflow.
4. Enter the protected `release` environment with `id-token: write`, verify the downloaded candidate, and publish through npm trusted publishing without `NODE_AUTH_TOKEN` or `NPM_TOKEN`.
5. Process the four helper packages before the CLI. A missing version is published; an existing version is accepted only when registry integrity exactly equals the candidate. Different bytes fail closed, allowing safe recovery after a partial multi-package publish.
6. Run the exact published SemVer through native `npx` and `bunx` before Safe-chain setup. Require one strict version JSON line plus strict `initialize` and `tools/list` NDJSON, no stderr, no notices, no ambient fallback, the exact broker identity, six bounded tools, and no arbitrary path/session/destination input.
7. Create a draft GitHub Release, upload the five npm tarballs, Plugin archive, manifests, and checksums, then publish the draft only after every upload succeeds. Any pre-existing release fails closed instead of bypassing asset verification.

Required repository configuration mirrors Kyoso:

- GitHub Environment `release`, with the repository owner as required reviewer;
- active tag ruleset `protect-release-tags` for `refs/tags/v*`, restricting creation, update, and deletion with only the intended repository-role bypass; and
- an npm trusted publisher on each of the five packages with owner `hokupod`, repository `utsuri`, workflow `release.yml`, and environment `release`.

## Tag-triggered release procedure

1. Merge the verified release-ready commit to `main` and require successful `main` CI.
2. Confirm that all five package identities still exist and that each trusted publisher allows `npm publish` only from owner `hokupod`, repository `utsuri`, workflow `release.yml`, and environment `release`.
3. Run the manual Distribution Candidate workflow on the exact `main` commit. Verify the exact run SHA and successful four-platform candidate before tagging.
4. Confirm that none of the five `0.3.3` versions already exists. If one exists, reconcile its registry integrity against the approved candidate before continuing.
5. Create annotated tag `v0.3.3` at the still-current exact `main` commit and push only that tag.
6. Approve the protected `release` environment. The workflow publishes the four helpers before the CLI, verifies every registry integrity, runs native `npx` and `bunx` smoke, and creates the immutable GitHub Release.
7. Verify the published tag, five package integrities, provenance, release assets, and live Plugin installation before declaring availability.

Do not declare a release publicly available until step 7 succeeds. A later release remains publicly available while its new candidate is prepared; documentation alone is not a release-authorization signal.

If publication fails after some package versions appear, rerun the same immutable tag workflow; the integrity reconciliation accepts only exact candidate bytes. Never move or recreate the tag. If a draft GitHub Release remains after an upload failure, the workflow intentionally refuses to overwrite it; inspect and reconcile that draft explicitly before retrying. Follow [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) for current operator-side behavior.

## Post-publication promotion

`.github/workflows/plugin-promotion.yml` is manually dispatched only after a separate publication approval. It must:

1. run `scripts/verify-published-cli.mjs` before Safe-chain setup or dependency installation;
2. execute the exact SemVer through native `npx` and `bunx` with isolated cache/config and strict JSON plus MCP NDJSON stdout;
3. reject `latest`, ranges, notices, ambient executables, unsafe tool schemas, timeouts, and surviving descendants;
4. download the approved candidate by exact workflow run ID and verify the aggregate Plugin against its candidate manifest;
5. install and verify the exact published current-platform helper and CLI;
6. run `plugin-promote.mjs` with one operator-supplied exact version in its default no-write dry-run mode; its controlled preflight verifies the tracked Git Plugin inventory, coherent previous version and exact pin, generated Skill digest, and allowed environment inputs; and
7. rerun Skill evaluations and Claude strict validation before uploading the separately verified aggregate Plugin artifact.

The workflow does not run ordinary `plugin:verify` before the dry-run because that strict verifier correctly rejects the controlled pre-write version skew. The workflow never passes `--write`, commits, pushes, or opens a pull request. After the dry-run passes, an operator may separately authorize a local `--write`. The write rechecks every preimage, stages same-directory files, atomically replaces only the declared catalog/manifest/generated-Skill/compatibility targets, and runs the complete strict Plugin verifier. Any post-write failure restores every original byte and mode; rollback failure is terminal and must be investigated before retrying. The separate source-change CI also requires ordinary `plugin:verify` after the synchronized bytes are committed for review.

Commit, push, pull request, and merge remain further separate approvals. Only after the exact promoted source is merged and publicly reachable may an operator run live Git-source installation in isolated Codex and Claude configurations. Record the exact commit, host versions, package identity, and sanitized boolean results. Never copy raw session values, credentials, local paths, or support correspondence into repository evidence.

No post-publication smoke may filter wrapper output to make invalid JSON appear valid.

## Verified synchronized `0.3.3` release

The 2026-09-07 release completed every external publication gate:

- exact release source commit `3680a056060b192d05448b3d785d7f5555611391` passed `main` CI run `34072412571` and four-platform Distribution Candidate run `34072618846`;
- all five exact npm package versions were published with candidate-matching integrity and SLSA provenance through protected Release run `34077275746`;
- [GitHub Release `v0.3.3`](https://github.com/hokupod/utsuri/releases/tag/v0.3.3) was published with the bound candidate manifest, checksums, five tarballs, and aggregate Plugin archive;
- promotion run `34077718476` verified the exact public CLI, helper, approved candidate manifest, Skill evaluations, and Claude strict validation; and
- isolated public Git-source installations on Codex `0.151.0` and Claude Code `2.1.251` verified the sanitized contract recorded in `docs/compatibility/plugin-runtime.json`.
