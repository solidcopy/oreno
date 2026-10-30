"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./LinkBrokenCheckPage.module.css";
import frame from "@/components/PageFrame.module.css";
import result from "@/components/CheckResult.module.css";
import Header from "@/app/[...slug]/Header";
import Sidebar from "@/app/[...slug]/Sidebar/Sidebar";
import { useSavedToggle } from "@/app/[...slug]/useSavedToggle";
import { setShowSidebarSetting } from "@/app/actions";
import type { SidebarData } from "@/lib/userSettings";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import type { BrokenLink } from "@/lib/linkBrokenCheck";

type Props = {
  rootDirName: string;
  projectName: string;
  sidebar: SidebarData;
};

// チェックの状態
// checking: チェック中、done: 完了（結果は brokenLinks）、failed: チェックに失敗した
type CheckState =
  | { status: "checking" }
  | { status: "done"; brokenLinks: BrokenLink[] }
  | { status: "failed" };

export default function LinkBrokenCheckPage({
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
        const response = await fetch("/.oreno/link_broken_check/check", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const { brokenLinks } = (await response.json()) as {
          brokenLinks: BrokenLink[];
        };
        setCheck({ status: "done", brokenLinks });
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
    <div className={frame.page}>
      <Header
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle="リンク切れチェック"
      />

      <div className={frame.body}>
        {sidebarVisible && (
          <Sidebar
            {...sidebar}
          />
        )}
        <div className={frame.main}>
          {error && <p className={frame.error}>{error}</p>}
          <div className={result.content}>
            <h1 className={result.title}>リンク切れチェック</h1>

            {check.status === "checking" && (
              <div className={result.status} role="status" aria-live="polite">
                {/* 動画のバッファリング中のように、3つの点が順に跳ねる */}
                <div className={result.dots} aria-hidden="true">
                  <span className={result.dot} />
                  <span className={result.dot} />
                  <span className={result.dot} />
                </div>
                <div className={result.statusText}>
                  <span className={result.statusTitle}>リンクチェック中です…</span>
                  <span className={result.statusSub}>
                    リンクの整合性を調べています。完了すると結果が表示されます。
                  </span>
                </div>
              </div>
            )}

            {check.status === "failed" && (
              <p className={frame.error}>チェックに失敗しました。</p>
            )}

            {check.status === "done" && check.brokenLinks.length === 0 && (
              <div className={result.status} role="status">
                <svg
                  className={result.okIcon}
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
                <span className={result.statusTitle}>
                  エラーは見付かりませんでした
                </span>
              </div>
            )}

            {check.status === "done" && check.brokenLinks.length > 0 && (
              <>
                <p className={result.summary}>
                  チェック完了: {check.brokenLinks.length}件のエラーが見付かりました
                </p>
                {check.brokenLinks.map((brokenLink, index) => (
                  <BrokenLinkCard key={index} brokenLink={brokenLink} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// リンク切れ1件分のカード
// テキストエディタのように、左に行番号、右に該当行を並べて見せる
function BrokenLinkCard({ brokenLink }: { brokenLink: BrokenLink }) {
  const { pagePath, startLine, before, link, after } = brokenLink;

  // 前・リンク・後をつなげた全文を行ごとに分け、各行のうちリンクにあたる範囲を求める
  const linkStart = before.length;
  const linkEnd = linkStart + link.length;
  const rows = [];
  let rowStart = 0;
  for (const [index, text] of (before + link + after).split("\n").entries()) {
    // この行の中でのリンクの範囲（行にリンクが無ければ空の範囲になる）
    const from = Math.min(Math.max(linkStart - rowStart, 0), text.length);
    const to = Math.min(Math.max(linkEnd - rowStart, 0), text.length);
    rows.push({
      lineNumber: startLine + index,
      before: text.slice(0, from),
      link: text.slice(from, to),
      after: text.slice(to),
    });
    rowStart += text.length + 1; // 改行ぶんの1文字を足す
  }

  return (
    <div className={result.card}>
      <Link href={encodeUrlPath(pagePath)} className={result.pageLink}>
        {pagePath}
      </Link>
      <div className={result.excerpt}>
        {rows.map((row) => (
          <div key={row.lineNumber} className={result.row}>
            <span className={result.lineNumber}>{row.lineNumber}</span>
            <span className={result.lineText}>
              {row.before}
              {row.link && <mark className={styles.mark}>{row.link}</mark>}
              {row.after}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
