"use server";

import { revalidatePath } from "next/cache";
import { normalizeFolderPath } from "@/lib/folderPath";
import {
  isHandleSameFilename,
  isOrderSetting,
  setImageImportSettings,
  setOrderSetting,
  type ImageImportSettings,
  type OrderSetting,
} from "@/lib/userSettings";

export type SaveUserSettingsResult =
  | { ok: true }
  | { ok: false; message: string };

export async function saveUserSettingsAction(
  order: OrderSetting,
  imageImport: ImageImportSettings,
): Promise<SaveUserSettingsResult> {
  // Server Action は誰でも直接呼び出せるため、渡された値を信用せず検証し直す
  if (!isOrderSetting(order)) {
    return { ok: false, message: "並び順の値が不正です" };
  }
  // デフォルトフォルダは、空文字（ページと同じフォルダ）か、整った絶対形式のパスだけを受け付ける
  if (
    typeof imageImport.useModal !== "boolean" ||
    !isHandleSameFilename(imageImport.handleSameFilename) ||
    (imageImport.defaultFolder !== "" &&
      normalizeFolderPath(imageImport.defaultFolder) !==
        imageImport.defaultFolder)
  ) {
    return { ok: false, message: "画像インポートの設定の値が不正です" };
  }

  try {
    await setOrderSetting(order);
    await setImageImportSettings(imageImport);
  } catch (error) {
    return { ok: false, message: `保存に失敗しました: ${String(error)}` };
  }
  // 並び順は全ページのサイドバーなどに影響するので、全ページのキャッシュを破棄する
  revalidatePath("/", "layout");

  return { ok: true };
}
