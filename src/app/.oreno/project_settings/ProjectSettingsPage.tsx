"use client";

import { useRef, useState } from "react";
import styles from "./ProjectSettingsPage.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import { saveProjectSettingsAction } from "./actions";
import type { SidebarSettings } from "@/lib/userSettings";

type Props = {
  rootDirName: string;
  initialProjectName: string;
  sidebarSettings: SidebarSettings;
  starredPages: string[];
  histories: string[];
};

// 保存通知を表示しておく時間
const NOTICE_DISPLAY_MS = 3000;

export default function ProjectSettingsPage({
  rootDirName,
  initialProjectName,
  sidebarSettings,
  starredPages,
  histories,
}: Props) {
  const [projectName, setProjectName] = useState(initialProjectName);
  // ヘッダーのリンクには「保存済みの」プロジェクト名を表示したいので、
  // 入力中の値（projectName）とは別に保持しておく
  const [savedProjectName, setSavedProjectName] = useState(initialProjectName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  // サイドバーを表示するかどうかと、それを切り替える関数（全ページ共通の設定として保存する）
  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebarSettings.show,
    setShowSidebarSetting,
    setError,
  );

  // 通知を一定時間後に消すための setTimeout の ID
  // 連続して保存したときに前のタイマーが後から発火して通知を消してしまわないよう、
  // 新しい保存のたびに前のタイマーを止めてから作り直す
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const result = await saveProjectSettingsAction(projectName);

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSavedProjectName(projectName);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setShowNotice(true);
    noticeTimerRef.current = setTimeout(() => {
      setShowNotice(false);
    }, NOTICE_DISPLAY_MS);
  }

  return (
    <div className={styles.page}>
      <Header
        projectName={savedProjectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="プロジェクト設定"
      />

      <div className={styles.body}>
        {sidebarVisible && (
          <Sidebar
            settings={sidebarSettings}
            starredPages={starredPages}
            histories={histories}
          />
        )}
        <div className={styles.main}>
          {showNotice && (
            <div className={styles.notice}>設定を保存しました。</div>
          )}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.content}>
            <label className={styles.field}>
              <span className={styles.label}>プロジェクト名</span>
              <input
                type="text"
                className={styles.input}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>

            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中…" : "設定を保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
