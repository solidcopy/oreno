import { useState } from "react";
import { setShowHistoriesSetting } from "../../actions";
import { useSavedToggle } from "../useSavedToggle";
import { ClockIcon } from "./icons";
import PageItem from "./PageItem";
import SectionHeading from "./SectionHeading";
import styles from "./Sidebar.module.css";

// 「履歴」で最初に表示する件数
const HISTORIES_INITIAL_COUNT = 5;

/**
 * 「履歴」の一覧
 */
export default function HistorySection({
  histories,
  initialOpen,
}: {
  histories: string[];
  initialOpen: boolean;
}) {
  const [open, toggle] = useSavedToggle(initialOpen, setShowHistoriesSetting);

  // 「履歴」を5件より多く表示しているかどうか
  // 保存はせず、ページを表示し直すと5件に戻る
  const [expanded, setExpanded] = useState(false);

  const visibleHistories = expanded
    ? histories
    : histories.slice(0, HISTORIES_INITIAL_COUNT);
  // 履歴が6件以上あるときだけ「もっと表示する」を出す
  const hasMoreHistories = histories.length > HISTORIES_INITIAL_COUNT;

  return (
    <section className={styles.section}>
      <SectionHeading
        open={open}
        onToggle={toggle}
        icon={<ClockIcon />}
        title="履歴"
      />

      {/* 履歴が0件のときは、一覧の代わりに何も表示しない */}
      {open && histories.length > 0 && (
        <ul className={styles.list}>
          {visibleHistories.map((urlPath) => (
            <PageItem key={urlPath} urlPath={urlPath} />
          ))}
          {/* 最大20件を表示しているときは、表示し切れていない履歴があるかに関わらず
              常に「(以下略)」を表示する */}
          {expanded && <li className={styles.omitted}>(以下略)</li>}
          {hasMoreHistories && (
            <li>
              <button
                type="button"
                className={styles.moreButton}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "少なく表示する" : "もっと表示する"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
