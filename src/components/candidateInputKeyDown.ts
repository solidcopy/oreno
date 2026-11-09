import type { KeyboardEvent, RefObject } from "react";

type Options = {
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
  { open, candidateCount, setActiveIndex, listRef }: Options,
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
