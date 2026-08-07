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

<!-- availability:phase-6-origin-session-feedback -->

完整的 v1 source 实现现已作为 stable-release candidate 可用。Phase 6 在 Phase 5 distribution candidate 上增加受 capability 保护的 interactive review、Feedback Batch preview 与存储、bounded Context Pack、Origin Session binding、Review Inbox CLI / MCP access、itemized answer writeback，以及安全的 return-to-session fallback。两个受支持 host 都未公开满足全部 authenticated binding 与 response correlation 要求的 API，因此未启用 direct same-session bridge。npm package 与 Plugin 仍未发布。

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
- 相互独立的 static / interactive / iframe CSP、bounded JSON、empty-sandbox 的已清理 preview、仅限 PNG 的 visual evidence、扩展 privacy 声明，以及严格的 SHA-256 report 验证；
- 强制使用 SHA-256 digest 固定的本地 image、network none、read-only root / project mount、capability drop、non-root user 与 PID / CPU / memory / time / artifact 上限的 Docker / Podman isolation；以及
- 包含 source / schema / UI hash 与确定性 SPDX 2.3 / dependency license inventory 的单一 Node 22 ESM CLI bundle；
- 独立持久化的 viewed progress、human judgment 和 anchored comment，以及 canonical export/import 与明确的 matched / stale / orphaned re-anchor；
- 仅限 loopback 的 static serve，以及带有 policy exit code `10` 的确定性 `report.zip`、`report.json` 和 `ci-summary.json`；以及
- exact CLI/native package contract、四种 architecture helper candidate、aggregate Plugin 验证、Node 22/24 isolated-tarball smoke 和共享 Skill eval；
- 每次启动独立的 capability token，以及 mutation 的 exact Origin、read-only GET 的 same-origin Fetch Metadata、Referer 存在时的 exact 检查、report binding 和 request schema 检查；
- 显式 Agent-attention 选择、Feedback Batch preview、经过 redaction 的 bounded Context Pack、immutable generation Review Inbox sidecar 与未读 answer state；以及
- 要求 originating host / session / project / report binding，并为每个 item 写回一个 answer 的 fixed-run `feedback` CLI / Review Inbox MCP operation。

选择“Ask the current Agent”只记录意图，不会发送、创建 Context Pack 或启动 process。static / unbound report 仅执行 export。interactive report 可以为 originating conversation 存储 batch，但 Utsuri 绝不会创建其他 Agent 或 session。即使 capture 完整，在 discovery 和 comparison 前仍为 `UNCOVERED`。证据缺失、格式错误、任一侧失败、resource limit 超限或 container capability 不足时仍为 `INCOMPLETE`；分母未知时不显示 percentage。pixel 差异本身不能判定 `REGRESSION`。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提条件：Nix、安装在标准用户位置的 Safe-chain 1.5.14，以及显式配置的兼容 Chrome / Chromium 或现有 Playwright 管理 browser。Node 24 与 Bun 由 Nix shell 提供；无需配置 Safe-chain 绝对路径。Utsuri 绝不会自动下载 browser。

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

在不修改 immutable report 的前提下 export mutable review state。导入其他 run 前先检查 source identity；`--reanchor` 会让变更或缺失的 anchor 明确保持 stale / orphaned。

```bash
node skills/utsuri-review/scripts/utsuri.mjs review export --run .artifacts/utsuri/readme-example --output .artifacts/utsuri/review-bundle.json --json
node skills/utsuri-review/scripts/utsuri.mjs review import --run .artifacts/utsuri/updated-run --input .artifacts/utsuri/review-bundle.json --reanchor --json
```

对于已绑定 Origin Session 的 run，启动受 capability 保护的 viewer，在 preview 所选项目后，将保存的 batch 返回同一 conversation。只有在 eligible batch 唯一时才能省略 `--batch`。

```bash
node skills/utsuri-review/scripts/utsuri.mjs serve .artifacts/utsuri/readme-example/report --interactive
node skills/utsuri-review/scripts/utsuri.mjs feedback list --run .artifacts/utsuri/readme-example --status ready --json
node skills/utsuri-review/scripts/utsuri.mjs feedback get --run .artifacts/utsuri/readme-example --batch fb_example --json
node skills/utsuri-review/scripts/utsuri.mjs feedback answer --run .artifacts/utsuri/readme-example --batch fb_example --input answers.json --json
```

