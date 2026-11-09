import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDocPath, resolveFilePath } from "@/lib/docPath";
import { registerAttachmentFile } from "@/lib/fileIndex";
import { encodeImageSrc, resolveImagePath } from "@/lib/imagePath";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// エディタにドロップされた画像ファイルを、指定された画像パスに保存する Route Handler
// Server Action ではなくこちらを使うのは、Server Action にはボディサイズの上限
// （next.config.ts の bodySizeLimit）があり、画像のサイズに上限を設けないため
// 同名のファイルがすでにあるときは、上書きする（上書きの確認は、呼び出し側が済ませている）
// リクエストは multipart/form-data で、次のフィールドを持つ
//   slug: 画像を挿入するページの slug の JSON（相対パスの基準になるページのフォルダを求める）
//   file: 画像ファイル1つ
//   path: 保存先の画像パス（絶対形式、またはページのフォルダからの相対）
// 保存できたら、Markdownに書く画像パスを返す
export async function POST(request: Request) {
  const formData = await request.formData();

  let slug: unknown;
  try {
    slug = JSON.parse(String(formData.get("slug")));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (
    !Array.isArray(slug) ||
    !slug.every((segment) => typeof segment === "string") ||
    !resolveDocPath(slug)
  ) {
    return new Response("Bad Request", { status: 400 });
  }

  const file = formData.get("file");
  const input = formData.get("path");
  if (file === null || typeof file === "string" || typeof input !== "string") {
    return new Response("Bad Request", { status: 400 });
  }

  // ブラウザから直接送られた値は信用せず、画像ファイルの保存先として使えるパスかを確かめる
  const resolved = resolveImagePath(slug, input);
  if (!resolved.ok) {
    return new Response(resolved.message, { status: 400 });
  }
  const filePath = resolveFilePath(resolved.slug);
  if (!filePath) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    // 保存先のフォルダがまだ無い場合に備えて作成しておく
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }

  registerAttachmentFile(resolved.slug);

  return Response.json({ path: encodeImageSrc(input) });
}
