"use client";

import { useRef, useState } from "react";
import styles from "./UserSettingsPage.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import { saveUserSettingsAction } from "./actions";
import type { OrderSetting, SidebarSettings } from "@/lib/userSettings";

type Props = {
  rootDirName: string;
  projectName: string;
  initialOrder: OrderSetting;
  sidebarSettings: SidebarSettings;
  starredPages: string[];
  histories: string[];
};

// ラジオボタンの選択肢（保存する値と表示名）
const ORDER_OPTIONS: { value: OrderSetting; label: string }[] = [
  { value: "by-name", label: "名前順" },
  { value: "folders-first", label: "フォルダが先" },
  { value: "pages-first", label: "ページが先" },
];

// 保存通知を表示しておく時間
const NOTICE_DISPLAY_MS = 3000;

export default function UserSettingsPage({
  rootDirName,
  projectName,
  initialOrder,
  sidebarSettings,
  starredPages,
  histories,
}: Props) {
  // ラジオボタンで選択中の並び順
  const [order, setOrder] = useState(initialOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebarSettings.show,
    setShowSidebarSetting,
    setError,
  );

  // 通知を一定時間後に消すタイマー。連続保存で前のタイマーが通知を消さないよう、都度止める
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const result = await saveUserSettingsAction(order);

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

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
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="ユーザー設定"
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
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>フォルダ/ページの並び順</legend>
              {ORDER_OPTIONS.map((option) => (
                <label key={option.value} className={styles.radio}>
                  <input
                    type="radio"
                    name="order"
                    value={option.value}
                    checked={order === option.value}
                    onChange={() => setOrder(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

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
