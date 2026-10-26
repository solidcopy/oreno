import fs from "node:fs";
import path from "node:path";
import { hasDotSegment } from "@/lib/dotPath";

/**
 * URL のパス部分（例: "/docs/hello" の "docs", "hello"）を
 * 環境変数 ORENO_ROOT を起点とした実ファイルパスに変換するモジュール
 *
 * README.md の「ファイルとURLの対応」に書かれているルールをここに集約し、
 * ページ表示・保存・削除のすべてがこの関数を通るようにする
 * こうしておくと、パスの安全性チェック（あとで説明する）を一箇所にまとめられる
 */

/**
 * URL の1セグメントとして許可しない文字
 * README にある「ファイルパスの指定で特別な意味のある記号」に相当する
 * さらに Windows でも安全なように : \ も禁止している
 */
const INVALID_SEGMENT_CHARS = /[*?[\]{}/\\:]/;

/**
 * 環境変数 ORENO_ROOT からドキュメントのルートディレクトリを取得する
 * 設定済みであることはサーバー起動時に assertRootDirExists で確認済みなので、ここでは確認しない
 */
export function getRootDir(): string {
  return path.resolve(process.env.ORENO_ROOT!);
}

/**
 * ORENO_ROOT が設定済みで、指定されたフォルダが存在することを確かめる
 * 満たしていなければ例外を投げる（サーバー起動時のチェックに使う）
 */
export function assertRootDirExists(): void {
  const root = process.env.ORENO_ROOT;
  if (!root) {
    throw new Error(
      "環境変数 ORENO_ROOT が設定されていません。文書ファイルのルートディレクトリを指定してください。",
    );
  }
  const rootDir = path.resolve(root);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(
      `環境変数 ORENO_ROOT で指定されたフォルダが存在しません: ${rootDir}`,
    );
  }
}

/**
 * 文書のルートフォルダ（index.md が置かれているフォルダ）の名前を返す
 * ヘッダーのルートリンクの表示文字列などに使う
 */
export function getRootDirName(): string {
  return path.basename(getRootDir());
}

/**
 * URL の slug（catch-all セグメントの配列）を、対応するマークダウンファイルの
 * 絶対パスに変換する
 *
 * 不正な slug（空配列、"." から始まるセグメントを含む、特殊記号を含む、ルートディレクトリの外を指す等）
 * の場合は null を返す
 * 呼び出し側はこれを 404 扱いにすること
 */
export function resolveDocPath(slug: string[]): string | null {
  const resolved = resolveUnderRoot(slug);
  return resolved && resolved + ".md";
}

/**
 * URL の slug を、文書ルート以下にある任意のファイルの絶対パスに変換する
 * 拡張子付きのURL（/image.png など）で、Markdown以外のファイルをそのまま返すために使う
 *
 * 検証は resolveDocPath と同じ
 * 不正な場合は null を返す
 */
export function resolveFilePath(slug: string[]): string | null {
  return resolveUnderRoot(slug);
}

/**
 * slug を検証し、文書ルート以下の絶対パス（拡張子なし）に変換する
 * resolveDocPath と resolveFilePath に共通する検証をここに集約している
 */
function resolveUnderRoot(slug: string[]): string | null {
  if (slug.length === 0) {
    // ルートURL（"/"）は [...slug] にマッチしないため実際には呼ばれないが、
    // 念のため空配列もファイルパスを決められないものとして扱う
    return null;
  }

  if (hasDotSegment(slug)) {
    // "." から始まるセグメントを含むパス（.git や、Oreno自身の機能用の .oreno など）は
    // 対応するファイルがあったとしても存在しないものとして扱う
    return null;
  }

  for (const segment of slug) {
    if (segment.length === 0) return null;
    if (INVALID_SEGMENT_CHARS.test(segment)) return null;
  }

  const root = getRootDir();
  const filePath = path.join(root, ...slug);

  // path.join の時点で ".." は正規化されてしまうが、念のため
  // 「解決後のパスが root の外に出ていないか」を二重にチェックする
  const resolved = path.resolve(filePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

/**
 * slug からブラウザに表示する URL パス（例: "/docs/hello"）を組み立てる
 * revalidatePath などに渡すために使う
 */
export function slugToUrlPath(slug: string[]): string {
  return "/" + slug.join("/");
}
