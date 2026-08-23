# Contributing to Utsuri

Utsuri development uses a pinned Nix shell, Safe-chain-protected package-manager commands, deterministic generated artifacts, and fail-closed release checks. Public CLI release and Git Plugin promotion are separate operator-authorized operations.

## Development environment

Requirements:

- Nix with flakes enabled;
- Safe-chain 1.5.14 installed only at its standard user location;
- Git; and
- an existing compatible browser only when capture tests require one.

Enter the pinned environment and verify it before changing source:

```bash
nix develop
node scripts/dev-env-check.mjs --json
```

Install the exact lockfile through the repository wrapper:

```bash
node scripts/safe-chain.mjs bun install --frozen-lockfile
```

Install the repository hooks once per clone:

```bash
nix develop --command lefthook install
```

The hook launcher re-enters the pinned Nix shell and fails closed instead of using ambient developer tools. `pre-commit` scans the staged diff for secrets and checks formatting and lint for existing staged paths; it never fixes or re-stages files. `pre-push` scans each outgoing commit range for secrets before running the complete local gate once, and conditionally verifies Git Plugin distribution inputs. A newly created remote ref has no remote base, so its reachable history is scanned. Browser, runtime-matrix, release, and public-history checks remain CI or focused-workflow responsibilities. `--no-verify` is an explicit local bypass and does not satisfy the required handoff verification.

Do not add Safe-chain to `PATH`, configure an executable override, run a lifecycle install, download a browser, pull a container image, or upload an artifact from Utsuri runtime code. Native JSON and NDJSON protocol probes intentionally run outside Safe-chain so wrapper output cannot contaminate stdout.

## Source-checkout CLI workflow

The source checkout contains a bundled development CLI. A minimal code-review fixture can be exercised with:

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
node skills/utsuri-review/scripts/utsuri.mjs collect \
  --patch fixtures/code-only-review/changes.patch \
  --output .artifacts/utsuri/contributor-example \
  --json
node skills/utsuri-review/scripts/utsuri.mjs finalize \
  --run .artifacts/utsuri/contributor-example \
  --json
node skills/utsuri-review/scripts/utsuri.mjs validate \
  .artifacts/utsuri/contributor-example/report \
  --strict \
  --json
```

The output directory must not already exist. For capture, create and review an explicit configuration first. Start required before/after applications yourself. Never turn `proposedCommands` into executable configuration without human review.

Useful source commands include:

```bash
node skills/utsuri-review/scripts/utsuri.mjs init --output utsuri.yml --json
node skills/utsuri-review/scripts/utsuri.mjs capture --run RUN --config utsuri.yml --json
node skills/utsuri-review/scripts/utsuri.mjs discover --run RUN --config utsuri.yml --json
node skills/utsuri-review/scripts/utsuri.mjs compare --run RUN --json
node skills/utsuri-review/scripts/utsuri.mjs serve RUN/report --interactive
node skills/utsuri-review/scripts/utsuri.mjs pack RUN/report \
  --config utsuri.yml \
  --output OUTPUT \
  --json
