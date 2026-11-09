import type { KeyboardEvent, RefObject } from "react";

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
