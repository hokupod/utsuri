# Utsuri contributor guidance

## Development environment

- Enter the pinned shell with `nix develop`.
- Safe-chain 1.5.14 is discovered only at the standard user install location.
- Run local package-manager commands as `node scripts/safe-chain.mjs bun ...`.
- Do not set an executable-path environment variable and do not add Safe-chain's directory to `PATH`.
- Do not run dependency installation, browser download, `direnv allow`, publishing, or external upload from Utsuri runtime code.
- Native CLI JSON and NDJSON protocol smoke tests intentionally run outside Safe-chain so wrapper output cannot alter stdout.

## Verification

- Run `node scripts/safe-chain.mjs bun run check` before handing off a change.
- Keep JSON Schema canonical and regenerate TypeScript declarations with `schemas:generate`.
- Update `docs/design.md` and all three README files in the same change when a public contract, command, version, security warning, or feature status changes.
- Keep `report/` immutable. Store mutable review state under `run/review/`.

## Review scope

- Do not implement advisory-only review findings unless the user explicitly requests them; keep fixes limited to decision-active findings and observed failures.
