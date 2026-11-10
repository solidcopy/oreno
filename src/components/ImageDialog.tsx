import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { linkTargetExists } from "@/app/actions";
import { isImageFile } from "@/lib/imageFile";
import { searchCandidates, type Candidate } from "@/lib/candidates";
// リンク設定モーダルと同じ見た目なので、CSSを共用する
import styles from "./LinkDialog.module.css";
import {
  handleCandidateInputKeyDown,
  handleCandidateListKeyDown,
  handleDialogKeyDown,
  toSlug,
} from "./dialogBehavior";
import { useCandidateFiles } from "./useCandidateFiles";

/** モーダルの入力欄の値 */
export type ImageValues = {
  src: string;
  title: string;
  alt: string;
};

type Props = {
  /**
   * 既存の画像を変更するときの、入力欄の初期値
   * 指定したときは「画像を変更」になり、省略したときは空欄から始まる「画像を挿入」になる
   */
  initial?: ImageValues;
  /** 「画像を挿入」「画像を変更」を押す（またはEnterを押す）と、入力された値を渡して呼ばれる */
  onSubmit: (src: string, title: string, alt: string) => void;
  /** 「キャンセル」、モーダルの外のクリック、Escキーで呼ばれる */
  onCancel: () => void;
};

// 取得したファイルの一覧から、画像ファイルだけを候補にする
// useCandidateFiles は渡された関数が変わると一覧を取得し直すため、
// 描画のたびに作り直されないようコンポーネントの外で定義する
const selectImages = (files: string[]) => files.filter(isImageFile);

/**
 * 画像パス・タイトル・代替テキストを入力するモーダル
 *
 * 作りはリンク設定モーダル（LinkDialog）と同じ
 * 入力欄は <form> に入れ、「画像を挿入」を submit ボタンにしている
 * 表示中だけマウントされる前提で、入力値は初期値（省略時は空）から始まる state として持つ
 * 開くたびに作り直されるので、前回の入力が残ることはない
 *
 * 画像パスを入力している間は、文書にある画像ファイルを候補としてドロップダウンに表示する
 */
