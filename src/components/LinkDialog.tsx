import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { linkTargetExists } from "@/app/actions";
import { searchCandidates, type Candidate } from "@/lib/candidates";
import styles from "./LinkDialog.module.css";
import {
  handleCandidateInputKeyDown,
  handleCandidateListKeyDown,
  handleDialogKeyDown,
  toSlug,
} from "./dialogBehavior";
import { useCandidateFiles } from "./useCandidateFiles";

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
 *
 * リンク先を入力している間は、文書にあるページやファイルを候補としてドロップダウンに表示する
 * 候補の一覧はモーダルを開いたときにサーバーから取得する
 */
export default function LinkDialog({
  initialUrl,
  initialText,
  onSubmit,
  onCancel,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);

  // 候補の絞り込みに使う、確定済みのリンク先
  // 日本語入力の変換中（未確定）の文字列は含めないため、url とは別に持つ
  const [query, setQuery] = useState(initialUrl);

  // サーバーから取得したファイルの一覧と、取得が終わったかどうか
  const { files, ready: filesReady } = useCandidateFiles();

  // 入力欄またはドロップダウンにフォーカスがあるか
  const [focused, setFocused] = useState(false);
  // Escキーや選択でドロップダウンを閉じたか（次にリンク先を入力するまで表示しない）
  const [dismissed, setDismissed] = useState(false);
  // キーボードで選択している候補の位置（選択していないときは -1）
  const [activeIndex, setActiveIndex] = useState(-1);
  // 実際にページまたはファイルが存在することを確認できた query
  const [existingQuery, setExistingQuery] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const canSubmit = url.trim() !== "";

  // 入力されたリンク先に、対応するページまたはファイルが実際にあるかを調べる
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
      .getElementById(`link-candidate-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // リンク先が変わったら、候補の選択と「閉じた」状態を最初に戻す
  const changeQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    setDismissed(false);
  };

  const selectCandidate = (candidate: Candidate) => {
    setUrl(candidate.link);
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
              id="link-dialog-url"
              className={styles.input}
              type="text"
              value={url}
              placeholder="https://example.com"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? "link-dialog-candidates" : undefined}
              aria-autocomplete="list"
              // 開いたらすぐ入力を始められるよう、リンク先にフォーカスする
              autoFocus
              onChange={(e) => {
                setUrl(e.target.value);
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
                id="link-dialog-candidates"
                className={styles.dropdown}
                role="listbox"
                aria-label="リンク先の候補"
                aria-activedescendant={
                  activeIndex >= 0 ? `link-candidate-${activeIndex}` : undefined
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
                    id={`link-candidate-${i}`}
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
