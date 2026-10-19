import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import mime from "mime-types";
import { resolveFilePath } from "@/lib/docPath";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// 拡張子付きのURL（/image.png など）に応える Route Handler
// src/proxy.ts が /image.png をこのパス（/.oreno/files/image.png）へ書き換える
// 文書ルートフォルダにある同じパスのファイルをそのまま返し、無ければ404にする
export async function GET(
  _request: Request,
  context: RouteContext<"/.oreno/files/[...path]">,
) {
  const { path: encodedSegments } = await context.params;

  let segments: string[];
  try {
    segments = encodedSegments.map(decodeURIComponent);
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = resolveFilePath(segments);
  if (!filePath) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return new Response("Not Found", { status: 404 });
    }
    // mime-types に載っていない拡張子は、ブラウザに任せるため octet-stream で返す
    // contentType() はスラッシュを含む文字列を MIME タイプそのものと解釈してしまうため、
    // パスを渡せる lookup() で引き、文字コード付きの Content-Type は contentType() で作る
    const mimeType = mime.lookup(filePath);
    const contentType = (mimeType && mime.contentType(mimeType)) || "application/octet-stream";
    // ファイル全体をメモリに読み込まず、読めた分から順にレスポンスへ流す
    // createReadStream は Node.js のストリームなので、Response が受け取れる Web のストリームに変換する
    const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        // ファイルを差し替えたらすぐ反映されるよう、毎回確認させる
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    // 存在しない、など読めないものはすべて404にする
    return new Response("Not Found", { status: 404 });
  }
}
