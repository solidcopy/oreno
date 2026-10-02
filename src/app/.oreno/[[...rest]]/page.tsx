import { notFound } from "next/navigation";

// ".oreno" 配下はOreno自身の機能（設定画面など）用に予約したURLで、
// 文書ファイルとしては扱わない（詳しくは src/lib/appReservedPath.ts を参照）
//
// このルートは [[...rest]]（オプショナルcatch-all）なので "/.oreno" 自体にも
// "/.oreno/任意のパス" にもマッチし、対応する機能がまだ無い間はここで404にする
// 将来 "/.oreno/settings" のような機能ページを追加すると、Next.jsのルーティングは
// 静的なセグメントをcatch-allより優先して選ぶため、そちらが代わりに使われるようになる
export default function OrenoAppRoute() {
  notFound();
}
