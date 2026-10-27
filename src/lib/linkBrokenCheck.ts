import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { getRootDir, resolveDocPath, resolveFilePath } from "@/lib/docPath";
import { hasDotSegment } from "@/lib/dotPath";

/**
 * 文書ルート以下のすべてのページから、リンク切れを探すモジュール
 * ファイル一覧（fileIndex）は使わず、呼ばれるたびにフォルダを辿って調べる
 */

/**
 * リンク切れ1件分の情報
 * before / link / after は、リンクのある行全体を「リンクの前」「リンク」「リンクの後」に
 * 分けたもの（リンクが複数行にまたがる場合は、先頭行の先頭から末尾行の末尾まで）
 */
export type BrokenLink = {
  // リンク切れがあったページのパス（例: "/docs/hello"）
  pagePath: string;
  startLine: number;
  endLine: number;
  before: string;
  link: string;
  after: string;
};

/**
 * 文書ルート以下のすべてのページを調べ、リンク切れを見付けた順に返す
 * signal が中断されたら、次のページに進む前に例外を投げて調査をやめる
 */
export async function findBrokenLinks(
  signal: AbortSignal,
): Promise<BrokenLink[]> {
  const brokenLinks: BrokenLink[] = [];
  // リンク先が存在するかの調査結果。同じリンク先を何度も調べないために使う
  const existsCache = new Map<string, boolean>();

  for await (const slug of walkPages([], signal)) {
    const filePath = resolveDocPath(slug);
    if (!filePath) continue;
    const source = await readFile(filePath, "utf-8");

    for (const { url, start, end } of extractLinks(source)) {
      if (await isBroken(slug.slice(0, -1), url, existsCache)) {
        brokenLinks.push({
          pagePath: "/" + slug.join("/"),
          ...excerpt(source, start, end),
        });
      }
    }
  }
  return brokenLinks;
}

/**
 * folder 以下のページを、見付けた順にスラッグ（文書ルートからのセグメントの配列）で返す
 * "." から始まる名前と、Markdown以外のファイルは無視する
 */
async function* walkPages(
  folder: string[],
  signal: AbortSignal,
): AsyncGenerator<string[]> {
  signal.throwIfAborted();

  // "*" などを含むフォルダの中のページは resolveDocPath が弾くので、ここでは検証しない
  const dirents = await readdir(path.join(getRootDir(), ...folder), {
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue;

    if (dirent.isDirectory()) {
      yield* walkPages([...folder, dirent.name], signal);
    } else if (dirent.isFile() && dirent.name.endsWith(".md")) {
      const name = dirent.name.slice(0, -".md".length);
      // URL にできない名前のページは、開けないので調べない
      if (name !== "" && resolveDocPath([...folder, name])) {
        yield [...folder, name];
      }
    }
  }
}

type ExtractedLink = {
  url: string;
  // リンクのソース上の位置（先頭からの文字数）
  start: { offset: number; column: number; line: number };
  end: { offset: number; line: number };
};

/**
 * Markdownの本文から、リンク先を持つ記法（リンク、画像、リンク定義）を出現順に取り出す
 * 本文中に直接書かれたHTML（<a href> など）は対象にしない
 */
function extractLinks(source: string): ExtractedLink[] {
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
 * リンクのある行全体を、リンクの前・リンク・リンクの後に分けて返す
 */
function excerpt(source: string, start: ExtractedLink["start"], end: ExtractedLink["end"]) {
  // column は行頭を 1 とした桁なので、行頭の位置は start.offset から逆算できる
  const lineStart = start.offset - (start.column - 1);
  const newline = source.indexOf("\n", end.offset);
  const lineEnd = newline === -1 ? source.length : newline;

  return {
    startLine: start.line,
    endLine: end.line,
    before: source.slice(lineStart, start.offset),
    link: source.slice(start.offset, end.offset),
    after: source.slice(end.offset, lineEnd).replace(/\r$/, ""),
  };
}

/**
 * リンク先が存在しないかどうかを返す
 * pageDir は、リンクのあるページが置かれているフォルダ（相対リンクの基準）
 *
 * 外部URL（http: や mailto: など）と、同じページ内を指すリンク（#見出し のみ）は調べない
 * #見出し と ?クエリ は取り除き、パス部分だけで存在を判定する
 */
async function isBroken(
  pageDir: string[],
  url: string,
  existsCache: Map<string, boolean>,
): Promise<boolean> {
  // 外部URLは調べない
  // 先頭が「スキーム名:」の形（https://... や mailto:... など）か、
  // スキームを省略した「//」始まり（//example.com/...）のもの
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return false;

  const pathPart = url.split(/[?#]/)[0];
  if (pathPart === "") return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return true;
  }

  // ブラウザと同じように、相対リンクはページのフォルダを基準に解決する
  const segments = decoded.startsWith("/") ? [] : [...pageDir];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // 文書ルートより上へは出られない
      if (segments.length === 0) return true;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  // ルートURLは /index へのリダイレクトなので、常に存在するものとして扱う
  if (segments.length === 0) return false;
  // /.oreno/... はOreno自身の画面なので、存在するものとして扱う
  if (segments[0] === ".oreno") return false;
  if (hasDotSegment(segments)) return true;

  const key = segments.join("/");
  let exists = existsCache.get(key);
  if (exists === undefined) {
    exists = await targetExists(segments);
    existsCache.set(key, exists);
  }
  return !exists;
}

/**
 * URLに対応するページまたはファイルがあるかを返す
 * file-routing スキルの判定順と同じく、Markdown（〜.md）を先に、なければ同じ名前のファイルを探す
 */
async function targetExists(segments: string[]): Promise<boolean> {
  const candidates = [resolveDocPath(segments), resolveFilePath(segments)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if ((await stat(candidate)).isFile()) return true;
    } catch {
      // 存在しない場合は次の候補を調べる
    }
  }
  return false;
}
