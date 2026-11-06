import { hasDotSegment } from "@/lib/dotPath";

/**
 * URL の1セグメントとして許可しない文字
 * README にある「ファイルパスの指定で特別な意味のある記号」に相当する
 * さらに Windows でも安全なように : \ も禁止している
 *
 * docPath.ts と違い node:path に依存しないため、Client Component からも安全にimportできる
 */
export const INVALID_SEGMENT_CHARS = /[*?[\]{}/\\:]/;

/**
 * 入力されたフォルダのパスを、"/" から始まり末尾に "/" を付けない絶対形式（例: "/images"）に整える
 * 使えないパス（空、"//" のような空の名前を含む、"." から始まる名前を含む、特殊記号を含む）の場合は null を返す
 * 前後の空白と、先頭・末尾の "/" 1つは取り除く（"images" や "/images/" も "/images" になる）
 */
export function normalizeFolderPath(input: string): string | null {
  let folder = input.trim();
  if (folder.startsWith("/")) folder = folder.slice(1);
  if (folder.endsWith("/")) folder = folder.slice(0, -1);

  // 空の文字列（"/" だけの入力を含む）や "//" は、空の名前のセグメントになる
  const segments = folder.split("/");
  if (segments.some((segment) => segment === "")) return null;
  if (hasDotSegment(segments)) return null;
  if (segments.some((segment) => INVALID_SEGMENT_CHARS.test(segment))) return null;
  return "/" + segments.join("/");
}

/**
 * ファイルの一覧（文書ルートからの相対パス）から、フォルダの一覧を作る
 * "docs/guide/a.md" なら "docs" と "docs/guide" の両方を含める
 */
export function listFolders(files: string[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const segments = file.split("/").slice(0, -1);
    for (let i = 1; i <= segments.length; i++) {
      folders.add(segments.slice(0, i).join("/"));
    }
  }
  return [...folders];
}
