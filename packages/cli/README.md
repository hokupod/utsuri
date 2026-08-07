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

<!-- availability:phase-4-security-hardening -->

The Phase 4 security-hardened flow is available from this source checkout. It combines code review, isolated browser capture, comparison and coverage with hardened report boundaries, resource limits, capability-gated container execution, a self-contained ESM bundle, and deterministic supply-chain metadata. Persisted review state and Agent feedback are not implemented yet. The npm package and Plugin remain unpublished.

<a id="capabilities"></a><!-- section:capabilities -->

## Capabilities

Available now:

- explicit patch, worktree, range, and merge-base collection modes;
- stable structured hunks with rename, delete, binary, submodule, mode, and low-signal metadata;
- deterministic initial change candidates with complete candidate-or-unclassified coverage;
- schema-validated annotations and evidence references; and
- a self-contained code review with summary, three-state queue, Focus mode, evidence drawer, unified/side-by-side diff, deep links, and keyboard focus restoration;
- separate before/after Browser Contexts with identical viewport, DPR, locale, timezone, color scheme, and reduced-motion settings;
- full-page and element screenshots plus normalized DOM, ARIA, computed-style, axe, console, network, metadata, and typed failure evidence; and
- deterministic stabilization, an allowlisted action DSL, blocked external/mutation requests, digest-checked reuse, and partial `INCOMPLETE` reports;
- prioritized explicit/Storybook/Playwright/route/import/selector/fallback target discovery with structured known, verified, unknown, planned, succeeded, and failed coverage;
- Pixelmatch counts, ratios, content-addressed diff images, changed regions, and normalized DOM/ARIA/style fingerprints;
- `new`, `resolved`, `unchanged`, and `incomplete` accessibility/runtime findings plus overflow and obstruction evidence; and
- side-by-side, wipe, stoppable blink, pixel-diff, and after-only views with crop/full-page selection, synchronized scroll/zoom, region navigation, and code/finding cross-links.
- separate static/interactive/iframe CSPs, bounded JSON, empty-sandbox sanitized previews, PNG-only visual evidence, expanded privacy declarations, and strict SHA-256 report validation;
- fixed Docker/Podman isolation with digest-pinned local images, no network, a read-only root/project mount, dropped capabilities, a non-root user, and PID/CPU/memory/time/artifact limits; and
- a single Node 22 ESM CLI bundle with source/schema/UI hashes plus deterministic SPDX 2.3 and dependency-license inventories.

Later v1 phases add persisted review state and Origin Session feedback. A complete capture remains `UNCOVERED` until discovery and comparison run. Missing or malformed evidence, a failed side, exceeded resource limits, or unavailable container capability remains `INCOMPLETE`; an unknown denominator remains explicit and is never presented as a percentage. Pixel differences alone do not establish `REGRESSION`.

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

Prerequisites: Nix, Safe-chain 1.5.14 at its standard user location, and an existing system Chrome or Chromium for capture. The Nix shell supplies Node 24 and Bun; no absolute Safe-chain path is configured.

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

Create a non-overwriting capture proposal from read-only project inspection. Review and edit it before capture; `proposedCommands` are never executed.

<!-- sync-command:init-capture-config -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs init --output utsuri.yml --json
```

Create a fresh example run. The output directory must not already exist.

<!-- sync-command:collect-patch -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs collect --patch fixtures/code-only-review/changes.patch --output .artifacts/utsuri/readme-example --json
```

For the default `dual-url` mode, start the configured before and after URLs yourself, then capture. A trusted `worktree` configuration additionally requires `--allow-project-code`. `static-fragment` starts no project command and labels its JavaScript-disabled output synthetic.

<!-- sync-command:capture-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs capture --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

A capture exit code of 4 preserves successful sides and typed failure evidence. Finalize that partial run rather than treating it as no visual difference.

Map changed code to the captured targets and preserve any unmapped change and unknown denominator.

<!-- sync-command:discover-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs discover --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

Compare pixels, structure, accessibility, runtime errors, network evidence, and overflow. Exit code 4 means the comparison is incomplete but its evidence is preserved.

<!-- sync-command:compare-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs compare --run .artifacts/utsuri/readme-example --json
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

**Security warning:** never provide production credentials, production browser state, unrestricted external network access, inferred setup commands, or parent-process environment variables to a capture. Before and after use separate Browser Contexts; external requests and Service Workers are blocked by default. External HTTP redirects and WebSocket handshakes use the same origin policy, and persisted textual evidence removes credentials, queries, and fragments from absolute and relative URLs.

