"use server";

/**
 * ファイル先頭の "use server" が Server Action の目印です。
 *
 * このファイルにある関数は「サーバー上でだけ実行されるコード」として扱われます。
 * ブラウザ（Client Component）側からは、これらの関数を普通の async 関数のように
 * import して呼び出せますが、実際には裏側で自動的に HTTP リクエスト（POST）が
 * 飛んでいて、この関数の中身はサーバー上でしか実行されません。
 * ファイル操作（fs）のような Node.js の機能は、まさにこの中でしか使えません。
 *
 * 重要な注意点として、Server Action は「実質的には誰でも直接 POST できる
 * エンドポイント」でもあります。ブラウザから渡された slug をそのまま信用せず、
 * この中で resolveDocPath による検証をやり直しています。
 */

import { revalidatePath } from "next/cache";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveDocPath, slugToUrlPath } from "@/lib/docPath";
import { markdownToHtml } from "@/lib/markdown";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type SaveResult =
  | { ok: true; html: string }
  | { ok: false; message: string };

/**
 * 指定した slug の文書をマークダウンとして保存（新規作成 or 上書き）します。
 * 保存に成功した場合、表示モードにそのまま反映できるよう変換済みの HTML も返します。
 */
export async function saveDocument(
  slug: string[],
  markdown: string,
): Promise<SaveResult> {
  const filePath = resolveDocPath(slug);
  if (!filePath) {
    return { ok: false, message: "不正な保存先です。" };
  }

  try {
    // ディレクトリがまだ無い場合に備えて作成しておきます。
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, markdown, "utf-8");
  } catch (error) {
    return { ok: false, message: `保存に失敗しました: ${String(error)}` };
  }

  // このパスに対して Next.js がキャッシュしているレンダリング結果を破棄します。
  // これをしないと、次にこのURLへアクセスしたときに古い内容が表示されてしまいます。
  revalidatePath(slugToUrlPath(slug));

  const html = await markdownToHtml(markdown);
  return { ok: true, html };
}

/** 指定した slug の文書ファイルを削除します。ファイルが元々無い場合も成功扱いにします。 */
export async function deleteDocument(slug: string[]): Promise<ActionResult> {
  const filePath = resolveDocPath(slug);
  if (!filePath) {
    return { ok: false, message: "不正な削除対象です。" };
  }

  try {
    await unlink(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      return { ok: false, message: `削除に失敗しました: ${String(error)}` };
    }
  }

  revalidatePath(slugToUrlPath(slug));

  return { ok: true };
}
