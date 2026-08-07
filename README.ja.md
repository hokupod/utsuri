<!-- doc-language: ja; canonical: README.md -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> 映りを捉え、移りを読み解く。

<a id="product-summary"></a><!-- section:product-summary -->

## プロダクト概要

Utsuriは、コード変更を、根拠と意図を伴う人間向けの視覚的レビューへ変換します。Git hunk、変更意図、実ブラウザー描画、構造的証拠、カバレッジ、人間のレビュー状態を、1つのローカルレポートで結び付けます。

名称には、変更後のUIがどう「映る」かと、beforeからafterへどう「移る」かという意味を込めています。

<a id="status"></a><!-- section:status -->

## 状態

<!-- availability:phase-3-comparison-coverage -->

Phase 3のcomparison / coverage flowは、このsource checkoutで利用できます。code reviewと分離したbrowser captureに、target discovery、visual / structural / runtime comparison、明示的なcoverage gap、measured-evidence UIを組み合わせます。review stateの永続化、Agent feedback、container実行は未実装です。npm packageとPluginも未公開です。

<a id="capabilities"></a><!-- section:capabilities -->

## 機能

現在利用できる機能:

- patch、worktree、range、merge-baseを明示した収集mode
- rename、delete、binary、submodule、mode、low-signal metadataを保持するstableなstructured hunk
- 全hunkをcandidateまたは`unclassified`へ残す決定論的な初期change candidate
- schema検証済みannotationとevidence参照
- summary、3分類queue、Focus mode、evidence drawer、unified/side-by-side diff、deep link、keyboard focus復元を備えた自己完結code review
- viewport、DPR、locale、timezone、color scheme、reduced motionを揃えたbefore / after別々のBrowser Context
- full-page / element screenshot、normalized DOM、ARIA、computed style、axe、console、network、metadata、型付きfailure evidence
- 決定論的stabilization、allowlist action DSL、external / mutation request block、digest検証付き再利用、部分的な`INCOMPLETE` report
- explicit / Storybook / Playwright / route / import / selector / fallbackの優先順を持ち、既知・検証済み・未知・予定・成功・失敗を分離するtarget discovery
- Pixelmatch count / ratio、content-addressed diff image、changed region、normalized DOM / ARIA / style fingerprint
- accessibility / runtime findingの`new` / `resolved` / `unchanged` / `incomplete`分類とoverflow / obstruction evidence
- side-by-side、wipe、停止可能なblink、pixel diff、after-only、crop / full-page選択、sync scroll / zoom、region navigation、code / finding cross-link

後続Phaseで、container hardening、review stateの永続化、Origin Session feedbackを追加します。captureが完了してもdiscoveryとcomparison前は`UNCOVERED`です。証拠の欠落・不正、または片側失敗は`INCOMPLETE`のままです。分母が不明なら割合を表示せず、pixel差分だけで`REGRESSION`とは判定しません。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提: Nix、標準のuser install先に導入済みのSafe-chain 1.5.14、capture用の既存system ChromeまたはChromium。Node 24とBunはNix shellが提供し、Safe-chainの絶対pathは設定しません。

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

setup script、Skill、CLIが依存packageやbrowserを自動install / downloadすることはありません。

read-onlyなproject調査から、上書きしないcapture設定案を作ります。capture前に内容を確認・編集してください。`proposedCommands`は実行されません。

<!-- sync-command:init-capture-config -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs init --output utsuri.yml --json
```

新しいexample runを作成します。output directoryは事前に存在していてはいけません。

<!-- sync-command:collect-patch -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs collect --patch fixtures/code-only-review/changes.patch --output .artifacts/utsuri/readme-example --json
```

既定の`dual-url` modeでは、設定したbefore / after URLを利用者が起動してからcaptureします。trustedな`worktree`設定では`--allow-project-code`も必要です。`static-fragment`はproject commandを起動せず、JavaScript無効の結果をsyntheticと明示します。

<!-- sync-command:capture-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs capture --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

captureがexit code 4でも、成功した片側と型付きfailure evidenceは残ります。no visual differenceと扱わず、partial runをfinalizeしてください。

