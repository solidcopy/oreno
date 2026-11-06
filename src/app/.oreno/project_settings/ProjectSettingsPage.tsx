"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ProjectSettingsPage.module.css";
import frame from "@/components/PageFrame.module.css";
import form from "@/components/SettingsForm.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import FolderPathInput from "@/components/FolderPathInput";
import { normalizeFolderPath } from "@/lib/folderPath";
import { saveProjectSettingsAction } from "./actions";
import type { SidebarData } from "@/lib/userSettings";

type Props = {
  rootDirName: string;
  initialProjectName: string;
  initialImageFolders: string[];
  sidebar: SidebarData;
};

// 保存通知を表示しておく時間
const NOTICE_DISPLAY_MS = 3000;

export default function ProjectSettingsPage({
  rootDirName,
  initialProjectName,
  initialImageFolders,
  sidebar,
}: Props) {
  const [projectName, setProjectName] = useState(initialProjectName);
  // ヘッダーのリンクには「保存済みの」プロジェクト名を表示したいので、
  // 入力中の値（projectName）とは別に保持しておく
  const [savedProjectName, setSavedProjectName] = useState(initialProjectName);
  // 画像フォルダ一覧と、追加欄に入力中のパス、一覧で選択中のフォルダ（未選択は ""）
  // 「設定を保存する」を押すまでは、画面上の状態にだけ反映される
  const [imageFolders, setImageFolders] = useState(initialImageFolders);
  const [newFolder, setNewFolder] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  // 画像フォルダ一覧の <select> 要素
  const folderListRef = useRef<HTMLSelectElement>(null);
  // 追加できなかった理由（追加欄の下に表示する）
  const [folderError, setFolderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  // サイドバーを表示するかどうかと、それを切り替える関数（全ページ共通の設定として保存する）
  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebar.settings.show,
    setShowSidebarSetting,
    setError,
  );

  // 通知を一定時間後に消すための setTimeout の ID
  // 連続して保存したときに前のタイマーが後から発火して通知を消してしまわないよう、
  // 新しい保存のたびに前のタイマーを止めてから作り直す
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 未選択のときは、一覧のどの項目も選択状態にしない
  // select に value を渡す方式だと、一致する項目がないとき React が先頭の項目を
  // 選択状態にしてしまい、削除ボタンが押せないのに選択されているように見えるため、
  // value は渡さず、選択中のフォルダの変更だけを onChange で受け取っている
  useEffect(() => {
    if (selectedFolder === "" && folderListRef.current) {
      folderListRef.current.selectedIndex = -1;
    }
  }, [selectedFolder, imageFolders]);

  function handleAddFolder() {
    const folder = normalizeFolderPath(newFolder);
    if (!folder) {
      setFolderError("フォルダのパスが正しくありません。");
      return;
    }
    if (imageFolders.includes(folder)) {
      setFolderError("すでに一覧にあります。");
      return;
    }
    setImageFolders([...imageFolders, folder]);
    setNewFolder("");
    setFolderError(null);
  }

  function handleDeleteFolder() {
    setImageFolders(imageFolders.filter((folder) => folder !== selectedFolder));
    setSelectedFolder("");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const result = await saveProjectSettingsAction(projectName, imageFolders);

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
    <div className={frame.page}>
      <Header
        projectName={savedProjectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="プロジェクト設定"
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
            <label className={form.field}>
              <span className={form.label}>プロジェクト名</span>
              <input
                type="text"
                className={form.input}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>

            <section className={styles.imageFolders}>
              <h2 className={form.label}>画像フォルダ一覧</h2>
              <p className={styles.note}>
                一覧のフォルダは画像をインポートする際にコピー先のフォルダとして選択することができます。
                <br />
                一覧にないフォルダも直接パスを入力すれば画像を保存できます。
              </p>

              {/* Enterキーでも追加できるよう、追加欄をフォームにしている */}
              <form
                className={styles.addRow}
                onSubmit={(event) => {
                  // フォームの既定の動作（ページの再読み込み）を止める
                  event.preventDefault();
                  handleAddFolder();
                }}
              >
                <div className={styles.addInput}>
                  <FolderPathInput
                    value={newFolder}
                    onChange={(value) => {
                      setNewFolder(value);
                      setFolderError(null);
                    }}
                    inputClassName={form.input}
                    placeholder="フォルダのパス（例: /images）"
                    aria-label="追加するフォルダのパス"
                  />
                </div>
                <button type="submit" className={styles.secondaryButton}>
                  追加
                </button>
              </form>
              {folderError && <p className={styles.folderError}>{folderError}</p>}

              {/* size={5} で5件分の高さになり、それ以上はスクロールする
                  select は複数選択にしない限り、1つだけ選べる */}
              <select
                className={styles.folderList}
                size={5}
                aria-label="画像フォルダ一覧"
                ref={folderListRef}
                onChange={(event) => setSelectedFolder(event.target.value)}
              >
                {imageFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleDeleteFolder}
                disabled={selectedFolder === ""}
              >
                削除
              </button>
            </section>

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
