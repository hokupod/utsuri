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

<!-- availability:phase-6-v0-1-0-release-ready -->

完全なv1 source実装は`v0.1.0` release向けに準備済みです。Phase 6は、capabilityで保護したinteractive review、Feedback Batchのpreview / 保存、bounded Context Pack、Origin Session binding、Review InboxのCLI / MCP access、itemized answer writeback、安全なreturn-to-session fallbackを提供します。read-onlyのDistribution Candidate workflowが全release artifactをbuild / 検証し、別の保護された`v*` tag workflowはrelease gate通過後にのみOIDC publicationを行います。対応hostのどちらも、認証済みbindingとresponse correlationの全要件を満たすAPIを公開していないため、direct same-session bridgeは有効化していません。npm packageとPluginは、初回公開のone-time bootstrapと明示承認されたreleaseまで未公開です。

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
- static / interactive / iframe別のCSP、bounded JSON、empty-sandboxのsanitize済みpreview、PNG限定のvisual evidence、拡張privacy宣言、SHA-256によるstrict report検証
- SHA-256 digest固定のlocal image、network none、read-only root / project mount、capability drop、non-root user、PID / CPU / memory / time / artifact limitを強制するDocker / Podman isolation
- source / schema / UI hashと、決定論的なSPDX 2.3 / dependency license inventoryを含む単一Node 22 ESM CLI bundle
- 独立して永続化するviewed progress、human judgment、anchored comment、canonical export/import、明示的なmatched / stale / orphaned re-anchor
- loopback限定static serve、policy exit code `10`を持つ決定論的`report.zip` / `report.json` / `ci-summary.json`
- exact CLI/native package契約、4 architecture helper candidate、aggregate Plugin検証、Node 22/24 isolated-tarball smoke、共通Skill eval
- 起動ごとのcapability tokenと、mutationのexact Origin、read-only GETのsame-origin Fetch Metadata、Referer存在時のexact検証、report binding、request schema検証を持つinteractive serve
- 明示的Agent-attention選択、Feedback Batch preview、redaction済みbounded Context Pack、immutable generationのReview Inbox sidecar、未読answer state
- 生成元のhost / session / project / report bindingを必須とし、itemごとに1 answerを書き戻すfixed-run `feedback` CLI / Review Inbox MCP operation

「Ask the current Agent」の選択は意図を記録するだけで、送信、Context Pack生成、process起動を行いません。static / unbound reportはexportだけを行います。interactive reportは生成元の会話用batchを保存できますが、Utsuriは別Agentやsessionを作成しません。captureが完了してもdiscoveryとcomparison前は`UNCOVERED`です。証拠の欠落・不正、片側失敗、resource limit超過、container capability不足は`INCOMPLETE`のままです。分母が不明なら割合を表示せず、pixel差分だけで`REGRESSION`とは判定しません。

<a id="quick-start"></a><!-- section:quick-start -->

## Quick Start

前提: Nix、標準のuser install先に導入済みのSafe-chain 1.5.14、明示設定した互換Chrome / Chromiumまたは既存のPlaywright管理browser。Node 24とBunはNix shellが提供し、Safe-chainの絶対pathは設定しません。Utsuriはbrowserを自動downloadしません。

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

immutable reportを変更せず、mutable review stateをexportします。別runへのimportはsource identityを確認してから行い、`--reanchor`は変更・欠落anchorをstale / orphanedとして明示的に保持します。

```bash
node skills/utsuri-review/scripts/utsuri.mjs review export --run .artifacts/utsuri/readme-example --output .artifacts/utsuri/review-bundle.json --json
node skills/utsuri-review/scripts/utsuri.mjs review import --run .artifacts/utsuri/updated-run --input .artifacts/utsuri/review-bundle.json --reanchor --json
```

Origin Sessionへbindされたrunでは、capabilityで保護したviewerを起動し、選択項目をpreviewしてから、保存したbatchを同じ会話へ戻します。対象batchが一意の場合だけ`--batch`を省略できます。

```bash
node skills/utsuri-review/scripts/utsuri.mjs serve .artifacts/utsuri/readme-example/report --interactive
node skills/utsuri-review/scripts/utsuri.mjs feedback list --run .artifacts/utsuri/readme-example --status ready --json
node skills/utsuri-review/scripts/utsuri.mjs feedback get --run .artifacts/utsuri/readme-example --batch fb_example --json
node skills/utsuri-review/scripts/utsuri.mjs feedback answer --run .artifacts/utsuri/readme-example --batch fb_example --input answers.json --json
```

現在の実装は意図的に`return-to-session`を使います。session bindingがなければ`export-only`とし、direct bridgeを推測したり別の会話へfallbackしたりしません。

外部uploadせずにlocal CI artifactを作成します。

