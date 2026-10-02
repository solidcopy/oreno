/**
 * ".oreno" から始まるパスは、Oreno自身の機能（設定画面など）が使うために予約してある
 * 文書ファイルのパスとは重複しないよう、この配下には文書を作成・表示できない
 *
 * docPath.ts と違い node:path に依存しないため、
 * Client Component（NewPageButton）からも安全にimportできる
 */
export const APP_RESERVED_SEGMENT = ".oreno";

export function isAppReservedPath(segments: string[]): boolean {
  return segments[0] === APP_RESERVED_SEGMENT;
}
