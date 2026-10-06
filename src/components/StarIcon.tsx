import styles from "./StarIcon.module.css";

/**
 * スターのアイコン
 * ページのスターボタン（DocumentPage）と、これから実装するサイドバーの
 * 「スター付き」見出しの両方で使うため、共通コンポーネントにしている
 * filled が true なら黄色で塗りつぶした「スター付き」の見た目、
 * false なら枠線だけの「スター無し」の見た目になる
 * 線の色は currentColor なので、枠線は親要素の文字色に合わせて変わる
 */
export default function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={filled ? styles.on : styles.off}
    >
      <polygon points="12,2.5 14.8,8.9 21.7,9.5 16.5,14.1 18.1,21 12,17.4 5.9,21 7.5,14.1 2.3,9.5 9.2,8.9" />
    </svg>
  );
}
