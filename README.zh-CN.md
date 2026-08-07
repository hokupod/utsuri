<!-- doc-language: zh-CN; canonical: README.md -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> 看见变化，理解原因。

<a id="product-summary"></a><!-- section:product-summary -->

## 产品概述

Utsuri 将代码变更转换为有证据、便于人类理解的可视化评审。它在一个本地报告中关联 Git hunk、变更意图、真实浏览器渲染、结构化证据、覆盖范围和人工评审状态。

名称同时表达 UI 在变更后的“呈现”，以及从 before 到 after 的“转变”。

<a id="status"></a><!-- section:status -->

## 状态

<!-- availability:phase-3-comparison-coverage -->

Phase 3 的 comparison / coverage flow 已可在此 source checkout 中使用。它把 code review 和隔离的 browser capture 与 target discovery、visual / structural / runtime comparison、明确的 coverage gap 和 measured-evidence UI 结合起来。持久化 review state、Agent feedback 与 container execution 尚未实现。npm package 与 Plugin 也尚未发布。

<a id="capabilities"></a><!-- section:capabilities -->

## 功能

当前可用功能：

- 明确的 patch、worktree、range 和 merge-base 收集 mode；
- 保留 rename、delete、binary、submodule、mode 与 low-signal metadata 的稳定 structured hunk；
- 将每个 hunk 保留在 candidate 或 `unclassified` 中的确定性初始 change candidate；
- 经过 schema 验证的 annotation 与 evidence reference；以及
- 包含 summary、三状态 queue、Focus mode、evidence drawer、unified/side-by-side diff、deep link 和 keyboard focus 恢复的自包含 code review；
- viewport、DPR、locale、timezone、color scheme 与 reduced motion 一致且 before / after 相互独立的 Browser Context；
- full-page 与 element screenshot，以及 normalized DOM、ARIA、computed style、axe、console、network、metadata 和类型化 failure evidence；以及
- 确定性 stabilization、allowlist action DSL、external / mutation request 阻止、经过 digest 校验的复用，以及部分 `INCOMPLETE` report；
- 按 explicit / Storybook / Playwright / route / import / selector / fallback 排序，并分别记录 known、verified、unknown、planned、succeeded 与 failed 的 target discovery；
- Pixelmatch count / ratio、content-addressed diff image、changed region 与 normalized DOM / ARIA / style fingerprint；
- accessibility / runtime finding 的 `new` / `resolved` / `unchanged` / `incomplete` 分类，以及 overflow / obstruction evidence；以及
- side-by-side、wipe、可停止 blink、pixel diff、after-only、crop / full-page 选择、sync scroll / zoom、region navigation 与 code / finding cross-link。

后续 v1 Phase 将加入 container hardening、持久化 review state 与 Origin Session feedback。即使 capture 完整，在 discovery 和 comparison 前仍为 `UNCOVERED`。证据缺失、格式错误或任一侧失败时仍为 `INCOMPLETE`；分母未知时不显示 percentage。pixel 差异本身不能判定 `REGRESSION`。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提条件：Nix、安装在标准用户位置的 Safe-chain 1.5.14，以及用于 capture 的现有 system Chrome 或 Chromium。Node 24 与 Bun 由 Nix shell 提供；无需配置 Safe-chain 绝对路径。

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

setup script、Skill 或 CLI 都不会自动安装依赖或下载浏览器。

通过只读 project 检查创建不会覆盖现有文件的 capture 配置提案。capture 前请检查并编辑；`proposedCommands` 永远不会执行。

<!-- sync-command:init-capture-config -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs init --output utsuri.yml --json
```

创建新的 example run。output directory 不得预先存在。

<!-- sync-command:collect-patch -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs collect --patch fixtures/code-only-review/changes.patch --output .artifacts/utsuri/readme-example --json
```

在默认 `dual-url` mode 中，请先自行启动配置的 before / after URL，再执行 capture。trusted `worktree` 配置还需要 `--allow-project-code`。`static-fragment` 不启动 project command，并把禁用 JavaScript 的结果标记为 synthetic。

