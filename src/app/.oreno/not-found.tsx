// ".oreno" 配下専用のエラー画面
// ルートの not-found.tsx（文書向けの文言）とは別に、
// アプリ機能向けの文言で「該当する画面が無い」ことを伝える
export default function OrenoNotFound() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>該当する画面がありません</h1>
      <p>指定されたURLに対応する機能はありません。</p>
    </div>
  );
}
