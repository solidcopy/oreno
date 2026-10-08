import styles from "./Sidebar.module.css";

// 時計の形のアイコン（円の中に針を描いたもの）
export function ClockIcon() {
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
export function DocumentIcon() {
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
export function TocIcon() {
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
export function PageEntryIcon() {
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
export function FolderEntryIcon() {
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
