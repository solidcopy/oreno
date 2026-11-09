import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { checkImageFileExists } from "@/app/actions";
import { resolveImagePath } from "@/lib/imagePath";
import FolderPathInput from "./FolderPathInput";
// 画像挿入モーダルと同じ見た目なので、CSSを共用する
import styles from "./LinkDialog.module.css";
import importStyles from "./ImageImportDialog.module.css";

type Props = {
  /** 画像を挿入するページの slug（相対パスの基準になるページのフォルダを求める） */
  slug: string[];
  /** 画像パスの初期入力 */
  initialPath: string;
  /** ページのフォルダ（"/" から始まる絶対形式。文書ルート直下のページは空文字） */
  pageFolder: string;
  /** プロジェクト設定の画像フォルダ一覧 */
  imageFolders: string[];
  /**
   * 「画像をインポート」を押すと、入力された値を渡して呼ばれる
   * 呼び出し側がファイルのコピーと埋め込みを終えるまで、ボタンは押せなくなる
   */
  onSubmit: (path: string, title: string, alt: string) => Promise<void>;
  /** 「キャンセル」、モーダルの外のクリック、Escキーで呼ばれる */
  onCancel: () => void;
};

const OVERWRITE_MESSAGE = "すでに同じパスにファイルがあります。上書きしますか？";

/**
 * ドロップされた画像を文書セットへインポートするときの、保存先などを設定するモーダル
 * ドロップした画像ファイル自体は、呼び出し側（MarkdownEditor）が持っている
 */
export default function ImageImportDialog({
  slug,
  initialPath,
  pageFolder,
  imageFolders,
  onSubmit,
  onCancel,
}: Props) {
  const [path, setPath] = useState(initialPath);
  const [title, setTitle] = useState("");
  const [alt, setAlt] = useState("");

  // すでにファイルがあることを確認できた画像パス（警告の表示に使う）
  const [existingPath, setExistingPath] = useState<string | null>(null);
  // 画像フォルダ選択ボタンのメニューを開いているか
  const [menuOpen, setMenuOpen] = useState(false);
  // コピーと埋め込みの途中か
  const [submitting, setSubmitting] = useState(false);

  // 画像パスの入力を、使えるパスかどうかも含めて解決する
  const resolved = useMemo(() => resolveImagePath(slug, path), [slug, path]);
  const canSubmit = resolved.ok && !submitting;

  // 入力された画像パスに、ファイルがすでにあるかを、入力のたびにサーバーへ問い合わせる
  // 入力が続いて古くなった問い合わせの結果は捨てる
  useEffect(() => {
    if (!resolved.ok) return;
    let cancelled = false;
    const input = path.trim();
    checkImageFileExists(slug, input)
      .then((result) => {
        if (!cancelled) setExistingPath(result ? input : null);
      })
      .catch(() => {
        if (!cancelled) setExistingPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, path, resolved.ok]);

  // 今の入力にファイルがあることを確認できているか
  // 入力が変わった直後は、確認した画像パスと一致しないので、警告は出ない
  const exists = resolved.ok && existingPath === path.trim();

  // 画像フォルダ選択ボタンのメニューの項目
  // 1つ目はページのフォルダ、2つ目以降はプロジェクト設定の画像フォルダ一覧
  const folderItems = [
    { label: "（ページのフォルダ）", folder: pageFolder },
    ...imageFolders.map((folder) => ({ label: folder, folder })),
  ];

  // 画像パスのファイル名より前のフォルダ部分を、選んだフォルダのフルパスに置き換える
  const selectFolder = (folder: string) => {
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    setPath(`${folder}/${fileName}`);
    setMenuOpen(false);
    document.getElementById("image-import-dialog-path")?.focus();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 入力してから押すまでの間にファイルが作られることもあるので、押した時点で確認し直す
      const existsNow = await checkImageFileExists(slug, path.trim()).catch(
        () => false,
      );
      // 上書きしないときは、処理を中断してモーダルは表示したままにする
      if (existsNow && !window.confirm(OVERWRITE_MESSAGE)) return;
      await onSubmit(path.trim(), title, alt);
    } finally {
      setSubmitting(false);
    }
  };

  // 入力が空のときは、エラーではなく「まだ入力していない」ので、メッセージは出さない
  const errorMessage =
    !resolved.ok && path.trim() !== "" ? resolved.message : null;

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
        aria-labelledby="image-import-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <h2 id="image-import-dialog-title" className={styles.title}>
          画像をインポート
        </h2>
        <div className={styles.field}>
          <label htmlFor="image-import-dialog-path" className={styles.label}>
            画像パス
          </label>
          <div className={importStyles.pathRow}>
            <div className={importStyles.pathInput}>
              <FolderPathInput
                id="image-import-dialog-path"
                value={path}
                onChange={setPath}
                inputClassName={styles.input}
                placeholder="images/example.png"
                withFileName
                // 開いたらすぐ入力を始められるよう、画像パスにフォーカスする
                autoFocus
              />
            </div>
            {/* メニューとボタンをまとめる
                フォーカスがメニューの外へ移ったときにメニューを閉じる */}
            <div
              className={importStyles.menuAnchor}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                className={importStyles.folderButton}
                aria-label="画像フォルダを選択"
                title="画像フォルダを選択"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </button>
              {menuOpen && (
                <ul
                  className={importStyles.menu}
                  role="menu"
                  aria-label="画像フォルダ"
                  onKeyDown={(e) => {
                    // モーダルは閉じず、メニューだけを閉じてボタンに戻る
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                    }
                  }}
                >
                  {folderItems.map((item) => (
                    <li key={item.label} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className={importStyles.menuItem}
                        // マウスを押した時点でフォーカスが外れて、メニューが閉じてしまわないようにする
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectFolder(item.folder)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {errorMessage && (
            <p className={importStyles.error} role="alert">
              {errorMessage}
            </p>
          )}
          {!errorMessage && exists && (
            <p className={importStyles.warning}>同じパスにファイルがあります</p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="image-import-dialog-title-input" className={styles.label}>
            タイトル
          </label>
          <input
            id="image-import-dialog-title-input"
            className={styles.input}
            type="text"
            value={title}
            placeholder="ツールチップなどに利用される画像タイトル"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="image-import-dialog-alt" className={styles.label}>
            代替テキスト
          </label>
          <input
            id="image-import-dialog-alt"
            className={styles.input}
            type="text"
            value={alt}
            placeholder="画像を表示できないときのテキスト"
            onChange={(e) => setAlt(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            画像をインポート
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
