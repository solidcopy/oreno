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

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import StarIcon from "@/components/StarIcon";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { FolderEntries } from "@/lib/folder";
import type { Heading } from "@/lib/headings";
import {
  loadFolderEntries,
  setShowPagesSetting,
  setShowHistoriesSetting,
  setShowStarredPagesSetting,
  setShowTocSetting,
} from "../actions";
import { useSavedToggle } from "./useSavedToggle";
import styles from "./Sidebar.module.css";

type Props = {
  // スター付きページのURLパス（例: "/spec/entities/reservation"）
  starredPages: string[];
  // 「スター付き」の一覧を開いているかどうかの保存済みの値
  initialShowStarredPages: boolean;
  // 履歴のURLパス（新しい順。「もっと表示する」で見せる分まで）
  histories: string[];
  // 「履歴」の一覧を開いているかどうかの保存済みの値
  initialShowHistories: boolean;
  // 表示中のページのslug（例: ["spec", "entities", "reservation"]）
  slug: string[];
  // 表示中のページがあるフォルダの中身
  folderEntries: FolderEntries;
  // 「ページ」の一覧を開いているかどうかの保存済みの値
  initialShowPages: boolean;
  // 表示中のページの見出し（文書の上からの順）
  headings: Heading[];
  // 「目次」の一覧を開いているかどうかの保存済みの値
  initialShowToc: boolean;
  // 目次の項目がクリックされたときに、何番目の見出しかを渡して呼ぶ
  // Server Component からは呼ばれないため、警告（TS71007）は無視してよい
  onSelectHeading: (index: number) => void;
};

// 「履歴」で最初に表示する件数
const HISTORIES_INITIAL_COUNT = 5;

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

// 文書のアイコン（紙の中に横線を描いたもの）
function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={styles.softIcon}
    >
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

// 目次のアイコン（点と横線を3行並べた箇条書きの形）
function TocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={styles.softIcon}
    >
      <path d="M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

// 一覧の項目に付ける、ページのアイコン（折り目のある紙の輪郭だけ）
// フォルダのアイコン（塗りつぶし）と見分けやすいよう、塗らずに線だけで描く
function PageEntryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      className={styles.softIcon}
    >
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

// 一覧の項目に付ける、フォルダのアイコン（塗りつぶし）
function FolderEntryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      className={styles.folderIcon}
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
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
  histories,
  initialShowHistories,
  slug,
  folderEntries,
  initialShowPages,
  headings,
  initialShowToc,
  onSelectHeading,
}: Props) {
  // 各一覧を開いているかどうかと、それを切り替える関数
  // 開閉の状態は全ページ共通の設定としてユーザー設定に保存する
  // 切り替えると先に画面が変わり、保存に失敗したら元に戻る（useSavedToggle の中身）
  const [starredOpen, toggleStarred] = useSavedToggle(
    initialShowStarredPages,
    setShowStarredPagesSetting,
  );
  const [historiesOpen, toggleHistories] = useSavedToggle(
    initialShowHistories,
    setShowHistoriesSetting,
  );
  const [pagesOpen, togglePages] = useSavedToggle(
    initialShowPages,
    setShowPagesSetting,
  );
  const [tocOpen, toggleToc] = useSavedToggle(
    initialShowToc,
    setShowTocSetting,
  );

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

  // 「履歴」を5件より多く表示しているかどうか
  // 保存はせず、ページを表示し直すと5件に戻る
  const [historiesExpanded, setHistoriesExpanded] = useState(false);

  // フォルダをクリックしたとき、そのフォルダの中身をサーバーから取得して一覧を切り替える
  // 表示中のページは変わらない
  async function handleOpenFolder(folder: string[]) {
    const result = await loadFolderEntries(folder);
    if (result.ok) {
      setBrowsed({ folder, entries: result.entries });
    }
  }

  const visibleHistories = historiesExpanded
    ? histories
    : histories.slice(0, HISTORIES_INITIAL_COUNT);
  // 履歴が6件以上あるときだけ「もっと表示する」を出す
  const hasMoreHistories = histories.length > HISTORIES_INITIAL_COUNT;

  return (
    <aside className={styles.sidebar}>
      <section className={styles.section}>
        <SectionHeading
          open={starredOpen}
          onToggle={toggleStarred}
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
          open={historiesOpen}
          onToggle={toggleHistories}
          icon={<ClockIcon />}
          title="履歴"
        />

        {/* 履歴が0件のときは、一覧の代わりに何も表示しない */}
        {historiesOpen && histories.length > 0 && (
          <ul className={styles.list}>
            {visibleHistories.map((urlPath) => (
              <PageItem key={urlPath} urlPath={urlPath} />
            ))}
            {/* 最大20件を表示しているときは、21件目以降があるかに関わらず
                常に「(以下略)」を表示する */}
            {historiesExpanded && (
              <li className={styles.omitted}>(以下略)</li>
            )}
            {hasMoreHistories && (
              <li>
                <button
                  type="button"
                  className={styles.moreButton}
                  onClick={() => setHistoriesExpanded(!historiesExpanded)}
                >
                  {historiesExpanded ? "少なく表示する" : "もっと表示する"}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <SectionHeading
          open={pagesOpen}
          onToggle={togglePages}
          icon={<DocumentIcon />}
          title="ページ"
        />

        {pagesOpen && (
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
            {shownEntries.folders.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={styles.entryButton}
                  onClick={() => handleOpenFolder([...shownFolder, name])}
                >
                  <FolderEntryIcon />
                  <span className={styles.entryName}>{name}</span>
                </button>
              </li>
            ))}
            {shownEntries.pages.map((name) => {
              const pageSlug = [...shownFolder, name];
              // 表示中のページの行は強調する
              const isCurrent = pageSlug.join("/") === slugKey;
              return (
                <li key={name}>
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

        {pagesOpen &&
          shownEntries.folders.length === 0 &&
          shownEntries.pages.length === 0 && (
            <p className={styles.empty}>ページはありません</p>
          )}
      </section>

      <section className={styles.section}>
        <SectionHeading
          open={tocOpen}
          onToggle={toggleToc}
          icon={<TocIcon />}
          title="目次"
        />

        {tocOpen && headings.length === 0 && (
          <p className={styles.empty}>見出しはありません</p>
        )}

        {tocOpen && headings.length > 0 && (
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
    </aside>
  );
}
