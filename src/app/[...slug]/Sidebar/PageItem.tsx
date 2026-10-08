import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { encodeUrlPath } from "@/lib/encodeUrlPath";
import styles from "./Sidebar.module.css";

// URLパスの最後の要素（例: "/spec/entities/reservation" なら "reservation"）
function lastSegment(urlPath: string): string {
  return urlPath.split("/").pop() ?? urlPath;
}

/**
 * 一覧の1行分（ページへのリンク）
 */
export default function PageItem({ urlPath }: { urlPath: string }) {
  // ツールチップを表示する画面上の位置
  // サイドバーは overflow でスクロールさせているため、中に置いた
  // position: absolute の要素はサイドバーの外に出られず切り取られてしまう
  // そこで position: fixed（画面基準）にし、リンクの位置から座標を計算して指定する
  const [tipPosition, setTipPosition] = useState<CSSProperties>({});

  // ホバー（またはフォーカス）されたときに、リンクの左下を基準に位置を決める
  const updateTipPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTipPosition({ left: rect.left + 8, top: rect.bottom + 2 });
  };

  return (
    <li
      className={styles.item}
      onMouseEnter={(e) => updateTipPosition(e.currentTarget)}
    >
      <Link
        href={encodeUrlPath(urlPath)}
        className={styles.link}
        onFocus={(e) => updateTipPosition(e.currentTarget)}
      >
        {lastSegment(urlPath)}
      </Link>
      {/* 最後の要素だけでは同名のページを見分けられないため、
          ホバーしたときにパス全体を表示する */}
      <span className={styles.tip} style={tipPosition} role="tooltip">
        {urlPath}
      </span>
    </li>
  );
}