```bash
node skills/utsuri-review/scripts/utsuri.mjs pack .artifacts/utsuri/readme-example/report --config utsuri.yml --output .artifacts/utsuri/ci-output --json
```

<a id="development"></a><!-- section:development -->

## 開発

package manager操作は、標準のuser install先からSafe-chain 1.5.14を検出するrepository wrapperを経由します。wrapperは初回実行前に`toolchain-policy.json`でplatform別に固定したSHA-256を検証し、その後にexact versionを検証します。CIも対応する公式release assetを取得し、実行前に同じdigestを検証します。

<!-- sync-command:check -->

```bash
node scripts/safe-chain.mjs bun run check
```

bundle済みCLI protocolはnative実行で検証し、wrapper noticeがJSON / NDJSONを汚染しないようにします。

checkとbuild gateは、現在のmacOSまたはLinux target向けに、監査可能なatomic publication helperをcompileします。手動dispatchする`.github/workflows/distribution-candidate.yml`は、対応するrunnerで4種類のOS / architecture helperをbuildし、aggregate Pluginとexact npm tarballをassembleして、release asset / checksumをbindし、Node 22 / 24でisolated installを検証します。registry write権限はありません。`.github/workflows/release.yml`は、exact `main` commitのannotated `v*` tagだけで起動し、OIDC publicationを保護された`release` environmentへ限定します。

<!-- sync-command:native-doctor -->

```bash
node skills/utsuri-review/scripts/utsuri.mjs doctor --json
```

<a id="security-privacy"></a><!-- section:security-privacy -->

## セキュリティとプライバシー

Utsuriはrepository content、diff、HTML、SVG、comment、Context Pack、capture textを信頼できない証拠として扱います。

**セキュリティ警告:** production credential、production browser state、制限のないexternal network、推測したsetup command、親processの環境変数をcaptureへ渡さないでください。beforeとafterは別Browser Contextを使い、external requestとService Workerを既定でblockします。external HTTP redirectとWebSocket handshakeにも同じorigin policyを適用し、永続化するtext証跡ではabsolute / relative URLのcredential、query、fragmentを除去します。

`dual-url`はproject codeを起動しません。`worktree`はtrusted input、before / afterそれぞれの明示argvと別working directory、利用者による`--allow-project-code` opt-inを必須とします。child environmentは最小baselineとallowlist済みの非secret名だけです。`static-fragment`はJavaScriptとHTTP requestを無効化し、active markupをsanitizeしてempty-sandbox iframeで表示しますが、実application描画と同一ではありません。

`container`は、SHA-256 digestで固定され、localに存在するDocker / Podman imageだけを受け付け、pullしません。imageはbounded request bridge用のNode 22を含む必要があります。serverはnetwork none、read-only root / project mount、no-new-privileges、全Linux capabilityのdrop、non-root user、PID / CPU / memory / tmpfs / time / artifact上限で起動します。すべてのrequestと削除操作をfull container IDへbindし、一時的な認証済みloopback proxyを使います。connection refusalを有界なreadiness中だけretryし、identity、response、originの失敗ではproxyを失効させます。応答可能なengineがimmutable IDの不存在を証明するまでcleanupを成功扱いにしません。untrusted contentをChromiumへ渡す前に、Linuxのwritable delegated cgroup v2でbrowser process tree全体へ`memory.max`を適用します。macOSまたはdelegationのないLinuxでは、project codeを起動する前にcapability不足として`INCOMPLETE`にします。host environment allowlist、secret mount、host socketは禁止です。

すべてのbrowser launchにrandom process tokenを付与し、Chrome / Chromiumの親processが正確に1件だけ対応することを必須とします。launch失敗時とrun完了時には有界な終了処理とglobal token rescanを行い、tracking不可、ownershipの曖昧さ、または残存processを検出した場合はfail closedします。先行処理が失敗してもbrowser、cgroup、server / containerの全cleanup stepを実行します。captureの各sideは`maxTimeMs`をbrowser workとcontained-file readのhard deadlineとして適用します。

生成済み`report/`はimmutableです。参照するcapture / comparison evidenceは独立してdigest検証し、画像を検証済みPNG byteに限定してreport内部へcopyし、asset manifestのhash対象にします。保存される`index.html`は常にoffline static CSPです。local interactive serverだけが、そのcanonical CSP境界をexact matchでinteractive CSPへ置換できます。static-fragment previewには別のno-script / no-connect CSPを適用します。strict validationはactive HTML、direct SVG、unsafeな参照、未列挙・欠落file、hash driftを拒否します。manifestはabsolute path、cookie、raw environment、raw DOM、raw header、traceを除外したことを宣言します。

