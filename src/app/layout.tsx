import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  preload: false,
});

// コード用フォント。日本語も等幅で揃う PlemolJP(SIL OFL 1.1、
// src/app/fonts/LICENSE-PlemolJP.txt 参照)を自前配信している。
// adjustFontFallback: false は、プロポーショナル体(Arial)基準で自動生成される
// 既定の代替フォントが等幅フォントには不向きなため、明示したフォールバックに任せる。
const plemolJP = localFont({
  src: "./fonts/PlemolJP-Regular.woff2",
  variable: "--font-plemol-jp",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Oreno",
  description: "マークダウンファイルとして文書を作成するWebアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} ${plemolJP.variable}`}>
      <body>{children}</body>
    </html>
  );
}
