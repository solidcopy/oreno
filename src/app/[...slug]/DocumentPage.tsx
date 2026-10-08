"use client";

/**
 * ファイル先頭の "use client" が、このファイルを Client Component にする宣言
 * ブラウザ上で動くコード（クリックへの反応や useState による画面の状態管理）は、
 * Client Component の中でしか書けない
 *
 * page.tsx（Server Component）がサーバー側でファイルを読み込み、
 * このコンポーネントに初期値（initialMarkdown / initialHtml / initialExists）を
 * props として渡してくる
 * ここから先の「表示⇄編集の切り替え」「保存」「削除」は
 * すべてブラウザ側の状態としてこのコンポーネントが管理する
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./DocumentPage.module.css";
import AppMenu from "./AppMenu";
import type { FolderEntries } from "@/lib/folder";
import { extractHeadings } from "@/lib/headings";
import Sidebar from "./Sidebar";
import NewPageButton from "./NewPageButton";
import { useSavedToggle } from "./useSavedToggle";
import {
  saveDocument,
  deleteDocument,
  recordViewHistory,
  setStarred,
  setShowSidebarSetting,
} from "../actions";
import { truncateProjectNameForDisplay } from "@/lib/projectNameDisplay";
import StarIcon from "@/components/StarIcon";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";

// Milkdown のエディタ本体はブラウザの document に依存しているため、
// サーバー上ではレンダリングできない（ssr: false）
// next/dynamic を使うと、このコンポーネントが実際に画面に必要になったタイミングで
// 初めて JavaScript を読み込むようになり、表示専用で開いたときの読み込み量も減らせる
const MarkdownEditor = dynamic(() => import("@/components/MarkdownEditor"), {
  ssr: false,
  loading: () => <p className={styles.editorLoading}>エディタを読み込み中…</p>,
});

type Mode = "view" | "edit";

type Props = {
  slug: string[];
  rootDirName: string;
  projectName: string;
  initialMarkdown: string;
  initialHtml: string;
  initialExists: boolean;
  initialStarred: boolean;
  starredPages: string[];
  showSidebar: boolean;
  showStarredPages: boolean;
  histories: string[];
  showHistories: boolean;
  folderEntries: FolderEntries;
  showPages: boolean;
  showToc: boolean;
};

export default function DocumentPage({
  slug,
  rootDirName,
  projectName,
  initialMarkdown,
  initialHtml,
  initialExists,
  initialStarred,
  starredPages,
  showSidebar,
  showStarredPages,
  histories,
  showHistories,
  folderEntries,
  showPages,
  showToc,
}: Props) {
  // プロジェクト名が設定されていればそちらを、未設定ならルートフォルダ名を表示する
  const rootLinkText = projectName
    ? truncateProjectNameForDisplay(projectName)
    : rootDirName;

  const router = useRouter();

  // useEffect は「画面が表示されたあとに実行したい処理」を登録するための
  // React のフック
  // ページを実際にブラウザで表示したときだけ閲覧履歴を記録するため、
  // サーバー側の描画中ではなくここで Server Action を呼んでいる
  // 存在しないページ（新規作成画面）は記録しない
  // slug は配列で描画のたびに参照が変わりうるため、依存には文字列にした値を使う
  const slugKey = slug.join("/");
  useEffect(() => {
    if (!initialExists) return;
    void recordViewHistory(slugKey.split("/"));
  }, [slugKey, initialExists]);

  // useState は「ブラウザ上でユーザーの操作によって変わる値」を保持するための
  // React のフック
  // 値が変わると、そのたびにこのコンポーネントが再実行され
  // 画面が更新される
  //
  // ファイルが存在しない場合（initialExists === false）は、README.md の
  // 「ページの新規作成」の仕様どおり最初から編集モードで開く
  const [mode, setMode] = useState<Mode>(initialExists ? "view" : "edit");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [html, setHtml] = useState(initialHtml);
  const [exists, setExists] = useState(initialExists);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MarkdownEditor（Client Component）が公開している getMarkdown() を
  // 呼び出すための ref
  // DOM 要素ではなく、コンポーネントが持つ関数への
  // 参照だという点が useRef(null) を <div> に渡す使い方との違い
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // 保存や削除でファイルの状態（存在する/しない、中身）が変わるたびに
  // MarkdownEditor を作り直したいので、key に使う値を用意する
  // key が変わると React はコンポーネントを一度破棄して新しく作り直すため、
  // Milkdown のエディタが新しい初期値で作り直される
  const [editorInstanceKey, setEditorInstanceKey] = useState(0);

  // スター付きかどうか
  // ボタンの見た目をすぐ切り替えるため、先に画面の状態を変えてから
  // Server Action で保存し、失敗したら元に戻す
  const [starred, setStarredState] = useState(initialStarred);

  async function handleToggleStar() {
    const next = !starred;
    setStarredState(next);
    const result = await setStarred(slug, next);
    if (!result.ok) {
      setStarredState(!next);
      setError(result.message);
    }
  }

  // サイドバーを表示するかどうかと、それを切り替える関数（全ページ共通の設定として保存する）
  // スターと同じく、先に画面の状態を変えてから保存し、失敗したら元に戻す
  const [sidebarVisible, handleToggleSidebar] = useSavedToggle(
    showSidebar,
    setShowSidebarSetting,
    setError,
  );

  // 「目次」に表示する見出し
  // 保存済みの内容（markdown）から取り出すため、編集中の変更は保存するまで反映されない
  // useMemo は、markdown が変わったときだけ計算し直すためのフック
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);

  // 本文の領域（表示モードの HTML も編集モードのエディタもこの中にある）
  const mainRef = useRef<HTMLDivElement>(null);

  // 目次の項目がクリックされたとき、index 番目の見出しの位置までスクロールする
  // 目次と本文の見出しはどちらも文書の上からの順に並んでいるため、
  // 本文の中の見出し要素を順番で探せば対応する要素が見つかる
  function handleSelectHeading(index: number) {
    const elements = mainRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6");
    elements?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEdit() {
    setError(null);
    setMode("edit");
  }

  function handleCancel() {
    setError(null);
    // 編集をキャンセルしたので、エディタの中身を保存前の状態に戻すために作り直す
    setEditorInstanceKey((key) => key + 1);
    setMode("view");
  }

  async function handleSave() {
    const currentMarkdown = editorRef.current?.getMarkdown() ?? "";
    setSaving(true);
    setError(null);

    const result = await saveDocument(slug, currentMarkdown);

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setMarkdown(currentMarkdown);
    setHtml(result.html);
    setExists(true);
    setMode("view");
    // サーバー側（page.tsx）が次にこのURLを描画するときのために、
    // Next.js が持っているキャッシュ済みのレンダリング結果を破棄しておく
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("この文書を削除しますか？この操作は取り消せません。")) {
      return;
    }

    setSaving(true);
    setError(null);

    const result = await deleteDocument(slug);

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    // 削除後は「このURLに対応するファイルが存在しない」状態になるので、
    // README.md の仕様どおり空の編集モードに戻す
    setMarkdown("");
    setHtml("");
    setExists(false);
    setEditorInstanceKey((key) => key + 1);
    setMode("edit");
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleToggleSidebar}
          aria-label="サイドバーの表示を切り替える"
          aria-expanded={sidebarVisible}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <path d="M7.5 3.5v13" />
          </svg>
        </button>
        <Link href="/index" className={styles.rootLink}>
          {rootLinkText}
        </Link>
        <span>/{slug.join("/")}</span>
        <div className={styles.spacer} />
        {mode === "view" ? (
          <>
            <NewPageButton slug={slug} />
            <button type="button" className={styles.button} onClick={handleEdit}>
              編集
            </button>
          </>
        ) : (
          <>
            {exists && (
              <button
                type="button"
                className={styles.button}
                onClick={handleCancel}
                disabled={saving}
              >
                キャンセル
              </button>
            )}
            {exists && (
              <button
                type="button"
                className={styles.buttonDanger}
                onClick={handleDelete}
                disabled={saving}
              >
                削除
              </button>
            )}
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </>
        )}
        <AppMenu />
      </div>

      <div className={styles.body}>
        {sidebarVisible && (
          <Sidebar
            starredPages={starredPages}
            initialShowStarredPages={showStarredPages}
            histories={histories}
            initialShowHistories={showHistories}
            slug={slug}
            folderEntries={folderEntries}
            initialShowPages={showPages}
            headings={headings}
            initialShowToc={showToc}
            onSelectHeading={handleSelectHeading}
          />
        )}
        <div className={styles.main} ref={mainRef}>
          {error && <p className={styles.error}>{error}</p>}

          {mode === "view" && exists && (
            <button
              type="button"
              className={styles.starButton}
              onClick={handleToggleStar}
              aria-pressed={starred}
              aria-label={starred ? "スターを外す" : "スターを付ける"}
              title={starred ? "スターを外す" : "スターを付ける"}
            >
              <StarIcon filled={starred} />
            </button>
          )}

          {mode === "view" ? (
            <div
              className={`markdown-body ${styles.content}`}
              // rehype-sanitize で危険なタグ・属性は取り除いた上で変換した HTML なので、
              // ここで dangerouslySetInnerHTML を使って直接埋め込んでいる
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className={styles.editorArea}>
              <MarkdownEditor
                key={editorInstanceKey}
                ref={editorRef}
                defaultValue={markdown}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
