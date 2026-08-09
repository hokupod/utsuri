<!-- doc-language: zh-CN; canonical: README.md -->

[English](README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

# Utsuri

> 看见变化，理解原因。

<a id="product-summary"></a><!-- section:product-summary -->

## 产品概述

Utsuri 将代码变更转换为有证据、便于人类理解的可视化评审。它在一个本地报告中关联 Git hunk、变更意图、真实浏览器渲染、结构化证据、覆盖范围和人工评审状态。

名称同时表达 UI 在变更后的“呈现”，以及从 before 到 after 的“转变”。

<a id="status"></a><!-- section:status -->

## 状态

<!-- availability:phase-0-documentation -->

Utsuri v1 正在实现。npm package 和 Plugin 尚未发布，以下命令仅适用于此 source checkout。

<a id="capabilities"></a><!-- section:capabilities -->

## 功能

v1 的目标包括：

- 对所有 Git hunk 进行语义分组；
- 隔离的 before / after 浏览器捕获；
- visual、DOM、ARIA、style、accessibility、runtime 和 coverage 证据；
- 自包含并符合 WCAG 2.2 AA 的 report；
- review state、锚定 comment 和 Origin Session feedback；以及
- Codex Plugin、Claude Code Plugin、standalone Skill、local CLI 和 CI。

每项功能仅在对应 Phase gate 通过后可用。捕获失败或未覆盖绝不会显示为“无差异”。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提条件：Nix、Node 24，以及由操作者管理的 Safe-chain 1.5.14。请将其可执行文件的绝对路径设置到 `UTSURI_SAFE_CHAIN_BIN`。

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

setup script、Skill 或 CLI 都不会自动安装依赖或下载浏览器。

<a id="development"></a><!-- section:development -->

## 开发

所有 package manager 操作必须通过指定的 exact Safe-chain executable。

<!-- sync-command:check -->

```bash
"$UTSURI_SAFE_CHAIN_BIN" bun run check
```

bundle 后的 CLI protocol 使用 native execution 验证，避免 wrapper notice 污染 JSON / NDJSON。

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## 安全与隐私

Utsuri 将 repository content、diff、HTML、SVG、comment、Context Pack 和 captured text 视为不可信证据。

**安全警告：**不要向 capture 提供 production credential、production browser state、不受限制的 external network、推测的 setup command 或父进程环境变量。before 与 after 使用独立 Browser Context；默认阻止 external request 和 Service Worker。

生成的 `report/` 是 immutable。可变的人工 review data 单独存储在 `run/review/`。static viewer 不连接外部服务。

<a id="documentation"></a><!-- section:documentation -->

## 文档

- [英文详细设计正本](docs/design.md)
- [v1 实现计划](docs/plans/v1-implementation.md)

详细设计以英文为正本。面向用户的 README 变更必须在同一个 change 中同步英文、日文和简体中文。

<a id="license-status"></a><!-- section:license-status -->

## License 与发布状态

publisher identity 和 SPDX license 尚未决定。在两者确认并且所有 release gate 通过前，所有 package 保持 private 且未发布。v1 实现计划不会执行 publish、tag、push 或 promotion。