viewed progress、human judgment、comment、Agent attention、batch state、answerは別々のmutable recordです。static modeはWeb Locksとoptimistic revisionを使ってreportごとにbrowser storageへ保存し、schema検証とcatalog bindingを通過したreview / feedback documentへexportします。staleなtabが新しいstateを上書きすることはありません。CLI stateは`run/review/`配下のimmutable generationとatomic hard link済みrevision recordを使い、boundedなinbox / batch / context / answer sidecarも同じgenerationへ保存します。importは`report/`を書き換えず、別reportへのre-anchorを明示的な選択とし、probable anchorを自動有効化せず、変更・欠落anchorをstale / orphanedとして明示します。Phase 5のpixel座標visual anchorは、persisted state、browser storage、review bundleのvalidation前にnormalized anchorへ移行し、別reportで対応不能なcommentは破棄せずorphanedとして保持します。

interactive modeはloopbackだけへbindします。全API requestにexact Host、same-origin Fetch Metadata、report ID、起動ごとのcapability tokenを要求します。mutationはさらにexact Originとexact request schemaを必須とします。read-only GETはsame-origin Fetch MetadataのもとでOriginを省略でき、browserがRefererを送る場合はそのoriginのexact一致も要求します。tokenはURL fragmentだけで渡し、取得後にaddress barから除去し、report / review state / eventへ記録しません。browser APIは任意のdestination、path、cwd、command、provider、modelを受け付けません。Review Inboxの全read / writeはOrigin Sessionとcanonicalなproject / report bindingを検証します。current-session inputとしてhash化するのはhost integrationが供給したraw session IDだけで、公開済みopaque refの再利用は受理しません。mismatchはfail closedとします。server / CLI / MCP serviceはCodex、Claude Code、別Agentを起動せず、Agent answerはhuman judgmentやthread resolutionを変更しません。

discovery / comparison manifestは収集diff / capture hashへbindされ、差し替え・未列挙artifactはfinalizeで拒否します。finalizeは検証済みrun artifactとannotationsからreport全体を再構築し、正確なsource byte snapshot hashをmanifestへ記録し、immutable snapshotだけを公開します。stagingまたはreuse中のsource / evidenceの変化は拒否します。Utsuriは、通常fileかつsymlinkではないrun input、canonicalなcontained path、安全なarchive inventory、他のlocal principalから保護されたpublication path、stagingのstrict validation、OSのno-replace helperを必須とします。helperが存在しない、またはfilesystemが対応しない場合はfail closedとします。生成失敗時には診断用のprivate staging directoryが残る場合がありますが、自動削除はしません。人間のmutable review dataは`run/review/`へ分離します。static viewerは外部serviceへ通信しません。

code diff contentはstructured lineへparseし、textとしてだけrenderします。repositoryが制御するdiff textをHTMLとして挿入しません。

build outputはexternal JavaScript runtime importを持たない単一のNode 22互換ESMです。captureに必要なpinned Playwright package metadataとbrowser registryを埋め込み、無関係なprojectからのsmoke testで`node_modules`やcheckout-relative runtime fileを読まずにcaptureできることを検証します。release verificationはbundleを独立して再buildし、実際にbundleした全third-party inputを、明示的に再生成してreviewするdependency baselineと照合します。build-manifest 1.1は各byte hash、SPDX 2.3はlockfile SHA-512 checksumとinstalled-package verification codeを記録し、同一metadataをCLI / Skill artifactへcopyします。

<a id="documentation"></a><!-- section:documentation -->

## ドキュメント

- [英語の詳細設計正本](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Phase 4 threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md)
- [Release・distribution guide](https://github.com/hokupod/utsuri/blob/main/docs/release.md)
- [UI guidelineとHIG/WCAG traceability](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Capture modeとruntime boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)
- [CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)
- [Origin Session feedback workflow](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/feedback.md)
- [v1実装計画](https://github.com/hokupod/utsuri/blob/main/ai/plans/active/v1-%E5%AE%9F%E8%A3%85/README.md)

詳細設計は英語を正本とします。user-facingなREADME変更は英語・日本語・簡体字中国語を同じchangeで更新します。

<a id="license-status"></a><!-- section:license-status -->

## License・公開状態

publisherは`hokupod`、npm maintainerは`hokupod-npm`、公開方式はGitHub Actions trusted publishing、SPDX licenseは`AGPL-3.0-or-later`です。sourceは`v0.1.0` release-readyですが、5つのnpm packageとaggregate Pluginは未公開です。candidate生成はregistryへ書き込みません。tag workflowは、保護された`release` environment、exact release-asset integrity、公開packageのnative smoke、全asset upload成功後にのみ公開されるdraft GitHub Releaseを要求します。npm trusted publishingでは新規packageを作成できないため、初回releaseにはrelease guide記載のone-time bootstrapも必要です。repository変更だけでtag作成やartifact公開は行われません。
