import { useEffect } from "react";
import type { RefObject } from "react";

// ポップアップの外側をクリックしたとき、Escapeキーを押したときに閉じる
export function useClosePopoverOnOutsideClick(
  open: boolean,
  wrapRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // wrapRef・onClose は open が変わらない限り再購読する必要が無いため、依存配列には含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
