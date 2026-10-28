import { findOrphanedPages } from "@/lib/orphanedPagesCheck";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// 孤立ページチェックを実行して、結果をJSONで返す Route Handler
// 画面（OrphanedPagesCheckPage）が開いたときに呼ぶ
// リンク切れチェックと同じく、画面を離れたときにブラウザがリクエストを中断すると
// request.signal が通知され、調査を途中でやめられる
export async function GET(request: Request) {
  try {
    const orphanedPages = await findOrphanedPages(request.signal);
    return Response.json({ orphanedPages });
  } catch (error) {
    // 中断されたときは、返す相手がいないので中身のない応答にする
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    throw error;
  }
}
