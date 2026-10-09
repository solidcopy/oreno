import styles from "./SidebarToggleButton.module.css";

/**
 * ヘッダー左端に置く、サイドバーの表示をオンオフするボタン
 * 状態を持たず、表示中かどうかと、クリックされたときの処理は親から受け取る
 * アイコンの見た目は状態によって変えない
 */
export default function SidebarToggleButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onToggle}
      aria-label="サイドバーの表示を切り替える"
      aria-expanded={visible}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M7.5 3.5v13" />
      </svg>
    </button>
  );
}
