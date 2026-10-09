import { useState } from "react";
import Link from "next/link";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { FolderEntries } from "@/lib/folder";
import { loadFolderEntries, setShowPagesSetting } from "../../actions";
import { useSavedToggle } from "../useSavedToggle";
import { DocumentIcon, FolderEntryIcon, PageEntryIcon } from "./icons";
import SectionHeading from "./SectionHeading";
import styles from "./Sidebar.module.css";

/**
 * 「ページ」の一覧
 * 表示中のページがあるフォルダの中身を表示し、フォルダをたどって移動できる
 */
export default function PagesSection({
  slug,
  folderEntries,
  initialOpen,
}: {
  slug: string[];
  folderEntries: FolderEntries;
  initialOpen: boolean;
}) {
  const [open, toggle] = useSavedToggle(initialOpen, setShowPagesSetting);

  // 「ページ」の一覧に表示しているフォルダ
  // フォルダをクリックしたときだけ、移動先のフォルダとその中身を入れる
  // null のときは、表示中のページがあるフォルダ（props で受け取った中身）を表示する
  const [browsed, setBrowsed] = useState<{
    folder: string[];
    entries: FolderEntries;
  } | null>(null);

  // 別のページに移動したら、一覧を新しいページのフォルダに戻す
  // Sidebar はページを移動しても作り直されず state が残るため、
  // 描画中に前回のページと比べて、変わっていたら state を初期化している
  // （useEffect で初期化すると、古い一覧が一瞬表示されてしまう）
  const slugKey = slug.join("/");
  const [prevSlugKey, setPrevSlugKey] = useState(slugKey);
  if (prevSlugKey !== slugKey) {
    setPrevSlugKey(slugKey);
    setBrowsed(null);
  }

  // 表示中のページがあるフォルダ（ページ名を除いたもの）
  const currentFolder = slug.slice(0, -1);
  const shownFolder = browsed ? browsed.folder : currentFolder;
  const shownEntries = browsed ? browsed.entries : folderEntries;

  // フォルダをクリックしたとき、そのフォルダの中身をサーバーから取得して一覧を切り替える
  // 表示中のページは変わらない
  async function handleOpenFolder(folder: string[]) {
    const result = await loadFolderEntries(folder);
    if (result.ok) {
      setBrowsed({ folder, entries: result.entries });
    }
  }

  return (
    <section className={styles.section}>
      <SectionHeading
        open={open}
        onToggle={toggle}
        icon={<DocumentIcon />}
        title="ページ"
      />

      {open && (
        <ul className={styles.list}>
          {/* ルートフォルダには上の階層がないので、「..」は出さない */}
          {shownFolder.length > 0 && (
            <li>
              <button
                type="button"
                className={styles.entryButton}
                onClick={() => handleOpenFolder(shownFolder.slice(0, -1))}
              >
                <FolderEntryIcon />
                <span className={styles.entryName}>..</span>
              </button>
            </li>
          )}
          {shownEntries.map(({ kind, name }) => {
            if (kind === "folder") {
              return (
                <li key={`folder:${name}`}>
                  <button
                    type="button"
                    className={styles.entryButton}
                    onClick={() => handleOpenFolder([...shownFolder, name])}
                  >
                    <FolderEntryIcon />
                    <span className={styles.entryName}>{name}</span>
                  </button>
                </li>
              );
            }
            const pageSlug = [...shownFolder, name];
            // 表示中のページの行は強調する
            const isCurrent = pageSlug.join("/") === slugKey;
            return (
              <li key={`page:${name}`}>
                <Link
                  href={encodeUrlPath("/" + pageSlug.join("/"))}
                  className={isCurrent ? styles.entryCurrent : styles.entry}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  <PageEntryIcon />
                  <span className={styles.entryName}>{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {open && shownEntries.length === 0 && (
        <p className={styles.empty}>ページはありません</p>
      )}
    </section>
  );
}
