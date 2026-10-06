"use server";

import { revalidatePath } from "next/cache";
import { saveProjectSettings } from "@/lib/projectSettings";

export type SaveProjectSettingsResult =
  | { ok: true }
  | { ok: false; message: string };

export async function saveProjectSettingsAction(
  projectName: string,
): Promise<SaveProjectSettingsResult> {
  try {
    await saveProjectSettings({ projectName });
  } catch (error) {
    return { ok: false, message: `保存に失敗しました: ${String(error)}` };
  }
  // プロジェクト名はヘッダーに全ページ共通で表示される
  // ブラウザ側には、移動前に取得した描画結果（古いプロジェクト名）がキャッシュされていて、
  // これを破棄しないと、ブラウザの戻る/進むボタンで再表示したときに古い名前が表示される
  // "/" を "layout" として指定すると、ルートのレイアウト配下の全ページが対象になる
  revalidatePath("/", "layout");

  return { ok: true };
}
