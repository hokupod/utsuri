# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.3] - 2026-09-07

### Changed

- Update development-only `typescript-eslint` to `8.69.0` and `globals` to
  `17.12.0` after dependency review and unchanged release-output verification.

## [0.3.2] - 2026-08-31

### Changed

- Update the development-only `typescript-eslint` toolchain to `8.68.0` after
  dependency review and unchanged release-output verification.

## [0.3.1] - 2026-08-24

### Changed

- Update the bundled AJV, axe-core, fflate, pixelmatch, Playwright, and YAML
  runtimes and regenerate deterministic CLI, report UI, SBOM, and license
  assets.
- Validate the release toolchain against Bun 1.4.0 while retaining Nix-pinned
  Bun 1.3.13 coverage.
- Derive SBOM and license-inventory identity from the installed production
  dependency graph. License-inventory schema 1.2 replaces `lockfileSha256`
  with `productionDependencySha256`.

### Fixed

- Keep Playwright 1.62.1 fully bundled without external runtime imports and
  accept its generated import aliases during release verification.
- Isolate temporary Git repositories from inherited hook state, permit
  generated files through pre-commit, and give offline candidate package
  installation a bounded CI timeout.
- Refresh release baselines and generated artifacts as one dependency-update
  transaction.

### Security

- Add Nix-pinned pre-commit and pre-push hooks with staged-path validation,
  outgoing secret scans, the complete local gate, and Plugin verification.
- Bind every bundled third-party module and installed production package to
  reviewed dependency baselines and byte hashes.

## [0.3.0] - 2026-08-21

### Added

- Add schema-validated Agent-authored review overviews, semantic changes, and
  per-hunk explanations, with deterministic fallback when annotations are
  unavailable.
- Add localized English and Japanese report copy selected from report metadata
  or the browser locale.
- Add the Utsuri product illustration to supported Codex Plugin surfaces.

### Changed

- Make a persistent loopback viewer, rendered diff check, and live URL the
  default completion path for human review sessions.
- Prioritize the review brief, change map, reviewer route, and keyboard
  navigation by risk first and confirmation state second.

### Security

- Reject annotations that omit or duplicate collected hunks, and preserve
  incomplete evidence instead of presenting unsupported Agent interpretation.

## [0.2.0] - 2026-08-11

### Added

- Add Git Marketplace catalogs and a source-only Utsuri Plugin for Codex and
  Claude Code, synchronized with CLI `0.2.0` and exact-pinned to that release.
- Add bounded, versioned run registration and the argumentless `utsuri mcp`
  broker with explicit zero, one, multiple, cross-project, and cross-session
  handling.
- Add deterministic Plugin generation, verification, promotion dry-run,
  atomic rollback, read-only CI, and current-host compatibility probes.

### Changed

- Reorganize all three READMEs around user installation, first review, report
  interpretation, security, and troubleshooting; move source development to
  `CONTRIBUTING.md`.
- Keep release numbers out of user READMEs and use the runtime compatibility
  record as the versioned source of truth.

### Security

- Preserve the Origin Session boundary without persisting or exposing raw
  session values, reject arbitrary MCP paths and destinations, and fail closed
  on ambiguous, stale, swapped, or mismatched registrations.

## [0.1.0] - 2026-08-09

### Added

- Add the complete Utsuri v1 review pipeline: repository collection, route and
  story discovery, deterministic capture and comparison, immutable reports,
  interactive review, Feedback Batches, Context Packs, and Origin Session
  return-to-session handling.
- Add the `@utsu-ri/cli` package and four architecture-specific native helper
  packages for Node 22 and 24 on supported macOS and Linux targets.
- Add Codex and Claude Code Plugin layouts with the `utsuri-review` Skill,
  schemas, SBOM, third-party notices, and aggregate native helpers.
- Add a read-only multi-platform Distribution Candidate workflow and a
  protected, tag-triggered release workflow using npm trusted publishing.

### Security

- Bind source, dependency, schema, UI, native-helper, package, Plugin, and
  release-asset bytes to verified manifests and checksums.
- Add public-history PII and secret scanning, protected release tags, exact
  `main` tag validation, OIDC-only publication, and idempotent npm integrity
  checks for partial-release recovery.
