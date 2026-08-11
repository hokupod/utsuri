<!-- doc-language: en; canonical: true -->

[English](README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

# Utsuri fixture

<a id="product-outcome"></a><!-- section:product-outcome -->

## Review outcome

Create a local evidence-backed report without hiding incomplete checks.

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## Availability and requirements

<!-- availability:git-marketplace-public -->
<!-- support-contract:macos-linux-windows-unsupported -->

Codex and Claude Code are supported on macOS and Linux. Native Windows is unsupported.

<a id="install"></a><!-- section:install -->

## Install

<!-- sync-command:codex-marketplace-add -->

```bash
codex plugin marketplace add hokupod/utsuri
```

<!-- sync-command:codex-plugin-install -->

```bash
codex plugin add utsuri@utsuri
```

<!-- sync-command:claude-marketplace-add -->

```bash
claude plugin marketplace add hokupod/utsuri
```

<!-- sync-command:claude-plugin-install -->

```bash
claude plugin install utsuri@utsuri
```

<a id="first-review"></a><!-- section:first-review -->

## First review

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create a local evidence-backed report and call out every incomplete or uncovered check.
```

<a id="how-it-works"></a><!-- section:how-it-works -->

## How it works

Collect, compare, finalize, and review bounded local evidence.

<a id="understand-report"></a><!-- section:understand-report -->

## Understand the report

`INCOMPLETE` and `UNCOVERED` are never global pass states.

<a id="security-privacy"></a><!-- section:security-privacy -->

## Security and privacy

Keep production credentials out of captures and keep feedback in the Origin Session.

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## Troubleshooting and lifecycle

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

[Contributing](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
