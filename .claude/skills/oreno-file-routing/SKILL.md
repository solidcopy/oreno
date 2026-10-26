---
name: oreno-file-routing
description: OrenoにおけるURLとファイルパスの対応ルール（環境変数ORENO_ROOT、404になる条件など）を定義したスキルです。ルーティング処理、catch-allセグメント（[...slug]）の解釈、URLからファイルパスへの変換・検証など、URLとMarkdownファイルの対応関係に関わるコードを実装・修正・レビューするときは必ず参照してください。
---

# ファイルとURLの対応

Orenoでは、URLのパスとMarkdownファイルのパスを1対1で対応させる。この対応ルールは `src/lib/docPath.ts` に集約されており、表示・保存・削除のすべての処理がここを通る。ルーティングに関わる実装をするときは、このルールを新たに書き起こすのではなく `docPath.ts` の関数を使うこと。

## 対応ルール

環境変数 `ORENO_ROOT` で文書ファイルの**ルートディレクトリ**を指定する。

URLのホスト名からの相対パスと、`ORENO_ROOT` からの相対パスが対応する。例えば `ORENO_ROOT=/oreno` のとき、

```
http://localhost:3000/docs/hello  →  /oreno/docs/hello.md
```

## 拡張子付きURLの扱い

URLの最後のセグメントにドットが含まれる場合（`/image.png` など）は、次の順で判定する。

1. `ORENO_ROOT/image.png.md` があれば文書として表示する
2. なければ `ORENO_ROOT/image.png` をそのまま返す
3. どちらも無ければ文書の新規作成として扱う（保存すると `image.png.md` を作る）

- 判定は `src/proxy.ts`（Proxy）が行う。2のときだけ、ファイルを返す Route Handler（`src/app/.oreno/files/[...path]/route.ts`）へ書き換える。1と3は通常の文書ページ（`[...slug]/page.tsx`）がそのまま処理する
- ファイル用の検証は `resolveFilePath`（`docPath.ts`）が行う。`resolveDocPath` と同じ検証を通す
- `/page.md` は `page.md.md` が無ければ `page.md` というファイルそのものへのアクセスになる（`/page` へのリダイレクトはしない）

## ルートURLの扱い

ルートURL（`http://localhost:3000/`）は対応するファイルパスを決められないため、`src/app/page.tsx` が `/index` へリダイレクトする（404にはしない）。

## 404にする条件

以下の場合はURLに対応するファイルパスを一意に決められない、またはセキュリティ上許容できないため、404を返す。

- `*` など、ファイルパスの指定で特別な意味を持つ記号がセグメントに含まれる場合
- `.` から始まる名前のセグメントが含まれる場合。`.` や `..` のように `ORENO_ROOT` の外を指しうるセグメントも、これに含まれる（下の「ドット始まりのパス」を参照）

新しいルーティング関連コードを書く際は、この404条件を弱めたり迂回したりしないこと（`ORENO_ROOT` の外のファイルを読み書きできてしまうと、ディレクトリトラバーサルの脆弱性になる）。

## ドット始まりのパス

名前が `.` から始まるフォルダ（その配下のファイルを含む）とファイルは、ページ表示やリンクの対象外で、存在しないものとして扱う。判定は `src/lib/dotPath.ts` の `hasDotSegment` に集約し、`resolveDocPath` / `resolveFilePath` の共通検証（`resolveUnderRoot`）から呼ぶ。

- 対応するファイルがあっても `resolveDocPath` / `resolveFilePath` は null を返す。そのため、URLの直接入力（文書は404、ファイルも404）、新規作成・移動・保存・削除・存在確認のServer Action、サイドバーのページ一覧、「すべてのページ」画面（どちらも `listFolder` 経由）がすべて対象外として扱う
- 新規作成・移動ボタン（`PageLocationButton.tsx`）でも、入力パスのどこかのセグメントが `.` から始まる場合は保存前にエラー表示して弾いている
- `.oreno` から始まるURL（`/.oreno/...`）はOreno自身の機能（ユーザー設定画面など）が使うため、文書のパスとしては使えない。URLとしては `src/app/.oreno/[[...rest]]/page.tsx` と専用の `not-found.tsx` が受け止め、文書向けの404（`src/app/not-found.tsx`）とは別の「該当する画面がありません」という表示になる。`/.oreno/...` の画面はファイルとは対応しないので、`resolveDocPath` を通らない

ディレクトリ名はそのまま `src/app/.oreno` でよい（アンダースコア始まりの `_oreno` だとApp Routerが「プライベートフォルダ」としてルーティング対象外にしてしまうため使えないが、ドット始まりにはその規約が無い）。
