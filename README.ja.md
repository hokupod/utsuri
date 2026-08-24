<!-- doc-language: ja; canonical: README.md -->

[English](https://github.com/hokupod/utsuri/blob/main/README.md) | [日本語](https://github.com/hokupod/utsuri/blob/main/README.ja.md) | [简体中文](https://github.com/hokupod/utsuri/blob/main/README.zh-CN.md)

# Utsuri

> 何が変わったかを見て、なぜ変わったかを理解する。

<a id="product-outcome"></a><!-- section:product-outcome -->

## 緑のバッジではなく、証拠として変更をレビューする

Utsuri は Git の変更を、コード・ブラウザキャプチャ・構造差分・アクセシビリティ所見・カバレッジ・人間のコメントがつながったローカルレビューに変換します。欠けた証拠を隠さないため、「問題なし」と「未確認」を区別できます。

コードや UI の変更に、永続的なレポート、明確な未検証項目、またはレポートを作成したコーディングセッションへ返す構造化された質問が必要なときに利用します。

<p align="center">
  <img src="https://raw.githubusercontent.com/hokupod/utsuri/main/docs/assets/utsuri.jpg" alt="折りたたまれた鏡越しに向かい合う二人のキャラクター" width="480">
</p>

<a id="availability-requirements"></a><!-- section:availability-requirements -->

## 提供状況と要件

<!-- availability:git-marketplace-source-ready-cli-publication-pending -->
<!-- support-contract:macos-linux-windows-unsupported -->

ソースには、対応する `@utsu-ri/cli` release に完全固定された Git Plugin が含まれます。ソース版が検証済みの最新公開版より新しい場合、そのソースを公開 Git からインストールできるのは、対応する CLI が公開され、Plugin ソースが公開到達可能になった後です。以下は検証済みの host command です。`latest`、version range、別 package へ置き換えないでください。

- [runtime compatibility record](https://github.com/hokupod/utsuri/blob/main/docs/compatibility/plugin-runtime.json) に記載された Codex または Claude Code release。
- macOS または Linux、Node.js 22 以降、および MCP 初回起動に使う `npx`。
- ブラウザキャプチャには既存の互換 Chrome / Chromium。Utsuri はブラウザをダウンロードしません。
- 分離された container capture mode には任意で Docker または Podman。Utsuri は image を pull しません。
- Marketplace インストール時の GitHub 接続と、MCP 初回起動時の npm 接続。

Windows 用 native helper を配布していないため、native Windows は非対応です。別途公開または upload を許可しない限り、レポート、キャプチャ、review state は project 内に残ります。

<a id="install"></a><!-- section:install -->

## Git Marketplace からインストールする

### Codex

<!-- sync-command:codex-marketplace-add -->

```bash
codex plugin marketplace add hokupod/utsuri
```

<!-- sync-command:codex-plugin-install -->

```bash
codex plugin add utsuri@utsuri
```

インストール時に Plugin は有効になります。Codex app では Plugin UI から有効状態を確認・変更できます。Codex では Utsuri のプロダクトイメージを composer icon と Plugin logo の両方に使用します。

### Claude Code

<!-- sync-command:claude-marketplace-add -->

```bash
claude plugin marketplace add hokupod/utsuri
```

<!-- sync-command:claude-plugin-install -->

```bash
claude plugin install utsuri@utsuri
```

Claude Code の現行 Plugin manifest には icon または logo field がないため、Utsuri は未対応の画像metadataを追加しません。

インストールまたは更新後に host から求められた場合は再起動してください。Plugin は native `npx` から正確な CLI を起動します。Utsuri の global install は不要で、利用もされません。

<a id="first-review"></a><!-- section:first-review -->

## 最初のレビューを実行する

Codex または Claude Code で repository を開き、Utsuri を有効にした新しい session で次の prompt を使います。

<!-- sync-command:first-review-prompt -->

```text
Review the current change with Utsuri. Create and validate an evidence-backed report, explain each change in my language, start the local report viewer, verify that the diff loads, and return its live URL with every incomplete or uncovered check.
```

Utsuri は何もインストールせず、最初に利用可能な capability を確認します。ブラウザ証拠を依頼していない場合や利用できない場合は、code-only report を作成できます。ブラウザ証拠が必要なら、必要な before / after application は自分で起動し、信頼できる明示的な command だけを許可してください。

人との会話では、Agent が選択された言語で根拠付きの解釈を作成し、レポートを厳密に検証して、適切な loopback viewer を永続プロセスとして起動します。さらにレポートと diff が読み込めることを確認し、live URL、確認済みカバレッジ、所見、失敗、未検証項目を返します。ファイルパスだけでは引き渡し完了ではありません。明示的に artifact-only または CI workflow を依頼した場合だけ serve を省略します。

<a id="how-it-works"></a><!-- section:how-it-works -->

## 仕組み

1. **Collect** — 指定された patch、worktree、range、merge base を境界付き run に読み込みます。
2. **Interpret** — 現在の Agent が会話、diff、索引済みの根拠を使い、因果関係のある複数ファイルの hunk を意味単位の変更へまとめます。各変更を説明し、すべての hunk に簡潔な「目的」と「この差分の意味」を付けます。裏付けのない意図は作りません。
3. **Capture** — 設定と許可がある場合だけ、分離した before / after のブラウザ証拠を記録します。
4. **Discover and compare** — 変更コードを target に対応付け、pixel、DOM、ARIA、style、accessibility、runtime、network、overflow の証拠を比較します。
5. **Finalize** — Agent が作成した annotations を含む immutable で hash 検証済みのローカル `report/` を公開し、失敗や部分的な証拠も保持します。
6. **Serve and verify** — 適切な loopback viewer を起動したまま、レビュー要旨、最初の意味単位の変更、code diff、Agent の解釈が読み込めることを確認し、live URL を返します。
7. **Review and return feedback** — viewed state、人間の判断、comment を `report/` の外へ保存します。Agent 向け質問は、登録済みの元 project・Origin Session にだけ戻せます。

[詳細設計](https://github.com/hokupod/utsuri/blob/main/docs/design.md)に data model と security boundary、[CLI contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/cli-contract.md)に機械向け動作を記載しています。

<a id="understand-report"></a><!-- section:understand-report -->

## レポートを理解する

- **レビュー要旨** は Agent が作成した全体説明、決定的に算出した根拠の状態、優先順の意味単位変更マップをまとめます。1つの意味単位の変更が複数ファイルにまたがることがあり、file と hunk のリンクはレビュー境界ではなく根拠です。
- **Hunk の説明** は、Agent が作成した「目的」と「この差分の意味」を、注釈付きコード hunk の直前に表示します。収集済み hunk を欠落または重複させた新しい annotations は拒否され、`unclassifiedHunkRefs` は annotations なしで生成する決定的 fallback レポートに限られます。このフィールドがない旧レポートも閲覧でき、その場合は説明パネルを表示しません。
- **Finding** は証拠に基づく観察であり、それだけで regression を証明しません。
- **`INCOMPLETE`** は必要な証拠の失敗、不正、上限超過、利用不能を示します。pass へ変換されません。
- **`UNCOVERED`** は変更コードに検証済み target がない、またはカバレッジの分母が不明であることを示します。
- **Finding なし** は完了した check で何も見つからなかったという意味だけで、全体の `PASS` ではありません。
- **人間の判断** は独立した state です。Agent の回答が reviewer の代わりに accepted、rejected、resolved を設定することはありません。

レポートは source identity、evidence hash、review gap を保持し、別の reviewer が確認範囲を監査できるようにします。

<a id="security-privacy"></a><!-- section:security-privacy -->

## セキュリティとプライバシー

**本番 credential、本番 browser state、無制限の network、推測した setup command、host socket、未レビューの project command を capture に渡さないでください。** Repository content、page、diff、SVG、comment、captured text は untrusted input です。

- `dual-url` は project command を起動しません。`worktree` は明示 argv と利用者の opt-in が必要です。`static-fragment` は script と network を無効化します。`container` は local に存在する digest-pinned image だけを受け付けます。
- 生成済み `report/` は immutable です。変更可能な review / feedback record は run の `review/` directory に保存します。
- Marketplace MCP は任意の path、working directory、command、provider、model、destination、raw session input を公開しません。
- MCP tool が扱えるのは canonical な現在の project と同じ Origin Session に登録された schema-valid report だけです。別 project、別 host、別 session、stale または swapped registration は fail closed します。
- Raw host session value は equality check と opaque hash にだけ使用し、persist、log、diagnostic、tool return には含めません。
- Marketplace broker が受け付ける host contract は `CODEX_THREAD_ID`、または `CLAUDE_CODE_SESSION_ID` + `CLAUDE_PROJECT_DIR` だけです。Fixed-run の `finalize`、`feedback`、`review-mcp` は `UTSURI_CODEX_SESSION_ID` と `CLAUDE_SESSION_ID` の互換性も維持しますが、legacy/new の値が競合する場合は拒否します。Claude Plugin の finalize は child directory から起動しても canonical な host project root に binding します。
- Release artifact には production dependency graph の決定的な SPDX と license inventory を含めます。その identity は lockfile の正確な integrity value と install 済み package の byte から算出し、無関係な development-only lock 変更では published inventory を変更しません。

Claude Code は別の ambient variable を MCP subprocess に渡す場合があります。Utsuri はそれらを identity に使わず、外部にも出しません。`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` は Claude Code installation が対応する場合の任意の host hardening です。Plugin から host 全体の environment scrubbing を強制することはできません。

Untrusted project を扱う前に、[threat model](https://github.com/hokupod/utsuri/blob/main/docs/threat-model.md)、[capture boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/capture-modes.md)、[feedback boundary](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/references/feedback.md)を確認してください。

<a id="troubleshooting-lifecycle"></a><!-- section:troubleshooting-lifecycle -->

## トラブルシューティングとライフサイクル

- **初回起動で npm に接続できない:** npm registry への接続を許可して再試行します。初回利用時に正確な package を取得し、ambient executable や floating version には fallback しません。
- **Browser capability がない:** 互換 browser を自分で install / configure するか、code-only report を続行します。Utsuri command は browser を download しません。
- **`MCP_RUN_UNAVAILABLE`:** 同じ host session・project で bound report を finalize してから再試行します。Unbound または別 session の report は意図的に見えません。
- **`MCP_RUN_AMBIGUOUS`:** 同じ session の report が複数登録されています。Error に示された opaque `report_id` のうち対象を Agent に指定してください。Utsuri が newest run を暗黙選択することはありません。
- **Run path が拒否される:** project 内の相対 POSIX path を使います。Space と Unicode 名は利用できます。Absolute path、`.` / `..` component、duplicate separator、backslash、NUL、symlink、project 外の path は拒否されます。
- **Origin Session mismatch:** report を作成した session に戻ります。別 Agent や session へ feedback を転送しません。
- **Windows:** 対応する macOS または Linux environment を利用します。Marketplace で見えることは native Windows 対応を意味しません。

新しい Plugin version が案内されたら、Codex では refresh と reinstall を行います。

```bash
codex plugin marketplace upgrade utsuri
codex plugin remove utsuri@utsuri
codex plugin add utsuri@utsuri
```

Claude Code では次を実行します。

```bash
claude plugin marketplace update utsuri
claude plugin update utsuri@utsuri
```

無効化またはアンインストール:

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

- [コントリビューションと開発環境](https://github.com/hokupod/utsuri/blob/main/CONTRIBUTING.md)
- [詳細設計](https://github.com/hokupod/utsuri/blob/main/docs/design.md)
- [Release・distribution 運用](https://github.com/hokupod/utsuri/blob/main/docs/release.md)
- [UI guidelines](https://github.com/hokupod/utsuri/blob/main/docs/ui-guidelines.md)
- [Skill contract](https://github.com/hokupod/utsuri/blob/main/skills/utsuri-review/SKILL.md)

Utsuri は `AGPL-3.0-or-later` でライセンスされています。Publisher は `hokupod` です。CLI publication、Git Plugin promotion、Git push、tag、release は個別に operator の許可を要する操作であり、source change だけで実行されることはありません。
