<!-- doc-language: en; canonical: true -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> See what changed. Understand why.

<a id="product-outcome"></a><!-- section:product-outcome -->

## Review a change as evidence, not a green badge

Utsuri turns a Git change into a local review that connects code, browser captures, structural differences, accessibility findings, coverage, and human comments. It keeps missing evidence visible, so a reviewer can distinguish “nothing found” from “not checked.”

Use it when a code or UI change needs a durable report, a clear list of review gaps, or structured questions returned to the coding session that created the report.

<p align="center">
  <img src="https://raw.githubusercontent.com/hokupod/utsuri/main/docs/assets/utsuri.jpg" alt="Two figures facing each other across a folded mirror" width="480">
</p>

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## Availability and requirements

<!-- availability:git-marketplace-source-ready-cli-publication-pending -->
<!-- support-contract:macos-linux-windows-unsupported -->

The source contains a Git Plugin that exact-pins the matching published `@utsu-ri/cli` release. Public Git installation remains gated until that CLI release is published and the Plugin source is merged. The commands below are verified host command shapes; do not substitute `latest`, a range, or another package.

- A Codex or Claude Code release listed in the [runtime compatibility record](https://github.com/hokupod/utsuri/blob/main/docs/compatibility/plugin-runtime.json).
- macOS or Linux, Node.js 22 or later, and `npx` for first MCP startup.
- An existing compatible Chrome/Chromium installation for browser capture. Utsuri never downloads a browser.
- Optional Docker or Podman capability for the isolated container capture mode. Utsuri never pulls an image.
- Network access to GitHub during Marketplace installation and to npm on the first MCP start.

Native Windows is unsupported because no Windows native helper is distributed. Reports, captures, and review state stay in the project unless you separately authorize publication or upload.

<a id="install"></a><!-- section:install -->

## Install from the Git Marketplace

### Codex

<!-- sync-command:codex-marketplace-add -->

```bash
codex plugin marketplace add hokupod/utsuri
```

<!-- sync-command:codex-plugin-install -->

```bash
codex plugin add utsuri@utsuri
```

Installation enables the Plugin. In the Codex app, the Plugin UI is also the supported place to inspect or change its enabled state. Codex uses the Utsuri product illustration as both the composer icon and Plugin logo.

### Claude Code

<!-- sync-command:claude-marketplace-add -->

```bash
claude plugin marketplace add hokupod/utsuri
```

<!-- sync-command:claude-plugin-install -->

```bash
claude plugin install utsuri@utsuri
```

Claude Code's current Plugin manifest does not expose an icon or logo field, so Utsuri does not add unsupported image metadata there.

Restart the host after an install or update when it asks you to do so. The Plugin starts the exact CLI through native `npx`; a global Utsuri installation is neither required nor used.

<a id="first-review"></a><!-- section:first-review -->

## Run your first review

Open the repository in Codex or Claude Code, start a new session with Utsuri enabled, and use this prompt:

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create and validate an evidence-backed report, explain each change in my language, start the local report viewer, verify that the diff loads, and return its live URL with every incomplete or uncovered check.
```

Utsuri first checks available capabilities without installing anything. It can produce a code-only report when browser evidence was not requested or is unavailable. For browser evidence, start any required before/after application yourself and approve only explicit commands you trust.

In a human conversation, the Agent authors the evidence-backed interpretation in your selected language, strictly validates the report, starts the appropriate persistent loopback viewer, verifies that the report and diff load, and returns the live URL with confirmed coverage, findings, failures, and gaps. A filesystem path alone is not a completed handoff. Serving is skipped only for an explicitly requested artifact-only or CI workflow.

<a id="how-it-works"></a><!-- section:how-it-works -->

## How it works

1. **Collect** — reads the requested patch, worktree, range, or merge base into a bounded run.
2. **Interpret** — the current Agent uses the conversation, diff, and indexed evidence to explain every change without inventing unsupported intent.
3. **Capture** — records separately isolated before/after browser evidence only when configured and authorized.
4. **Discover and compare** — maps changed code to targets, then compares pixels, DOM, ARIA, styles, accessibility, runtime, network, and overflow evidence.
5. **Finalize** — publishes an immutable, hash-validated local `report/` with the Agent-authored annotations; failed or partial evidence is preserved.
6. **Serve and verify** — keeps the appropriate loopback viewer alive, confirms that the report ID, first change, code diff, and Agent interpretation load, then returns the live URL.
7. **Review and return feedback** — stores viewed state, human judgment, and comments outside `report/`. Agent questions can return only to the registered originating project and session.

[The detailed design](https://github.com/hokupod/utsuri/blob/main/docs/design.md) defines the data model and security boundaries. [The CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md) documents machine-facing behavior.

<a id="understand-report"></a><!-- section:understand-report -->

## Understand the report

- **Findings** are evidence-backed observations, not automatic proof of a regression.
- **`INCOMPLETE`** means required evidence failed, was malformed, exceeded a limit, or was unavailable. It is never converted to pass.
- **`UNCOVERED`** means changed code has no verified target or the coverage denominator is unknown.
- **No finding** means only that the completed checks found none; it is not a global `PASS` badge.
- **Human judgment** is independent state. Agent answers never mark an item accepted, rejected, or resolved for the reviewer.

The report preserves source identity, evidence hashes, and review gaps so another reviewer can audit what was and was not checked.

<a id="security-privacy"></a><!-- section:security-privacy -->

## Security and privacy

**Never give a capture production credentials, production browser state, unrestricted network access, inferred setup commands, host sockets, or an unreviewed project command.** Repository content, pages, diffs, SVG, comments, and captured text are untrusted input.

- `dual-url` starts no project command. `worktree` requires explicit argv plus your opt-in. `static-fragment` disables scripts and network. `container` accepts only an already-present digest-pinned image.
- Generated `report/` files are immutable. Mutable review and feedback records live under the run's `review/` directory.
- The Marketplace MCP exposes no arbitrary path, working directory, command, provider, model, destination, or raw session input.
- MCP tools can use only schema-valid reports registered for the canonical current project and the same Origin Session. Cross-project, cross-host, cross-session, stale, or swapped registrations fail closed.
- Raw host session values are used only for equality checking and opaque hashing. They are not persisted, logged, diagnosed, or returned by tools.
- The Marketplace broker accepts only `CODEX_THREAD_ID` or the `CLAUDE_CODE_SESSION_ID` + `CLAUDE_PROJECT_DIR` host contract. Fixed-run `finalize`, `feedback`, and `review-mcp` also retain `UTSURI_CODEX_SESSION_ID` and `CLAUDE_SESSION_ID` compatibility; conflicting legacy/new values are rejected. Claude Plugin finalization always binds to the canonical host project root, including when launched from a child directory.

Claude Code may pass other ambient variables to MCP subprocesses. Utsuri does not use them as identity or expose them. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` is optional host hardening when supported by your Claude Code installation; the Plugin cannot enforce host-wide environment scrubbing.

See the [threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md), [capture boundaries](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md), and [feedback boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/feedback.md) before handling untrusted projects.

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## Troubleshooting and lifecycle

- **First start cannot reach npm:** allow access to the npm registry, then retry. The exact package is fetched on first use; Utsuri does not fall back to an ambient executable or floating version.
- **Browser capability is missing:** install or explicitly configure a compatible browser yourself, or continue with a code-only report. No Utsuri command downloads one.
- **`MCP_RUN_UNAVAILABLE`:** finalize a bound report in this same host session and project, then retry. An unbound or different-session report is intentionally invisible.
- **`MCP_RUN_AMBIGUOUS`:** more than one same-session report is registered. Ask the Agent to use the desired opaque `report_id` listed in the error; Utsuri never silently picks the newest run.
- **Run path rejected:** use a contained project-relative POSIX path. Spaces and Unicode names are supported; absolute paths, `.` or `..` components, duplicate separators, backslashes, NUL, symlinks, and paths outside the project are rejected.
- **Origin Session mismatch:** return to the session that created the report. Utsuri never redirects feedback to another Agent or session.
- **Windows:** use a supported macOS or Linux environment; Marketplace visibility does not imply native Windows support.

Refresh and reinstall on Codex when a new Plugin version is announced:

```bash
codex plugin marketplace upgrade utsuri
codex plugin remove utsuri@utsuri
codex plugin add utsuri@utsuri
```

On Claude Code:

```bash
claude plugin marketplace update utsuri
claude plugin update utsuri@utsuri
```

Disable or uninstall:

<!-- sync-command:codex-plugin-remove -->

```bash
codex plugin remove utsuri@utsuri
```

<!-- sync-command:claude-plugin-disable -->

```bash
claude plugin disable utsuri@utsuri
```

<!-- sync-command:claude-plugin-uninstall -->

```bash
claude plugin uninstall utsuri@utsuri
```

<a id="documentation-contributing-license"></a><!-- section:documentation-contributing-license -->

## Documentation, contributing, and license

- [Contributing and developer setup](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
- [Detailed design](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Release and distribution operations](https://github.com/hokupod/utsuri/blob/main/docs/release.md)
- [UI guidelines](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Skill contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/SKILL.md)

Utsuri is licensed under `AGPL-3.0-or-later`. The publisher is `hokupod`. CLI publication, Git Plugin promotion, Git push, tags, and releases are separate operator-authorized actions; source changes alone perform none of them.
