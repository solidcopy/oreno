import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRootDir } from "@/lib/docPath";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// ファビコンのリクエストに応える Route Handler
// ファイル名がそのままURLになるので、このフォルダ名 "favicon.ico" が /favicon.ico に対応する
// 文書ルートフォルダに favicon.ico があればそれを返し、なければ
// public/default-favicon.ico(ノートとペンのアイコン)へリダイレクトする
export async function GET(request: Request) {
  try {
    const data = await readFile(path.join(getRootDir(), "favicon.ico"));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/x-icon",
        // ユーザーが差し替えたらすぐ反映されるよう、毎回確認させる
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    // ファイルが無い場合など、読めなければ既定のアイコンにする
    return Response.redirect(new URL("/default-favicon.ico", request.url), 307);
  }
}
