"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { keymapRef } from "@milkdown/crepe/feature/toolbar";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  blockquoteKeymap,
  bulletListKeymap,
  codeBlockKeymap,
  clearTextInCurrentBlockCommand,
  hardbreakFilterNodes,
  headingKeymap,
  imageSchema,
  insertImageCommand,
  isMarkSelectedCommand,
  linkSchema,
  orderedListKeymap,
  updateImageCommand,
} from "@milkdown/kit/preset/commonmark";
import { NodeSelection } from "@milkdown/kit/prose/state";
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
import { getImageImportContext } from "@/app/actions";
import { isImageFile } from "@/lib/imageFile";
import type { ImageImportContext } from "@/lib/imageImport";
import ImageDialog, { type ImageValues } from "./ImageDialog";
import ImageImportDialog from "./ImageImportDialog";
import LinkDialog from "./LinkDialog";
import {
  applyLink,
  canRemoveLink,
  getLinkTarget,
  removeLink,
  type LinkTarget,
} from "./linkEdit";
import { unlinkButtonPlugin } from "./unlinkButtonPlugin";
import { unlinkIcon } from "./unlinkIcon";
import { tableBreakPlugin } from "./tableBreakPlugin";
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

// スラッシュメニューの画像項目のアイコン
const imageIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14z"
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
  /** 編集中のページの slug。ドロップされた画像を、ページと同じフォルダに保存するために使う */
  slug: string[];
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
  /** ドロップされた画像の保存に失敗したときに呼ばれる */
  onImageSaveFailed?: () => void;
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
  slug,
  defaultValue,
  onChange,
  onUnmount,
  onImageSaveFailed,
}: Props & { ref?: React.Ref<MarkdownEditorHandle> }) {
  // 実際に Crepe を描画する対象の <div> を指すための ref
  const containerRef = useRef<HTMLDivElement>(null);
  // Crepe のインスタンス自体を覚えておくための ref（再レンダーされても消えない）
  const crepeRef = useRef<Crepe | null>(null);

  // リンク設定モーダルの表示状態
  // null のときは閉じている。開いているときは、置き換える対象と初期値を持つ
  // Crepe の外（React）で描画するモーダルなので、state で管理する
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);

  // 画像挿入モーダルの表示状態
  // null のときは閉じている。開いているときの initial は、
  // 選択中の画像を変更するときだけ持つ入力欄の初期値（挿入のときは null）
  const [imageDialog, setImageDialog] = useState<{
    initial: ImageValues | null;
  } | null>(null);

  // 画像インポートモーダルの表示状態
  // null のときは閉じている。開いているときは、ドロップされた画像ファイルと、
  // そのドロップ位置、モーダルの初期値などを持つ
  const [importDialog, setImportDialog] = useState<{
    file: File;
    dropPos?: number;
    context: ImageImportContext;
  } | null>(null);

  // onChange は最新の関数を ref に入れておき、Crepe には常にこの ref 経由で呼んでもらう
  // useEffect の中で onChange を直接渡すと、エディタを作った時点の関数が
  // 使われ続けてしまう（エディタは最初の1回しか作らないため）
  const onChangeRef = useRef(onChange);
  const onUnmountRef = useRef(onUnmount);
  const onImageSaveFailedRef = useRef(onImageSaveFailed);
  // ドロップされた画像のインポートを始める関数
  // ドロップを受け取る関数は useEffect の中で一度だけ作られるため、この ref 経由で呼ぶ
  const startImportRef = useRef<(file: File, dropPos?: number) => void>(
    () => {},
  );
  // slug も同じ理由で ref 経由にする（画像のドロップ時に最新のページを参照するため）
  const slugRef = useRef(slug);
  useEffect(() => {
    onChangeRef.current = onChange;
    onUnmountRef.current = onUnmount;
    onImageSaveFailedRef.current = onImageSaveFailed;
    slugRef.current = slug;
  });

  // 親コンポーネント（DocumentPage）が ref.current.getMarkdown() を
  // 呼び出せるように、公開する関数をここで定義する
  // React 19 からは forwardRef を使わずに、通常の props として ref を受け取れる
  useImperativeHandle(ref, () => ({
    getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    // Mod は Mac では Cmd、それ以外では Ctrl
    const isMac = navigator.userAgent.includes("Mac");

    // リンク設定モーダルを開く
    // 開いた時点の選択範囲から、置き換える対象とモーダルの初期値を求める
    const openLinkDialog = (ctx: Ctx) => {
      setLinkTarget(getLinkTarget(ctx.get(editorViewCtx), linkSchema.type(ctx)));
    };

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue,
      features: {
        // 数式（LaTeX）を無効にする
        // $text$ の自動変換と、ツールバーの数式ボタンがなくなる
        [CrepeFeature.Latex]: false,
        // リンク上にカーソルを置くと出る標準の小窓（編集・削除ボタン付き）を無効にする
        // リンクの設定はリンク設定モーダルで行う
        [CrepeFeature.LinkTooltip]: false,
        // 標準の画像機能（ImageBlock）を無効にする
        // 有効だと画像がブロック画像として読み込まれ、保存時に代替テキストが
        // サイズ倍率（"1.00" など）に置き換えられてしまう
        // 無効にすると画像は標準の image ノードになり、![代替テキスト](パス "タイトル")
        // がそのまま保存される。リサイズとキャプションの機能もなくなる
        // スラッシュメニューの標準の Image 項目も消えるので、下の buildMenu で自作の項目を足す
        [CrepeFeature.ImageBlock]: false,
      },
      featureConfigs: {
        // スラッシュメニュー（行頭の＋アイコンで開くメニュー）の先頭に
        // 画像挿入モーダルを開く項目を足す
        [CrepeFeature.BlockEdit]: {
          buildMenu: (builder) => {
            builder.getGroup("advanced").group.items.unshift({
              key: "image",
              label: "Image",
              icon: imageIcon,
              onRun: (ctx) => {
                // メニューを開くために入力した "/" などを消してから、モーダルを開く
                // モーダルを開いている間もカーソル位置は保たれるので、
                // 挿入はモーダルの確定時にその位置へ行う
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                setImageDialog({ initial: null });
              },
            });
          },
        },
        // 既定の文字修飾（太字・斜体・取り消し線）の並びの最後に
        // 下線・上付き・下付きのボタンを足す
        [CrepeFeature.Toolbar]: {
          buildToolbar: (builder) => {
            // 標準のリンクボタン（リンクの付け外しをする）の動作を、
            // リンク設定モーダルを開く動作に差し替える
            const linkItem = builder
              .getGroup("function")
              .group.items.find((item) => item.key === "link");
            if (linkItem) linkItem.onRun = openLinkDialog;
            // リンクボタンの右隣に、リンク解除ボタンを足す
            // ツールバーのボタンには「押せない状態」がないため、
            // active を「解除できるリンクがある」の意味で使い、
            // active でないときは globals.css で薄く表示して押せなくしている
            builder.getGroup("function").addItem("unlink", {
              icon: unlinkIcon,
              label: "Unlink",
              shortcut: isMac ? "⌘⌥K" : "Ctrl+Alt+K",
              ariaKeyshortcuts: isMac ? "Meta+Alt+K" : "Control+Alt+K",
              active: (ctx) =>
                canRemoveLink(ctx.get(editorViewCtx), linkSchema.type(ctx)),
              onRun: (ctx) =>
                removeLink(ctx.get(editorViewCtx), linkSchema.type(ctx)),
            });
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
    // 表のセル内の改行を <br> として読み書きできるようにする
    crepe.editor.use(tableBreakPlugin);
    // カーソルがリンク上にあるとき、リンクの真上に解除ボタンを出す
    crepe.editor.use(unlinkButtonPlugin);
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
      // 改行（Shift+Enter）を受け付けない要素から表を外す
      // Milkdown は標準で表とコードブロックの中への改行を拒否しているが、
      // 表のセル内の改行は <br> として扱うため、現在の一覧から表だけを取り除く
      ctx.update(hardbreakFilterNodes.key, (nodes) =>
        nodes.filter((name) => name !== "table"),
      );
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

    // Mod+K でリンク設定モーダルを開き、Mod+Alt+K でリンクを解除する
    // Mod+P で画像挿入モーダルを開く（ブラウザの印刷より優先する）
    // 変換中のキー入力や、Shift が付いた組み合わせは対象外にする
    // Mac では Option を押しながらだと e.key が別の文字（"˚" など）になるため、
    // 押したキーそのものを表す e.code で判定する
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod || e.shiftKey || e.isComposing) return;
      if (e.code === "KeyP" && !e.altKey) {
        e.preventDefault();
        // 画像を選択しているときは、その画像を変更するモーダルを開く
        crepe.editor.action((ctx) => {
          const { selection } = ctx.get(editorViewCtx).state;
          const selected =
            selection instanceof NodeSelection &&
            selection.node.type === imageSchema.type(ctx);
          setImageDialog({
            initial: selected
              ? {
                  src: selection.node.attrs.src as string,
                  title: selection.node.attrs.title as string,
                  alt: selection.node.attrs.alt as string,
                }
              : null,
          });
        });
        return;
      }
      if (e.code === "KeyK") {
        e.preventDefault();
        if (e.altKey) {
          crepe.editor.action((ctx) =>
            removeLink(ctx.get(editorViewCtx), linkSchema.type(ctx)),
          );
        } else {
          crepe.editor.action(openLinkDialog);
        }
      }
    };
    containerRef.current.addEventListener("keydown", handleKeyDown);

    // ファイラーなどからドロップされた画像ファイルを、ページと同じフォルダに保存して、
    // ドロップした位置に画像として挿入する
    // ドロップできるのは単一の画像ファイルだけ
    // ProseMirror より先に処理するため、キャプチャ段階で受け取る
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // これがないと、ブラウザがファイルを開いてしまいドロップを受け取れない
      e.preventDefault();
      // ドラッグ中はファイル名が分からないので、MIME タイプで画像かどうかを見分ける
      // OS によっては MIME タイプが空になる（.ico など）ため、空のときは許可して、
      // ドロップ時に拡張子で判定する
      const items = [...(e.dataTransfer?.items ?? [])];
      const droppable =
        items.length === 1 &&
        (items[0].type === "" || items[0].type.startsWith("image/"));
      if (!droppable) {
        // マウスポインタが禁止マークになり、ドロップもできなくなる
        // ドロップ位置の水平線（ドロップカーソル）も出さないよう、エディタ本体には渡さない
        e.dataTransfer!.dropEffect = "none";
        e.stopPropagation();
      }
    };
    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      // ドロップ位置を示す水平線（ドロップカーソル）は、エディタ本体が drop を受け取って消す
      // ここで止めてしまうと消えずに残るため、同じ後始末をする dragend を代わりに送る
      crepe.editor.ctx.get(editorViewCtx).dom.dispatchEvent(new DragEvent("dragend"));
      // 単一の画像ファイル以外は無視する
      const files = e.dataTransfer?.files;
      if (files?.length !== 1 || !isImageFile(files[0].name)) return;

      // 保存の完了を待つ間にカーソルなどが動いても挿入位置がずれないよう、
      // ドロップした座標から求めた位置を先に控えておく
      const view = crepe.editor.ctx.get(editorViewCtx);
      const dropPos = view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
      startImportRef.current(files[0], dropPos);
    };
    // ポインタの種類はドラッグがエディタに入った時点（dragenter）でも決まるため、
    // dragover と同じ処理を dragenter にも付ける
    containerRef.current.addEventListener("dragenter", handleDragOver, true);
    containerRef.current.addEventListener("dragover", handleDragOver, true);
    containerRef.current.addEventListener("drop", handleDrop, true);

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
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("dragenter", handleDragOver, true);
      container.removeEventListener("dragover", handleDragOver, true);
      container.removeEventListener("drop", handleDrop, true);
      observer.disconnect();
      crepeRef.current = null;
      void crepe.destroy();
    };
    // defaultValue は初回マウント時の初期値としてのみ使うので、
    // 依存配列には含めない（含めると入力のたびにエディタが作り直されてしまう）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ドロップされた画像のインポートを始める
  // 画像パスの初期入力などをサーバーに問い合わせてから、設定に応じて、
  // 画像インポートモーダルを開くか、確認なしでそのままコピーして埋め込む
  // 問い合わせが終わるまでモーダルは開かないので、初期入力が後から書き換わることはない
  const startImport = async (file: File, dropPos?: number) => {
    let context: ImageImportContext;
    try {
      context = await getImageImportContext(slugRef.current, file.name);
    } catch (error) {
      console.error(error);
      onImageSaveFailedRef.current?.();
      return;
    }

    if (context.useModal) {
      setImportDialog({ file, dropPos, context });
    } else {
      await importImage(file, context.initialPath, "", "", dropPos);
    }
  };

  // 画像ファイルを path に保存（コピー）して、ドロップした位置に画像として埋め込む
  // 保存に失敗したときは、通知を出して埋め込まない
  const importImage = async (
    file: File,
    path: string,
    title: string,
    alt: string,
    dropPos?: number,
  ) => {
    const formData = new FormData();
    formData.append("slug", JSON.stringify(slugRef.current));
    formData.append("file", file);
    formData.append("path", path);

    let src: string;
    try {
      const response = await fetch("/.oreno/upload_images", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(String(response.status));
      ({ path: src } = await response.json());
    } catch (error) {
      console.error(error);
      onImageSaveFailedRef.current?.();
      return;
    }

    crepeRef.current?.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const imageType = imageSchema.type(ctx);
      // 保存を待つ間にドキュメントが変わっていても範囲外にならないようにする
      const pos = Math.min(
        dropPos ?? view.state.selection.from,
        view.state.doc.content.size,
      );
      const image = imageType.create({ src, alt, title });
      // 段落の中なら文中の画像として挿入する（既存の画像挿入と同じ）
      // 段落と段落の間のように文を置けない位置なら、画像だけの段落にする
      const node = view.state.doc.resolve(pos).parent.inlineContent
        ? image
        : view.state.schema.nodes.paragraph.create(null, image);
      view.dispatch(view.state.tr.insert(pos, node));
      view.focus();
    });
  };

  useEffect(() => {
    startImportRef.current = startImport;
  });

  const closeImportDialog = () => {
    setImportDialog(null);
    crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const closeLinkDialog = () => {
    setLinkTarget(null);
    // 閉じたあとも続けて入力できるよう、エディタにフォーカスを戻す
    crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const closeImageDialog = () => {
    setImageDialog(null);
    crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  // flex:1 で親(.editorArea)いっぱいに広がる
  // globals.css側で
  // Milkdownが実行時に生成する .milkdown / .ProseMirror にも同じ
  // flex:1 を連鎖させることで、編集領域が文書の短さに関わらず
  // 画面下端まで届くようにしている（末尾クリックでカーソル移動できるように）
  return (
    <>
      <div
        ref={containerRef}
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      />
      {/* モーダルは document.body の直下に描画されるため、ここに置いても
          エディタの表示領域には影響しない */}
      {linkTarget && (
        <LinkDialog
          initialUrl={linkTarget.url}
          initialText={linkTarget.text}
          onCancel={closeLinkDialog}
          onSubmit={(url, text) => {
            crepeRef.current?.editor.action((ctx) => {
              applyLink(
                ctx.get(editorViewCtx),
                linkSchema.type(ctx),
                linkTarget,
                url,
                text,
              );
            });
            setLinkTarget(null);
          }}
        />
      )}
      {importDialog && (
        <ImageImportDialog
          slug={slug}
          initialPath={importDialog.context.initialPath}
          pageFolder={importDialog.context.pageFolder}
          imageFolders={importDialog.context.imageFolders}
          onCancel={closeImportDialog}
          onSubmit={async (path, title, alt) => {
            await importImage(
              importDialog.file,
              path,
              title,
              alt,
              importDialog.dropPos,
            );
            setImportDialog(null);
          }}
        />
      )}
      {imageDialog && (
        <ImageDialog
          initial={imageDialog.initial ?? undefined}
          onCancel={closeImageDialog}
          onSubmit={(src, title, alt) => {
            // 画像を変更するときは選択中の画像を置き換え、そうでなければ
            // 現在のカーソル位置に画像を挿入する
            // 段落の途中にも挿入でき、その場合は文の中の画像（インライン画像）になる
            // モーダルを開いている間も画像の選択は保たれている
            crepeRef.current?.editor.action((ctx) => {
              const command = imageDialog.initial
                ? updateImageCommand
                : insertImageCommand;
              ctx.get(commandsCtx).call(command.key, { src, alt, title });
            });
            closeImageDialog();
          }}
        />
      )}
    </>
  );
}
