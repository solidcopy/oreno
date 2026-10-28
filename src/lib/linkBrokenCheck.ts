import { readFile, stat } from "node:fs/promises";
import { resolveDocPath, resolveFilePath } from "@/lib/docPath";
import {
  extractLinks,
  resolveLinkTarget,
  type ExtractedLink,
} from "@/lib/pageLinks";
import { walkPages } from "@/lib/walkPages";

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
 * ルートURLは /index へのリダイレクトなので、常に存在するものとして扱う
 */
async function isBroken(
  pageDir: string[],
  url: string,
  existsCache: Map<string, boolean>,
): Promise<boolean> {
  const target = resolveLinkTarget(pageDir, url);
  if (target === "skip" || target === "root") return false;
  if (target === "broken") return true;

  const key = target.join("/");
  let exists = existsCache.get(key);
  if (exists === undefined) {
    exists = await targetExists(target);
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
