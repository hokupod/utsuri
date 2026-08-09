<!-- doc-language: en; canonical: true -->

[English](README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

# Utsuri

> See what changed. Understand why.

<a id="product-summary"></a><!-- section:product-summary -->

## Product summary

Utsuri transforms code changes into evidence-based, human-readable visual reviews. It connects Git hunks, intent, real-browser rendering, structural evidence, coverage, and human review state in one local report.

The name joins the Japanese ideas of how a UI is reflected after a change and how it transitions from before to after.

<a id="status"></a><!-- section:status -->

## Status

<!-- availability:phase-0-documentation -->

Utsuri v1 is under active implementation. The npm package is not published, the Plugin is not distributed, and commands shown below are for this source checkout only.

<a id="capabilities"></a><!-- section:capabilities -->

## Capabilities

The v1 target includes:

- semantic grouping of every Git hunk;
- isolated before/after browser capture;
- visual, DOM, ARIA, style, accessibility, runtime, and coverage evidence;
- a self-contained WCAG 2.2 AA report;
- review state, anchored comments, and Origin Session feedback; and
- Codex Plugin, Claude Code Plugin, standalone Skill, local CLI, and CI use.

These capabilities become available only as their phase gates pass. A failed or uncovered capture is never reported as no difference.

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

Prerequisites: Nix, Node 24, and an operator-managed Safe-chain 1.5.14 executable whose absolute path is stored in `UTSURI_SAFE_CHAIN_BIN`.

<!-- sync-command:dev-shell -->

```bash
nix develop
```

<!-- sync-command:dev-env-check -->

```bash
node scripts/dev-env-check.mjs --json
```

<!-- sync-command:install -->

```bash
"$UTSURI_SAFE_CHAIN_BIN" bun install --frozen-lockfile
```

No setup script, Skill, or CLI command installs dependencies or downloads a browser automatically.

<a id="development"></a><!-- section:development -->

## Development

Run package-manager operations through the exact Safe-chain executable.

<!-- sync-command:check -->

```bash
"$UTSURI_SAFE_CHAIN_BIN" bun run check
```

The bundled CLI protocol is verified natively so wrapper notices cannot corrupt JSON or NDJSON.

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## Security and privacy

Utsuri treats repository content, diffs, HTML, SVG, comments, Context Packs, and captured text as untrusted evidence.

**Security warning:** never provide production credentials, production browser state, unrestricted external network access, inferred setup commands, or parent-process environment variables to a capture. Before and after use separate Browser Contexts; external requests and Service Workers are blocked by default.

Generated `report/` content is immutable. Mutable human-review data is stored separately in `run/review/`. The static viewer does not contact external services.

<a id="documentation"></a><!-- section:documentation -->

## Documentation

- [Canonical detailed design](docs/design.md)
- [v1 implementation plan](docs/plans/v1-implementation.md)

The design is canonical in English. User-facing README changes update English, Japanese, and Simplified Chinese in the same change.

<a id="license-status"></a><!-- section:license-status -->

## License and publication status

Publisher identity and SPDX license are not yet decided. Every package remains private and unpublished until both are confirmed and all release gates pass. This repository must not be published, tagged, pushed, or promoted as part of the v1 implementation plan.
