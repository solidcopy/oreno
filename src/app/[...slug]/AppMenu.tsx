"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "./AppMenu.module.css";
import { useClosePopoverOnOutsideClick } from "./useClosePopoverOnOutsideClick";

export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  function handleToggle() {
    setOpen((current) => !current);
  }

  function handleClose() {
    setOpen(false);
  }

  useClosePopoverOnOutsideClick(open, wrapRef, handleClose);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={handleToggle}
        aria-label="アプリメニューを開く"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="4" cy="10" r="1.8" fill="currentColor" />
          <circle cx="10" cy="10" r="1.8" fill="currentColor" />
          <circle cx="16" cy="10" r="1.8" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className={styles.popover} role="menu" aria-label="アプリメニュー">
          <a
            href="https://github.com/solidcopy/oreno"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={styles.menuItem}
            onClick={handleClose}
          >
            Orenoについて
          </a>
          <div className={styles.divider} />
          <Link
            href="/.oreno/all_pages"
            role="menuitem"
            className={styles.menuItem}
            onClick={handleClose}
          >
            すべてのページ
          </Link>
          <div className={styles.divider} />
          <Link
            href="/.oreno/project_settings"
            role="menuitem"
            className={styles.menuItem}
            onClick={handleClose}
          >
            プロジェクト設定
          </Link>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={handleClose}>
            ユーザー設定
          </button>
        </div>
      )}
    </div>
  );
}
