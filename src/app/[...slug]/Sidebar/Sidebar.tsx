"use client";

/**
 * サイドバー
 * スター付きページ、履歴、フォルダ内のページの一覧を表示する
 *
 * 開閉の状態はブラウザ上で切り替わる値なので、useState を使うために
 * Client Component にしている
 * 各一覧の中身は、page.tsx（Server Component）がファイルから読み込んで
 * props として渡してくる
 */

import type { FolderEntries } from "@/lib/folder";
import type { Heading } from "@/lib/headings";
import type { SidebarSettings } from "@/lib/userSettings";
import HistorySection from "./HistorySection";
import PagesSection from "./PagesSection";
import StarredSection from "./StarredSection";
import TocSection from "./TocSection";
import styles from "./Sidebar.module.css";

type Props = {
  // スター付きページのURLパス（例: "/spec/entities/reservation"）
  starredPages: string[];
  // 履歴のURLパス（新しい順。「もっと表示する」で見せる分まで）
  histories: string[];
  // 表示中のページのslug（例: ["spec", "entities", "reservation"]）
  slug: string[];
  // 表示中のページがあるフォルダの中身
  folderEntries: FolderEntries;
  // 表示中のページの見出し（文書の上からの順）
  headings: Heading[];
  // 各一覧を開いているかどうかの保存済みの値
  settings: SidebarSettings;
  // 目次の項目がクリックされたときに、何番目の見出しかを渡して呼ぶ
  // Server Component からは呼ばれないため、警告（TS71007）は無視してよい
  onSelectHeading: (index: number) => void;
};

export default function Sidebar({
  starredPages,
  histories,
  slug,
  folderEntries,
  headings,
  settings,
  onSelectHeading,
}: Props) {
  return (
    <aside className={styles.sidebar}>
      <StarredSection
        pages={starredPages}
        initialOpen={settings.showStarredPages}
      />
      <HistorySection
        histories={histories}
        initialOpen={settings.showHistories}
      />
      <PagesSection
        slug={slug}
        folderEntries={folderEntries}
        initialOpen={settings.showPages}
      />
      <TocSection
        headings={headings}
        initialOpen={settings.showToc}
        onSelectHeading={onSelectHeading}
      />
    </aside>
  );
}
