<!-- doc-language: en; canonical: true -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> See what changed. Understand why.

<a id="product-summary"></a><!-- section:product-summary -->

## Product summary

Utsuri transforms code changes into evidence-based, human-readable visual reviews. It connects Git hunks, intent, real-browser rendering, structural evidence, coverage, and human review state in one local report.

The name joins the Japanese ideas of how a UI is reflected after a change and how it transitions from before to after.

<a id="status"></a><!-- section:status -->

## Status

<!-- availability:phase-1-code-review -->

The Phase 1 code-only review flow is available from this source checkout. It collects patch, worktree, range, or merge-base changes and builds an immutable local report. Browser capture, visual/runtime comparison, persisted review state, and Agent feedback are not implemented yet. The npm package and Plugin remain unpublished.

<a id="capabilities"></a><!-- section:capabilities -->

## Capabilities

Available now:

- explicit patch, worktree, range, and merge-base collection modes;
- stable structured hunks with rename, delete, binary, submodule, mode, and low-signal metadata;
- deterministic initial change candidates with complete candidate-or-unclassified coverage;
- schema-validated annotations and evidence references; and
- a self-contained code review with summary, three-state queue, Focus mode, evidence drawer, unified/side-by-side diff, deep links, and keyboard focus restoration.

Later v1 phases add isolated browser capture, visual/DOM/ARIA/style/accessibility/runtime comparison, persisted review state, and Origin Session feedback. Until capture runs, every report is `UNCOVERED` and explicitly lists visual and runtime verification gaps.

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

Prerequisites: Nix and Safe-chain 1.5.14 installed at its standard user location. The Nix shell supplies Node 24 and Bun; no absolute Safe-chain path is configured.

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
node scripts/safe-chain.mjs bun install --frozen-lockfile
```

No setup script, Skill, or CLI command installs dependencies or downloads a browser automatically.

Create a fresh code-only example run. The output directory must not already exist.

<!-- sync-command:collect-patch -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs collect --patch fixtures/code-only-review/changes.patch --output .artifacts/utsuri/readme-example --json
```

<!-- sync-command:finalize-report -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs finalize --run .artifacts/utsuri/readme-example --json
```

<!-- sync-command:validate-report -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs validate .artifacts/utsuri/readme-example/report --strict --json
```

<a id="development"></a><!-- section:development -->

## Development

Run package-manager operations through the repository wrapper, which discovers Safe-chain 1.5.14 at its standard user location. Before its first execution, the wrapper verifies the platform-specific SHA-256 pinned in `toolchain-policy.json`; it then verifies the exact version. CI downloads the matching official release asset and verifies the same digest before execution.

<!-- sync-command:check -->

```bash
node scripts/safe-chain.mjs bun run check
```

The bundled CLI protocol is verified natively so wrapper notices cannot corrupt JSON or NDJSON.

The check and build gates compile the audited atomic-publication helper for the current macOS or Linux target. Distribution candidates assemble and verify all four supported OS/architecture helpers before publication.

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## Security and privacy

Utsuri treats repository content, diffs, HTML, SVG, comments, Context Packs, and captured text as untrusted evidence.

**Security warning:** never provide production credentials, production browser state, unrestricted external network access, inferred setup commands, or parent-process environment variables to a capture. Before and after use separate Browser Contexts; external requests and Service Workers are blocked by default.

Generated `report/` content is immutable. Utsuri requires regular non-symlink run inputs, a publication path protected from other local principals, strict staging validation, and the bundled OS no-replace helper. Missing or unsupported helpers fail closed; failed generation can leave a private staging directory for manual diagnosis and never deletes it automatically. Mutable human-review data is stored separately in `run/review/`. The static viewer does not contact external services.

Code diff content is parsed into structured lines and rendered only as text. Repository-controlled diff text is never injected as HTML.

<a id="documentation"></a><!-- section:documentation -->

## Documentation

- [Canonical detailed design](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [UI guidelines and HIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [v1 implementation plan](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

The design is canonical in English. User-facing README changes update English, Japanese, and Simplified Chinese in the same change.

<a id="license-status"></a><!-- section:license-status -->

## License and publication status

The publisher is `hokupod`, the npm maintainer is `hokupod-npm`, publication uses GitHub Actions trusted publishing, and the SPDX license is `AGPL-3.0-or-later`. Packages remain unpublished until all release gates pass and a separate release is explicitly authorized. The v1 implementation plan does not publish, tag, push, or promote artifacts.
