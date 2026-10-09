"use client";

/**
 * サイドバー
 * スター付きページ、履歴、フォルダ内のページ、目次の一覧を表示する
 * 文書以外の画面（プロジェクト設定など）では pages と toc を渡さず、
 * 「ページ」と「目次」をそれぞれタイトルごと省く
 *
 * 開閉の状態はブラウザ上で切り替わる値なので、useState を使うために
 * Client Component にしている
 * 各一覧の中身は、page.tsx（Server Component）がファイルから読み込んで
 * props として渡してくる
 */

import { useState, type PointerEvent } from "react";
import { setSidebarWidthSetting } from "@/app/actions";
import { clampSidebarWidth } from "@/lib/sidebarWidth";
import type { FolderEntries } from "@/lib/folder";
import type { Heading } from "@/lib/headings";
import type { SidebarSettings } from "@/lib/userSettings";
import HistorySection from "./HistorySection";
import PagesSection from "./PagesSection";
import StarredSection from "./StarredSection";
import TocSection from "./TocSection";
import styles from "./Sidebar.module.css";

// 「ページ」の一覧の表示に必要な情報
type PagesInfo = {
  // 表示中のページのslug（例: ["spec", "entities", "reservation"]）
  slug: string[];
  // 表示中のページがあるフォルダの中身
  folderEntries: FolderEntries;
};

// 「目次」の一覧の表示に必要な情報
type TocInfo = {
  // 表示中のページの見出し（文書の上からの順）
  headings: Heading[];
  // 目次の項目がクリックされたときに、何番目の見出しかを渡して呼ぶ
  // Server Component からは呼ばれないため、警告（TS71007）は無視してよい
  onSelectHeading: (index: number) => void;
};

type Props = {
  // 各一覧を開いているかどうかの保存済みの値
  settings: SidebarSettings;
  // スター付きページのURLパス（例: "/spec/entities/reservation"）
  starredPages: string[];
  // 履歴のURLパス（新しい順。「もっと表示する」で見せる分まで）
  histories: string[];
  // 渡したときだけ「ページ」の一覧を表示する
  pages?: PagesInfo;
  // 渡したときだけ「目次」の一覧を表示する
  toc?: TocInfo;
};

export default function Sidebar({
  settings,
  starredPages,
  histories,
  pages,
  toc,
}: Props) {
  // ドラッグ中の幅も含めた、画面に表示する幅
  const [width, setWidth] = useState(settings.width);
  const [dragging, setDragging] = useState(false);

  // 境界を押したとき、ポインタをキャプチャして、
  // 境界の外へ出てもドラッグが続くようにする
  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  // ドラッグ中は、サイドバーの左端からポインタまでの距離を幅にする
  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const left = e.currentTarget.parentElement!.getBoundingClientRect().left;
    setWidth(clampSidebarWidth(e.clientX - left));
  }

  // 離したときに、最終的な幅を保存する（動かしている途中では保存しない）
  async function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    const previous = settings.width;
    const result = await setSidebarWidthSetting(width);
    if (!result.ok) {
      // 保存できなかったら元の幅に戻す
      setWidth(previous);
    }
  }

  return (
    <div className={styles.container} style={{ width }}>
      <aside className={styles.sidebar}>
        <StarredSection
          pages={starredPages}
          initialOpen={settings.showStarredPages}
        />
        <HistorySection
          histories={histories}
          initialOpen={settings.showHistories}
        />
        {pages && (
          <PagesSection
            slug={pages.slug}
            folderEntries={pages.folderEntries}
            initialOpen={settings.showPages}
          />
        )}
        {toc && (
          <TocSection
            headings={toc.headings}
            initialOpen={settings.showToc}
            onSelectHeading={toc.onSelectHeading}
          />
        )}
      </aside>
      <div
        className={dragging ? styles.resizerActive : styles.resizer}
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドバーの幅"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
