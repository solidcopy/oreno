/**
 * not-found.tsx は Next.js が特別に認識するファイル名です。
 * ルート内で notFound() が呼ばれたとき（page.tsx を参照）や、
 * どの page.tsx にもマッチしない URL にアクセスされたときに、
 * このコンポーネントが代わりに表示されます。
 *
 * これも "use client" が無い Server Component です。
 */
export default function NotFound() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>文書が見つかりません</h1>
      <p>指定されたURLに対応する文書はありません。</p>
    </div>
  );
}
