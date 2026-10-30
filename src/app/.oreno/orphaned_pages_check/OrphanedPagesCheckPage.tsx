"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./OrphanedPagesCheckPage.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import type { SidebarData } from "@/lib/userSettings";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { OrphanedPage } from "@/lib/orphanedPagesCheck";

type Props = {
  rootDirName: string;
  projectName: string;
  sidebar: SidebarData;
};

// チェックの状態
// checking: チェック中、done: 完了（結果は orphanedPages）、failed: チェックに失敗した
type CheckState =
  | { status: "checking" }
  | { status: "done"; orphanedPages: OrphanedPage[] }
  | { status: "failed" };

export default function OrphanedPagesCheckPage({
  rootDirName,
  projectName,
  sidebar,
}: Props) {
  // サイドバーのオンオフを保存できなかったときのエラーメッセージ
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckState>({ status: "checking" });

  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    sidebar.settings.show,
    setShowSidebarSetting,
    setError,
  );

  // 画面を開いたときにチェックを始める
  // 画面を離れる（アンマウントされる）ときの後始末で abort() を呼ぶと、
  // ブラウザがリクエストを中断し、サーバー側の調査も止まる
  useEffect(() => {
    const controller = new AbortController();

    async function runCheck() {
      try {
        const response = await fetch("/.oreno/orphaned_pages_check/check", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const { orphanedPages } = (await response.json()) as {
          orphanedPages: OrphanedPage[];
        };
        setCheck({ status: "done", orphanedPages });
      } catch {
        // 中断した場合は、画面がもう無いので何もしない
        if (controller.signal.aborted) return;
        setCheck({ status: "failed" });
      }
    }
    void runCheck();

    return () => controller.abort();
  }, []);

  return (
    <div className={styles.page}>
      <Header
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="孤立ページチェック"
      />

      <div className={styles.body}>
        {sidebarVisible && (
          <Sidebar
            {...sidebar}
          />
        )}
        <div className={styles.main}>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.content}>
            <h1 className={styles.title}>孤立ページチェック</h1>

            {check.status === "checking" && (
              <div className={styles.status} role="status" aria-live="polite">
                {/* 動画のバッファリング中のように、3つの点が順に跳ねる */}
                <div className={styles.dots} aria-hidden="true">
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </div>
                <div className={styles.statusText}>
                  <span className={styles.statusTitle}>
                    孤立ページチェック中です…
                  </span>
                  <span className={styles.statusSub}>
                    /indexからリンクで辿り着けないページがないか調べています。完了すると結果が表示されます。
                  </span>
                </div>
              </div>
            )}

            {check.status === "failed" && (
              <p className={styles.error}>チェックに失敗しました。</p>
            )}

            {check.status === "done" && check.orphanedPages.length === 0 && (
              <div className={styles.status} role="status">
                <svg
                  className={styles.okIcon}
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 12.5l3 3 5-6" />
                </svg>
                <span className={styles.statusTitle}>
                  孤立ページは見付かりませんでした
                </span>
              </div>
            )}

            {check.status === "done" && check.orphanedPages.length > 0 && (
              <>
                <p className={styles.summary}>
                  チェック完了: {check.orphanedPages.length}件の孤立ページが見付かりました
                </p>
                {check.orphanedPages.map((orphanedPage) => (
                  <OrphanedPageCard
                    key={orphanedPage.pagePath}
                    orphanedPage={orphanedPage}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 孤立ページ1件分のカード
// ページへのリンクと、ページの最初の数行を、行番号付きで見せる
function OrphanedPageCard({ orphanedPage }: { orphanedPage: OrphanedPage }) {
  const { pagePath, lines } = orphanedPage;

  return (
    <div className={styles.card}>
      <Link href={encodeUrlPath(pagePath)} className={styles.pageLink}>
        {pagePath}
      </Link>
      {/* 空のページは行が無いので、行番号の欄ごと出さない */}
      {lines.length > 0 && (
        <div className={styles.excerpt}>
          {lines.map((line, index) => (
            <div key={index} className={styles.row}>
              <span className={styles.lineNumber}>{index + 1}</span>
              <span className={styles.lineText}>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