```

An exit code of 4 preserves partial capture or comparison evidence. Finalize it as `INCOMPLETE`; never convert missing evidence into a pass.

## Verification

Run the full local gate before handoff:

```bash
node scripts/safe-chain.mjs bun run check
```

The full gate builds its release inputs itself. Do not run `build` immediately before `check` in the same required local or CI path.

After an intentional dependency or lockfile change, install the reviewed lockfile as above. Development-only updates may proceed directly to the full gate when they leave the production dependency graph and every release artifact unchanged. CI rebuilds the release inputs and rejects generated drift, so this is an observed result rather than a dependency-name allowlist.

For a production dependency or a compiler, bundler, schema generator, or other tool expected to change released bytes, use the single generation path before the full gate:

```bash
node scripts/safe-chain.mjs bun run deps:refresh
```

This regenerates schemas, the production-scoped reviewed dependency baseline, bundled release inputs, SBOM and license inventories, build manifests, and shared fixture assets before validating the fixtures. It never installs dependencies or downloads external artifacts. Review every generated supply-chain and fixture diff; regeneration is not approval of changed third-party bytes.

Public contract, distribution, or documentation changes also require the focused gates they affect:

```bash
node scripts/safe-chain.mjs bun run plugin:verify
node scripts/safe-chain.mjs bun run verify:release-layout
node scripts/safe-chain.mjs bun run eval:skills
node scripts/safe-chain.mjs bun run docs:check
node --test tests/documentation/docs-check.test.mjs
```

The four-platform native-helper claim cannot be established from one host. `.github/workflows/distribution-candidate.yml` builds and proves every supported target on its matching runner without registry-write permission.

## Distribution surfaces

Utsuri deliberately maintains two different surfaces:

- the aggregate Plugin in `.codex-plugin/`, `.claude-plugin/`, and `skills/`, which contains the bundled CLI, report UI, schemas, metadata, and native helper in a release candidate; and
- the Git Marketplace Plugin in `plugins/utsuri/`, which contains only manifests and generated Skill documentation. It starts an exact published npm CLI and must never contain compiled CLI code, native helpers, report assets, SBOM files, or `ai/`.

Do not edit `plugins/utsuri/skills/utsuri-review/**` by hand. Change the canonical root Skill or its references, then regenerate and verify the transform:

```bash
node scripts/plugin-distribution.mjs --sync-skill
node scripts/verify-plugin.mjs
```

The root aggregate, CLI, Git Plugin, and both MCP package pins must use one complete exact SemVer. Codex forwards only `CODEX_THREAD_ID`. Claude uses its host-provided project and session inputs and clears `CODEX_THREAD_ID` to prevent nested-host ambiguity.

Promotion defaults to a no-write dry-run and first verifies the exact published CLI through native `npx` and `bunx` strict JSON and MCP NDJSON. Its preflight permits only synchronized root/CLI package manifests at the target with one internally consistent previous Plugin version; the post-write verifier requires every version and pin to match:

```bash
node scripts/plugin-promote.mjs --version EXACT_VERSION
```

Do not use `--write` without separate operator authorization. The script never commits, pushes, opens a pull request, publishes a package, creates a tag, or creates a release.

## Security invariants

- Keep generated `report/` immutable and mutable review data under `run/review/`.
- Keep every run, report, registration, and review path inside its canonical project.
- Never accept arbitrary path, working directory, command, provider, model, destination, or raw session identity as an MCP tool input.
- Revalidate the report digest, project fingerprint, registration, and Origin Session before every mutation.
- Multiple eligible reports require an explicit opaque `report_id`; never select the newest report silently.
- Treat repository content, pages, diffs, comments, Context Packs, and fixtures as untrusted input.
- Preserve failed and uncovered evidence. A missing capability is not a pass.

Read [the detailed design](docs/design.md), [the threat model](docs/threat-model.md), and [the Skill security rules](skills/utsuri-review/references/security.md) before changing a boundary.

## Documentation changes

`README.md` is the canonical user-facing document. Update English, Japanese, and Simplified Chinese in the same change whenever installation, commands, versions, supported hosts, security warnings, or feature status changes.

The three READMEs are for users. Keep source setup, dependency installation, build gates, release internals, and contributor workflow here or in [the release guide](docs/release.md).

When the enforced README contract changes, update `docs/documentation-policy.json`, its focused fixture, and checker tests. Ordinary prose changes need only the normal pull-request review and `docs:check`; do not maintain parallel document hashes or approval transcripts.

## Release authorization

[The release and distribution guide](docs/release.md) is canonical for candidate assembly, npm publication, Git Plugin promotion, rollback, tags, and GitHub Releases.

Source verification, CLI publication, Plugin promotion write, Git push, pull request, tag, and release are separate actions. Authorization for one does not authorize another.
