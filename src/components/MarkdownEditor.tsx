"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { keymapRef } from "@milkdown/crepe/feature/toolbar";
import { commandsCtx } from "@milkdown/kit/core";
import {
  blockquoteKeymap,
  bulletListKeymap,
  codeBlockKeymap,
  headingKeymap,
  isMarkSelectedCommand,
  orderedListKeymap,
} from "@milkdown/kit/preset/commonmark";
import type { Ctx, SliceType } from "@milkdown/kit/ctx";
import type { KeymapConfig } from "@milkdown/kit/utils";
import { strikethroughKeymap } from "@milkdown/kit/preset/gfm";
import {
  subscriptSchema,
  superscriptSchema,
  scriptPlugin,
  toggleSubscriptCommand,
  toggleSuperscriptCommand,
} from "./scriptPlugin";
import {
  toggleUnderlineCommand,
  underlineKeymap,
  underlinePlugin,
  underlineSchema,
} from "./underlinePlugin";

// Milkdown（Crepe）の見た目を決める CSS
// "common/style.css" が土台のスタイル、"frame.css" がテーマ（枠線付きの見た目）
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// ツールバーに追加する下線ボタンのアイコン
// 「U」の文字と下線を塗りつぶしの図形で描いている（他のアイコンと同じ形式）
const underlineIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      d="M7.5 5h2v7.2c0 1.9 1 2.8 2.5 2.8s2.5-.9 2.5-2.8V5h2v7.2c0 3-1.8 4.8-4.5 4.8s-4.5-1.8-4.5-4.8z"
    />
    <rect x="6.5" y="18.5" width="11" height="1.6" />
  </svg>
`;

// ツールバーに追加する上付き・下付きボタンのアイコン
// 「x」の文字と、小さな「2」を右上または右下に置いた形を塗りつぶしの図形で描いている
const superscriptIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      d="M22 7h-2v1h3v1h-4V6h3V5h-3V4h4v3zM5.88 20h2.66l3.4-5.42h.12L15.47 20h2.65l-4.66-7.27L17.81 6h-2.68l-3.07 4.99h-.12L8.85 6H6.19l4.32 6.73L5.88 20z"
    />
  </svg>
`;

const subscriptIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      d="M22 18h-2v1h3v1h-4v-3h3v-1h-3v-1h4v3zM5.88 18h2.66l3.4-5.42h.12L15.47 18h2.65l-4.66-7.27L17.81 4h-2.68l-3.07 4.99h-.12L8.85 4H6.19l4.32 6.73L5.88 18z"
    />
  </svg>