当前实现有意采用 `return-to-session`。缺少 session binding 时使用 `export-only`；绝不会臆造 direct bridge 或 fallback 到其他 conversation。

创建本地 CI artifact，但不上传：

```bash
node skills/utsuri-review/scripts/utsuri.mjs pack .artifacts/utsuri/readme-example/report --config utsuri.yml --output .artifacts/utsuri/ci-output --json
```

<a id="development"></a><!-- section:development -->

## 开发

所有 package manager 操作都通过 repository wrapper；该 wrapper 从标准用户位置发现 Safe-chain 1.5.14。首次执行前，wrapper 会验证 `toolchain-policy.json` 中按 platform 固定的 SHA-256，随后验证 exact version。CI 也会下载对应的官方 release asset，并在执行前验证相同的 digest。

<!-- sync-command:check -->

```bash
node scripts/safe-chain.mjs bun run check
```

bundle 后的 CLI protocol 使用 native execution 验证，避免 wrapper notice 污染 JSON / NDJSON。

check 和 build gate 会为当前 macOS 或 Linux target 编译可审计的 atomic publication helper。手动 dispatch 的 candidate workflow 会在对应 runner 上 build 四种 OS / architecture helper，组装 aggregate Plugin 与 exact npm tarball，并在 Node 22 / 24 下验证 isolated install。candidate mode 不会写入 registry。

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## 安全与隐私

Utsuri 将 repository content、diff、HTML、SVG、comment、Context Pack 和 captured text 视为不可信证据。

**安全警告：**不要向 capture 提供 production credential、production browser state、不受限制的 external network、推测的 setup command 或父进程环境变量。before 与 after 使用独立 Browser Context；默认阻止 external request 和 Service Worker。external HTTP redirect 与 WebSocket handshake 也受同一 origin policy 约束，持久化文本证据会移除 absolute / relative URL 中的 credential、query 和 fragment。

`dual-url` 永远不会启动 project code。`worktree` 要求 trusted input、before / after 各自的明确 argv 和不同 working directory，以及用户提供 `--allow-project-code` opt-in。child environment 只包含最小 baseline 与 allowlist 中的非 secret 名称。`static-fragment` 会禁用 JavaScript 和 HTTP request、清理 active markup，并在 empty-sandbox iframe 中显示，但不等同于真实 application rendering。

`container` 只接受以 SHA-256 digest 固定且已存在于本地的 Docker / Podman image，并且不会 pull。image 必须提供用于 bounded request bridge 的 Node 22。server 以 network none、read-only root / project mount、no-new-privileges、丢弃全部 Linux capability、non-root user，以及 PID / CPU / memory / tmpfs / time / artifact 上限启动。每个 request 与删除操作都绑定 full container ID，并使用临时 authenticated loopback proxy。connection refusal 只会在有界 readiness 阶段重试；identity、response 或 origin 失败会撤销 proxy。只有在可响应的 engine 证明 immutable ID 不存在后 cleanup 才成功。在 untrusted content 到达 Chromium 前，Linux 必须提供 writable delegated cgroup v2，通过 `memory.max` 约束完整 browser process tree。macOS 或没有该 delegation 的 Linux 会在启动 project code 前报告 capability 缺失并保持 `INCOMPLETE`。禁止 host environment allowlist、secret mount 与 host socket。

每次 browser launch 都使用随机 process token，并必须精确匹配一个 Chrome / Chromium 父进程。launch 失败或 run 完成后会执行有界的终止流程与全局 token 重新扫描；无法 tracking、ownership 不明确或仍有残留进程时会 fail closed。即使前一项失败，也会执行 browser、cgroup 与 server / container 的全部 cleanup step。每个 capture side 都会将 `maxTimeMs` 作为 browser work 与 contained-file read 的 hard deadline。

生成的 `report/` 是 immutable。引用的 capture / comparison evidence 会独立进行 digest 校验；图片仅限通过验证的 PNG byte，复制到 report 后纳入 asset manifest 的 hash。保存的 `index.html` 始终使用 offline static CSP；只有 local interactive server 可以通过 exact match 把该 canonical CSP 边界替换为 interactive CSP。static-fragment preview 使用独立的 no-script / no-connect CSP。strict validation 会拒绝 active HTML、direct SVG、不安全 reference、未列出或缺失的 file 与 hash drift。manifest 声明已排除 absolute path、cookie、raw environment、raw DOM、raw header 与 trace。

