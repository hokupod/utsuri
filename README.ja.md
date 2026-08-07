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

<!-- availability:phase-1-code-review -->

Phase 1のcode-only review flowは、このsource checkoutで利用できます。patch、worktree、range、merge-baseの変更を収集し、immutableなlocal reportを生成します。browser capture、visual/runtime comparison、review stateの永続化、Agent feedbackは未実装です。npm packageとPluginも未公開です。

<a id="capabilities"></a><!-- section:capabilities -->

## 機能

現在利用できる機能:

- patch、worktree、range、merge-baseを明示した収集mode
- rename、delete、binary、submodule、mode、low-signal metadataを保持するstableなstructured hunk
- 全hunkをcandidateまたは`unclassified`へ残す決定論的な初期change candidate
- schema検証済みannotationとevidence参照
- summary、3分類queue、Focus mode、evidence drawer、unified/side-by-side diff、deep link、keyboard focus復元を備えた自己完結code review

後続Phaseで、分離browser capture、visual/DOM/ARIA/style/accessibility/runtime comparison、review stateの永続化、Origin Session feedbackを追加します。capture実行前のreportは必ず`UNCOVERED`とし、visualとruntimeのverification gapを明示します。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提: Nixと、標準のuser install先に導入済みのSafe-chain 1.5.14。Node 24とBunはNix shellが提供し、Safe-chainの絶対pathは設定しません。

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

新しいcode-only example runを作成します。output directoryは事前に存在していてはいけません。

<!-- sync-command:collect-patch -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs collect --patch fixtures/code-only-review/changes.patch --output .artifacts/utsuri/readme-example --json
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

**セキュリティ警告:** production credential、production browser state、制限のないexternal network、推測したsetup command、親processの環境変数をcaptureへ渡さないでください。beforeとafterは別Browser Contextを使い、external requestとService Workerを既定でblockします。

生成済み`report/`はimmutableです。Utsuriは、通常fileかつsymlinkではないrun input、他のlocal principalから保護されたpublication path、stagingのstrict validation、OSのno-replace helperを必須とします。helperが存在しない、またはfilesystemが対応しない場合はfail closedとします。生成失敗時には診断用のprivate staging directoryが残る場合がありますが、自動削除はしません。人間のmutable review dataは`run/review/`へ分離します。static viewerは外部serviceへ通信しません。

code diff contentはstructured lineへparseし、textとしてだけrenderします。repositoryが制御するdiff textをHTMLとして挿入しません。

<a id="documentation"></a><!-- section:documentation -->

## ドキュメント

- [英語の詳細設計正本](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [UI guidelineとHIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [v1実装計画](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

詳細設計は英語を正本とします。user-facingなREADME変更は英語・日本語・簡体字中国語を同じchangeで更新します。

<a id="license-status"></a><!-- section:license-status -->

## License・公開状態

publisherは`hokupod`、npm maintainerは`hokupod-npm`、公開方式はGitHub Actions trusted publishing、SPDX licenseは`AGPL-3.0-or-later`です。全release gate通過と別途の明示承認までpackageは未公開に保ちます。v1実装計画ではpublish、tag、push、promotionを行いません。
