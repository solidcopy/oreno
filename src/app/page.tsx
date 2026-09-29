import { redirect } from "next/navigation";

// URLのルート（"/"）は [...slug] が最低1セグメント必要なためマッチせず、
// 何もしなければ not-found.tsx が表示されてしまう
// ルートURLへのアクセスは /index へのリダイレクトとして扱う
export default function RootPage() {
  redirect("/index");
}
