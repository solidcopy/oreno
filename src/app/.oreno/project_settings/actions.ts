"use server";

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
  return { ok: true };
}
