import { readdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir, resolveDocPath } from "@/lib/docPath";
import type { OrderSetting } from "@/lib/userSettings";

/**
 * 文書ルート以下のフォルダの中身（サブフォルダとページ）を調べるモジュール
 * サイドバーの「ページ」の一覧に使う
 */

export type FolderEntry = {
  kind: "folder" | "page";
  // フォルダ名、またはページ名（拡張子 ".md" は含まない）
  name: string;
};

// フォルダの中身。並び順はユーザー設定の order に従う
export type FolderEntries = FolderEntry[];

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
 * folder のフォルダにあるサブフォルダとページを、order の並び順で返す
 * フォルダが存在しない場合（新規作成前のページのフォルダなど）や不正なパスの場合は、
 * エラーにせず空の一覧を返す
 * "." から始まる名前（.git や .oreno など）と、Markdown以外のファイルは無視する
 */
export async function listFolder(
  folder: string[],
  order: OrderSetting,
): Promise<FolderEntries> {
  const folderPath = resolveFolderPath(folder);
  if (!folderPath) return [];

  let dirents;
  try {
    dirents = await readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      return [];
    }
    throw error;
  }

  const entries: FolderEntries = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue;

    if (dirent.isDirectory()) {
      entries.push({ kind: "folder", name: dirent.name });
    } else if (dirent.isFile() && dirent.name.endsWith(".md")) {
      const name = dirent.name.slice(0, -".md".length);
      // URL にできない名前（"*" を含むなど）のページは、開けないので一覧に出さない
      if (name !== "" && resolveDocPath([...folder, name])) {
        entries.push({ kind: "page", name });
      }
    }
  }

  return entries.sort(compareByOrder(order));
}

/**
 * 名前の昇順（日本語の照合順）で比較する
 */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "ja");
}

/**
 * 同じフォルダに並ぶ項目同士の並び順を決める比較関数を、order から作る
 * by-name: フォルダとページを区別せず名前の昇順（同名ならフォルダが先）
 * folders-first / pages-first: 先にする種類を前に置き、それぞれ名前の昇順
 */
function compareByOrder(
  order: OrderSetting,
): (a: FolderEntry, b: FolderEntry) => number {
  // 種類の順位。小さいほど前に並ぶ
  const kindRank = (kind: FolderEntry["kind"]) =>
    (kind === "folder") === (order !== "pages-first") ? 0 : 1;

  return (a, b) => {
    if (order === "by-name") {
      return compareNames(a.name, b.name) || kindRank(a.kind) - kindRank(b.kind);
    }
    return kindRank(a.kind) - kindRank(b.kind) || compareNames(a.name, b.name);
  };
}

/**
 * 「すべてのページ」のツリーの1項目
 * path は文書ルートからのセグメントの配列で、ページならURL（"/" 区切り）にそのまま使える
 */
export type TreeNode =
  | { kind: "folder"; name: string; path: string[]; children: TreeNode[] }
  | { kind: "page"; name: string; path: string[] };

/**
 * 文書ルート以下のすべてのフォルダとページをツリーにして返す（ルート直下の項目の配列）
 * 各フォルダの中身は listFolder で調べるので、無視するファイルや名前の扱いはサイドバーと同じ
 * 並び順は order で決まり、すべての階層に同じルールを適用する
 */
export async function listAllPages(
  order: OrderSetting,
  folder: string[] = [],
): Promise<TreeNode[]> {
  const entries = await listFolder(folder, order);

  const nodes: TreeNode[] = [];
  for (const { kind, name } of entries) {
    const path = [...folder, name];
    if (kind === "folder") {
      nodes.push({
        kind,
        name,
        path,
        children: await listAllPages(order, path),
      });
    } else {
      nodes.push({ kind, name, path });
    }
  }
  return nodes;
}
