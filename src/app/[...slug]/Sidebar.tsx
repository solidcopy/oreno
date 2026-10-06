"use client";

/**
 * サイドバー
 * 現時点ではスター付きページの一覧だけを表示する
 *
 * 開閉の状態はブラウザ上で切り替わる値なので、useState を使うために
 * Client Component にしている
 * スター付きページの一覧そのものは、page.tsx（Server Component）が
 * ファイルから読み込んで props として渡してくる
 */

import { useState } from "react";
import Link from "next/link";
import StarIcon from "@/components/StarIcon";
import styles from "./Sidebar.module.css";

type Props = {
  // スター付きページのURLパス（例: "/spec/entities/reservation"）
  staredPages: string[];
};

// URLパスの最後の要素（例: "/spec/entities/reservation" なら "reservation"）
function lastSegment(urlPath: string): string {
  return urlPath.split("/").pop() ?? urlPath;
}

export default function Sidebar({ staredPages }: Props) {
  // 「スター付き」の一覧を開いているかどうか
  // 開閉の状態は保存せず、ページを表示し直すと開いた状態に戻る
  const [open, setOpen] = useState(true);

  return (
    <aside className={styles.sidebar}>
      <button
        type="button"
        className={styles.heading}
        onClick={() => setOpen(!open)}
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
        <StarIcon filled />
        <span className={styles.title}>スター付き</span>
      </button>

      {/* 開いているときだけ一覧を描画する
          React では、条件が false のものは何も描画されない */}
      {open && staredPages.length === 0 && (
        <p className={styles.empty}>スターの付いたページはありません</p>
      )}

      {open && staredPages.length > 0 && (
        <ul className={styles.list}>
          {/* 配列から要素を作るときは、要素を区別するための key が必要
              URLパスは重複しないので、そのまま key に使える */}
          {staredPages.map((urlPath) => (
            <li key={urlPath} className={styles.item}>
              <Link href={urlPath} className={styles.link}>
                {lastSegment(urlPath)}
              </Link>
              {/* 最後の要素だけでは同名のページを見分けられないため、
                  ホバーしたときにパス全体を表示する */}
              <span className={styles.tip} role="tooltip">
                {urlPath}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
