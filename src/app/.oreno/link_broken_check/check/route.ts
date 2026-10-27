import { findBrokenLinks } from "@/lib/linkBrokenCheck";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// リンク切れチェックを実行して、結果をJSONで返す Route Handler
// 画面（LinkBrokenCheckPage）が開いたときに呼ぶ
// Server Action ではなくこちらを使うのは、画面を離れたときにブラウザが
// リクエストを中断すると request.signal が通知され、調査を途中でやめられるため
export async function GET(request: Request) {
  try {
    const brokenLinks = await findBrokenLinks(request.signal);
    return Response.json({ brokenLinks });
  } catch (error) {
    // 中断されたときは、返す相手がいないので中身のない応答にする
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    throw error;
  }
}
