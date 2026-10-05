import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir } from "@/lib/docPath";

/**
 * ユーザー設定（(文書フォルダのルート)/.oreno/user-settings.json）のうち、
 * 閲覧履歴（view-histories）の読み込み・更新をまとめるモジュール
 * 閲覧履歴は、後にアクセスしたものほど先頭に並ぶ
 *
 * 将来ほかのキーが増えても消えないよう、保存時は既存のJSONを読み込んで
 * view-histories だけを差し替えている
 */

type UserSettingsFile = Record<string, unknown>;

// .gitignore に書く行
// 途中に "/" を含むパターンは、.gitignore のあるフォルダからの相対パスとして扱われる
const GITIGNORE_ENTRY = ".oreno/user-settings.json";

function getUserSettingsPath(): string {
  return path.join(getRootDir(), ".oreno", "user-settings.json");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * user-settings.json をGitの管理対象から外すため、文書ルートの .gitignore に追記する
 * ユーザーごとの設定をリポジトリに含めないための処理
 *
 * 文書ルートに .gitignore が無い場合は何もしない
 * （Gitで管理されていない、または文書ルートがGit管理のルートではない場合を含む）
 * すでに同じ行があれば追記しない
 */
async function ignoreUserSettingsInGit(): Promise<void> {
  const gitignorePath = path.join(getRootDir(), ".gitignore");
  let current: string;
  try {
    current = await readFile(gitignorePath, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw error;
  }

  const alreadyIgnored = current
    .split(/\r?\n/)
    .some((line) => line.trim() === GITIGNORE_ENTRY);
  if (alreadyIgnored) return;

  // 末尾が改行で終わっていないと、最後の行とくっついてしまうため補う
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  await writeFile(
    gitignorePath,
    current + separator + GITIGNORE_ENTRY + "\n",
    "utf-8",
  );
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
 * 保存済みの閲覧履歴を、新しい順で返す
 * 文字列以外の要素が混ざっていた場合は取り除く
 */
export async function loadViewHistories(): Promise<string[]> {
  const data = await readUserSettingsFile();
  const histories = data["view-histories"];
  if (!Array.isArray(histories)) return [];
  return histories.filter((h): h is string => typeof h === "string");
}

// 読み込み→書き込みの途中で別の記録が割り込むと履歴が欠けるため、
// 記録処理は1つずつ順番に実行する
let queue: Promise<void> = Promise.resolve();

/**
 * 閲覧履歴の先頭に urlPath（例: "/spec/entities"）を追加する
 * すでに履歴にあるパスは、元の位置から取り除いて先頭へ移動する
 * 文書の保存と同様、ここでは git commit は行わない
 * ファイルを新規作成するときは、Gitの管理対象から外すため .gitignore にも追記する
 */
export function addViewHistory(urlPath: string): Promise<void> {
  const task = queue.then(async () => {
    const data = await readUserSettingsFile();
    const histories = await loadViewHistories();
    data["view-histories"] = [
      urlPath,
      ...histories.filter((h) => h !== urlPath),
    ];

    const filePath = getUserSettingsPath();

    // 新規作成するときだけ .gitignore を更新する
    // 先に更新しておくと、失敗した場合はファイルが作られず、次の記録でやり直せる
    if (!(await pathExists(filePath))) {
      await ignoreUserSettingsInGit();
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  });
  // 失敗しても後続の記録を止めないようにする
  queue = task.catch(() => {});
  return task;
}
