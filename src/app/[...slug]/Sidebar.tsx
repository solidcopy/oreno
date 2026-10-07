"use client";

/**
 * サイドバー
 * スター付きページと、最近アクセスしたページの一覧を表示する
 *
 * 開閉の状態はブラウザ上で切り替わる値なので、useState を使うために
 * Client Component にしている
 * 各一覧の中身は、page.tsx（Server Component）がファイルから読み込んで
 * props として渡してくる
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import StarIcon from "@/components/StarIcon";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import {
  setShowRecentlyViewedPagesSetting,
  setShowStarredPagesSetting,
} from "../actions";
import styles from "./Sidebar.module.css";

type Props = {
  // スター付きページのURLパス（例: "/spec/entities/reservation"）
  starredPages: string[];
  // 「スター付き」の一覧を開いているかどうかの保存済みの値
  initialShowStarredPages: boolean;
  // 最近アクセスしたページのURLパス（新しい順。「もっと表示する」で見せる分まで）
  recentPages: string[];
  // 「最近アクセスしたページ」の一覧を開いているかどうかの保存済みの値
  initialShowRecentlyViewedPages: boolean;
};

// 「最近アクセスしたページ」で最初に表示する件数
const RECENT_PAGES_INITIAL_COUNT = 5;

// URLパスの最後の要素（例: "/spec/entities/reservation" なら "reservation"）
function lastSegment(urlPath: string): string {
  return urlPath.split("/").pop() ?? urlPath;
}

// 時計の形のアイコン（円の中に針を描いたもの）
function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={styles.clockIcon}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/**
 * 一覧の見出し
 * 「＞」とアイコンとタイトルを並べたボタンで、押すと onToggle を呼ぶ
 * 開閉する一覧が複数あるため、見出しの見た目をここにまとめている
 */
function SectionHeading({
  open,
  onToggle,
  icon,
  title,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      className={styles.heading}
      onClick={onToggle}
      aria-expanded={open}
    >
      {/* 開いているときは下向き、閉じているときは右向きになるよう、
          右向きの矢印を CSS で回転させている */}
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        className={open ? styles.chevronOpen : styles.chevron}
      >
        <path d="M6 3l5 5-5 5" />
      </svg>
      {icon}
      <span className={styles.title}>{title}</span>
    </button>
  );
}

/**
 * 一覧の1行分（ページへのリンク）
 */
function PageItem({ urlPath }: { urlPath: string }) {
  // ツールチップを表示する画面上の位置
  // サイドバーは overflow でスクロールさせているため、中に置いた
  // position: absolute の要素はサイドバーの外に出られず切り取られてしまう
  // そこで position: fixed（画面基準）にし、リンクの位置から座標を計算して指定する
  const [tipPosition, setTipPosition] = useState<CSSProperties>({});

  // ホバー（またはフォーカス）されたときに、リンクの左下を基準に位置を決める
  const updateTipPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTipPosition({ left: rect.left + 8, top: rect.bottom + 2 });
  };

  return (
    <li
      className={styles.item}
      onMouseEnter={(e) => updateTipPosition(e.currentTarget)}
    >
      <Link
        href={encodeUrlPath(urlPath)}
        className={styles.link}
        onFocus={(e) => updateTipPosition(e.currentTarget)}
      >
        {lastSegment(urlPath)}
      </Link>
      {/* 最後の要素だけでは同名のページを見分けられないため、
          ホバーしたときにパス全体を表示する */}
      <span className={styles.tip} style={tipPosition} role="tooltip">
        {urlPath}
      </span>
    </li>
  );
}

export default function Sidebar({
  starredPages,
  initialShowStarredPages,
  recentPages,
  initialShowRecentlyViewedPages,
}: Props) {
  // 各一覧を開いているかどうか
  // 開閉の状態は全ページ共通の設定としてユーザー設定に保存する
  // useState の初期値は最初の描画でだけ使われる
  const [starredOpen, setStarredOpen] = useState(initialShowStarredPages);
  const [recentOpen, setRecentOpen] = useState(
    initialShowRecentlyViewedPages,
  );

  // 「最近アクセスしたページ」を5件より多く表示しているかどうか
  // 保存はせず、ページを表示し直すと5件に戻る
  const [recentExpanded, setRecentExpanded] = useState(false);

  // 見た目をすぐ切り替えるため、先に画面の状態を変えてから
  // Server Action で保存し、失敗したら元に戻す
  async function handleToggleStarred() {
    const next = !starredOpen;
    setStarredOpen(next);
    const result = await setShowStarredPagesSetting(next);
    if (!result.ok) {
      setStarredOpen(!next);
    }
  }

  async function handleToggleRecent() {
    const next = !recentOpen;
    setRecentOpen(next);
    const result = await setShowRecentlyViewedPagesSetting(next);
    if (!result.ok) {
      setRecentOpen(!next);
    }
  }

  const visibleRecentPages = recentExpanded
    ? recentPages
    : recentPages.slice(0, RECENT_PAGES_INITIAL_COUNT);
  // 履歴が6件以上あるときだけ「もっと表示する」を出す
  const hasMoreRecentPages = recentPages.length > RECENT_PAGES_INITIAL_COUNT;

  return (
    <aside className={styles.sidebar}>
      <section className={styles.section}>
        <SectionHeading
          open={starredOpen}
          onToggle={handleToggleStarred}
          icon={<StarIcon filled />}
          title="スター付き"
        />

        {/* 開いているときだけ一覧を描画する
            React では、条件が false のものは何も描画されない */}
        {starredOpen && starredPages.length === 0 && (
          <p className={styles.empty}>スターの付いたページはありません</p>
        )}

        {starredOpen && starredPages.length > 0 && (
          <ul className={styles.list}>
            {/* 配列から要素を作るときは、要素を区別するための key が必要
                URLパスは重複しないので、そのまま key に使える */}
            {starredPages.map((urlPath) => (
              <PageItem key={urlPath} urlPath={urlPath} />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <SectionHeading
          open={recentOpen}
          onToggle={handleToggleRecent}
          icon={<ClockIcon />}
          title="最近アクセスしたページ"
        />

        {/* 履歴が0件のときは、一覧の代わりに何も表示しない */}
        {recentOpen && recentPages.length > 0 && (
          <ul className={styles.list}>
            {visibleRecentPages.map((urlPath) => (
              <PageItem key={urlPath} urlPath={urlPath} />
            ))}
            {/* 最大20件を表示しているときは、21件目以降があるかに関わらず
                常に「(以下略)」を表示する */}
            {recentExpanded && (
              <li className={styles.omitted}>(以下略)</li>
            )}
            {hasMoreRecentPages && (
              <li>
                <button
                  type="button"
                  className={styles.moreButton}
                  onClick={() => setRecentExpanded(!recentExpanded)}
                >
                  {recentExpanded ? "少なく表示する" : "もっと表示する"}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </aside>
  );
}
