// このファイルには "use client" がない
// つまりこれは Server Component
// Next.js の App Router では、
// デフォルトのコンポーネントはすべて Server Component として扱われる
// Server Component はサーバー上でのみ実行され、ブラウザに送られるのは
// レンダリング結果（HTML）だけ
// Node.js の fs（ファイル読み込み）のような機能は
// Server Component の中でしか使えない

import { connection } from "next/server";
import { notFound } from "next/navigation";
import { resolveDocPath, getRootDirName, slugToUrlPath } from "@/lib/docPath";
import { loadDocument } from "@/lib/document";
import { listFolder } from "@/lib/folder";
import { markdownToHtml } from "@/lib/markdown";
import { loadProjectSettings } from "@/lib/projectSettings";
import {
  isPageStarred,
  loadSidebarSettings,
  loadStarredPages,
  loadViewHistories,
} from "@/lib/userSettings";
import DocumentPage from "./DocumentPage";

// [...slug] という名前のディレクトリが「catch-all セグメント」
// 例えば /docs/hello/world というURLは、このページに対して
// slug = ["docs", "hello", "world"] という配列で渡ってくる
//
// PageProps<"/[...slug]"> は Next.js が dev サーバー起動時に自動生成する型で、
// このルートの params の型（{ slug: string[] } を Promise で包んだもの）を表す
// import せずにそのまま使えるグローバルな型
export default async function DocumentRoute(props: PageProps<"/[...slug]">) {
  // Next.js 16 では params は Promise
  // await して中身を取り出す
  const { slug: encodedSlug } = await props.params;

  // Next.js は URL のセグメントをパーセントエンコードされたまま渡してくる
  // （例: "あ" は "%E3%81%82"）
  // 日本語のファイル名をそのまま扱えるよう、検証より前にデコードする
  // "%2F" や "%2e%2e" もここで "/" や ".." に戻るが、
  // resolveDocPath が戻した後の値を検証するため404にできる
  let slug: string[];
  try {
    slug = encodedSlug.map(decodeURIComponent);
  } catch {
    // "%E3" のような不正なエンコードは decodeURIComponent が例外を投げる
    notFound();
  }

  const filePath = resolveDocPath(slug);
  if (!filePath) {
    // slug が不正（".." を含む、特殊記号を含む、等）な場合は 404 にする
    // README.md の「ファイルとURLの対応」に書かれているルール
    notFound();
  }

  // connection() を呼ぶと、Next.js に対して
  // 「このページはリクエストごとに毎回サーバー上で実行してほしい」と伝えられる
  //
  // これを呼ばないと、fs でのファイル読み込みは next build 時に一度だけ実行され、
  // その結果が静的なHTMLとして固定されてしまう（=あとでファイルを書き換えても
  // 画面に反映されなくなる）
  // 文書ファイルは実行中に増えたり変わったりするので、
  // 必ず毎回読み直す必要があり、そのために connection() を呼んでいる
  await connection();

  const { exists, markdown } = await loadDocument(slug);
  const html = exists ? await markdownToHtml(markdown) : "";
  const { projectName } = await loadProjectSettings();
  const starred = await isPageStarred(slugToUrlPath(slug));
  const starredPages = await loadStarredPages();
  const sidebarSettings = await loadSidebarSettings();
  const recentPages = await loadViewHistories();
  // サイドバーの「ページ」に最初に表示する、表示中のページがあるフォルダの中身
  const folderEntries = await listFolder(slug.slice(0, -1));

  // ここから先は Client Component（"use client" がついたコンポーネント）に処理を渡す
  // 表示/編集の切り替えのようなブラウザ上でのインタラクションは
  // Server Component ではできない（useState などのフックが使えない）ため
  return (
    <DocumentPage
      slug={slug}
      rootDirName={getRootDirName()}
      projectName={projectName}
      initialMarkdown={markdown}
      initialHtml={html}
      initialExists={exists}
      initialStarred={starred}
      starredPages={starredPages}
      showSidebar={sidebarSettings.show}
      showStarredPages={sidebarSettings.showStarredPages}
      recentPages={recentPages}
      showRecentlyViewedPages={sidebarSettings.showRecentlyViewedPages}
      folderEntries={folderEntries}
      showPages={sidebarSettings.showPages}
    />
  );
}
