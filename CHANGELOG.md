# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
