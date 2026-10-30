import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir } from "@/lib/docPath";
import { SIDEBAR_WIDTH_DEFAULT, clampSidebarWidth } from "@/lib/sidebarWidth";

/**
 * ユーザー設定（(文書フォルダのルート)/.oreno/user-settings.json）のうち、
 * 閲覧履歴（view-histories）とスター付きページ（starred-pages）の
 * 読み込み・更新をまとめるモジュール
 * 閲覧履歴は、後にアクセスしたものほど先頭に並ぶ
 *
 * 将来ほかのキーが増えても消えないよう、保存時は既存のJSONを読み込んで
 * 更新するキーだけを差し替えている
 */

type UserSettingsFile = Record<string, unknown>;

function getUserSettingsPath(): string {
  return path.join(getRootDir(), ".oreno", "user-settings.json");
}

/**
 * ファイルの内容をJSONオブジェクトとして読み込む
 * ファイルが無い場合、JSONオブジェクトとして解析できない場合は、
 * どちらも未設定扱いとして空のオブジェクトを返す
 */
async function readUserSettingsFile(): Promise<UserSettingsFile> {
  let raw: string;
  try {
    raw = await readFile(getUserSettingsPath(), "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return data as UserSettingsFile;
    }
  } catch {
    // 解析できない場合は未設定扱い
  }
  return {};
}

/**
 * 設定値を文字列の配列として取り出す
 * 配列でない場合は空配列、文字列以外の要素は取り除く
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// 読み込み→書き込みの途中で別の記録が割り込むと履歴が欠けるため、
// 記録処理は1つずつ順番に実行する
let queue: Promise<void> = Promise.resolve();

/**
 * ユーザー設定ファイルを「読み込み → 変更 → 書き込み」で更新する共通処理
 * mutate には、読み込んだ設定を受け取って、変更したい箇所だけ書き換える関数を渡す
 * mutate は、設定を変更したら true、変更しなかったら false を返す
 * false の場合は書き込まない
 */
function updateUserSettings(
  mutate: (data: UserSettingsFile) => boolean,
): Promise<void> {
  const task = queue.then(async () => {
    const data = await readUserSettingsFile();
    if (!mutate(data)) return;

    const filePath = getUserSettingsPath();

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  });
  // 失敗しても後続の記録を止めないようにする
  queue = task.catch(() => {});
  return task;
}

// 閲覧履歴として保存する最大件数
const VIEW_HISTORIES_MAX = 20;

/**
 * 閲覧履歴の先頭に urlPath（例: "/spec/entities"）を追加する
 * すでに履歴にあるパスは、元の位置から取り除いて先頭へ移動する
 * 最大件数を超えた分は、古いものから削除する
 * 文書の保存と同様、ここでは git commit は行わない
 */
export function addViewHistory(urlPath: string): Promise<void> {
  return updateUserSettings((data) => {
    const histories = toStringArray(data["view-histories"]);
    data["view-histories"] = [
      urlPath,
      ...histories.filter((h) => h !== urlPath),
    ].slice(0, VIEW_HISTORIES_MAX);
    return true;
  });
}

/**
 * 閲覧履歴（新しい順のURLパス）をすべて返す
 * 文字列以外の要素が混ざっていた場合は取り除く
 */
export async function loadViewHistories(): Promise<string[]> {
  const data = await readUserSettingsFile();
  return toStringArray(data["view-histories"]);
}

/**
 * 保存済みのスター付きページ（URLパス）を返す
 * 文字列以外の要素が混ざっていた場合は取り除く
 */
export async function loadStarredPages(): Promise<string[]> {
  const data = await readUserSettingsFile();
  return toStringArray(data["starred-pages"]);
}

/**
 * urlPath のスター付きの状態を設定する
 * すでに同じ状態であれば何も書き込まない
 * 閲覧履歴の記録と同じキューに載せて、更新が同時に走らないようにしている
 */
