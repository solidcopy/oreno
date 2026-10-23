/**
 * Next.js のサーバー起動時に一度だけ呼ばれる
 * 起動前の設定チェックと、ファイル一覧のスキャン開始をここで行う
 */
export async function register() {
  // Edge ランタイムでは fs が使えないため、Node.js のときだけ始める
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ORENO_ROOT が使えない状態では何も動かせないため、起動失敗としてプロセスを止める
    const { assertRootDirExists } = await import("@/lib/docPath");
    try {
      assertRootDirExists();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }

    const { startFileScan } = await import("@/lib/fileIndex");
    startFileScan();
  }
}
