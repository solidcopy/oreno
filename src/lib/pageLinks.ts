import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { hasDotSegment } from "@/lib/dotPath";

/**
 * Markdownのページに書かれたリンクを取り出し、リンク先を解決するモジュール
 */

export type ExtractedLink = {
  url: string;
  // リンクのソース上の位置（先頭からの文字数）
  start: { offset: number; column: number; line: number };
  end: { offset: number; line: number };
};

/**
 * Markdownの本文から、リンク先を持つ記法（リンク、画像、リンク定義）を出現順に取り出す
 * 本文中に直接書かれたHTML（<a href> など）は対象にしない
 */
export function extractLinks(source: string): ExtractedLink[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);

  const links: ExtractedLink[] = [];
  function visit(node: Nodes) {
    if (
      (node.type === "link" ||
        node.type === "image" ||
        node.type === "definition") &&
      node.position
    ) {
      links.push({
        url: node.url,
        start: node.position.start as ExtractedLink["start"],
        end: node.position.end as ExtractedLink["end"],
      });
    }
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  }
  visit(tree);
  return links;
}

/**
 * リンクのURLが指す先を、文書ルートからのセグメントの配列に解決した結果
 * skip: 調べる必要がないリンク（外部URL、同じページ内を指すリンク、Oreno自身の画面）
 * broken: 解決できない（またはドット始まりで存在しないものとして扱う）リンク
 * root: ルートURL（/index へリダイレクトされる）
 */
export type LinkTarget = "skip" | "broken" | "root" | string[];

/**
 * リンクのURLを、文書ルートからのセグメントの配列に解決する
 * pageDir は、リンクのあるページが置かれているフォルダ（相対リンクの基準）
 *
 * 外部URL（http: や mailto: など）と、同じページ内を指すリンク（#見出し のみ）は調べない
 * #見出し と ?クエリ は取り除き、パス部分だけで解決する
 */
export function resolveLinkTarget(pageDir: string[], url: string): LinkTarget {
  // 外部URLは調べない
  // 先頭が「スキーム名:」の形（https://... や mailto:... など）か、
  // スキームを省略した「//」始まり（//example.com/...）のもの
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return "skip";

  const pathPart = url.split(/[?#]/)[0];
  if (pathPart === "") return "skip";

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return "broken";
  }

  // ブラウザと同じように、相対リンクはページのフォルダを基準に解決する
  const segments = decoded.startsWith("/") ? [] : [...pageDir];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // 文書ルートより上へは出られない
      if (segments.length === 0) return "broken";
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  if (segments.length === 0) return "root";
  // /.oreno/... はOreno自身の画面なので、調べない
  if (segments[0] === ".oreno") return "skip";
  if (hasDotSegment(segments)) return "broken";
  return segments;
}