<!-- sync-command:capture-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs capture --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

即使 capture 返回 exit code 4，成功的一侧和类型化 failure evidence 仍会保留。请 finalize 该 partial run，不要把它当作 no visual difference。

把变更代码映射到已 capture 的 target，并保留 unmapped change 与未知分母。

<!-- sync-command:discover-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs discover --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

比较 pixel、structure、accessibility、runtime error、network evidence 与 overflow。exit code 4 表示 comparison 不完整，但证据会保留。

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

## 开发

所有 package manager 操作都通过 repository wrapper；该 wrapper 从标准用户位置发现 Safe-chain 1.5.14。首次执行前，wrapper 会验证 `toolchain-policy.json` 中按 platform 固定的 SHA-256，随后验证 exact version。CI 也会下载对应的官方 release asset，并在执行前验证相同的 digest。

<!-- sync-command:check -->

```bash
node scripts/safe-chain.mjs bun run check
```

bundle 后的 CLI protocol 使用 native execution 验证，避免 wrapper notice 污染 JSON / NDJSON。

check 和 build gate 会为当前 macOS 或 Linux target 编译可审计的 atomic publication helper。distribution candidate 会在发布前组装并验证全部四种受支持的 OS / architecture helper。

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## 安全与隐私

Utsuri 将 repository content、diff、HTML、SVG、comment、Context Pack 和 captured text 视为不可信证据。

**安全警告：**不要向 capture 提供 production credential、production browser state、不受限制的 external network、推测的 setup command 或父进程环境变量。before 与 after 使用独立 Browser Context；默认阻止 external request 和 Service Worker。external HTTP redirect 与 WebSocket handshake 也受同一 origin policy 约束，持久化文本证据会移除 absolute / relative URL 中的 credential、query 和 fragment。

`dual-url` 永远不会启动 project code。`worktree` 要求 trusted input、before / after 各自的明确 argv 和不同 working directory，以及用户提供 `--allow-project-code` opt-in。child environment 只包含最小 baseline 与 allowlist 中的非 secret 名称。`static-fragment` 会禁用 JavaScript 和 HTTP request、清理 active markup，但不等同于真实 application rendering。阻止 browser request 并不能隔离 project server process；untrusted server execution 必须等待 Phase 4 container mode。

生成的 `report/` 是 immutable。引用的 capture / comparison evidence 会独立进行 digest 校验，复制到 report 中，并纳入 asset manifest 的 hash。discovery / comparison manifest 与收集到的 diff / capture hash 绑定；被替换或未列出的 artifact 会在 finalize 时被拒绝。finalize 会从已验证的 run artifact 与 annotations 重建完整 report，在 manifest 中记录精确的 source byte snapshot hash，只发布 immutable snapshot，并拒绝 staging 或 reuse 期间发生的 source / evidence 漂移。Utsuri 要求 run input 是普通文件且不是 symlink，publication path 不可被其他本地 principal 改名，staging 必须通过 strict validation，并使用 OS 的 no-replace helper。helper 缺失或 filesystem 不支持时会 fail closed。生成失败可能保留用于诊断的 private staging directory，Utsuri 不会自动删除它。可变的人工 review data 单独存储在 `run/review/`。static viewer 不连接外部服务。

code diff content 会解析为 structured line，并且只以 text 方式渲染。由 repository 控制的 diff text 永远不会作为 HTML 注入。

<a id="documentation"></a><!-- section:documentation -->

## 文档

- [英文详细设计正本](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [UI guideline 与 HIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Capture mode 与 runtime boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)
- [CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)
- [v1 实现计划](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

详细设计以英文为正本。面向用户的 README 变更必须在同一个 change 中同步英文、日文和简体中文。

<a id="license-status"></a><!-- section:license-status -->

## License 与发布状态

publisher 为 `hokupod`，npm maintainer 为 `hokupod-npm`，发布使用 GitHub Actions trusted publishing，SPDX license 为 `AGPL-3.0-or-later`。在所有 release gate 通过并取得单独明确授权前，package 保持未发布。v1 实现计划不会执行 publish、tag、push 或 promotion。
