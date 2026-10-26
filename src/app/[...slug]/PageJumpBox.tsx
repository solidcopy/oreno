import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getLinkCandidates } from "../actions";
import { searchLinkCandidates, type LinkCandidate } from "@/lib/linkCandidates";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import styles from "./PageJumpBox.module.css";

// ファイル一覧の更新が終わっていないときに、取得し直すまでの待ち時間
const RETRY_MS = 1000;

/**
 * ヘッダー中央に置く、ページ名を入力してそのページへ移動するための入力欄と移動ボタン
 *
 * 入力中は、文書にあるページやファイルを候補としてドロップダウンに表示する
 * 候補の絞り込みと並び順は、リンク設定モーダルのリンク先と同じ（searchLinkCandidates）
 * 候補を選ぶ（クリック、キーボードでの選択、移動ボタン、Enter）と、そのページへ移動する
 */
export default function PageJumpBox() {
  const router = useRouter();

  const [input, setInput] = useState("");
  // 候補の絞り込みに使う、確定済みの入力
  // 日本語入力の変換中（未確定）の文字列は含めないため、input とは別に持つ
  const [query, setQuery] = useState("");

  // サーバーから取得したファイルの一覧と、取得が終わったかどうか
  const [files, setFiles] = useState<string[]>([]);
  const [filesReady, setFilesReady] = useState(false);

  // 入力欄またはドロップダウンにフォーカスがあるか
  const [focused, setFocused] = useState(false);
  // Escキーで閉じたか（次に入力するまで表示しない）
  const [dismissed, setDismissed] = useState(false);
  // キーボードで選択している候補の位置（選択していないときは -1）
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // 一覧の取得を取り消すための通し番号とタイマー
  const loadToken = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画面から消えるときに、取得のやり直しを止める
  useEffect(() => {
    return () => {
      // loadToken は DOM 要素ではなく単なるカウンタなので、cleanup 時点の値を読んでよい
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadToken.current++;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  // ファイルの一覧を取得する
  // 入力欄にフォーカスしたときに、サーバーへ一覧の更新を依頼する（完了は待たない）
  // 更新中は更新前の一覧をそのまま使い、更新が終わるまで取り直して差し替える
  function loadFiles(refresh: boolean) {
    const token = ++loadToken.current;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    getLinkCandidates(refresh)
      .then((result) => {
        if (token !== loadToken.current) return;
        if (result.ready) {
          setFiles(result.files);
          setFilesReady(true);
        }
        if (!result.ready || result.scanning) {
          retryTimer.current = setTimeout(() => loadFiles(false), RETRY_MS);
        }
      })
      .catch(() => {
        // 取得に失敗したときは、候補が空のものとして扱う
        if (token === loadToken.current) setFilesReady(true);
      });
  }

  const candidates = useMemo(
    () => searchLinkCandidates(files, query),
    [files, query],
  );

  // ファイル一覧の取得中は、候補の代わりに取得中であることを表示する
  const open =
    query.length > 0 &&
    focused &&
    !dismissed &&
    (!filesReady || candidates.length > 0);

  // キーボードで選択した候補が、スクロールで隠れないようにする
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`page-jump-candidate-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // 入力が変わったら、候補の選択と「閉じた」状態を最初に戻す
  function changeQuery(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    setDismissed(false);
  }

  function moveTo(candidate: LinkCandidate) {
    setInput("");
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.blur();

    if (candidate.path.endsWith(".md")) {
      router.push(encodeUrlPath(candidate.link));
    } else {
      // Markdown 以外のファイルはページではなく、サーバーが直接配信する
      // クライアント側の画面遷移ではなく、通常のページ遷移にする
      window.location.assign(encodeUrlPath(candidate.link));
    }
  }

  // 移動ボタンとEnterの動作
  // 候補を選択していればそれに、していなければ先頭の候補に移動する
  function moveToSelectedOrFirst() {
    if (query.length === 0) return;
    const candidate = candidates[activeIndex >= 0 ? activeIndex : 0];
    if (candidate) moveTo(candidate);
  }

  return (
    <div className={styles.box}>
      {/* 入力欄とドロップダウンをまとめる
          どちらにフォーカスがあっても、入力欄にフォーカスがあるように見せるため、
          入力欄の枠はこの要素の :focus-within で切り替えている */}
      <div
        className={styles.control}
        onFocus={() => {
          if (!focused) loadFiles(true);
          setFocused(true);
        }}
        onBlur={(e) => {
          // フォーカスが入力欄とドロップダウンの間で移るだけのときは外れたとみなさない
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setFocused(false);
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          placeholder="ページ名を入力して移動"
          aria-label="移動先のページ名"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? "page-jump-candidates" : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setInput(e.target.value);
            // 変換中の未確定の文字列では、候補を更新しない
            if (!(e.nativeEvent as InputEvent).isComposing) {
              changeQuery(e.target.value);
            }
          }}
          onCompositionEnd={(e) => changeQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            // 漢字変換の確定で押したキーは、操作として扱わない
            // Safari では確定の Enter の keydown 時点で isComposing が false になっているため、
            // 変換中のキーイベントに付く keyCode 229 でも判定する
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;

            if (e.key === "ArrowDown" && open && candidates.length > 0) {
              // 下キーで、ドロップダウンの先頭の候補を選択する
              e.preventDefault();
              setActiveIndex(0);
              listRef.current?.focus();
            } else if (e.key === "Enter") {
              e.preventDefault();
              moveToSelectedOrFirst();
            } else if (e.key === "Escape") {
              setDismissed(true);
            }
          }}
        />
        {open && !filesReady && (
          <div className={styles.dropdown} role="status">
            <div className={styles.loading}>(ファイル一覧を取得中...)</div>
          </div>
        )}
        {open && filesReady && (
          <ul
            ref={listRef}
            id="page-jump-candidates"
            className={styles.dropdown}
            role="listbox"
            aria-label="移動先の候補"
            aria-activedescendant={
              activeIndex >= 0 ? `page-jump-candidate-${activeIndex}` : undefined
            }
            // Tabキーの移動では止まらず、下キーのときだけフォーカスを受ける
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, candidates.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                // 先頭で上キーを押したら、入力欄にフォーカスを戻す
                if (activeIndex <= 0) {
                  setActiveIndex(-1);
                  inputRef.current?.focus();
                } else {
                  setActiveIndex(activeIndex - 1);
                }
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (activeIndex >= 0) moveTo(candidates[activeIndex]);
              } else if (e.key === "Escape") {
                // ドロップダウンだけを閉じて入力欄に戻る
                e.preventDefault();
                setDismissed(true);
                setActiveIndex(-1);
                inputRef.current?.focus();
              }
            }}
          >
            {candidates.map((candidate, i) => (
              <li
                key={candidate.path}
                id={`page-jump-candidate-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={
                  i === activeIndex
                    ? `${styles.candidate} ${styles.candidateActive}`
                    : styles.candidate
                }
                // マウスを押した時点でフォーカスが外れて閉じてしまわないようにする
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => moveTo(candidate)}
              >
                <span className={styles.candidateName}>{candidate.name}</span>
                <span className={styles.candidateDir}>{candidate.dir}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-label="移動"
        onClick={moveToSelectedOrFirst}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 10h12" />
          <path d="M11 5l5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}
