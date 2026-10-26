/**
 * "." から始まる名前のフォルダ・ファイル（.git や .oreno など）は、
 * ページの表示やリンクの対象外として扱う
 * ".oreno" 配下はOreno自身の機能（設定画面など）が使うURLでもある
 *
 * docPath.ts と違い node:path に依存しないため、
 * Client Component（PageLocationButton）からも安全にimportできる
 */
export function hasDotSegment(segments: string[]): boolean {
  return segments.some((segment) => segment.startsWith("."));
}
