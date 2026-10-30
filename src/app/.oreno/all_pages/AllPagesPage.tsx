"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./AllPagesPage.module.css";
import frame from "@/components/PageFrame.module.css";
import Header from "@/app/[...slug]/Header";
import { FolderEntryIcon, PageEntryIcon } from "@/app/[...slug]/Sidebar/icons";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import type { SidebarData } from "@/lib/userSettings";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { TreeNode } from "@/lib/folder";

type Props = {
  rootDirName: string;
  projectName: string;
  tree: TreeNode[];
  sidebar: SidebarData;
};

// ツリーの1階層分（ul）を描く
// フォルダの中身は、このコンポーネント自身を呼んで入れ子にする（再帰）
function TreeList({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className={styles.list}>
      {nodes.map((node) => (
        <li key={node.path.join("/")}>
          {node.kind === "folder" ? (
            <>
              {/* フォルダはクリックしても何も起きないので、リンクにしない */}
              <div className={styles.folderRow}>
                <FolderEntryIcon />
                <span className={styles.name}>{node.name}</span>
              </div>
              <TreeList nodes={node.children} />
            </>
          ) : (
            <Link
              href={encodeUrlPath("/" + node.path.join("/"))}
              className={styles.pageRow}
            >
              <PageEntryIcon />
              <span className={styles.name}>{node.name}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function AllPagesPage({
  rootDirName,
  projectName,
  tree,
  sidebar,
}: Props) {
  // サイドバーのオンオフを保存できなかったときのエラーメッセージ
  const [error, setError] = useState<string | null>(null);

  // サイドバーを表示するかどうかと、それを切り替える関数（全ページ共通の設定として保存する）
  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebar.settings.show,
    setShowSidebarSetting,
    setError,
  );

  return (
    <div className={frame.page}>
      <Header
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="すべてのページ"
      />

      <div className={frame.body}>
        {sidebarVisible && (
          <Sidebar
            {...sidebar}
          />
        )}
        <div className={frame.main}>
          {error && <p className={frame.error}>{error}</p>}
          <div className={styles.content}>
            {tree.length === 0 ? (
              <p className={styles.empty}>ページがありません。</p>
            ) : (
              <TreeList nodes={tree} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