export default function ImageDialog({ initial, onSubmit, onCancel }: Props) {
  const [src, setSrc] = useState(initial?.src ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [alt, setAlt] = useState(initial?.alt ?? "");

  // 候補の絞り込みに使う、確定済みの画像パス
  // 日本語入力の変換中（未確定）の文字列は含めないため、src とは別に持つ
  const [query, setQuery] = useState(initial?.src ?? "");

  // サーバーから取得した画像ファイルの一覧と、取得が終わったかどうか
  const { files, ready: filesReady } = useCandidateFiles(selectImages);

  // 入力欄またはドロップダウンにフォーカスがあるか
  const [focused, setFocused] = useState(false);
  // Escキーや選択でドロップダウンを閉じたか（次に画像パスを入力するまで表示しない）
  // 画像を変更するときは、初期値の画像パスに対する存在の確認が終わる前に
  // ドロップダウンが一瞬出ないよう、最初から閉じておく
  const [dismissed, setDismissed] = useState(initial !== undefined);
  // キーボードで選択している候補の位置（選択していないときは -1）
  const [activeIndex, setActiveIndex] = useState(-1);
  // 実際にファイルが存在することを確認できた query
  const [existingQuery, setExistingQuery] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const canSubmit = src.trim() !== "";

  // 入力された画像パスに、対応するファイルが実際にあるかを調べる
  // あれば選択済みとみなして、ドロップダウンを閉じる
  useEffect(() => {
    let cancelled = false;
    const slug = toSlug(query);
    Promise.resolve(slug ? linkTargetExists(slug) : false)
      .then((exists) => {
        if (!cancelled) setExistingQuery(exists ? query : null);
      })
      .catch(() => {
        if (!cancelled) setExistingQuery(null);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const candidates = useMemo(
    () => searchCandidates(files, query),
    [files, query],
  );

  // ファイル一覧の取得中は、候補の代わりに取得中であることを表示する
  const open =
    query.length > 0 &&
    focused &&
    !dismissed &&
    existingQuery !== query &&
    (!filesReady || candidates.length > 0);

  // キーボードで選択した候補が、スクロールで隠れないようにする
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`image-candidate-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // 画像パスが変わったら、候補の選択と「閉じた」状態を最初に戻す
  const changeQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    setDismissed(false);
  };

  const selectCandidate = (candidate: Candidate) => {
    setSrc(candidate.link);
    setQuery(candidate.link);
    setActiveIndex(-1);
    setDismissed(true);
    inputRef.current?.focus();
  };

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
      onKeyDown={(e) => handleDialogKeyDown(e, onCancel)}
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(src.trim(), title, alt);
        }}
      >
        <h2 id="image-dialog-title" className={styles.title}>
          {initial ? "画像を変更" : "画像を挿入"}
        </h2>
        <div className={styles.field}>
          <label htmlFor="image-dialog-src" className={styles.label}>
            画像パス
          </label>
          {/* 入力欄とドロップダウンをまとめる
              どちらにフォーカスがあっても、入力欄にフォーカスがあるように見せるため、
              入力欄の枠はこの要素の :focus-within で切り替えている */}
          <div
            className={styles.urlControl}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              // フォーカスが入力欄とドロップダウンの間で移るだけのときは外れたとみなさない
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setFocused(false);
              }
            }}
          >
            <input
              ref={inputRef}
              id="image-dialog-src"
              className={styles.input}
              type="text"
              value={src}
              placeholder="images/example.png"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? "image-dialog-candidates" : undefined}
              aria-autocomplete="list"
              // 開いたらすぐ入力を始められるよう、画像パスにフォーカスする
              autoFocus
              onChange={(e) => {
                setSrc(e.target.value);
                // 変換中の未確定の文字列では、候補を更新しない
                if (!(e.nativeEvent as InputEvent).isComposing) {
                  changeQuery(e.target.value);
                }
              }}
              onCompositionEnd={(e) => changeQuery(e.currentTarget.value)}
              onKeyDown={(e) =>
                handleCandidateInputKeyDown(e, {
                  open,
                  candidateCount: candidates.length,
                  setActiveIndex,
                  listRef,
                })
              }
            />
            {open && !filesReady && (
              <div className={styles.dropdown} role="status">
                <div className={styles.loading}>(ファイル一覧を取得中...)</div>
              </div>
            )}
            {open && filesReady && (
              <ul
                ref={listRef}
                id="image-dialog-candidates"
                className={styles.dropdown}
                role="listbox"
                aria-label="画像パスの候補"
                aria-activedescendant={
                  activeIndex >= 0 ? `image-candidate-${activeIndex}` : undefined
                }
                // Tabキーの移動では止まらず、下キーのときだけフォーカスを受ける
                tabIndex={-1}
                onKeyDown={(e) =>
                  handleCandidateListKeyDown(e, {
                    candidates,
                    activeIndex,
                    setActiveIndex,
                    setDismissed,
                    inputRef,
                    onSelect: selectCandidate,
                  })
                }
              >
                {candidates.map((candidate, i) => (
                  <li
                    key={candidate.path}
                    id={`image-candidate-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={
                      i === activeIndex
                        ? `${styles.candidate} ${styles.candidateActive}`
                        : styles.candidate
                    }
                    // マウスを押した時点でフォーカスが外れて閉じてしまわないようにする
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCandidate(candidate)}
                  >
                    <span className={styles.candidateName}>{candidate.name}</span>
                    <span className={styles.candidateDir}>{candidate.dir}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="image-dialog-title-input" className={styles.label}>
            タイトル
          </label>
          <input
            id="image-dialog-title-input"
            className={styles.input}
            type="text"
            value={title}
            placeholder="ツールチップなどに利用される画像タイトル"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="image-dialog-alt" className={styles.label}>
            代替テキスト
          </label>
          <input
            id="image-dialog-alt"
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
            {initial ? "画像を変更" : "画像を挿入"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