`dual-url` never starts project code. `worktree` requires trusted input, explicit argv and separate working directories for both sides, plus the user's `--allow-project-code` opt-in. Child environments use only a minimal baseline and allowlisted non-secret names. `static-fragment` disables JavaScript and HTTP requests, sanitizes active markup, uses an empty-sandbox iframe, and is not equivalent to real-application rendering.

`container` accepts only Docker/Podman images pinned by SHA-256 and already present locally; it never pulls an image. The image must provide Node 22 for the bounded request bridge. Its fixed server invocation uses no network, a read-only root and project mount, no new privileges, no Linux capabilities, a non-root user, and bounded PID/CPU/memory/tmpfs/time/artifact resources. Every request and removal operation is bound to the full container ID and an ephemeral authenticated loopback proxy. Connection refusal is retried only during bounded readiness; identity, response, or origin failure revokes the proxy. Cleanup succeeds only after a responsive engine proves the immutable ID is absent. Before untrusted content can reach Chromium, Linux must provide a writable delegated cgroup v2 so `memory.max` can constrain the complete browser process tree. macOS and Linux hosts without that delegation report a missing capability before starting project code. Host environment allowlists, secret mounts, and host sockets are forbidden.

Every browser launch uses a random process token and must resolve to exactly one Chrome/Chromium parent. Failed launches and completed runs use bounded termination plus a global token rescan; unavailable tracking, ambiguous ownership, or any surviving process fails closed. Browser, cgroup, and server/container cleanup steps all run even when an earlier step fails. Each capture side applies `maxTimeMs` as a hard deadline to browser work and contained-file reads.

Generated `report/` content is immutable. Referenced capture and comparison evidence is independently digest-checked, copied into the report, restricted to validated PNG bytes for images, and covered by the report asset manifest. The stored `index.html` always has the offline static CSP. A local interactive server may replace exactly that canonical CSP boundary with the interactive CSP; static-fragment previews have a separate no-script/no-connect CSP. Strict validation rejects active HTML, direct SVG, unsafe references, unlisted files, missing files, and hash drift. Manifests declare that absolute paths, cookies, raw environment, raw DOM, raw headers, and traces are excluded.

Discovery and comparison manifests are bound to the collected diff/capture hashes; substituted or unlisted artifacts fail finalization. Finalization reconstructs the complete report from validated run artifacts and annotations, records the exact source-byte snapshot hash in the manifest, publishes only an immutable snapshot, and rejects source or evidence drift during staging or reuse. Utsuri requires regular non-symlink run inputs, canonical contained paths, safe archive inventories, a publication path protected from other local principals, strict staging validation, and the bundled OS no-replace helper. Missing or unsupported helpers fail closed; failed generation can leave a private staging directory for manual diagnosis and never deletes it automatically. Mutable human-review data is stored separately in `run/review/`. The static viewer does not contact external services.

Code diff content is parsed into structured lines and rendered only as text. Repository-controlled diff text is never injected as HTML.

Build output is one Node 22-compatible ESM file with no external JavaScript runtime import. It embeds the pinned Playwright package metadata and browser registry required for capture, and an unrelated-project smoke test proves that capture does not read `node_modules` or checkout-relative runtime files. Release verification rebuilds the bundle independently and checks every actual third-party bundle input against an explicitly regenerated, reviewed dependency baseline. Build-manifest 1.1 records those byte hashes; SPDX 2.3 records lockfile SHA-512 checksums and installed-package verification codes. Matching metadata is copied into the CLI and Skill artifacts.

<a id="documentation"></a><!-- section:documentation -->

## Documentation

- [Canonical detailed design](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Phase 4 threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md)
- [UI guidelines and HIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Capture modes and runtime boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)
- [CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)
- [v1 implementation plan](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

The design is canonical in English. User-facing README changes update English, Japanese, and Simplified Chinese in the same change.

<a id="license-status"></a><!-- section:license-status -->

## License and publication status

The publisher is `hokupod`, the npm maintainer is `hokupod-npm`, publication uses GitHub Actions trusted publishing, and the SPDX license is `AGPL-3.0-or-later`. Packages remain unpublished until all release gates pass and a separate release is explicitly authorized. The v1 implementation plan does not publish, tag, push, or promote artifacts.
