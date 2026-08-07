# Utsuri release and distribution guide

- **Current status**: Phase 5 distribution candidate
- **Public availability**: unpublished
- **Version source**: root `package.json`
- **Publisher**: `hokupod`
- **npm maintainer**: `hokupod-npm`
- **License**: `AGPL-3.0-or-later`

## Release boundary

The default release workflow produces a private GitHub Actions artifact. It does not publish, tag, promote, or approve an npm version.

Registry writes require a separately selected workflow input, the protected `npm-production` environment, GitHub OIDC, and explicit operator authorization. A staged npm version is still an external write, consumes the package/version slot, and is not public until a maintainer approves it with 2FA.

The first version of a new package cannot use npm staged publishing because the package must already exist. Bootstrap publication is a separate release operation and is not part of v1 implementation.

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

`.github/workflows/release.yml` is manually dispatched with `publication=candidate` by default.

1. Build and execute the native-helper proof on matching GitHub-hosted runners for all four targets.
2. Pack each exact native optional package.
3. Reconstruct the four verified helper directories in the aggregate job.
4. Assemble the private-staged CLI and aggregate Plugin.
5. Verify exact recursive inventories, file hashes, source/proof binding, architecture, and executable modes.
6. Pack all npm tarballs and carry the manifest-bound Plugin tree without extracting an intermediate archive.
7. Install only the exact local CLI and current-platform helper tarballs under Node 22 and Node 24 with registry fallback disabled.
8. Upload the candidate artifact with seven-day retention.

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
- Transport regular files through Actions artifacts, verify their hashes, then restore only manifest-declared `0644` / `0755` modes. Never extract a downloaded Plugin or helper tarball in the candidate or promotion workflow.
- Create the promoted Plugin archive only from the exact tree that passed manifest, release-layout, Skill, and Claude strict validation.
- Verify the helper architecture from its executable bytes, not its directory name.
- Require the audited platform no-replace operation; never fall back to ordinary `rename`.
- Install generated tarballs in an isolated directory with an empty user config, isolated cache, `--ignore-scripts`, and no workspace or ambient CLI fallback.

## CI review artifacts

`utsuri pack` writes `report.zip`, `report.json`, and `ci-summary.json` to a new output directory. A configured `failOn` match returns exit code `10` after preserving all artifacts. The CLI never uploads them; `.github/workflows/ci.yml` owns artifact upload and retention.

## Registry staging

The optional `publication=stage` job is not part of candidate generation. It requires:

- an explicit workflow selection;
- approval through the `npm-production` GitHub environment;
- `id-token: write` only on the staging job;
- npm 11.15.0 or newer and Node 22.14.0 or newer;
- pre-existing npm packages with the trusted publisher configured for `.github/workflows/release.yml`; and
- the trusted publisher restricted to `npm stage publish` where possible.

The job stages helper packages before the CLI and never runs `npm stage approve`. Follow [npm staged publishing](https://docs.npmjs.com/staged-publishing/) and [trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the operator-side configuration.

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

## Remaining stable-release gates

Phase 5 is not a stable release. Stable candidacy additionally requires:

- Phase 6 Origin Session feedback and localhost API security gates;
- a current human semantic review of the English design and all three READMEs;
- Codex local marketplace install/load evidence from the exact candidate;
- real-browser E2E evidence using an already installed compatible browser; and
- separate authorization for any tag, registry write, promotion, push, or public release.
