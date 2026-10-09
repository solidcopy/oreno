"use server";

/**
 * ファイル先頭の "use server" が Server Action の目印
 *
 * このファイルにある関数は「サーバー上でだけ実行されるコード」として扱われる
 * ブラウザ（Client Component）側からは、これらの関数を普通の async 関数のように
 * import して呼び出せるが、実際には裏側で自動的に HTTP リクエスト（POST）が
 * 飛んでいて、この関数の中身はサーバー上でしか実行されない
 * ファイル操作（fs）のような Node.js の機能は、まさにこの中でしか使えない
 *
 * 重要な注意点として、Server Action は「実質的には誰でも直接 POST できる
 * エンドポイント」でもある
 * ブラウザから渡された slug をそのまま信用せず、
 * この中で resolveDocPath による検証をやり直している
 */

import { revalidatePath } from "next/cache";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveDocPath, slugToUrlPath } from "@/lib/docPath";
import { documentExists } from "@/lib/document";
import { listFolder, type FolderEntries } from "@/lib/folder";
import { markdownToHtml } from "@/lib/markdown";
import {
  addViewHistory,
  setPageStarred,
  setShowPages,
  setShowHistories,
  setShowSidebar,
  setShowStarredPages,
  setShowToc,
  setSidebarWidth,
  loadOrderSetting,
} from "@/lib/userSettings";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type SaveResult =
  | { ok: true; html: string }
  | { ok: false; message: string };

/**
 * 指定した slug の文書をマークダウンとして保存（新規作成 or 上書き）する
 * 保存に成功した場合、表示モードにそのまま反映できるよう変換済みの HTML も返す
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
    // ディレクトリがまだ無い場合に備えて作成しておく
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, markdown, "utf-8");
  } catch (error) {
    return { ok: false, message: `保存に失敗しました: ${String(error)}` };
  }

  // このパスに対して Next.js がキャッシュしているレンダリング結果を破棄する
  // これをしないと、次にこのURLへアクセスしたときに古い内容が表示されてしまう
  revalidatePath(slugToUrlPath(slug));

  const html = await markdownToHtml(markdown);
  return { ok: true, html };
}

/**
 * 指定した slug のファイルがすでに存在するかどうかを調べる
 * 「新規作成」ポップアップで、既存ファイルを上書きしてしまわないように使う
 */
export async function checkDocumentExists(slug: string[]): Promise<boolean> {
  return documentExists(slug);
}

/**
 * 指定した slug の文書ファイルを削除する
 * ファイルが元々無い場合も成功扱いにする
 */
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

/**
 * 指定した slug のページを閲覧履歴の先頭に記録する
 * 履歴はサイドバーの「履歴」に表示する
 * 履歴の記録に失敗しても文書の表示には影響させたくないため、失敗は無視する
 */
export async function recordViewHistory(slug: string[]): Promise<void> {
  // 不正なパスや ".oreno" 配下は記録しない
  if (!resolveDocPath(slug)) return;

  try {
    await addViewHistory(slugToUrlPath(slug));
  } catch {
    // 無視する
    return;
  }

  // サイドバーの「履歴」は全ページ共通の表示なので、
  // すべてのページのキャッシュを破棄する
  // これを呼ばないと、サイドバーにたった今開いたページが反映されず、
  // 戻る/進むでも古い履歴が表示される
  revalidatePath("/", "layout");
}

/**
 * 指定した slug のページのスター付きの状態を設定する
 * 保存できた場合は ok: true を返す
 */
export async function setStarred(
  slug: string[],
  starred: boolean,
): Promise<ActionResult> {
  if (!resolveDocPath(slug)) {
    return { ok: false, message: "不正なページです。" };
  }

  try {
    await setPageStarred(slugToUrlPath(slug), starred);
  } catch (error) {
    return { ok: false, message: `スターの更新に失敗しました: ${String(error)}` };
  }

  // ブラウザ側には、移動前に取得した描画結果（スター無しの状態）がキャッシュされている
  // これを破棄しないと、ブラウザの戻るボタンで戻ったときに古いスターの状態が表示される
  revalidatePath(slugToUrlPath(slug));

  return { ok: true };
}

/**
 * サイドバーの「スター付き」の一覧を開いているかどうかを保存する
 * 保存できた場合は ok: true を返す
 */
export async function setShowStarredPagesSetting(
  show: boolean,
): Promise<ActionResult> {
  try {
    await setShowStarredPages(show);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  // これを呼ばないと、戻る/進むで以前の開閉の状態が表示される
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * サイドバーを表示するかどうかを保存する
 * 保存できた場合は ok: true を返す
 */
export async function setShowSidebarSetting(
  show: boolean,
): Promise<ActionResult> {
  try {
    await setShowSidebar(show);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  // これを呼ばないと、戻る/進むで以前の表示の状態になる
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * サイドバーの「履歴」の一覧を開いているかどうかを保存する
 * 保存できた場合は ok: true を返す
 */
export async function setShowHistoriesSetting(
  show: boolean,
): Promise<ActionResult> {
  try {
    await setShowHistories(show);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  // これを呼ばないと、戻る/進むで以前の開閉の状態が表示される
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * サイドバーの「ページ」の一覧を開いているかどうかを保存する
 * 保存できた場合は ok: true を返す
 */
export async function setShowPagesSetting(
  show: boolean,
): Promise<ActionResult> {
  try {
    await setShowPages(show);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  // これを呼ばないと、戻る/進むで以前の開閉の状態が表示される
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * サイドバーの「目次」の一覧を開いているかどうかを保存する
 * 保存できた場合は ok: true を返す
 */
export async function setShowTocSetting(
  show: boolean,
): Promise<ActionResult> {
  try {
    await setShowToc(show);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  // これを呼ばないと、戻る/進むで以前の開閉の状態が表示される
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * サイドバーの幅（px）を保存する
 * 保存できた場合は ok: true を返す
 */
export async function setSidebarWidthSetting(
  width: number,
): Promise<ActionResult> {
  // Server Action は直接呼べるため、数値かどうかを検証し直す
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return { ok: false, message: "不正な幅です。" };
  }

  try {
    await setSidebarWidth(width);
  } catch (error) {
    return { ok: false, message: `設定の保存に失敗しました: ${String(error)}` };
  }

  // サイドバーは全ページ共通の表示なので、すべてのページのキャッシュを破棄する
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * 指定したフォルダの中にあるサブフォルダとページの一覧を返す
 * サイドバーの「ページ」で、フォルダをクリックしたときに呼ばれる
 * folder は文書ルートからのフォルダのパス（空配列ならルート）
 * 渡された folder を信用せず、listFolder の中で検証し直している
 */
export async function loadFolderEntries(
  folder: string[],
): Promise<
  { ok: true; entries: FolderEntries } | { ok: false; message: string }
> {
  try {
    const order = await loadOrderSetting();
    return { ok: true, entries: await listFolder(folder, order) };
  } catch (error) {
    return { ok: false, message: `一覧の取得に失敗しました: ${String(error)}` };
  }
}