変更codeをcapture済みtargetへ対応付け、未mapping changeと不明な分母を保持します。

<!-- sync-command:discover-run -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs discover --run .artifacts/utsuri/readme-example --config utsuri.yml --json
```

pixel、structure、accessibility、runtime error、network evidence、overflowを比較します。exit code 4はcomparisonが未完了であることを示しますが、証拠は保持されます。

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

## 開発

package manager操作は、標準のuser install先からSafe-chain 1.5.14を検出するrepository wrapperを経由します。wrapperは初回実行前に`toolchain-policy.json`でplatform別に固定したSHA-256を検証し、その後にexact versionを検証します。CIも対応する公式release assetを取得し、実行前に同じdigestを検証します。

<!-- sync-command:check -->

```bash
node scripts/safe-chain.mjs bun run check
```

bundle済みCLI protocolはnative実行で検証し、wrapper noticeがJSON / NDJSONを汚染しないようにします。

checkとbuild gateは、現在のmacOSまたはLinux target向けに、監査可能なatomic publication helperをcompileします。distribution candidateでは、公開前に対応する4種類のOS / architecture helperをassemble・検証します。

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## セキュリティとプライバシー

Utsuriはrepository content、diff、HTML、SVG、comment、Context Pack、capture textを信頼できない証拠として扱います。

**セキュリティ警告:** production credential、production browser state、制限のないexternal network、推測したsetup command、親processの環境変数をcaptureへ渡さないでください。beforeとafterは別Browser Contextを使い、external requestとService Workerを既定でblockします。external HTTP redirectとWebSocket handshakeにも同じorigin policyを適用し、永続化するtext証跡ではabsolute / relative URLのcredential、query、fragmentを除去します。

`dual-url`はproject codeを起動しません。`worktree`はtrusted input、before / afterそれぞれの明示argvと別working directory、利用者による`--allow-project-code` opt-inを必須とします。child environmentは最小baselineとallowlist済みの非secret名だけです。`static-fragment`はJavaScriptとHTTP requestを無効化し、active markupをsanitizeしますが、実application描画と同一ではありません。browser requestのblockはproject server processを隔離しないため、untrustedなserver実行はPhase 4のcontainer modeまで行いません。

生成済み`report/`はimmutableです。参照するcapture / comparison evidenceは独立してdigest検証し、report内部へcopyしてasset manifestのhash対象にします。discovery / comparison manifestは収集diff / capture hashへbindされ、差し替え・未列挙artifactはfinalizeで拒否します。finalizeは検証済みrun artifactとannotationsからreport全体を再構築し、正確なsource byte snapshot hashをmanifestへ記録し、immutable snapshotだけを公開します。stagingまたはreuse中のsource / evidenceの変化は拒否します。Utsuriは、通常fileかつsymlinkではないrun input、他のlocal principalから保護されたpublication path、stagingのstrict validation、OSのno-replace helperを必須とします。helperが存在しない、またはfilesystemが対応しない場合はfail closedとします。生成失敗時には診断用のprivate staging directoryが残る場合がありますが、自動削除はしません。人間のmutable review dataは`run/review/`へ分離します。static viewerは外部serviceへ通信しません。

code diff contentはstructured lineへparseし、textとしてだけrenderします。repositoryが制御するdiff textをHTMLとして挿入しません。

<a id="documentation"></a><!-- section:documentation -->

## ドキュメント

- [英語の詳細設計正本](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [UI guidelineとHIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Capture modeとruntime boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)
- [CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)
- [v1実装計画](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

詳細設計は英語を正本とします。user-facingなREADME変更は英語・日本語・簡体字中国語を同じchangeで更新します。

<a id="license-status"></a><!-- section:license-status -->

## License・公開状態

publisherは`hokupod`、npm maintainerは`hokupod-npm`、公開方式はGitHub Actions trusted publishing、SPDX licenseは`AGPL-3.0-or-later`です。全release gate通過と別途の明示承認までpackageは未公開に保ちます。v1実装計画ではpublish、tag、push、promotionを行いません。
