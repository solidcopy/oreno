import { connection } from "next/server";
import { redirect } from "next/navigation";

// URLのルート（"/"）は [...slug] が最低1セグメント必要なためマッチせず、
// 何もしなければ not-found.tsx が表示されてしまう
// ルートURLへのアクセスは /index へのリダイレクトとして扱う
export default async function RootPage() {
  // connection() を呼ぶと、Next.js に対して
  // 「このページはリクエストごとに毎回サーバー上で実行してほしい」と伝えられる
  //
  // これを呼ばないと、このページは next build 時に静的なHTML（index.html）として
  // 事前生成されてしまう
  // 本番サーバーは /index へのリクエストでキャッシュを探すとき、
  // この index.html を「/index」の結果として返してしまい、
  // 文書ページ（[...slug]）に届かず /index へのリダイレクトを繰り返す
  await connection();

  redirect("/index");
}
