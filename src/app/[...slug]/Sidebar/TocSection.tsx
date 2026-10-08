import type { Heading } from "@/lib/headings";
import { setShowTocSetting } from "../../actions";
import { useSavedToggle } from "../useSavedToggle";
import { TocIcon } from "./icons";
import SectionHeading from "./SectionHeading";
import styles from "./Sidebar.module.css";

/**
 * 「目次」の一覧
 */
export default function TocSection({
  headings,
  initialOpen,
  onSelectHeading,
}: {
  headings: Heading[];
  initialOpen: boolean;
  onSelectHeading: (index: number) => void;
}) {
  const [open, toggle] = useSavedToggle(initialOpen, setShowTocSetting);

  return (
    <section className={styles.section}>
      <SectionHeading
        open={open}
        onToggle={toggle}
        icon={<TocIcon />}
        title="目次"
      />

      {open && headings.length === 0 && (
        <p className={styles.empty}>見出しはありません</p>
      )}

      {open && headings.length > 0 && (
        <ul className={styles.list}>
          {/* 見出しは同じ文字列が複数ありうるため、順番（index）を key にする
              見出しの並びは文書が変わったときに丸ごと入れ替わるので、これで問題ない */}
          {headings.map((heading, index) => (
            <li key={index}>
              <button
                type="button"
                className={styles.tocButton}
                // レベルが1つ深くなるごとに左へインデントする
                // レベルによって値が変わるため、CSSではなくここで指定している
                style={{
                  paddingLeft: `${0.5 + (heading.level - 1) * 0.875}rem`,
                }}
                onClick={() => onSelectHeading(index)}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
