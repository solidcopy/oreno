import { INVALID_SEGMENT_CHARS } from "@/lib/folderPath";
import { isImageFile } from "@/lib/imageFile";

/**
 * 画像インポートで入力された画像パスを扱うモジュール
 * node:fs に依存しないため、Client Component（画像インポートモーダル）からも安全にimportできる
 */

export type ResolveImagePathResult =
  | { ok: true; slug: string[] }
  | { ok: false; message: string };

/**
 * 画像パスの入力を、文書ルートからのファイルのパス（セグメントの配列）に解決する
 * "/" から始まる絶対形式は文書ルート、それ以外はページのフォルダを基準にする
 * "." と ".." は解決する。文書セットの外を指すもの、使えないパス、画像でないファイルはエラーにする
 *
 * pageSlug は、画像を挿入するページの slug（ページのフォルダは、その末尾を除いたもの）
 */
export function resolveImagePath(
  pageSlug: string[],
  input: string,
): ResolveImagePathResult {
  const path = input.trim();
  if (path === "") {
    return { ok: false, message: "画像パスを入力してください。" };
  }

  const absolute = path.startsWith("/");
  const segments = (absolute ? path.slice(1) : path).split("/");
  const slug = absolute ? [] : pageSlug.slice(0, -1);

  for (const segment of segments) {
    if (segment === "") {
      return { ok: false, message: "画像パスの形式が正しくありません。" };
    }
    if (segment === ".") continue;
    if (segment === "..") {
      if (slug.length === 0) {
        return { ok: false, message: "文書セットの外は指定できません。" };
      }
      slug.pop();
      continue;
    }
    if (segment.startsWith(".")) {
      return { ok: false, message: "「.」から始まる名前は使えません。" };
    }
    if (INVALID_SEGMENT_CHARS.test(segment)) {
      return { ok: false, message: "使えない文字が含まれています。" };
    }
    slug.push(segment);
  }

  // 最後の名前が、画像ファイルの名前（拡張子が画像のもの）でなければならない
  // "." や ".." で終わるパスは、フォルダを指すのでここで弾かれる
  if (slug.length === 0 || !isImageFile(slug[slug.length - 1])) {
    return {
      ok: false,
      message: "画像ファイルの拡張子（.png など）が必要です。",
    };
  }
  return { ok: true, slug };
}

/**
 * Markdownに書く画像パスを作る
 * 入力された画像パスの、ファイル名などの各セグメントのうち、ASCIIの記号だけをURLエンコードする
 * 日本語などのASCII以外の文字はエンコードしない
 * "." と ".."、パスの区切りの "/" はそのまま残す
 */
export function encodeImageSrc(input: string): string {
  return input
    .trim()
    .split("/")
    .map((segment) =>
      segment === "" || segment === "." || segment === ".."
        ? segment
        : // Array.from でコードポイントごとに分けて、ASCII以外はそのまま残す
          Array.from(segment, (c) =>
            c.charCodeAt(0) > 0x7f
              ? c
              : // encodeURIComponent は ( ) をエンコードしないが、Markdownの記法と紛らわしいので足す
                encodeURIComponent(c).replace(
                  /[()]/g,
                  (p) => "%" + p.charCodeAt(0).toString(16).toUpperCase(),
                ),
          ).join(""),
    )
    .join("/");
}

/**
 * ページのフォルダを、"/" から始まる絶対形式で返す（文書ルート直下のページは空文字）
 */
export function pageFolderPath(pageSlug: string[]): string {
  return pageSlug
    .slice(0, -1)
    .map((segment) => "/" + segment)
    .join("");
}

/**
 * 日付から、年月日時分秒を連結した数字だけのタイムスタンプ（例: "20261106153045"）を作る
 * 時刻は、実行している環境のタイムゾーンで表す
 */
export function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/**
 * ファイル名の拡張子の前に、"_" で区切ってタイムスタンプを付ける
 * 例: "photo.png" → "photo_20261106153045.png"
 */
export function appendTimestampToFileName(
  fileName: string,
  timestamp: string,
): string {
  const dot = fileName.lastIndexOf(".");
  // 先頭の "." だけの名前（拡張子のない隠しファイル）は、末尾に付ける
  if (dot <= 0) return `${fileName}_${timestamp}`;
  return `${fileName.slice(0, dot)}_${timestamp}${fileName.slice(dot)}`;
}
