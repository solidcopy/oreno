---
name: oreno-user-settings
description: Orenoのユーザー設定(文書ルート/.oreno/user-settings.json)の仕様。user-settings.json や src/lib/userSettings.ts に関わるコード、閲覧履歴、スター付きページ、並び順、モード、サイドバーの設定を実装・修正するときは必ず参照してください。
---

# 参照先の案内

このファイルには、設定ファイルの読み書きの作法と、閲覧履歴・スター付きページ・並び順・モードの仕様を書く。サイドバーの設定(`sidebar-settings`)と、サイドバーの「履歴」「ページ」「目次」の一覧の仕様は `references/sidebar-settings.md` を読む。

# ユーザー設定

ユーザーごとの設定は `(ORENO_ROOT)/.oreno/user-settings.json` に保存する。読み書きは `src/lib/userSettings.ts` に集約しており、設定を追加するときもここに関数を足す。

プロジェクト単位の設定(`project-settings.json`)とは別ファイルで、こちらはプロジェクト設定画面から編集するものではない。

## ファイルの扱い

- ファイルが無い場合、JSONオブジェクトとして解析できない場合は、エラーにせず未設定扱いにする
- 保存時は既存のJSONを読み込み、更新するキーだけを差し替える。このファイルには今後も別の設定が増えるため、他のキーを消さないようにする(`project-settings.json` のように全体を書き直す方式にはしない)
- 読み込み→書き込みの途中で別の更新が割り込むと内容が欠けるため、更新処理は1つずつ順番に実行する(`userSettings.ts` の `updateUserSettings` に集約している。設定の更新は必ずこれを経由する)
- 保存時に `git commit` は行わない(oreno-deployment スキルの方針どおり)
- `.gitignore` への追記など、Gitに関する処理はしない(アプリの仕様はGit管理を前提にしない。バージョン管理の対象から外す案内はREADME.mdに書く)
- ファイル内のキー名はケバブケース(`view-histories`)で、アプリ内で扱う名前との変換は `userSettings.ts` に閉じ込める

## 閲覧履歴(view-histories)

ユーザーがアクセスしたページのURLパスを、新しい順に並べた文字列配列で保存する。

```json
{
  "view-histories": ["/spec/entities", "/about", "/index"]
}
```

上の例は `/index`、`/about`、`/spec/entities` の順にアクセスした結果である。

- 後にアクセスしたものほど先頭にする
- 過去に表示したページをもう一度表示したら、元の位置から取り除いて先頭へ移動する(重複させない)
- 最大20件まで保存する。超えた分は古いものから削除する(保存時に切り詰めるので、表示側で件数を制限する必要はない)
- 存在しないページ(新規作成画面)は記録しない。保存前のページは履歴に残す意味が薄いため
- `.` から始まる名前を含むパスなど不正なパスは記録しない(`resolveDocPath` で検証する)
- サイドバーの「履歴」に表示する(`references/sidebar-settings.md` を参照)

### 記録の仕組み

`DocumentPage.tsx` が表示後に `useEffect` で Server Action `recordViewHistory`(`src/app/actions.ts`)を呼ぶ。サーバー側の描画中(`page.tsx`)で書き込まないのは、描画は副作用を持たない処理であるべきで、ブラウザの先読み(prefetch)でも走りかねないためである。

Server Action は誰でも直接呼び出せるため、渡された slug を信用せずアクション内で検証し直す。履歴の記録に失敗しても文書の表示には影響させない。

## スター付きページ(starred-pages)

お気に入り(スター付き)にしたページのURLパスを、文字列配列で保存する。

```json
{
  "starred-pages": ["/spec/entities", "/about"]
}
```

- 並び順に意味は持たせない(スターを付けた順に末尾へ追加する)
- 重複させない。すでに同じ状態(スター付きのものを付ける、スター無しのものを外す)なら何も書き込まない
- 存在しないページ(新規作成画面)にはスターを付けられない

### 画面の仕様

- 文書の表示領域の右上に、星形アイコンの正方形ボタンを表示する。ヘッダーには置かない
- スクロールしても動かないよう固定する(`position: fixed`)
- スター無しは星の輪郭だけ、スター付きは黄色く塗る
- 表示モードで、ファイルが存在するときだけ表示する(編集モードはエディタと重なるため出さない)
- 現時点では、スター付きの文書の一覧表示などは実装しない

### 実装の仕組み

`page.tsx` が表示のたびに `isPageStarred` で状態を調べ、`DocumentPage.tsx` へ `initialStarred` として渡す。ボタンを押すと画面の状態を先に切り替え、Server Action `setStarred`(`src/app/actions.ts`)で保存する。失敗したら元に戻してエラーを表示する。

`setStarred` は `recordViewHistory` と同様、渡された slug を信用せずアクション内で検証し直す。

`setStarred` では保存後に `revalidatePath` を呼ぶ。これを省くと、ブラウザが持つ「移動前に取得した描画結果」(クライアントルーターキャッシュ)がそのまま使われ、別のページへ移動してからブラウザの戻るボタンで戻ったときに、スターの状態が古いまま表示される。

## 並び順(order)

同じ階層にあるフォルダとページの並び順を保存する。ユーザー設定画面(`/.oreno/user_settings`)でラジオボタンから選び、「設定を保存する」で保存する。

```json
{
  "order": "folders-first"
}
```

- 値は `by-name`(フォルダとページを区別せず名前の昇順。同名ならフォルダが先)、`folders-first`(フォルダが先、それぞれ名前の昇順)、`pages-first`(ページが先、それぞれ名前の昇順)のいずれか
- 未設定、または上記以外の値のときは `by-name` 扱いにする
- 読み書きは `userSettings.ts` の `loadOrderSetting` / `setOrderSetting`。保存後は `revalidatePath("/", "layout")` で全ページのキャッシュを破棄する
- 「すべてのページ」とサイドバーの「ページ」に適用する(「..」は常に先頭)。比較は `folder.ts` の `listFolder` に集約し、「すべてのページ」は全階層に同じ並び順を使う

## モード(mode)

文書の表示モードと編集モードのどちらで開くかを保存する。ページを移動したりリロードしても、モードが変わらないようにするための設定で、全ページ共通である。

```json
{
  "mode": "edit"
}
```

- 値は `view`(表示モード)か `edit`(編集モード)のどちらか(`DocumentPage.tsx` の `Mode` と同じ。型は `userSettings.ts` の `Mode`)
- 未設定、または上記以外の値のときは `view` 扱いにする
- 読み書きは `userSettings.ts` の `loadMode` / `setMode`。すでに同じ値なら何も書き込まない
- `page.tsx` が表示のたびに `loadMode` で読み込み、`DocumentPage.tsx` へ `initialMode` として渡す
- 「編集モードに切り替え」「表示モードに切り替え」を押すたびに、Server Action `setModeSetting`(`src/app/actions.ts`)で保存する。保存に失敗しても画面のモードは変えず、エラーだけ表示する。保存後は `revalidatePath("/", "layout")` で全ページのキャッシュを破棄する
- 存在しないページ(新規作成画面)は、保存済みのモードに関わらず編集モードで開き、このときは書き込まない。「保存」ボタンでファイルを作ったときも書き込まず、保存済みのモードに従って、編集モードのままにするか表示モードにする
