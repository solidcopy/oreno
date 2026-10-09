/**
 * サイドバーの幅（px）の既定値と、変更できる範囲
 * ブラウザ側（Sidebar）とサーバー側（userSettings）の両方で使うため、
 * fs を使う userSettings.ts とは別のファイルにしている
 */
export const SIDEBAR_WIDTH_DEFAULT = 240;
const SIDEBAR_WIDTH_MIN = 160;
const SIDEBAR_WIDTH_MAX = 600;

/**
 * 幅を整数に丸めたうえで、最小から最大までの範囲に収める
 */
export function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}
