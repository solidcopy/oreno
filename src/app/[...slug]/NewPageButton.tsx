"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import docStyles from "./DocumentPage.module.css";
import styles from "./NewPageButton.module.css";
import { checkDocumentExists } from "../actions";
import { useClosePopoverOnOutsideClick } from "./useClosePopoverOnOutsideClick";
import { APP_RESERVED_SEGMENT, isAppReservedPath } from "@/lib/appReservedPath";

const RESERVED_PATH_ERROR = `"${APP_RESERVED_SEGMENT}" から始まるパスにはページを作成できません。`;

// 入力が止まってからこの時間が経つまでは、既存ファイルとの重複チェックを行わない
// キー入力のたびに毎回サーバーへ問い合わせると無駄なリクエストが増えるため、
// 入力の区切りで一度だけ確認する
const DUPLICATE_CHECK_DELAY_MS = 400;

type Props = {
  // 新しいページのパスの初期値（現在表示中のページがあるフォルダ）を
  // 決めるために、今表示しているページの slug を受け取る
  slug: string[];
};

export default function NewPageButton({ slug }: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 重複チェックの結果が古い入力のものにならないようにするための通し番号
  const existsCheckToken = useRef(0);
  const existsCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleOpen() {
    const folder = slug.slice(0, -1);
    setPath(folder.length > 0 ? folder.join("/") + "/" : "");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (existsCheckTimer.current) {
      clearTimeout(existsCheckTimer.current);
      existsCheckTimer.current = null;
    }
    setOpen(false);
    setError(null);
  }

  // 入力欄が画面に現れた瞬間（ポップアップを開いた瞬間）にフォーカスして
  // カーソルを末尾に置く（同じフォルダに作るならファイル名を続けて入力するだけで
  // 済むようにするため）
  // useEffect ではなく ref のコールバック関数にしているのは、この処理が
  // 「入力欄というDOM要素が生成されたタイミングで一度だけ行いたいこと」であり、
  // useState の値の変化を監視する必要が無いため
  // （useCallback で関数の中身を固定しないと、再描画のたびに新しい関数が
  // 渡されたと React に判断され、キー入力のたびにカーソルが末尾へ
  // 飛び直してしまう）
  const focusPathInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  useClosePopoverOnOutsideClick(open, wrapRef, handleClose);

  // 入力が落ち着いたタイミングで、同じパスのファイルがすでに無いか確認する
  // 「path が変わったら」ではなく「ユーザーが入力したら」が本来のきっかけなので、
  // useEffect ではなく onChange ハンドラの中でタイマーを仕込む形にしている
  function scheduleExistsCheck(value: string) {
    if (existsCheckTimer.current) {
      clearTimeout(existsCheckTimer.current);
    }

    const trimmed = value.trim();
    if (trimmed === "" || trimmed.endsWith("/")) {
      // ファイル名部分がまだ無いので確認しない
      return;
    }

    const token = ++existsCheckToken.current;
    existsCheckTimer.current = setTimeout(() => {
      const segments = trimmed.split("/").filter((segment) => segment.length > 0);
      checkDocumentExists(segments).then((exists) => {
        // 確認結果が返ってくるまでの間にさらに入力が進んでいたら、古い結果は無視する
        if (token !== existsCheckToken.current) return;
        setError(exists ? "ファイルはすでに存在します。" : null);
      });
    }, DUPLICATE_CHECK_DELAY_MS);
  }

  function handlePathChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setPath(value);
    setError(null);

    const segments = value.trim().split("/").filter((segment) => segment.length > 0);
    if (isAppReservedPath(segments)) {
      setError(RESERVED_PATH_ERROR);
      return;
    }

    scheduleExistsCheck(value);
  }

  function handlePathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreate();
    }
  }

  async function handleCreate() {
    const trimmed = path.trim();
    if (trimmed === "" || trimmed.endsWith("/")) {
      setError("ファイル名を入力してください。");
      return;
    }

    const segments = trimmed.split("/").filter((segment) => segment.length > 0);

    if (isAppReservedPath(segments)) {
      setError(RESERVED_PATH_ERROR);
      return;
    }

    // 入力中の確認が間に合っていない場合に備えて、作成の直前にも確認する
    const exists = await checkDocumentExists(segments);
    if (exists) {
      setError("ファイルはすでに存在します。");
      return;
    }

    handleClose();
    router.push("/" + segments.join("/"));
  }

  return (
    <div className={styles.newPageWrap} ref={wrapRef}>
      <button
        type="button"
        className={docStyles.button}
        onClick={open ? handleClose : handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        新規作成
      </button>

      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="新しいページのパスを入力"
        >
          <label htmlFor="newPagePath" className={styles.popoverLabel}>
            新しいページのパス
          </label>
          <div className={styles.pathInputRow}>
            <input
              id="newPagePath"
              ref={focusPathInput}
              type="text"
              className={
                error ? `${styles.pathInput} ${styles.pathInputInvalid}` : styles.pathInput
              }
              value={path}
              onChange={handlePathChange}
              onKeyDown={handlePathKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
            <span className={styles.pathSuffix}>.md</span>
          </div>
          {error && <p className={styles.popoverError}>{error}</p>}
          <div className={styles.popoverActions}>
            <button type="button" className={docStyles.button} onClick={handleClose}>
              キャンセル
            </button>
            <button
              type="button"
              className={docStyles.buttonPrimary}
              onClick={handleCreate}
            >
              作成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