export function setPageStarred(
  urlPath: string,
  starred: boolean,
): Promise<void> {
  return updateUserSettings((data) => {
    const pages = toStringArray(data["starred-pages"]);
    if (pages.includes(urlPath) === starred) return false;

    data["starred-pages"] = starred
      ? [...pages, urlPath]
      : pages.filter((p) => p !== urlPath);
    return true;
  });
}

/**
 * 閲覧履歴とスター付きページに記録されている fromUrlPath を toUrlPath に置き換える
 * ページを移動したときに、履歴とスターが移動先のページを指すようにするために使う
 * 移動先がすでに記録されていた場合は、重複しないよう先に現れた方だけを残す
 * どちらにも fromUrlPath が無ければ何も書き込まない
 */
export function renamePageInSettings(
  fromUrlPath: string,
  toUrlPath: string,
): Promise<void> {
  return updateUserSettings((data) => {
    let changed = false;
    for (const key of ["view-histories", "starred-pages"]) {
      const pages = toStringArray(data[key]);
      if (!pages.includes(fromUrlPath)) continue;

      const renamed = pages.map((p) => (p === fromUrlPath ? toUrlPath : p));
      data[key] = renamed.filter((p, i) => renamed.indexOf(p) === i);
      changed = true;
    }
    return changed;
  });
}

/**
 * urlPath がスター付きかどうかを返す
 */
export async function isPageStarred(urlPath: string): Promise<boolean> {
  return (await loadStarredPages()).includes(urlPath);
}

/**
 * サイドバーの設定（sidebar-settings）を、アプリ内で扱う形にしたもの
 * キー名のケバブケースへの変換は、このモジュールの中に閉じ込めている
 */
export type SidebarSettings = {
  // サイドバーを表示するかどうか
  show: boolean;
  // 「スター付き」の一覧を開いているかどうか
  showStarredPages: boolean;
  // 「履歴」の一覧を開いているかどうか
  showHistories: boolean;
  // 「ページ」の一覧を開いているかどうか
  showPages: boolean;
  // 「目次」の一覧を開いているかどうか
  showToc: boolean;
  // サイドバーの幅（px）
  width: number;
};

/**
 * サイドバーの表示に必要な、ファイルから読み込む値をまとめたもの
 * 文書以外の画面も含め、サイドバーを出す画面はこれを props で受け取り、
 * そのまま Sidebar に渡す
 */
export type SidebarData = {
  // 各一覧を開いているかどうかなどの保存済みの設定
  settings: SidebarSettings;
  // スター付きページのURLパス
  starredPages: string[];
  // 履歴のURLパス（新しい順）
  histories: string[];
};

/**
 * 保存済みのサイドバーの設定を返す
 * 未設定の項目は、どちらも「表示する・開いている」状態にする
 */
export async function loadSidebarSettings(): Promise<SidebarSettings> {
  const data = await readUserSettingsFile();
  const sidebar = data["sidebar-settings"];
  const values =
    typeof sidebar === "object" && sidebar !== null
      ? (sidebar as Record<string, unknown>)
      : {};
  return {
    show: typeof values["show"] === "boolean" ? values["show"] : true,
    showStarredPages:
      typeof values["show-starred-pages"] === "boolean"
        ? values["show-starred-pages"]
        : true,
    showHistories:
      typeof values["show-histories"] === "boolean"
        ? values["show-histories"]
        : true,
    showPages:
      typeof values["show-pages"] === "boolean" ? values["show-pages"] : true,
    showToc:
      typeof values["show-toc"] === "boolean" ? values["show-toc"] : true,
    width:
      typeof values["width"] === "number" && Number.isInteger(values["width"])
        ? clampSidebarWidth(values["width"])
        : SIDEBAR_WIDTH_DEFAULT,
  };
}

/**
 * sidebar-settings の key（ケバブケース）の値を設定する
 * sidebar-settings の中の他のキーは残す
 * すでに同じ値であれば何も書き込まない
 */
