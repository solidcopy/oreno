import { useState } from "react";
import type { ActionResult } from "../actions";

/**
 * オン/オフの状態を持ち、切り替えるたびに Server Action で保存するフック
 * 見た目をすぐ切り替えるため、先に画面の状態を変えてから保存し、
 * 失敗したら元に戻す
 *
 * 保存に失敗したときは、onError にエラーメッセージを渡して呼ぶ
 * 画面にエラーを表示する場所がなければ、省略してよい
 *
 * 戻り値は [現在の状態, 切り替える関数] の組
 */
export function useSavedToggle(
  initial: boolean,
  save: (next: boolean) => Promise<ActionResult>,
  onError?: (message: string) => void,
): [boolean, () => Promise<void>] {
  const [value, setValue] = useState(initial);

  async function toggle() {
    const next = !value;
    setValue(next);
    const result = await save(next);
    if (!result.ok) {
      setValue(!next);
      onError?.(result.message);
    }
  }

  return [value, toggle];
}
