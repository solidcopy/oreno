/**
 * プロジェクト名の表示整形をまとめるモジュール
 * node:fs などサーバー専用のモジュールに依存しないので、
 * Client Component からも安全にインポートできる
 */

// プロジェクト名を表示する箇所（ヘッダーのリンクなど）での最大文字数
// 入力自体には文字数制限を設けない
const DISPLAY_NAME_MAX_LENGTH = 20;

/**
 * 表示用にプロジェクト名を省略する
 * 20文字を超える場合は19文字目までを残し、末尾に「...」を付ける
 */
export function truncateProjectNameForDisplay(projectName: string): string {
  if (projectName.length <= DISPLAY_NAME_MAX_LENGTH) {
    return projectName;
  }
  return `${projectName.slice(0, DISPLAY_NAME_MAX_LENGTH - 1)}...`;
}
