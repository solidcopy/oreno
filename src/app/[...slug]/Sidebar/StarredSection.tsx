import StarIcon from "@/components/StarIcon";
import { setShowStarredPagesSetting } from "../../actions";
import { useSavedToggle } from "../useSavedToggle";
import PageItem from "./PageItem";
import SectionHeading from "./SectionHeading";
import styles from "./Sidebar.module.css";

/**
 * 「スター付き」の一覧
 */
export default function StarredSection({
  pages,
  initialOpen,
}: {
  pages: string[];
  initialOpen: boolean;
}) {
  // 開閉の状態は全ページ共通の設定としてユーザー設定に保存する
  // 切り替えると先に画面が変わり、保存に失敗したら元に戻る（useSavedToggle の中身）
  const [open, toggle] = useSavedToggle(
    initialOpen,
    setShowStarredPagesSetting,
  );

  return (
    <section className={styles.section}>
      <SectionHeading
        open={open}
        onToggle={toggle}
        icon={<StarIcon filled />}
        title="スター付き"
      />

      {/* 開いているときだけ一覧を描画する
          React では、条件が false のものは何も描画されない */}
      {open && pages.length === 0 && (
        <p className={styles.empty}>スターの付いたページはありません</p>
      )}

      {open && pages.length > 0 && (
        <ul className={styles.list}>
          {/* 配列から要素を作るときは、要素を区別するための key が必要
              URLパスは重複しないので、そのまま key に使える */}
          {pages.map((urlPath) => (
            <PageItem key={urlPath} urlPath={urlPath} />
          ))}
        </ul>
      )}
    </section>
  );
}
