"use server";

import { revalidatePath } from "next/cache";
import {
  isOrderSetting,
  setOrderSetting,
  type OrderSetting,
} from "@/lib/userSettings";

export type SaveUserSettingsResult =
  | { ok: true }
  | { ok: false; message: string };

export async function saveUserSettingsAction(
  order: OrderSetting,
): Promise<SaveUserSettingsResult> {
  // Server Action は誰でも直接呼び出せるため、渡された値を信用せず検証し直す
  if (!isOrderSetting(order)) {
    return { ok: false, message: "並び順の値が不正です" };
  }

  try {
    await setOrderSetting(order);
  } catch (error) {
    return { ok: false, message: `保存に失敗しました: ${String(error)}` };
  }
  // 並び順は全ページのサイドバーなどに影響するので、全ページのキャッシュを破棄する
  revalidatePath("/", "layout");

  return { ok: true };
}
