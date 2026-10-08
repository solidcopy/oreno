import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

/**
 * 一覧の見出し
 * 「＞」とアイコンとタイトルを並べたボタンで、押すと onToggle を呼ぶ
 * 開閉する一覧が複数あるため、見出しの見た目をここにまとめている
 */
export default function SectionHeading({
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
