"use client";

import { useRef, useState } from "react";
import styles from "./UserSettingsPage.module.css";
import frame from "@/components/PageFrame.module.css";
import form from "@/components/SettingsForm.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import FolderPathInput from "@/components/FolderPathInput";
import { normalizeFolderPath } from "@/lib/folderPath";
import { saveUserSettingsAction } from "./actions";
import type {
  HandleSameFilename,
  ImageImportSettings,
  OrderSetting,
  SidebarData,
} from "@/lib/userSettings";

type Props = {
  rootDirName: string;
  projectName: string;
  initialOrder: OrderSetting;
  initialImageImport: ImageImportSettings;
  sidebar: SidebarData;
};

// ラジオボタンの選択肢（保存する値と表示名）
const ORDER_OPTIONS: { value: OrderSetting; label: string }[] = [
  { value: "by-name", label: "名前順" },
  { value: "folders-first", label: "フォルダが先" },
  { value: "pages-first", label: "ページが先" },
];

// 同じ名前の画像ファイルがあったときの扱いの選択肢（保存する値と表示名）
const SAME_FILENAME_OPTIONS: { value: HandleSameFilename; label: string }[] = [
  { value: "overwrite", label: "そのまま" },
  { value: "append-timestamp", label: "タイムスタンプを付与する" },
];

// 保存通知を表示しておく時間
const NOTICE_DISPLAY_MS = 3000;

export default function UserSettingsPage({
  rootDirName,
  projectName,
  initialOrder,
  initialImageImport,
  sidebar,
}: Props) {
  // ラジオボタンで選択中の並び順
  const [order, setOrder] = useState(initialOrder);
  // 画像インポートの設定
  // デフォルトフォルダは、保存済みの値が空文字ならラジオボタンは「ページのフォルダ」にする
  const [useModal, setUseModal] = useState(initialImageImport.useModal);
  const [specifyFolder, setSpecifyFolder] = useState(
    initialImageImport.defaultFolder !== "",
  );
  // 入力欄の値は、「ページのフォルダ」に切り替えても残しておく（保存はしない）
  const [defaultFolder, setDefaultFolder] = useState(
    initialImageImport.defaultFolder,
  );
  const [handleSameFilename, setHandleSameFilename] = useState(
    initialImageImport.handleSameFilename,
  );
  // デフォルトフォルダのパスが使えないときのメッセージ（入力欄の下に表示する）
  const [folderError, setFolderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebar.settings.show,
    setShowSidebarSetting,
    setError,
  );

  // 通知を一定時間後に消すタイマー。連続保存で前のタイマーが通知を消さないよう、都度止める
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSave() {
    // 「ページのフォルダ」のときは、ページと同じフォルダ（空文字）として保存する
    let folder = "";
    if (specifyFolder) {
      if (defaultFolder.trim() === "") {
        setFolderError("フォルダを指定してください。");
        return;
      }
      const normalized = normalizeFolderPath(defaultFolder);
      if (!normalized) {
        setFolderError("フォルダのパスが正しくありません。");
        return;
      }
      folder = normalized;
      setDefaultFolder(normalized);
    }

    setSaving(true);
    setError(null);
    setFolderError(null);

    const result = await saveUserSettingsAction(order, {
      useModal,
      defaultFolder: folder,
      handleSameFilename,
    });

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
    <div className={frame.page}>
      <Header
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="ユーザー設定"
      />

      <div className={frame.body}>
        {sidebarVisible && (
          <Sidebar
            {...sidebar}
          />
        )}
        <div className={frame.main}>
          {showNotice && (
            <div className={form.notice}>設定を保存しました。</div>
          )}
          {error && <p className={frame.error}>{error}</p>}

          <div className={styles.content}>
            <fieldset className={styles.fieldset}>
              <legend className={form.label}>フォルダ/ページの並び順</legend>
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

            <fieldset className={styles.groupBox}>
              <legend className={form.label}>画像インポート</legend>

              <p className={styles.groupDescription}>
                編集中のページに画像ファイルをドラッグ&ドロップした時の動作を設定します
              </p>

              <div className={styles.checkboxItem}>
                <label className={styles.radio}>
                  <input
                    type="checkbox"
                    checked={useModal}
                    onChange={(event) => setUseModal(event.target.checked)}
                  />
                  画像インポートモーダルを表示する
                </label>
                <p className={styles.note}>
                  モーダルを表示しない場合は確認せずデフォルト設定でインポートします
                </p>
              </div>

              <fieldset className={styles.fieldset}>
                <legend className={form.label}>画像パスのデフォルトフォルダ</legend>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="default-folder"
                    checked={!specifyFolder}
                    onChange={() => {
                      setSpecifyFolder(false);
                      setFolderError(null);
                    }}
                  />
                  ページのフォルダ
                </label>
                <div className={styles.inlineRow}>
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="default-folder"
                      checked={specifyFolder}
                      onChange={() => setSpecifyFolder(true)}
                    />
                    フォルダを指定する
                  </label>
                  {/* 「フォルダを指定する」を選んでいるときだけ入力できる */}
                  <div className={styles.folderInput}>
                    <FolderPathInput
                      value={defaultFolder}
                      onChange={(value) => {
                        setDefaultFolder(value);
                        setFolderError(null);
                      }}
                      inputClassName={form.input}
                      placeholder="フォルダのパス（例: /images）"
                      disabled={!specifyFolder}
                      aria-label="デフォルトフォルダのパス"
                    />
                  </div>
                </div>
                {folderError && (
                  <p className={styles.folderError}>{folderError}</p>
                )}
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={form.label}>
                  同じ名前の画像ファイルがあった時は
                </legend>
                {SAME_FILENAME_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.radio}>
                    <input
                      type="radio"
                      name="handle-same-filename"
                      value={option.value}
                      checked={handleSameFilename === option.value}
                      onChange={() => setHandleSameFilename(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </fieldset>

            <button
              type="button"
              className={form.saveButton}
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
