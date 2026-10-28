import { readdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir, resolveDocPath } from "@/lib/docPath";

/**
 * 文書ルート以下のページを走査するモジュール
 * ファイル一覧（fileIndex）は使わず、呼ばれるたびにフォルダを辿る
 */

/**
 * folder 以下のページを、見付けた順にスラッグ（文書ルートからのセグメントの配列）で返す
 * "." から始まる名前と、Markdown以外のファイルは無視する
 */
export async function* walkPages(
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
