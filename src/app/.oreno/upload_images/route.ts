import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDocPath, resolveFilePath } from "@/lib/docPath";
import { registerAttachmentFile } from "@/lib/fileIndex";
import { isImageFile } from "@/lib/imageFile";

// 文書ルートフォルダの内容は実行時に変わるため、ビルド時に固定されないようにする
export const dynamic = "force-dynamic";

// エディタにドロップされた画像ファイルを、ページと同じフォルダに保存する Route Handler
// Server Action ではなくこちらを使うのは、Server Action にはボディサイズの上限
// （next.config.ts の bodySizeLimit）があり、画像のサイズに上限を設けないため
// 同名のファイルがすでにあるときは、確認せずに上書きする
// リクエストは multipart/form-data で、slug（ページの slug の JSON）と file（画像ファイル1つ）を持つ
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

  // ブラウザから直接送られた値は信用せず、画像ファイルだけを対象にする
  const file = formData.get("file");
  if (file === null || typeof file === "string" || !isImageFile(file.name)) {
    return new Response("Bad Request", { status: 400 });
  }

  // ページが保存されるフォルダ（ページがまだ保存されていなくても決まる）
  const fileSlug = [...slug.slice(0, -1), file.name];
  const filePath = resolveFilePath(fileSlug);
  if (!filePath) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }

  registerAttachmentFile(fileSlug);

  // ファイル名はそのまま保存し、パスの中ではURLエンコードする
  // encodeURIComponent は ( ) をエンコードしないが、Markdownの記法と紛らわしいので足す
  const imagePath =
    "/" +
    fileSlug
      .map((segment) =>
        encodeURIComponent(segment).replace(
          /[()]/g,
          (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
        ),
      )
      .join("/");
  return Response.json({ path: imagePath });
}
