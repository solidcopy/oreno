import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir } from "@/lib/docPath";

/**
 * プロジェクト設定（(文書フォルダのルート)/.oreno/project-settings.json）の
 * 読み込み・保存をまとめるモジュール
 * ファイル内のキー名（project-name）と、アプリ内で扱う型のプロパティ名
 * （projectName）を変換する役割もここに集約する
 */
export type ProjectSettings = {
  projectName: string;
  /** 画像をインポートするときにコピー先として選べるフォルダ（"/images" のような絶対形式） */
  imageFolders: string[];
};

const EMPTY_SETTINGS: ProjectSettings = { projectName: "", imageFolders: [] };

type ProjectSettingsFile = {
  "project-name"?: unknown;
  "image-folders"?: unknown;
};

function getProjectSettingsPath(): string {
  return path.join(getRootDir(), ".oreno", "project-settings.json");
}

/**
 * 保存済みのプロジェクト設定を読み込む
 * ファイルが無い場合、JSONとして解析できない場合は、どちらも未設定扱いとして
 * 空の設定を返す
 */
export async function loadProjectSettings(): Promise<ProjectSettings> {
  let raw: string;
  try {
    raw = await readFile(getProjectSettingsPath(), "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return EMPTY_SETTINGS;
    }
    throw error;
  }

  let data: ProjectSettingsFile;
  try {
    data = JSON.parse(raw) as ProjectSettingsFile;
  } catch {
    return EMPTY_SETTINGS;
  }

  const projectName = data["project-name"];
  const imageFolders = data["image-folders"];
  return {
    projectName: typeof projectName === "string" ? projectName : "",
    // 配列でないときは未設定扱いにし、文字列以外の要素は無視する
    imageFolders: Array.isArray(imageFolders)
      ? imageFolders.filter((folder) => typeof folder === "string")
      : [],
  };
}

/**
 * プロジェクト設定を保存する
 * 文書の保存と同様、ここでは git commit は行わない
 */
export async function saveProjectSettings(
  settings: ProjectSettings,
): Promise<void> {
  const filePath = getProjectSettingsPath();
  const data: ProjectSettingsFile = {
    "project-name": settings.projectName,
    "image-folders": settings.imageFolders,
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
