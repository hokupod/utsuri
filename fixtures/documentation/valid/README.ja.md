<!-- doc-language: ja; canonical: README.md -->

[English](README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

# Utsuri fixture

<a id="product-outcome"></a><!-- section:product-outcome -->

## レビュー結果

未完了の確認を隠さず、証拠に基づくローカルレポートを作成します。

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## 提供状況と要件

<!-- availability:git-marketplace-public -->
<!-- support-contract:macos-linux-windows-unsupported -->

Codex と Claude Code は macOS と Linux に対応し、native Windows は非対応です。

<a id="install"></a><!-- section:install -->

## インストール

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

## 最初のレビュー

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create a local evidence-backed report and call out every incomplete or uncovered check.
```

<a id="how-it-works"></a><!-- section:how-it-works -->

## 仕組み

境界付きのローカル証拠を collect、compare、finalize、review します。

<a id="understand-report"></a><!-- section:understand-report -->

## レポートを理解する

`INCOMPLETE` と `UNCOVERED` を全体の pass として扱いません。

<a id="security-privacy"></a><!-- section:security-privacy -->

## セキュリティとプライバシー

本番 credential を capture に含めず、feedback を Origin Session 内に保ちます。

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## トラブルシューティングとライフサイクル

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

## ドキュメント、コントリビューション、ライセンス

[コントリビューション](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
