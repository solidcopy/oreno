"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "./ProjectSettingsPage.module.css";
import AppMenu from "@/app/[...slug]/AppMenu";
import { saveProjectSettingsAction } from "./actions";

type Props = {
  rootDirName: string;
  initialProjectName: string;
};

// 保存通知を表示しておく時間
const NOTICE_DISPLAY_MS = 3000;

export default function ProjectSettingsPage({
  rootDirName,
  initialProjectName,
}: Props) {
  const [projectName, setProjectName] = useState(initialProjectName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

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
      <div className={styles.toolbar}>
        <Link href="/index" className={styles.rootLink}>
          {rootDirName}
        </Link>
        <span>プロジェクト設定</span>
        <div className={styles.spacer} />
        <AppMenu />
      </div>

      {showNotice && <div className={styles.notice}>設定を保存しました。</div>}
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
  );
}
