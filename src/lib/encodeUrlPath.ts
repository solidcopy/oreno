/**
 * デコード済みのパス（例: "/docs/a#b"）を、リンクや画面遷移に使える URL パスに変換する
 * セグメントごとに encodeURIComponent をかけるので、"#" や "%" を含むファイル名でも
 * URL の区切りと誤解されない（例: "/docs/a%23b"）
 * "/" で区切るのは、セグメント自身に "/" が含まれることは無い（docPath.ts が弾く）ため
 *
 * docPath.ts と違い node:path に依存しないため、
 * Client Component（Sidebar, NewPageButton）からも安全にimportできる
 */
export function encodeUrlPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
