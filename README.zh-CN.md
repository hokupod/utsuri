<!-- doc-language: zh-CN; canonical: README.md -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> 看见变化，理解原因。

<a id="product-outcome"></a><!-- section:product-outcome -->

## 将变更作为证据审查，而不是只看绿色徽章

Utsuri 将 Git 变更转换为本地审查，把代码、浏览器截图、结构差异、无障碍发现、覆盖范围和人工评论连接起来。缺失的证据会保持可见，因此审查者能区分“没有发现问题”和“尚未检查”。

当代码或 UI 变更需要可持久审查报告、清晰的验证缺口，或需要把结构化问题返回到创建报告的编码会话时，请使用 Utsuri。

<p align="center">
  <img src="https://raw.githubusercontent.com/hokupod/utsuri/main/docs/assets/utsuri.jpg" alt="两个角色隔着折叠镜面相对而立" width="480">
</p>

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## 可用性与要求

<!-- availability:git-marketplace-source-ready-cli-publication-pending -->
<!-- support-contract:macos-linux-windows-unsupported -->

源码包含一个 Git Plugin，并精确固定到对应的已发布 `@utsu-ri/cli` release。在该 CLI release 发布且 Plugin 源码合并之前，无法从公开 Git 安装。以下是经过验证的 host 命令形式；请勿替换为 `latest`、版本范围或其他包。

