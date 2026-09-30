import { access, readFile } from "node:fs/promises";
import { resolveDocPath } from "@/lib/docPath";

export type LoadedDocument = { exists: boolean; markdown: string };

/**
 * 指定した slug のマークダウンファイルを読み込む
 * ファイルが存在しない場合はエラーにせず exists: false を返す
 * （README の「ページの新規作成」の判定に使うため）
 *
 * これは "use server" のついた Server Action ではなく、ただの通常の関数
 * Server Component（page.tsx）から直接呼び出すだけなので、
 * わざわざ HTTP 越しの呼び出しにする必要が無いためこの形にしている
 */
export async function loadDocument(slug: string[]): Promise<LoadedDocument> {
  const filePath = resolveDocPath(slug);
  if (!filePath) {
    return { exists: false, markdown: "" };
  }

  try {
    const markdown = await readFile(filePath, "utf-8");
    return { exists: true, markdown };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { exists: false, markdown: "" };
    }
    throw error;
  }
}

/**
 * 指定した slug のマークダウンファイルが存在するかどうかだけを調べる
 * 「新規作成」時の重複チェックに使うため、loadDocument と違い
 * ファイルの中身までは読み込まない（access はファイルの中身を読まないので軽い）
 */
export async function documentExists(slug: string[]): Promise<boolean> {
  const filePath = resolveDocPath(slug);
  if (!filePath) {
    return false;
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