function setSidebarSetting(
  key: string,
  value: boolean | number,
): Promise<void> {
  return updateUserSettings((data) => {
    const current = data["sidebar-settings"];
    const sidebar: Record<string, unknown> =
      typeof current === "object" && current !== null && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};
    if (sidebar[key] === value) return false;

    sidebar[key] = value;
    data["sidebar-settings"] = sidebar;
    return true;
  });
}

/**
 * サイドバーを表示するかどうかを保存する
 */
export function setShowSidebar(show: boolean): Promise<void> {
  return setSidebarSetting("show", show);
}

/**
 * 「スター付き」の一覧を開いているかどうかを保存する
 */
export function setShowStarredPages(show: boolean): Promise<void> {
  return setSidebarSetting("show-starred-pages", show);
}

/**
 * 「履歴」の一覧を開いているかどうかを保存する
 */
export function setShowHistories(show: boolean): Promise<void> {
  return setSidebarSetting("show-histories", show);
}

/**
 * 「ページ」の一覧を開いているかどうかを保存する
 */
export function setShowPages(show: boolean): Promise<void> {
  return setSidebarSetting("show-pages", show);
}

/**
 * 「目次」の一覧を開いているかどうかを保存する
 */
export function setShowToc(show: boolean): Promise<void> {
  return setSidebarSetting("show-toc", show);
}

/**
 * サイドバーの幅（px）を保存する
 * 整数でない値、範囲外の値は範囲内に丸める
 */
export function setSidebarWidth(width: number): Promise<void> {
  return setSidebarSetting("width", clampSidebarWidth(width));
}

/**
 * 同じ階層にあるフォルダとページの並び順（order）
 * by-name: 区別せず名前の昇順、folders-first: フォルダが先、pages-first: ページが先
 */
export type OrderSetting = "by-name" | "folders-first" | "pages-first";

const ORDER_DEFAULT: OrderSetting = "by-name";

export function isOrderSetting(value: unknown): value is OrderSetting {
  return (
    value === "by-name" || value === "folders-first" || value === "pages-first"
  );
}

/**
 * 保存済みの並び順を返す
 * 未設定、または不正な値のときは名前順にする
 */
export async function loadOrderSetting(): Promise<OrderSetting> {
  const data = await readUserSettingsFile();
  const value = data["order"];
  return isOrderSetting(value) ? value : ORDER_DEFAULT;
}

/**
 * 並び順を保存する
 * すでに同じ値であれば何も書き込まない
 */
export function setOrderSetting(order: OrderSetting): Promise<void> {
  return updateUserSettings((data) => {
    if (data["order"] === order) return false;
    data["order"] = order;
    return true;
  });
}

/**
 * 文書の表示モード（mode）
 * ページを移動したりリロードしても、表示モードと編集モードが変わらないように保存する
 * view: 表示モード、edit: 編集モード
 */
export type Mode = "view" | "edit";

const MODE_DEFAULT: Mode = "view";

export function isMode(value: unknown): value is Mode {
  return value === "view" || value === "edit";
}

/**
 * 保存済みのモードを返す
 * 未設定、または不正な値のときは表示モードにする
 */
export async function loadMode(): Promise<Mode> {
  const data = await readUserSettingsFile();
  const value = data["mode"];
  return isMode(value) ? value : MODE_DEFAULT;
}

/**
 * モードを保存する
 * すでに同じ値であれば何も書き込まない
 */
export function setMode(mode: Mode): Promise<void> {
  return updateUserSettings((data) => {
    if (data["mode"] === mode) return false;
    data["mode"] = mode;
    return true;
  });
}

/**
 * サイドバーの表示に必要な値をまとめて読み込んで返す
 */
export async function loadSidebarData(): Promise<SidebarData> {
  return {
    settings: await loadSidebarSettings(),
    starredPages: await loadStarredPages(),
    histories: await loadViewHistories(),
  };
}
