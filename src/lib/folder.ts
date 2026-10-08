import { readdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir, resolveDocPath } from "@/lib/docPath";

/**
 * 文書ルート以下のフォルダの中身（サブフォルダとページ）を調べるモジュール
 * サイドバーの「ページ」の一覧に使う
 */

export type FolderEntries = {
  // サブフォルダの名前（昇順）
  folders: string[];
  // ページの名前。拡張子 ".md" は含まない（昇順）
  pages: string[];
};

/**
 * フォルダのパス（文書ルートからのセグメントの配列）を、実フォルダの絶対パスに変換する
 * 空配列は文書ルート自身を表す
 * 不正なパス（".." を含む、".oreno" 配下、特殊記号を含む等）は null を返す
 *
 * 検証のルールを docPath.ts から複製しないよう、末尾に仮のページ名を付けて
 * resolveDocPath に検証させ、その結果から仮のページ名を取り除いている
 */
function resolveFolderPath(folder: string[]): string | null {
  if (folder.length === 0) return getRootDir();
  const filePath = resolveDocPath([...folder, "_"]);
  return filePath && path.dirname(filePath);
}

/**
 * folder のフォルダにあるサブフォルダとページを返す
 * フォルダが存在しない場合（新規作成前のページのフォルダなど）や不正なパスの場合は、
 * エラーにせず空の一覧を返す
 * "." から始まる名前（.git や .oreno など）と、Markdown以外のファイルは無視する
 */
export async function listFolder(folder: string[]): Promise<FolderEntries> {
  const folderPath = resolveFolderPath(folder);
  if (!folderPath) return { folders: [], pages: [] };

  let dirents;
  try {
    dirents = await readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      return { folders: [], pages: [] };
    }
    throw error;
  }

  const folders: string[] = [];
  const pages: string[] = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue;

    if (dirent.isDirectory()) {
      folders.push(dirent.name);
    } else if (dirent.isFile() && dirent.name.endsWith(".md")) {
      const name = dirent.name.slice(0, -".md".length);
      // URL にできない名前（"*" を含むなど）のページは、開けないので一覧に出さない
      if (name !== "" && resolveDocPath([...folder, name])) {
        pages.push(name);
      }
    }
  }

  return { folders: folders.sort(compareNames), pages: pages.sort(compareNames) };
}

/**
 * 名前の昇順（日本語の照合順）で比較する
 */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "ja");
}

/**
 * 「すべてのページ」のツリーの1項目
 * path は文書ルートからのセグメントの配列で、ページならURL（"/" 区切り）にそのまま使える
 */
export type TreeNode =
  | { kind: "folder"; name: string; path: string[]; children: TreeNode[] }
  | { kind: "page"; name: string; path: string[] };

/**
 * 同じフォルダに並ぶ項目同士の並び順を決める比較関数
 * フォルダ先・ページ先のような並びを選べるようにするときは、
 * この型の関数を差し替えて listAllPages に渡す
 */
export type TreeNodeComparator = (a: TreeNode, b: TreeNode) => number;

/**
 * フォルダとページを区別せず、名前の昇順に並べる
 */
export const compareByName: TreeNodeComparator = (a, b) =>
  compareNames(a.name, b.name);

/**
 * 文書ルート以下のすべてのフォルダとページをツリーにして返す（ルート直下の項目の配列）
 * 各フォルダの中身は listFolder で調べるので、無視するファイルや名前の扱いはサイドバーと同じ
 * 並び順は compare で決まる
 */
export async function listAllPages(
  compare: TreeNodeComparator = compareByName,
  folder: string[] = [],
): Promise<TreeNode[]> {
  const { folders, pages } = await listFolder(folder);

  const nodes: TreeNode[] = [];
  for (const name of folders) {
    const path = [...folder, name];
    nodes.push({
      kind: "folder",
      name,
      path,
      children: await listAllPages(compare, path),
    });
  }
  for (const name of pages) {
    nodes.push({ kind: "page", name, path: [...folder, name] });
  }
  return nodes.sort(compare);
}
