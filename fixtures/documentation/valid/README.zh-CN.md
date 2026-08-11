<!-- doc-language: zh-CN; canonical: README.md -->

[English](README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

# Utsuri fixture

<a id="product-outcome"></a><!-- section:product-outcome -->

## 审查结果

创建基于证据的本地报告，并保持未完成检查可见。

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## 可用性与要求

<!-- availability:git-marketplace-public -->
<!-- support-contract:macos-linux-windows-unsupported -->

Codex 和 Claude Code 支持 macOS 与 Linux；不支持原生 Windows。

<a id="install"></a><!-- section:install -->

## 安装

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

## 第一次审查

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create a local evidence-backed report and call out every incomplete or uncovered check.
```

<a id="how-it-works"></a><!-- section:how-it-works -->

## 工作方式

对范围受限的本地证据执行收集、比较、定稿和审查。

<a id="understand-report"></a><!-- section:understand-report -->

## 理解报告

`INCOMPLETE` 和 `UNCOVERED` 绝不是全局 pass 状态。

<a id="security-privacy"></a><!-- section:security-privacy -->

## 安全与隐私

不要在 capture 中使用生产 credential，并将 feedback 保留在 Origin Session 中。

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## 故障排除与生命周期

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

## 文档、贡献与许可证

[贡献](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
