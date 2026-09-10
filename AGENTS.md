# Utsuri contributor guidance

## Development environment

- Enter the pinned shell with `nix develop`.
- Safe-chain 1.5.16 is discovered only at the standard user install location.
- Run local package-manager commands as `node scripts/safe-chain.mjs bun ...`.
- Do not set an executable-path environment variable and do not add Safe-chain's directory to `PATH`.
- Do not run dependency installation, browser download, `direnv allow`, publishing, or external upload from Utsuri runtime code.
- Native CLI JSON and NDJSON protocol smoke tests intentionally run outside Safe-chain so wrapper output cannot alter stdout.

## Verification

- Run `node scripts/safe-chain.mjs bun run check` before handing off a change. The pre-push hook owns this check when pushing; do not immediately repeat the same check manually.
- Keep JSON Schema canonical and regenerate TypeScript declarations with `schemas:generate`.
- After a production dependency or release-output-affecting tool change, run `node scripts/safe-chain.mjs bun run deps:refresh` and review every generated baseline, SBOM, license, build, and fixture diff. Development-only updates may omit refresh only when `check` leaves all release artifacts unchanged.
- Update `docs/design.md` and all three README files in the same change when a public contract, command, version, security warning, or feature status changes.
- Keep `report/` immutable. Store mutable review state under `run/review/`.

## Review scope

- Do not implement advisory-only review findings unless the user explicitly requests them; keep fixes limited to decision-active findings and observed failures.

## Harness scope

- Keep verification proportional to an observed failure boundary. Do not add document-byte hashes, approval transcripts, or parallel state files; Git history and pull-request review are the documentation record.
- Do not run the same test or verifier more than once in a required local or CI path unless each invocation exercises a distinct runtime or artifact.
- `check` owns its release-input build; do not run `build` immediately before `check` in the same required path.
- Before adding a gate, identify the unique failure it catches and prefer extending the smallest existing check.

## Dependency maintenance

- Follow `CONTRIBUTING.md` for bounded Renovate repair. A failed generated-artifact check may be repaired with the existing generators in an isolated checkout when maintenance writes are authorized.
- Review the exact dependency update and every generated baseline, SBOM, license, bundle, and fixture diff before committing. Unexpected source, workflow, or authorization changes stop the repair.
- Keep tool versions exactly pinned in canonical manifests/policy; do not duplicate their patch versions or digest values in contract tests.
- Merge development-only updates without a release when the verified release artifacts are unchanged. Publication still requires all release and Plugin gates in `docs/release.md`.
