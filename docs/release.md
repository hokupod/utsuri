# Utsuri release and distribution guide

- **Current status**: Phase 6 / `v0.1.0` release-ready source
- **Public availability**: unpublished
- **Version source**: root `package.json`
- **Publisher**: `hokupod`
- **npm maintainer**: `hokupod-npm`
- **License**: `AGPL-3.0-or-later`

## Release boundary

`.github/workflows/distribution-candidate.yml` is the default, manually dispatched release check. It produces a private GitHub Actions artifact and has no registry-write or OIDC permission. It does not publish, tag, promote, or approve an npm version.

`.github/workflows/release.yml` runs only after an operator pushes an annotated `v*` tag. It requires the tag to match the root and CLI versions and to point to the exact `origin/main` commit. Registry writes are confined to its protected `release` environment and use GitHub OIDC trusted publishing without an npm token.

The workflow never creates or pushes a tag. Package creation, the first registry write, tag creation, and environment approval remain separate operator actions. The first version of a new package cannot use npm trusted or staged publishing because the package must already exist; follow the one-time bootstrap procedure below.

## Package identities

| Artifact         | Package or directory        | Runtime target        |
| ---------------- | --------------------------- | --------------------- |
| CLI              | `@utsu-ri/cli`              | Node 22 and 24        |
| Native helper    | `@utsu-ri/cli-darwin-arm64` | macOS arm64           |
| Native helper    | `@utsu-ri/cli-darwin-x64`   | macOS x64             |
| Native helper    | `@utsu-ri/cli-linux-arm64`  | Linux arm64           |
| Native helper    | `@utsu-ri/cli-linux-x64`    | Linux x64             |
| Aggregate Plugin | `plugin/` in the candidate  | Codex and Claude Code |

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

1. Require an annotated `v<version>` tag at the exact `main` commit, a dated CHANGELOG entry, and current human-reviewed documentation hashes.
2. Scan the complete release history for private local paths and secrets with the repository scanner and Gitleaks.
3. Call the same read-only four-platform Distribution Candidate workflow.
4. Enter the protected `release` environment with `id-token: write`, verify the downloaded candidate, and publish through npm trusted publishing without `NODE_AUTH_TOKEN` or `NPM_TOKEN`.
5. Process the four helper packages before the CLI. A missing version is published; an existing version is accepted only when registry integrity exactly equals the candidate. Different bytes fail closed, allowing safe recovery after a partial multi-package publish.
6. Run the exact published SemVer through native `npx` and `bunx` before Safe-chain setup and require one strict JSON line with no stderr or ambient fallback.
7. Create a draft GitHub Release, upload the five npm tarballs, Plugin archive, manifests, and checksums, then publish the draft only after every upload succeeds. Any pre-existing release fails closed instead of bypassing asset verification.

Required repository configuration mirrors Kyoso:

- GitHub Environment `release`, with the repository owner as required reviewer;
- active tag ruleset `protect-release-tags` for `refs/tags/v*`, restricting creation, update, and deletion with only the intended repository-role bypass; and
- an npm trusted publisher on each of the five packages with owner `hokupod`, repository `utsuri`, workflow `release.yml`, and environment `release`.

## First-publication bootstrap

npm trusted publishing and staged publishing cannot create a package. For the first Utsuri release:

1. Push the verified release-ready commit to `main`; do not create the release tag yet.
2. Run the manual Distribution Candidate workflow on that exact `main` commit and download `utsuri-release-candidate` by exact run ID.
3. Verify `release-assets.json`, `SHA256SUMS`, all five tarballs, and the candidate manifest locally. Record the run ID and artifact digest.
4. Using the authorized npm maintainer account and npm's current 2FA-required first-publication procedure, publish those exact four helper tarballs before the exact CLI tarball. Do not store a registry token in this repository or GitHub Actions.
5. Confirm each public registry version has the exact SHA-512 integrity recorded in `release-assets.json`.
6. Configure the five trusted publishers with the exact owner, repository, workflow filename, and environment listed above.
7. Create the annotated `v0.1.0` tag at the still-current exact `main` commit and push only that tag. The release workflow will accept the already-published versions only when every integrity matches, run the published smoke, and create the GitHub Release.

If a draft GitHub Release remains after an upload failure, the workflow intentionally refuses to overwrite it. Inspect and remove or reconcile that draft explicitly before retrying. Follow [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm staged publishing](https://docs.npmjs.com/staged-publishing/), and [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) for current operator-side behavior.

## Post-publication promotion

`.github/workflows/plugin-promotion.yml` is manually dispatched only after a separate publication approval. It must:

1. run `scripts/verify-published-cli.mjs` before Safe-chain setup or dependency installation;
2. execute the exact SemVer through native `npx` and `bunx` with isolated cache/config and strict JSON stdout;
3. reject `latest`, ranges, notices, ambient executables, timeouts, and surviving descendants;
4. download the approved candidate by exact workflow run ID;
5. verify the aggregate Plugin against its candidate manifest;
6. install and verify the exact published current-platform helper and CLI; and
7. rerun Skill evaluations and Claude strict validation before uploading the promoted Plugin artifact.

No post-publication smoke may filter wrapper output to make invalid JSON appear valid.

## Remaining `v0.1.0` release gates

The v1 source and local implementation gates are complete. Public `v0.1.0` still requires external evidence that cannot be established by source changes alone:

- a current human semantic review of this release update in the English design and all three READMEs;
- successful `main` CI and a manual four-platform Distribution Candidate run on the exact release commit;
- the protected GitHub Environment and `v*` tag ruleset described above;
- exact first-publication bootstrap and all five npm trusted-publisher registrations;
- explicit authorization for the first registry writes and annotated tag push; and
- successful tag workflow, published-package smoke, and GitHub Release creation.
