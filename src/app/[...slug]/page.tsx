// このファイルには "use client" がありません。つまりこれは Server Component です。
// Next.js の App Router では、デフォルトのコンポーネントはすべて Server Component として
// 扱われます。Server Component はサーバー上でのみ実行され、ブラウザに送られるのは
// レンダリング結果（HTML）だけです。Node.js の fs（ファイル読み込み）のような機能は
// Server Component の中でしか使えません。

import { connection } from "next/server";
import { notFound } from "next/navigation";
import { resolveDocPath } from "@/lib/docPath";
import { loadDocument } from "@/lib/document";
import { markdownToHtml } from "@/lib/markdown";
import DocumentPage from "./DocumentPage";

// [...slug] という名前のディレクトリが「catch-all セグメント」です。
// 例えば /docs/hello/world というURLは、このページに対して
// slug = ["docs", "hello", "world"] という配列で渡ってきます。
//
// PageProps<"/[...slug]"> は Next.js が dev サーバー起動時に自動生成する型で、
// このルートの params の型（{ slug: string[] } を Promise で包んだもの）を表します。
// import せずにそのまま使えるグローバルな型です。
export default async function DocumentRoute(props: PageProps<"/[...slug]">) {
  // Next.js 16 では params は Promise です。await して中身を取り出します。
  const { slug } = await props.params;

  const filePath = resolveDocPath(slug);
  if (!filePath) {
    // slug が不正（"/" だけ、".." を含む、特殊記号を含む、等）な場合は 404 にします。
    // README.md の「ファイルとURLの対応」に書かれているルールです。
    notFound();
  }

  // connection() を呼ぶと、Next.js に対して
  // 「このページはリクエストごとに毎回サーバー上で実行してほしい」と伝えられます。
  //
  // これを呼ばないと、fs でのファイル読み込みは next build 時に一度だけ実行され、
  // その結果が静的なHTMLとして固定されてしまいます（=あとでファイルを書き換えても
  // 画面に反映されなくなる）。文書ファイルは実行中に増えたり変わったりするので、
  // 必ず毎回読み直す必要があり、そのために connection() を呼んでいます。
  await connection();

  const { exists, markdown } = await loadDocument(slug);
  const html = exists ? await markdownToHtml(markdown) : "";

  // ここから先は Client Component（"use client" がついたコンポーネント）に処理を渡します。
  // 表示/編集の切り替えのようなブラウザ上でのインタラクションは
  // Server Component ではできない（useState などのフックが使えない）ためです。
  return (
    <DocumentPage
      slug={slug}
      initialMarkdown={markdown}
      initialHtml={html}
      initialExists={exists}
    />
  );
}
