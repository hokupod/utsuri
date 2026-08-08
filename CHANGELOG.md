# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
