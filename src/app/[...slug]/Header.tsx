import Link from "next/link";
import type { ReactNode } from "react";
import { truncateProjectNameForDisplay } from "@/lib/projectNameDisplay";
import AppMenu from "./AppMenu";
import styles from "./Header.module.css";
import SidebarToggleButton from "./SidebarToggleButton";

/**
 * 全画面共通のヘッダー
 * 左から、サイドバーのオンオフボタン、ルートへのリンク、画面の名前（pageTitle）、
 * 画面ごとのボタン（actions）、アプリメニューの順に並べる
 *
 * 状態は持たず、サイドバーの状態と切り替える関数は親から受け取る
 */
export default function Header({
  projectName,
  rootDirName,
  sidebarVisible,
  onToggleSidebar,
  pageTitle,
  actions,
}: {
  // プロジェクト設定のプロジェクト名（未設定なら空文字）
  projectName: string;
  rootDirName: string;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  // ルートへのリンクの右に表示する、画面の名前やパス
  pageTitle: string;
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
      <div className={styles.spacer} />
      {actions}
      <AppMenu />
    </div>
  );
}
