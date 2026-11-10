import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { Candidate } from "@/lib/candidates";

/**
 * モーダルのオーバーレイの onKeyDown で呼ぶ
 * Escキーでモーダルを閉じる
 * 日本語入力の変換中のEscは変換を取り消すためのキーなので、モーダルは閉じない
 */
export function handleDialogKeyDown(
  e: KeyboardEvent<HTMLElement>,
  onCancel: () => void,
) {
  if (e.key === "Escape" && !e.nativeEvent.isComposing) {
    e.preventDefault();
    onCancel();
  }
}

type CandidateInputOptions = {
  /** 候補のドロップダウンが開いているか */
  open: boolean;
  /** 候補の数 */
  candidateCount: number;
  /** キーボードで選択している候補の位置を変える */
  setActiveIndex: (index: number) => void;
  /** 候補のリスト（下キーでフォーカスを移す） */
  listRef: RefObject<HTMLUListElement | null>;
};

/**
 * 候補つきの入力欄の onKeyDown で呼ぶ
 * 下キーで、ドロップダウンの先頭の候補を選択する
 */
export function handleCandidateInputKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  { open, candidateCount, setActiveIndex, listRef }: CandidateInputOptions,
) {
  if (
    e.key === "ArrowDown" &&
    !e.nativeEvent.isComposing &&
    open &&
    candidateCount > 0
  ) {
    e.preventDefault();
    setActiveIndex(0);
    listRef.current?.focus();
  }
}

type CandidateListOptions = {
  /** 表示している候補 */
  candidates: Candidate[];
  /** キーボードで選択している候補の位置（選択していないときは -1） */
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  /** Escキーでドロップダウンを閉じたことにする */
  setDismissed: (dismissed: boolean) => void;
  /** 候補のリストから戻る先の入力欄 */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Enterキーまたはスペースキーで、選択中の候補を確定する */
  onSelect: (candidate: Candidate) => void;
};

/**
 * 候補のリスト（<ul>）の onKeyDown で呼ぶ
 * 上下キーで選択を移し、Enter・スペースで確定する
 * Escキーでは、モーダルは閉じず、ドロップダウンだけを閉じて入力欄に戻る
 */
export function handleCandidateListKeyDown(
  e: KeyboardEvent<HTMLUListElement>,
  {
    candidates,
    activeIndex,
    setActiveIndex,
    setDismissed,
    inputRef,
    onSelect,
  }: CandidateListOptions,
) {
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
    if (activeIndex >= 0) onSelect(candidates[activeIndex]);
  } else if (e.key === "Escape") {
    // オーバーレイのEsc処理に届かないよう止める
    e.preventDefault();
    e.stopPropagation();
    setDismissed(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }
}

/**
 * リンク先や画像パスの入力を、サーバーに存在を問い合わせるための slug に変換する
 * 現在のページのURLを基準に解決するので、"../" を含む入力も扱える
 * 別のサイトのURLなど、このアプリのページやファイルを指さない入力は null を返す
 *
 * window.location を使うため、ブラウザ（Client Component）でだけ呼べる
 */
export function toSlug(input: string): string[] | null {
  try {
    const url = new URL(input, window.location.href);
    if (url.origin !== window.location.origin) return null;
    const slug = url.pathname
      .split("/")
      .filter((segment) => segment !== "")
      .map(decodeURIComponent);
    return slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}