`;

/**
 * キーマップのうち、指定した操作のショートカットを別のキーに変更する
 * 型引数の考え方は disableShortcuts と同じ
 */
function changeShortcut<K extends string>(
  ctx: Ctx,
  keymap: { key: SliceType<KeymapConfig<K>> },
  action: NoInfer<K>,
  shortcut: string,
) {
  ctx.update(keymap.key, (current) => ({
    ...current,
    [action]: { ...current[action], shortcuts: shortcut },
  }));
}

/**
 * キーマップのうち、指定した操作のショートカットを無効にする
 * 型引数 K はキーマップが持つ操作名の型で、キーマップごとに異なる
 * （"TurnIntoH1" など）
 * actions は K の一部だけを指定できるよう NoInfer にしている
 */
function disableShortcuts<K extends string>(
  ctx: Ctx,
  keymap: { key: SliceType<KeymapConfig<K>> },
  actions: NoInfer<K>[],
) {
  ctx.update(keymap.key, (current) => {
    const next = { ...current };
    for (const action of actions) {
      next[action] = { ...next[action], shortcuts: [] };
    }
    return next;
  });
}

type Props = {
  /** 編集を開始する時点でのマークダウン文字列 */
  defaultValue: string;
  /**
   * 編集によって内容が変わるたびに、変更後のマークダウン文字列を渡して呼ばれる
   * 日本語入力などの変換中（未確定）は呼ばれず、確定したあとに呼ばれる
   */
  onChange?: (markdown: string) => void;
  /**
   * エディタが画面から消えるときに、その時点の内容を渡して呼ばれる
   * onChange は編集から少し遅れて呼ばれるため、直前の編集を取りこぼさないために使う
   */
  onUnmount?: (markdown: string) => void;
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
 * 内容は props の value のような形では受け渡さず、取り出したいときは
 * ref 経由の getMarkdown()、編集されたことを知りたいときは onChange で受け取る
 * 1文字入力するたびに親の state を更新して画面全体を再レンダーするのを避けるため
 */
export default function MarkdownEditor({
  ref,
  defaultValue,
  onChange,
  onUnmount,
}: Props & { ref?: React.Ref<MarkdownEditorHandle> }) {
  // 実際に Crepe を描画する対象の <div> を指すための ref
  const containerRef = useRef<HTMLDivElement>(null);
  // Crepe のインスタンス自体を覚えておくための ref（再レンダーされても消えない）
  const crepeRef = useRef<Crepe | null>(null);

  // onChange は最新の関数を ref に入れておき、Crepe には常にこの ref 経由で呼んでもらう
  // useEffect の中で onChange を直接渡すと、エディタを作った時点の関数が
  // 使われ続けてしまう（エディタは最初の1回しか作らないため）
  const onChangeRef = useRef(onChange);
  const onUnmountRef = useRef(onUnmount);
  useEffect(() => {
    onChangeRef.current = onChange;
    onUnmountRef.current = onUnmount;
  });

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
      featureConfigs: {
        // 既定の文字修飾（太字・斜体・取り消し線）の並びの最後に
        // 下線・上付き・下付きのボタンを足す
        [CrepeFeature.Toolbar]: {
          buildToolbar: (builder) => {
            builder.getGroup("formatting").addItem("underline", {
              icon: underlineIcon,
              label: "Underline",
              keymap: keymapRef(underlineKeymap.key, "ToggleUnderline"),
              active: (ctx) =>
                ctx
                  .get(commandsCtx)
                  .call(isMarkSelectedCommand.key, underlineSchema.type(ctx)),
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(toggleUnderlineCommand.key);
              },
            });
            builder.getGroup("formatting").addItem("superscript", {
              icon: superscriptIcon,
              label: "Superscript",
              active: (ctx) =>
                ctx
                  .get(commandsCtx)
                  .call(isMarkSelectedCommand.key, superscriptSchema.type(ctx)),
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(toggleSuperscriptCommand.key);
              },
            });
            builder.getGroup("formatting").addItem("subscript", {
              icon: subscriptIcon,
              label: "Subscript",
              active: (ctx) =>
                ctx
                  .get(commandsCtx)
                  .call(isMarkSelectedCommand.key, subscriptSchema.type(ctx)),
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(toggleSubscriptCommand.key);
              },
            });
          },
        },
      },
    });
    // 下線のマーク・コマンド・ショートカット・入力ルールを追加する
    crepe.editor.use(underlinePlugin);
    // 上付き・下付きのマーク・コマンドを追加する
    crepe.editor.use(scriptPlugin);
    crepeRef.current = crepe;

    // 文字修飾や要素挿入のショートカットを、変更または無効にする
    // Milkdown のキーマップは「操作名 → ショートカット」の設定として
    // コンテキスト（ctx）に保存されている
    // ショートカットを別のキーの文字列にすると変更、空の配列にすると
    // そのキーには何も割り当てられなくなる（無効）
    // キーマップ設定は create() より前に書き換える必要がある
    // 見出しのキーマップには見出しレベルを変える操作が複数あるため、
    // 操作名を指定して無効にしている
    crepe.editor.config((ctx) => {
      changeShortcut(ctx, strikethroughKeymap, "ToggleStrikethrough", "Mod-s");
      disableShortcuts(ctx, headingKeymap, [
        "TurnIntoH1",
        "TurnIntoH2",
        "TurnIntoH3",
        "TurnIntoH4",
        "TurnIntoH5",
        "TurnIntoH6",
        "DowngradeHeading",
      ]);
      disableShortcuts(ctx, bulletListKeymap, ["WrapInBulletList"]);
      disableShortcuts(ctx, orderedListKeymap, ["WrapInOrderedList"]);
      disableShortcuts(ctx, blockquoteKeymap, ["WrapInBlockquote"]);
      disableShortcuts(ctx, codeBlockKeymap, ["CreateCodeBlock"]);
    });

    // 日本語入力などの変換中（未確定の文字がある間）かどうか
    // 変換中の文字もエディタの内容には含まれるため、そのまま通知すると
    // 確定前の文字が保存されてしまう
    // そこで変換中は通知を止め、確定したときにまとめて通知する
    let composing = false;
    let compositionEndTimer: ReturnType<typeof setTimeout> | undefined;

    // 文書が編集されるたびに呼ばれるリスナーを登録する（create() より前に登録する）
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (composing) return;
        onChangeRef.current?.(markdown);
      });
    });

    // 変換の開始と確定は、エディタ内の入力欄から DOM イベントとして伝わってくる
    // 確定直後は ProseMirror が最後の変更を取り込み終えていないことがあるため、
    // 少し待ってから最新の内容を通知する
    const handleCompositionStart = () => {
      composing = true;
      clearTimeout(compositionEndTimer);
    };
    const handleCompositionEnd = () => {
      composing = false;
      clearTimeout(compositionEndTimer);
      compositionEndTimer = setTimeout(() => {
        onChangeRef.current?.(crepe.getMarkdown());
      }, 50);
    };
    containerRef.current.addEventListener("compositionstart", handleCompositionStart);
    containerRef.current.addEventListener("compositionend", handleCompositionEnd);

    let cancelled = false;
    // create() が終わって、内容を取り出せる状態になったかどうか
    let created = false;

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
      created = true;
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
      // Crepe を破棄する前に、その時点の内容を親に渡す
      if (created) {
        onUnmountRef.current?.(crepe.getMarkdown());
      }
      clearTimeout(settleTimer);
      clearTimeout(compositionEndTimer);
      container.removeEventListener("compositionstart", handleCompositionStart);
      container.removeEventListener("compositionend", handleCompositionEnd);
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
