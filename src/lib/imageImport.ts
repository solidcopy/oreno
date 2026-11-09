import { stat } from "node:fs/promises";
import { resolveFilePath } from "@/lib/docPath";
import {
  appendTimestampToFileName,
  formatTimestamp,
  pageFolderPath,
  resolveImagePath,
} from "@/lib/imagePath";
import { loadProjectSettings } from "@/lib/projectSettings";
import { loadImageImportSettings } from "@/lib/userSettings";

/**
 * 画像インポートのうち、サーバー側で行う処理をまとめるモジュール
 * ブラウザ側からも使うパスの処理は imagePath.ts にある
 */

/**
 * 画像パスの入力に対応するファイルが、すでに存在するかどうかを調べる
 * 使えないパスのときは、存在しないものとして扱う
 */
export async function imageFileExists(
  pageSlug: string[],
  input: string,
): Promise<boolean> {
  const resolved = resolveImagePath(pageSlug, input);
  if (!resolved.ok) return false;
  const filePath = resolveFilePath(resolved.slug);
  if (!filePath) return false;

  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export type ImageImportContext = {
  /** ドロップ時に画像インポートモーダルを表示するか */
  useModal: boolean;
  /** 画像パスの初期入力（デフォルトフォルダとファイル名をつないだもの。"/" から始まる絶対形式） */
  initialPath: string;
  /** ページのフォルダ（"/" から始まる絶対形式。文書ルート直下のページは空文字） */
  pageFolder: string;
  /** プロジェクト設定の画像フォルダ一覧 */
  imageFolders: string[];
};

/**
 * ドロップされた画像のインポートを始めるために必要な情報を集める
 * 画像パスの初期入力は、ユーザー設定のデフォルトフォルダ（空ならページのフォルダ）と
 * ファイル名をつないだものにする
 * 同じ名前のファイルがすでにあり、設定が「タイムスタンプを付与する」のときは、
 * ファイル名の後ろにタイムスタンプを付ける（時刻はサーバーのタイムゾーン）
 */
export async function prepareImageImport(
  pageSlug: string[],
  fileName: string,
): Promise<ImageImportContext> {
  const settings = await loadImageImportSettings();
  const { imageFolders } = await loadProjectSettings();
  const pageFolder = pageFolderPath(pageSlug);
  const folder = settings.defaultFolder || pageFolder;

  let initialPath = `${folder}/${fileName}`;
  if (
    settings.handleSameFilename === "append-timestamp" &&
    (await imageFileExists(pageSlug, initialPath))
  ) {
    const name = appendTimestampToFileName(fileName, formatTimestamp(new Date()));
    initialPath = `${folder}/${name}`;
  }

  return {
    useModal: settings.useModal,
    initialPath,
    pageFolder,
    imageFolders,
  };
}
