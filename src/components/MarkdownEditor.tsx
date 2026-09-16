"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";

// Milkdown（Crepe）の見た目を決める CSS です。
// "common/style.css" が土台のスタイル、"frame.css" がテーマ（枠線付きの見た目）です。
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type Props = {
  /** 編集を開始する時点でのマークダウン文字列 */
  defaultValue: string;
};

/** 親コンポーネントが ref 経由で呼び出せる操作 */
export type MarkdownEditorHandle = {
  /** エディタが現在保持している内容をマークダウン文字列として取得する */
  getMarkdown: () => string;
};

/**
 * Milkdown の Crepe エディタを React の中で動かすためのラッパーコンポーネントです。
 *
 * Crepe は ProseMirror というライブラリを土台にしていて、ブラウザの DOM
 * （document）を直接操作します。React のように「状態から画面を再計算する」
 * のではなく、Crepe自身が div の中身を書き換え続けます。
 * そのため React の外側にあるものとして扱い、useEffect の中で
 * 「マウントされたら作る／アンマウントされたら壊す」という命令的な書き方をします。
 *
 * このコンポーネントは DocumentPage.tsx から
 *   dynamic(() => import("@/components/MarkdownEditor"), { ssr: false })
 * という形で読み込まれます。ssr: false にしているのは、Crepe が
 * ブラウザの document に依存していて、サーバー上（Node.js）には
 * document が存在せず動かせないためです。
 *
 * props ではなく ref 経由でマークダウンを取り出す設計にしているのは、
 * 1文字入力するたびに親の state を更新して画面全体を再レンダーするのを避け、
 * 「保存ボタンを押した瞬間にだけ中身を取り出す」ようにするためです。
 */
export default function MarkdownEditor({
  ref,
  defaultValue,
}: Props & { ref?: React.Ref<MarkdownEditorHandle> }) {
  // 実際に Crepe を描画する対象の <div> を指すための ref です。
  const containerRef = useRef<HTMLDivElement>(null);
  // Crepe のインスタンス自体を覚えておくための ref です（再レンダーされても消えません）。
  const crepeRef = useRef<Crepe | null>(null);

  // 親コンポーネント（DocumentPage）が ref.current.getMarkdown() を
  // 呼び出せるように、公開する関数をここで定義します。
  // React 19 からは forwardRef を使わずに、通常の props として ref を受け取れます。
  useImperativeHandle(ref, () => ({
    getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue,
    });
    crepeRef.current = crepe;

    let cancelled = false;
    void crepe.create().then(() => {
      if (cancelled) {
        // create() が終わる前に画面が閉じられていた場合は、
        // 出来上がった直後のインスタンスをそのまま破棄します。
        void crepe.destroy();
      }
    });

    // クリーンアップ関数: このコンポーネントが画面から消えるとき
    // （編集モードを抜けたときなど）に Crepe を確実に破棄します。
    // これをしないと、同じ内容のエディタが裏で残り続けてメモリリークします。
    return () => {
      cancelled = true;
      crepeRef.current = null;
      void crepe.destroy();
    };
    // defaultValue は初回マウント時の初期値としてのみ使うので、
    // 依存配列には含めません（含めると入力のたびにエディタが作り直されてしまいます）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} />;
}
