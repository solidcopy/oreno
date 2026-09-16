import { readFile } from "node:fs/promises";
import { resolveDocPath } from "@/lib/docPath";

export type LoadedDocument = { exists: boolean; markdown: string };

/**
 * 指定した slug のマークダウンファイルを読み込みます。
 * ファイルが存在しない場合はエラーにせず exists: false を返します
 * （README の「ページの新規作成」の判定に使うためです）。
 *
 * これは "use server" のついた Server Action ではなく、ただの通常の関数です。
 * Server Component（page.tsx）から直接呼び出すだけなので、
 * わざわざ HTTP 越しの呼び出しにする必要が無いためこの形にしています。
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
