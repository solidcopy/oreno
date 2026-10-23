/**
 * Next.js のサーバー起動時に一度だけ呼ばれる
 * ファイル一覧のスキャンをここから始める
 */
export async function register() {
  // Edge ランタイムでは fs が使えないため、Node.js のときだけ始める
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFileScan } = await import("@/lib/fileIndex");
    startFileScan();
  }
}
