import { useState } from "react";
import { createPortal } from "react-dom";
import styles from "./LinkDialog.module.css";

type Props = {
  /** リンク先の初期値 */
  initialUrl: string;
  /** リンクテキストの初期値 */
  initialText: string;
  /** 「リンクを挿入」を押す（またはEnterを押す）と、入力された値を渡して呼ばれる */
  onSubmit: (url: string, text: string) => void;
  /** 「キャンセル」、モーダルの外のクリック、Escキーで呼ばれる */
  onCancel: () => void;
};

/**
 * リンク先とリンクテキストを入力するモーダル
 *
 * 入力欄は <form> に入れ、「リンクを挿入」を submit ボタンにしている
 * こうすると、入力欄でEnterを押したときにブラウザが自動で submit を起こす
 * 日本語入力の変換を確定するEnterでは submit されない
 * ボタンが disabled のときも submit されない
 *
 * 表示中だけマウントされる前提で、入力値は初期値から始まる state として持つ
 * 開くたびに作り直されるので、前回の入力が残ることはない
 */
export default function LinkDialog({
  initialUrl,
  initialText,
  onSubmit,
  onCancel,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);

  const canSubmit = url.trim() !== "";

  // createPortal で document.body の直下に描画する
  // エディタの親要素の overflow や z-index の影響を受けずに画面全体を覆うため
  return createPortal(
    <div
      className={styles.overlay}
      // 入力欄でマウスを押して外へドラッグしたときに閉じないよう、
      // click ではなく「オーバーレイ自身の上で押した」ときだけ閉じる
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(url.trim(), text);
        }}
      >
        <h2 id="link-dialog-title" className={styles.title}>
          リンクを設定
        </h2>
        <div className={styles.field}>
          <label htmlFor="link-dialog-url" className={styles.label}>
            リンク先
          </label>
          <input
            id="link-dialog-url"
            className={styles.input}
            type="text"
            value={url}
            placeholder="https://example.com"
            // 開いたらすぐ入力を始められるよう、リンク先にフォーカスする
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="link-dialog-text" className={styles.label}>
            リンクテキスト
          </label>
          <input
            id="link-dialog-text"
            className={styles.input}
            type="text"
            value={text}
            placeholder="表示するテキスト"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            リンクを挿入
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