viewed progress、human judgment、comment、Agent attention、batch state 和 answer 是彼此独立的 mutable record。static mode 使用 Web Locks 与 optimistic revision，按 report 存入 browser storage，并 export 为通过 schema 验证且绑定 catalog 的 review / feedback document；stale tab 不会覆盖更新的 state。CLI state 在 `run/review/` 下使用 immutable generation 与 atomic hard-linked revision record，并把 bounded inbox / batch / context / answer sidecar 写入同一 generation。import 不会重写 `report/`；对其他 report 的 re-anchor 必须显式选择；probable anchor 不会自动启用，变更或缺失的 anchor 会明确保持 stale / orphaned。

interactive mode 只绑定 loopback。每个 API request 都要求 exact Host、same-origin Fetch Metadata、report ID 与每次启动独立的 capability token。mutation 还必须提供 exact Origin 与 exact request schema。read-only GET 可在 same-origin Fetch Metadata 下省略 Origin；如果 browser 发送 Referer，则其 origin 必须 exact match。token 只通过 URL fragment 传递，捕获后即从 address bar 移除，并且不会写入 report / review state / event。browser API 不接受任意 destination、path、cwd、command、provider 或 model。消费 feedback 时还会检查 opaque Origin Session ref 与 canonical project fingerprint；mismatch 会 fail closed。server / CLI / MCP service 绝不会启动 Codex、Claude Code 或其他 Agent，Agent answer 也不会更改 human judgment 或 thread resolution。

discovery / comparison manifest 与收集到的 diff / capture hash 绑定；被替换或未列出的 artifact 会在 finalize 时被拒绝。finalize 会从已验证的 run artifact 与 annotations 重建完整 report，在 manifest 中记录精确的 source byte snapshot hash，只发布 immutable snapshot，并拒绝 staging 或 reuse 期间发生的 source / evidence 漂移。Utsuri 要求 run input 是普通文件且不是 symlink，并要求 canonical contained path、安全 archive inventory、不可被其他本地 principal 改名的 publication path、staging strict validation 与 OS no-replace helper。helper 缺失或 filesystem 不支持时会 fail closed。生成失败可能保留用于诊断的 private staging directory，Utsuri 不会自动删除它。可变的人工 review data 单独存储在 `run/review/`。static viewer 不连接外部服务。

code diff content 会解析为 structured line，并且只以 text 方式渲染。由 repository 控制的 diff text 永远不会作为 HTML 注入。

build output 是不含 external JavaScript runtime import 的单一 Node 22 兼容 ESM。它内嵌 capture 所需的 pinned Playwright package metadata 与 browser registry，并通过在无关 project 中执行 smoke test，证明 capture 不会读取 `node_modules` 或 checkout-relative runtime file。release verification 会独立重新 build bundle，并将所有实际 bundled third-party input 与必须明确重新生成并 review 的 dependency baseline 比对。build-manifest 1.1 记录各 byte hash，SPDX 2.3 记录 lockfile SHA-512 checksum 与 installed-package verification code；相同 metadata 会复制到 CLI / Skill artifact。

<a id="documentation"></a><!-- section:documentation -->

## 文档

- [英文详细设计正本](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Phase 4 threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md)
- [Release 与 distribution guide](https://github.com/hokupod/utsuri/blob/main/docs/release.md)
- [UI guideline 与 HIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Capture mode 与 runtime boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)
- [CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)
- [Origin Session feedback workflow](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/feedback.md)
- [v1 实现计划](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

详细设计以英文为正本。面向用户的 README 变更必须在同一个 change 中同步英文、日文和简体中文。

<a id="license-status"></a><!-- section:license-status -->

## License 与发布状态

publisher 为 `hokupod`，npm maintainer 为 `hokupod-npm`，发布使用 GitHub Actions trusted publishing，SPDX license 为 `AGPL-3.0-or-later`。Phase 6 生成完整的 v1 stable-release candidate。job 间传输会先验证 manifest 绑定的普通文件，再恢复声明的 mode；不会解压下载的 helper 或 Plugin tarball。在所有 release gate 通过并取得单独明确授权前，package 保持未发布。v1 实现计划不会执行 publish、tag、push 或 promotion。
