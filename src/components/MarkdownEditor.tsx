"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";

// Milkdown（Crepe）の見た目を決める CSS
// "common/style.css" が土台のスタイル、"frame.css" がテーマ（枠線付きの見た目）
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
 * Milkdown の Crepe エディタを React の中で動かすためのラッパーコンポーネント
 *
 * Crepe は ProseMirror というライブラリを土台にしていて、ブラウザの DOM
 * （document）を直接操作する
 * React のように「状態から画面を再計算する」
 * のではなく、Crepe自身が div の中身を書き換え続ける
 * そのため React の外側にあるものとして扱い、useEffect の中で
 * 「マウントされたら作る／アンマウントされたら壊す」という命令的な書き方をする
 *
 * このコンポーネントは DocumentPage.tsx から
 *   dynamic(() => import("@/components/MarkdownEditor"), { ssr: false })
 * という形で読み込まれる
 * ssr: false にしているのは、Crepe が
 * ブラウザの document に依存していて、サーバー上（Node.js）には
 * document が存在せず動かせないため
 *
 * props ではなく ref 経由でマークダウンを取り出す設計にしているのは、
 * 1文字入力するたびに親の state を更新して画面全体を再レンダーするのを避け、
 * 「保存ボタンを押した瞬間にだけ中身を取り出す」ようにするため
 */
export default function MarkdownEditor({
  ref,
  defaultValue,
}: Props & { ref?: React.Ref<MarkdownEditorHandle> }) {
  // 実際に Crepe を描画する対象の <div> を指すための ref
  const containerRef = useRef<HTMLDivElement>(null);
  // Crepe のインスタンス自体を覚えておくための ref（再レンダーされても消えない）
  const crepeRef = useRef<Crepe | null>(null);

  // 親コンポーネント（DocumentPage）が ref.current.getMarkdown() を
  // 呼び出せるように、公開する関数をここで定義する
  // React 19 からは forwardRef を使わずに、通常の props として ref を受け取れる
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

    // 編集モードに切り替えた直後にすぐ入力を始められるよう、
    // Crepe が生成する contenteditable 要素（.ProseMirror）へフォーカスする
    // create() が解決した時点ではまだこの要素が DOM に現れていない上、
    // 現れた後も内部プラグイン（virtual-cursor など）が要素を組み替える
    // たびにフォーカスが外れてしまうため、DOM の変化が一定時間落ち着くまで
    // MutationObserver でフォーカスをかけ直し続ける
    // settleTimer は「DOM の変化が止まってから300ms」を判定するための
    // デバウンス用タイマー
    // Mutation が起きるたびに直前のタイマーを
    // clearTimeout でキャンセルして300ms後の disconnect を予約し直すため、
    // 変化が連続している間は disconnect が先延ばしされ続ける
    // 一度 disconnect が実行されると監視自体が止まるので、それ以降に
    // DOM が変化してもこのコールバックは呼ばれず、フォーカスも当たらない
    // （＝以後の変化はエディタ内部の通常の編集によるものとみなして無視する）
    const container = containerRef.current;
    let settleTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      container.querySelector<HTMLElement>(".ProseMirror")?.focus();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => observer.disconnect(), 300);
    });
    observer.observe(container, { childList: true, subtree: true });

    void crepe.create().then(() => {
      if (cancelled) {
        // create() が終わる前に画面が閉じられていた場合は、
        // 出来上がった直後のインスタンスをそのまま破棄する
        void crepe.destroy();
      }
    });

    // クリーンアップ関数: このコンポーネントが画面から消えるとき
    // （編集モードを抜けたときなど）に Crepe を確実に破棄する
    // これをしないと、同じ内容のエディタが裏で残り続けてメモリリークする
    return () => {
      cancelled = true;
      clearTimeout(settleTimer);
      observer.disconnect();
      crepeRef.current = null;
      void crepe.destroy();
    };
    // defaultValue は初回マウント時の初期値としてのみ使うので、
    // 依存配列には含めない（含めると入力のたびにエディタが作り直されてしまう）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flex:1 で親(.editorArea)いっぱいに広がる
  // globals.css側で
  // Milkdownが実行時に生成する .milkdown / .ProseMirror にも同じ
  // flex:1 を連鎖させることで、編集領域が文書の短さに関わらず
  // 画面下端まで届くようにしている（末尾クリックでカーソル移動できるように）
  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    />
  );
}
