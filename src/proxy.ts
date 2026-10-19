import { access } from "node:fs/promises";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveDocPath, resolveFilePath } from "@/lib/docPath";

// 拡張子付きのURL（/image.png など）の振り分けを行う Proxy
// 1. 対応する Markdown（/image.png.md）があれば、そのまま文書として表示する
// 2. なければ、同じパスのファイル（/image.png）があればそれを返す
// 3. どちらも無ければ、文書の新規作成として扱う
// 1 と 3 は何もせず通常のページ処理に任せ、2 のときだけファイルを返す Route Handler へ書き換える

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  let slug: string[];
  try {
    slug = request.nextUrl.pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map(decodeURIComponent);
  } catch {
    return NextResponse.next();
  }

  // ドットを含まないURLは、文書としてしか扱わない
  if (!slug[slug.length - 1]?.includes(".")) {
    return NextResponse.next();
  }

  const docPath = resolveDocPath(slug);
  const filePath = resolveFilePath(slug);
  if (!docPath || !filePath) {
    return NextResponse.next();
  }

  if (await exists(docPath)) {
    return NextResponse.next();
  }

  if (await exists(filePath)) {
    const url = request.nextUrl.clone();
    url.pathname = "/.oreno/files" + request.nextUrl.pathname;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

// Next.js の内部パスと、Oreno の予約パスは対象外にする
export const config = {
  matcher: ["/((?!_next/|\\.oreno).*)"],
};
