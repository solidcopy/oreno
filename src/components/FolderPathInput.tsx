import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCandidates } from "@/app/actions";
import { searchCandidates, type Candidate } from "@/lib/candidates";
import { listFolders } from "@/lib/folderPath";
// リンク設定モーダルと同じ見た目の候補ドロップダウンなので、CSSを共用する
import styles from "./LinkDialog.module.css";
import { handleCandidateInputKeyDown } from "./dialogBehavior";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** 入力欄に付けるクラス名（見た目は使う画面に合わせる） */
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 入力欄の id（ラベルの htmlFor と対応させる） */
  id?: string;
  /** 表示されたときに入力欄にフォーカスするか */
  autoFocus?: boolean;
  /**
   * 入力がファイル名つきのパス（例: "/images/photo.png"）のとき true にする
   * 最後の "/" より前をフォルダとみなして候補を出し、候補を選ぶと、そのフォルダ部分だけを置き換える
   */
  withFileName?: boolean;
  "aria-label"?: string;
};

// ファイル一覧の更新が終わっていないときに、取得し直すまでの待ち時間
const RETRY_MS = 1000;

/**
 * フォルダのパスを入力する欄
 * 入力中のパスに合わせて、文書セット内の既存フォルダを候補としてドロップダウンに表示する
 * 候補の絞り込みと並び順、キー操作は、リンク設定モーダルのリンク先と同じ
 */
export default function FolderPathInput({
  value,
  onChange,
  inputClassName,
  placeholder,
  disabled,
  id: inputId,
  autoFocus,
  withFileName,
  "aria-label": ariaLabel,
}: Props) {
  // 候補の絞り込みに使う、確定済みの入力
  // 日本語入力の変換中（未確定）の文字列は含めないため、value とは別に持つ
  const [query, setQuery] = useState(value);

  // サーバーから取得したフォルダの一覧と、取得が終わったかどうか
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersReady, setFoldersReady] = useState(false);

  // 入力欄またはドロップダウンにフォーカスがあるか
  const [focused, setFocused] = useState(false);
  // Escキーや選択でドロップダウンを閉じたか（次に入力するまで表示しない）
  const [dismissed, setDismissed] = useState(false);
  // キーボードで選択している候補の位置（選択していないときは -1）
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // 要素の id は画面に複数置いても重複しないよう、useId で作る
  const id = useId();

  // フォルダの一覧を取得する
  // 開いたときにサーバーへファイル一覧の更新を依頼するが、更新の完了は待たない
  // 更新が終わるまで取得し直して、終わったら新しい一覧に差し替える
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async (refresh: boolean) => {
      try {
        const result = await getCandidates(refresh);
        if (cancelled) return;
        if (result.ready) {
          setFolders(listFolders(result.files));
          setFoldersReady(true);
        }
        if (!result.ready || result.scanning) {
          timer = setTimeout(() => load(false), RETRY_MS);
        }
      } catch {
        // 取得に失敗したときは、候補が空のものとして扱う
        setFoldersReady(true);
      }
    };
    void load(true);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // 候補の絞り込みに使うフォルダのパス
  // ファイル名つきの入力では、最後の "/" より前（"/" がなければ、まだフォルダを入力していないので空）
  const folderQuery = withFileName
    ? query.includes("/")
      ? query.slice(0, query.lastIndexOf("/"))
      : ""
    : query;

  // フォルダのパスを「ファイル」として渡すと、ファイルの候補と同じ規則で絞り込める
  const candidates = useMemo(
    () => searchCandidates(folders, folderQuery),
    [folders, folderQuery],
  );

  // 入力がすでにフォルダのパスと一致しているときは、選択済みとみなして閉じる
  const open =
    folderQuery.length > 0 &&
    focused &&
    !dismissed &&
    foldersReady &&
    candidates.length > 0 &&
    !candidates.some((candidate) => candidate.link === folderQuery);

  // キーボードで選択した候補が、スクロールで隠れないようにする
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${id}-candidate-${activeIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, id]);

  // 入力が変わったら、候補の選択と「閉じた」状態を最初に戻す
  const changeQuery = (next: string) => {
    setQuery(next);
    setActiveIndex(-1);
    setDismissed(false);
  };

  const selectCandidate = (candidate: Candidate) => {
    // ファイル名つきの入力では、ファイル名の部分は残して、フォルダ部分だけを置き換える
    const next = withFileName
      ? `${candidate.link}/${value.slice(value.lastIndexOf("/") + 1)}`
      : candidate.link;
    onChange(next);
    setQuery(next);
    setActiveIndex(-1);
    setDismissed(true);
    inputRef.current?.focus();
  };

  return (
    // 入力欄とドロップダウンをまとめる
    // フォーカスが両者の間で移るだけのときは、外れたとみなさない
    <div
      className={styles.urlControl}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        autoFocus={autoFocus}
        className={inputClassName}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${id}-candidates` : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
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
      {open && (
        <ul
          ref={listRef}
          id={`${id}-candidates`}
          className={styles.dropdown}
          role="listbox"
          aria-label="フォルダの候補"
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-candidate-${activeIndex}` : undefined
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
              if (activeIndex >= 0) selectCandidate(candidates[activeIndex]);
            } else if (e.key === "Escape") {
              // ドロップダウンだけを閉じて入力欄に戻る
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }
          }}
        >
          {candidates.map((candidate, i) => (
            <li
              key={candidate.path}
              id={`${id}-candidate-${i}`}
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
              <span className={styles.candidateDir}>
                {candidate.dir === "." ? "/" : "/" + candidate.dir}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
