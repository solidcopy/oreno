import { readFile } from "node:fs/promises";
import { resolveDocPath } from "@/lib/docPath";
import { extractLinks, resolveLinkTarget } from "@/lib/pageLinks";
import { walkPages } from "@/lib/walkPages";

/**
 * /index から出発してリンクを辿ってもたどり着けないページ（孤立ページ）を探すモジュール
 * リンクの解釈は、リンク切れチェック（linkBrokenCheck.ts）と同じ
 * サイドバーなど、リンク以外からアクセスできるかどうかは考えない
 */

// カードに表示する、ページの先頭からの行数
const EXCERPT_LINES = 5;

/**
 * 孤立ページ1件分の情報
 */
export type OrphanedPage = {
  // 孤立ページのパス（例: "/memo/old-ideas"）
  pagePath: string;
  // ページの最初の数行（空行も含める。空のページは空配列）
  lines: string[];
};

/**
 * 文書ルート以下のページのうち孤立しているものを、見付けた順に返す
 * signal が中断されたら、次のページに進む前に例外を投げて調査をやめる
 */
export async function findOrphanedPages(
  signal: AbortSignal,
): Promise<OrphanedPage[]> {
  const pages: string[][] = [];
  for await (const slug of walkPages([], signal)) {
    pages.push(slug);
  }
  // リンクの行き先がページかどうかを調べるための、ページのパスの集合
  const pageKeys = new Set(pages.map((slug) => slug.join("/")));

  // /index から出発して、リンクを辿れたページ
  const reached = new Set<string>();
  const queue: string[][] = [];
  function reach(slug: string[]) {
    const key = slug.join("/");
    if (pageKeys.has(key) && !reached.has(key)) {
      reached.add(key);
      queue.push(slug);
    }
  }

  reach(["index"]);
  // queue の先頭から取り出しながら、見付けたページを末尾に足していく（幅優先探索）
  for (let i = 0; i < queue.length; i++) {
    signal.throwIfAborted();
    const slug = queue[i];
    const source = await readSource(slug);

    for (const { url } of extractLinks(source)) {
      const target = resolveLinkTarget(slug.slice(0, -1), url);
      if (target === "root") {
        // ルートURLは /index へのリダイレクト
        reach(["index"]);
      } else if (target !== "skip" && target !== "broken") {
        reach(target);
      }
    }
  }

  const orphanedPages: OrphanedPage[] = [];
  for (const slug of pages) {
    if (reached.has(slug.join("/"))) continue;
    signal.throwIfAborted();
    orphanedPages.push({
      pagePath: "/" + slug.join("/"),
      lines: firstLines(await readSource(slug)),
    });
  }
  return orphanedPages;
}

async function readSource(slug: string[]): Promise<string> {
  // walkPages が返すページは resolveDocPath で検証済み
  return readFile(resolveDocPath(slug)!, "utf-8");
}

/**
 * Markdownの最初の数行を返す
 * 末尾の改行は行の区切りとして扱い、その後ろに空行があるとは数えない
 */
function firstLines(source: string): string[] {
  if (source === "") return [];
  const body = source.endsWith("\n") ? source.slice(0, -1) : source;
  return body
    .split("\n")
    .slice(0, EXCERPT_LINES)
    .map((line) => line.replace(/\r$/, ""));
}