- [runtime compatibility record](https://github.com/hokupod/utsuri/blob/main/docs/compatibility/plugin-runtime.json) 中列出的 Codex 或 Claude Code release。
- macOS 或 Linux、Node.js 22 或更高版本，以及首次启动 MCP 所需的 `npx`。
- 浏览器捕获需要已有的兼容 Chrome / Chromium。Utsuri 不会下载浏览器。
- 隔离的 container capture mode 可选择 Docker 或 Podman。Utsuri 不会 pull image。
- Marketplace 安装时需要访问 GitHub，MCP 首次启动时需要访问 npm。

由于未分发 Windows native helper，因此不支持原生 Windows。除非你单独授权发布或上传，否则报告、捕获结果和 review state 都保留在项目内。

<a id="install"></a><!-- section:install -->

## 从 Git Marketplace 安装

### Codex

<!-- sync-command:codex-marketplace-add -->

```bash
codex plugin marketplace add hokupod/utsuri
```

<!-- sync-command:codex-plugin-install -->

```bash
codex plugin add utsuri@utsuri
```

安装时会启用 Plugin。在 Codex app 中，也可以通过 Plugin UI 查看或更改启用状态。Codex 将 Utsuri 产品插图同时用作 composer icon 和 Plugin logo。

### Claude Code

<!-- sync-command:claude-marketplace-add -->

```bash
claude plugin marketplace add hokupod/utsuri
```

<!-- sync-command:claude-plugin-install -->

```bash
claude plugin install utsuri@utsuri
```

Claude Code 当前的 Plugin manifest 没有 icon 或 logo 字段，因此 Utsuri 不会添加不受支持的图片 metadata。

如果 host 在安装或更新后要求重启，请重新启动。Plugin 通过原生 `npx` 启动精确版本的 CLI；无需也不会使用全局 Utsuri 安装。

<a id="first-review"></a><!-- section:first-review -->

## 运行第一次审查

在 Codex 或 Claude Code 中打开 repository，启动启用了 Utsuri 的新会话，然后使用以下提示：

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create and validate an evidence-backed report, explain each change in my language, start the local report viewer, verify that the diff loads, and return its live URL with every incomplete or uncovered check.
```

Utsuri 首先检查可用 capability，不会安装任何内容。未请求浏览器证据或浏览器不可用时，它可以生成 code-only report。如需浏览器证据，请自行启动所需的 before / after application，并且只批准你信任的明确命令。

在人机对话中，Agent 会使用选定语言撰写有证据支持的解释，严格验证报告，以持久进程启动适当的 loopback viewer，并确认报告和 diff 能够加载。最终回复会提供 live URL、已确认覆盖范围、发现、失败和缺口。仅返回文件路径不算完成交付；只有明确要求 artifact-only 或 CI workflow 时才会跳过 serve。

<a id="how-it-works"></a><!-- section:how-it-works -->

## 工作方式

1. **Collect** — 将指定的 patch、worktree、range 或 merge base 读取到有边界的 run 中。
2. **Interpret** — 当前 Agent 使用会话、diff 和已索引证据解释每项变更，不臆造缺少依据的意图。
3. **Capture** — 仅在已配置并授权时，分别记录隔离的 before / after 浏览器证据。
4. **Discover and compare** — 将变更代码映射到 target，然后比较 pixel、DOM、ARIA、style、accessibility、runtime、network 和 overflow 证据。
5. **Finalize** — 发布包含 Agent-authored annotations、immutable 且经过 hash 验证的本地 `report/`，并保留失败或部分证据。
6. **Serve and verify** — 保持适当的 loopback viewer 运行，确认 report ID、第一项变更、code diff 和 Agent 解释可以加载，然后返回 live URL。
7. **Review and return feedback** — 在 `report/` 外保存 viewed state、人工判断和 comment。Agent 问题只能返回到已注册的原项目和 Origin Session。

[详细设计](https://github.com/hokupod/utsuri/blob/main/docs/design.md)定义 data model 和 security boundary；[CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)记录机器接口行为。

<a id="understand-report"></a><!-- section:understand-report -->

## 理解报告

- **Finding** 是基于证据的观察，并不能自动证明 regression。
- **`INCOMPLETE`** 表示所需证据失败、格式错误、超过限制或不可用。它绝不会被改写为 pass。
- **`UNCOVERED`** 表示变更代码没有已验证 target，或覆盖范围的分母未知。
- **没有 finding** 仅表示已完成的检查未发现问题，并不是全局 `PASS` 徽章。
- **人工判断** 是独立 state。Agent 回答不会代表审查者将项目设为 accepted、rejected 或 resolved。

报告保留 source identity、evidence hash 和 review gap，让其他审查者能够核查哪些内容已检查、哪些尚未检查。

<a id="security-privacy"></a><!-- section:security-privacy -->

## 安全与隐私

**不要向 capture 提供生产 credential、生产 browser state、无限制 network、推测的 setup command、host socket 或未经审查的 project command。** Repository content、page、diff、SVG、comment 和 captured text 都是不可信输入。

- `dual-url` 不启动 project command。`worktree` 需要明确 argv 和你的 opt-in。`static-fragment` 禁用 script 与 network。`container` 只接受本地已有的 digest-pinned image。
- 生成的 `report/` 是 immutable。可变的 review / feedback record 保存在 run 的 `review/` directory。
- Marketplace MCP 不暴露任意 path、working directory、command、provider、model、destination 或 raw session input。
- MCP tool 只能处理为 canonical 当前 project 和同一 Origin Session 注册的 schema-valid report。跨 project、跨 host、跨 session、stale 或 swapped registration 都会 fail closed。
- Raw host session value 只用于 equality check 和 opaque hash，不会被 persist、log、diagnose 或通过 tool 返回。
- Marketplace broker 只接受 `CODEX_THREAD_ID`，或 `CLAUDE_CODE_SESSION_ID` + `CLAUDE_PROJECT_DIR` host contract。Fixed-run 的 `finalize`、`feedback` 与 `review-mcp` 继续兼容 `UTSURI_CODEX_SESSION_ID` 和 `CLAUDE_SESSION_ID`，但 legacy/new 值冲突时会拒绝。即使从 child directory 启动，Claude Plugin finalize 也始终绑定 canonical host project root。

Claude Code 可能向 MCP subprocess 传递其他 ambient variable。Utsuri 不会把它们用作 identity，也不会暴露它们。若你的 Claude Code installation 支持，`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` 可作为可选 host hardening；Plugin 无法强制 host 范围的 environment scrubbing。

处理不可信项目之前，请阅读 [threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md)、[capture boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)和 [feedback boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/feedback.md)。

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## 故障排除与生命周期

- **首次启动无法访问 npm：**允许访问 npm registry 后重试。首次使用时会获取精确 package；不会 fallback 到 ambient executable 或 floating version。
- **缺少 browser capability：**自行安装或明确配置兼容浏览器，或者继续 code-only report。Utsuri command 不会下载浏览器。
- **`MCP_RUN_UNAVAILABLE`：**在同一 host session 和 project 中 finalize 一个 bound report 后重试。Unbound 或其他 session 的 report 会被刻意隐藏。
- **`MCP_RUN_AMBIGUOUS`：**同一 session 注册了多个 report。请让 Agent 使用错误中列出的目标 opaque `report_id`；Utsuri 不会静默选择最新 run。
- **Run path 被拒绝：**请使用 project 内的相对 POSIX path。支持空格和 Unicode 名称；absolute path、`.` / `..` component、重复 separator、backslash、NUL、symlink 以及 project 外路径都会被拒绝。
- **Origin Session mismatch：**返回到创建 report 的 session。Utsuri 不会把 feedback 重定向到其他 Agent 或 session。
- **Windows：**请使用受支持的 macOS 或 Linux 环境。能在 Marketplace 中看到 Plugin 并不表示原生 Windows 受支持。

新 Plugin version 发布后，在 Codex 中刷新并重新安装：

```bash
codex plugin marketplace upgrade utsuri
codex plugin remove utsuri@utsuri
codex plugin add utsuri@utsuri
```

在 Claude Code 中：

```bash
claude plugin marketplace update utsuri
claude plugin update utsuri@utsuri
```

禁用或卸载：

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

- [贡献与开发环境](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
- [详细设计](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Release 与 distribution 操作](https://github.com/hokupod/utsuri/blob/main/docs/release.md)
- [UI guidelines](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Skill contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/SKILL.md)

Utsuri 采用 `AGPL-3.0-or-later` 许可证。Publisher 为 `hokupod`。CLI publication、Git Plugin promotion、Git push、tag 和 release 都是需要 operator 单独授权的操作；源码变更本身不会执行这些操作。
