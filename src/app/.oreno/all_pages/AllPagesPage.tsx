import Link from "next/link";
import styles from "./AllPagesPage.module.css";
import AppMenu from "@/app/[...slug]/AppMenu";
import { FolderEntryIcon, PageEntryIcon } from "@/app/[...slug]/Sidebar/icons";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { TreeNode } from "@/lib/folder";
import { truncateProjectNameForDisplay } from "@/lib/projectNameDisplay";

type Props = {
  rootDirName: string;
  projectName: string;
  tree: TreeNode[];
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

// このコンポーネントは状態を持たず、AppMenu（Client Component）以外は
// ブラウザ側での処理が要らないので、"use client" を付けない（Server Component）
export default function AllPagesPage({ rootDirName, projectName, tree }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/index" className={styles.rootLink}>
          {projectName
            ? truncateProjectNameForDisplay(projectName)
            : rootDirName}
        </Link>
        <span>すべてのページ</span>
        <div className={styles.spacer} />
        <AppMenu />
      </div>

      <div className={styles.content}>
        {tree.length === 0 ? (
          <p className={styles.empty}>ページがありません。</p>
        ) : (
          <TreeList nodes={tree} />
        )}
      </div>
    </div>
  );
}
