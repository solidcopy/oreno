import path from "node:path";

/**
 * URL のパス部分（例: "/docs/hello" の "docs", "hello"）を
 * 環境変数 ORENO_ROOT を起点とした実ファイルパスに変換するモジュールです。
 *
 * README.md の「ファイルとURLの対応」に書かれているルールをここに集約し、
 * ページ表示・保存・削除のすべてがこの関数を通るようにします。
 * こうしておくと、パスの安全性チェック（あとで説明します）を一箇所にまとめられます。
 */

/**
 * URL の1セグメントとして許可しない文字。
 * README にある「ファイルパスの指定で特別な意味のある記号」に相当します。
 * さらに Windows でも安全なように : \ も禁止しています。
 */
const INVALID_SEGMENT_CHARS = /[*?[\]{}/\\:]/;

/**
 * 環境変数 ORENO_ROOT からドキュメントのルートディレクトリを取得します。
 * 未設定の場合はアプリの設定ミスなので、呼び出し側で catch させず例外を投げます。
 */
export function getRootDir(): string {
  const root = process.env.ORENO_ROOT;
  if (!root) {
    throw new Error(
      "環境変数 ORENO_ROOT が設定されていません。文書ファイルのルートディレクトリを指定してください。",
    );
  }
  return path.resolve(root);
}

/**
 * URL の slug（catch-all セグメントの配列）を、対応するマークダウンファイルの
 * 絶対パスに変換します。
 *
 * 不正な slug（空配列、"." や ".." を含む、特殊記号を含む、ルートディレクトリの外を指す等）
 * の場合は null を返します。呼び出し側はこれを 404 扱いにしてください。
 */
export function resolveDocPath(slug: string[]): string | null {
  if (slug.length === 0) {
    // README: "/" へのアクセスはファイルパスを決められないので 404
    return null;
  }

  for (const segment of slug) {
    if (segment.length === 0) return null;
    if (segment === "." || segment === "..") return null;
    if (INVALID_SEGMENT_CHARS.test(segment)) return null;
  }

  const root = getRootDir();
  const filePath = path.join(root, ...slug) + ".md";

  // path.join の時点で ".." は正規化されてしまいますが、念のため
  // 「解決後のパスが root の外に出ていないか」を二重にチェックします。
  const resolved = path.resolve(filePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

/**
 * slug からブラウザに表示する URL パス（例: "/docs/hello"）を組み立てます。
 * revalidatePath などに渡すために使います。
 */
export function slugToUrlPath(slug: string[]): string {
  return "/" + slug.join("/");
}
