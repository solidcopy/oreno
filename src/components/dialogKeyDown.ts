import type { KeyboardEvent } from "react";

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
