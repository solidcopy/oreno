import Link from "next/link";
import type { ReactNode } from "react";
import { truncateProjectNameForDisplay } from "@/lib/projectNameDisplay";
import AppMenu from "./AppMenu";
import styles from "./Header.module.css";
import PageJumpBox from "./PageJumpBox";
import SidebarToggleButton from "./SidebarToggleButton";

// 文書の保存の状態
// idle: ページを開いてからまだ編集していない、saved: 編集内容が保存済み（次の編集まで表示し続ける）、saving: 未保存の編集がある（保存待ちまたは保存中）、
// failed: 直近の保存に失敗した、new: 新規作成中でまだファイルがない（自動保存はしない）
export type SaveStatus = "idle" | "saved" | "saving" | "failed" | "new";

/**
 * 全画面共通のヘッダー
 * 左から、サイドバーのオンオフボタン、ルートへのリンク、画面の名前（pageTitle）、
 * 保存の状態（saveStatus）、ページ移動の入力欄（中央）、画面ごとのボタン（actions）、
 * アプリメニューの順に並べる
 *
 * 状態は持たず、サイドバーの状態と切り替える関数は親から受け取る
 */
export default function Header({
  projectName,
  rootDirName,
  sidebarVisible,
  onToggleSidebar,
  pageTitle,
  saveStatus,
  newPageActions,
  actions,
}: {
  // プロジェクト設定のプロジェクト名（未設定なら空文字）
  projectName: string;
  rootDirName: string;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  // ルートへのリンクの右に表示する、画面の名前やパス
  pageTitle: string;
  // 文書の保存の状態（pageTitle の右に表示する）
  // 保存の状態がない画面では省略する
  saveStatus?: SaveStatus;
  // saveStatus が "new" のとき、（新規）の右に出す「保存」「キャンセル」ボタンの操作
  // disabled が true の間は、どちらのボタンも押せない
  newPageActions?: {
    onSave: () => void;
    onCancel: () => void;
    disabled: boolean;
  };
  // 右端のアプリメニューの手前に並べるボタン
  actions?: ReactNode;
}) {
  // プロジェクト名が設定されていればそちらを、未設定ならルートフォルダ名を表示する
  const rootLinkText = projectName
    ? truncateProjectNameForDisplay(projectName)
    : rootDirName;

  return (
    <div className={styles.toolbar}>
      <SidebarToggleButton
        visible={sidebarVisible}
        onToggle={onToggleSidebar}
      />
      <Link href="/index" className={styles.rootLink}>
        {rootLinkText}
      </Link>
      <span>{pageTitle}</span>
      {saveStatus === "saving" && (
        <span className={styles.saveStatusSaving}>（保存中...）</span>
      )}
      {saveStatus === "saved" && (
        <span className={styles.saveStatusSaving}>（保存済み）</span>
      )}
      {saveStatus === "new" && (
        <>
          <span className={styles.saveStatusNew}>（新規）</span>
          {newPageActions && (
            <>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={newPageActions.onSave}
                disabled={newPageActions.disabled}
              >
                保存
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={newPageActions.onCancel}
                disabled={newPageActions.disabled}
              >
                キャンセル
              </button>
            </>
          )}
        </>
      )}
      {saveStatus === "failed" && (
        <span className={styles.saveStatusFailed}>（保存失敗）</span>
      )}
      <div className={styles.spacer} />
      <PageJumpBox />
      <div className={styles.spacer} />
      {actions}
      <AppMenu />
    </div>
  );
}
