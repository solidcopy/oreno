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
import { useRouter } from "next/navigation";
import styles from "./DocumentPage.module.css";
import type { FolderEntries } from "@/lib/folder";
import type { Mode, SidebarSettings } from "@/lib/userSettings";
import { extractHeadings } from "@/lib/headings";
import Sidebar from "./Sidebar/Sidebar";
import Header, { type SaveStatus } from "./Header";
import NewPageButton from "./NewPageButton";
import { useSavedToggle } from "./useSavedToggle";
import {
  saveDocument,
  deleteDocument,
  recordViewHistory,
  setStarred,
  setShowSidebarSetting,
  setModeSetting,
  type SaveResult,
} from "../actions";
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

// 編集が止まってから保存を始めるまでの待ち時間
// 1文字入力するたびに保存が走らないよう、連続した編集をまとめる
const AUTO_SAVE_DELAY_MS = 500;

// 保存失敗のメッセージを表示しておく時間
// ユーザー設定画面の保存通知と同じ秒数にしている
const NOTICE_DISPLAY_MS = 3000;

type Props = {
  slug: string[];
  rootDirName: string;
  projectName: string;
  initialMarkdown: string;
  initialHtml: string;
  initialExists: boolean;
  initialStarred: boolean;
  // 保存済みのモード
  initialMode: Mode;
  // サイドバーの表示・開閉の保存済みの設定
  sidebarSettings: SidebarSettings;
  starredPages: string[];
  histories: string[];
  folderEntries: FolderEntries;
};

export default function DocumentPage({
  slug,
  rootDirName,
  projectName,
  initialMarkdown,
  initialHtml,
  initialExists,
  initialStarred,
  initialMode,
  sidebarSettings,
  starredPages,
  histories,
  folderEntries,
}: Props) {
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
  // 保存済みのモード（initialMode）で開く
  // ファイルが存在しない場合（initialExists === false）は、README.md の
  // 「ページの新規作成」の仕様どおり、保存済みのモードに関わらず編集モードで開く
  const [mode, setMode] = useState<Mode>(initialExists ? initialMode : "edit");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [html, setHtml] = useState(initialHtml);
  const [exists, setExists] = useState(initialExists);
  // 削除中かどうか（削除中は削除ボタンの二重押しと、モードの切り替えを防ぐ）
  const [deleting, setDeleting] = useState(false);
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
    sidebarSettings.show,
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

  // モードを切り替えて、ページを移動したりリロードしても変わらないよう保存する
  // 保存に失敗しても、画面のモードはそのままにしてエラーだけ表示する
  async function changeMode(next: Mode) {
    setMode(next);
    const result = await setModeSetting(next);
    if (!result.ok) {
      setError(result.message);
    }
  }

  function handleEdit() {
    setError(null);
    void changeMode("edit");
  }

  // ---- 自動保存 ----
  //
  // 編集のたびに onChange（handleEditorChange）が呼ばれ、最後の編集から
  // AUTO_SAVE_DELAY_MS 経ったら保存する
  // 保存の途中で使う値は、変わっても画面を描き直す必要がないので
  // useState ではなく useRef に入れている（ref は書き換えても再レンダーされない）
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showSaveFailedNotice, setShowSaveFailedNotice] = useState(false);

  // エディタの最新の内容
  const latestMarkdownRef = useRef(initialMarkdown);
  // ファイルに保存済みの内容
  const savedMarkdownRef = useRef(initialMarkdown);
  // 保存待ちのタイマー
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 保存失敗のメッセージを消すタイマー
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ファイルが存在するかどうか
  // 保存中の関数から最新の値を見たいので ref にも持つ（exists と同じ値）
  const existsRef = useRef(initialExists);

  function clearSaveTimer() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  // Server Action で文書を保存する
  // 通信の失敗などで Server Action 自体が呼べなかった場合も、失敗の結果として返す
  async function requestSave(target: string): Promise<SaveResult> {
    try {
      return await saveDocument(slug, target);
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  }

  // 最新の内容をファイルに保存する
  // 保存を始めてから終わるまでの間にさらに編集されることがあるので、
  // 保存が終わった時点で最新の内容が保存した内容と同じときだけ「保存済み」にする
  async function saveNow() {
    clearSaveTimer();
    const target = latestMarkdownRef.current;
    if (target === savedMarkdownRef.current) {
      setSaveStatus("saved");
      return;
    }

    const result = await requestSave(target);

    if (!result.ok) {
      console.error(result.message);
      // 保存の途中でさらに編集されていたら、その編集の保存が改めて走るので失敗扱いにしない
      if (latestMarkdownRef.current === target) {
        setSaveStatus("failed");
      }
      showSaveFailedMessage();
      return;
    }

    savedMarkdownRef.current = target;
    setMarkdown(target);
    setHtml(result.html);
    if (latestMarkdownRef.current === target) {
      setSaveStatus("saved");
    }
  }

  function showSaveFailedMessage() {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setShowSaveFailedNotice(true);
    noticeTimerRef.current = setTimeout(() => {
      setShowSaveFailedNotice(false);
    }, NOTICE_DISPLAY_MS);
  }

  // エディタの内容が変わるたびに呼ばれる
  // 前回の保存待ちを取り消して待ち直すことで、連続した編集を1回の保存にまとめる
  // （保存に失敗したあとも自動では再試行せず、次にこれが呼ばれたとき保存を試みる）
  function handleEditorChange(newMarkdown: string) {
    latestMarkdownRef.current = newMarkdown;
    // 新規作成中（まだファイルがない）は自動保存せず、「保存」ボタンで保存する
    if (!existsRef.current) return;
    if (newMarkdown === savedMarkdownRef.current) {
      // 編集して元に戻した場合など、保存済みの内容と同じなら保存しない
      clearSaveTimer();
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    clearSaveTimer();
    saveTimerRef.current = setTimeout(() => {
      void saveNow();
    }, AUTO_SAVE_DELAY_MS);
  }

  // エディタが画面から消えるとき（別のページへ移動したときなど）、
  // 待っている保存を待たずに、その時点の内容を今すぐ保存する
  // onChange は編集から少し遅れて呼ばれるため、直前の編集は latestMarkdownRef に
  // 届いていないことがある
  // そのため、エディタが消える直前に取り出した内容を使う
  // 新規作成中（まだファイルがない）の内容と、ブラウザのタブを閉じる場合は対象外
  // 削除のあとにエディタが作り直されるときも、ファイルがない状態なので保存されない
  function handleEditorUnmount(unmountMarkdown: string) {
    if (!existsRef.current) return;
    latestMarkdownRef.current = unmountMarkdown;
    if (unmountMarkdown !== savedMarkdownRef.current) {
      clearSaveTimer();
      void saveDocument(slug, unmountMarkdown);
    }
  }

  // 新規作成中かどうか（保存の途中は「保存」「キャンセル」ボタンを押せなくする）
  const [creating, setCreating] = useState(false);

  // 新規作成の「保存」ボタン
  // ここで初めてファイルを作る
  // 保存したあとのモードは、ユーザー設定のモード（initialMode）に従う
  // 失敗したときは、新規作成の画面のまま失敗のメッセージを出す
  async function handleCreate() {
    // onChange は編集から少し遅れて呼ばれるため、エディタから直接内容を取り出す
    const content = editorRef.current?.getMarkdown() ?? latestMarkdownRef.current;
    setCreating(true);
    setError(null);

    const result = await requestSave(content);

    setCreating(false);
    if (!result.ok) {
      console.error(result.message);
      showSaveFailedMessage();
      return;
    }

    latestMarkdownRef.current = content;
    savedMarkdownRef.current = content;
    setMarkdown(content);
    setHtml(result.html);
    existsRef.current = true;
    setExists(true);
    setMode(initialMode);
  }

  // 新規作成の「キャンセル」ボタン
  // 直前まで表示していたページに戻る
  // 履歴がない（URLを直接開いた）ときは、戻る先がないのでルートへ移動する
  function handleCancelNew() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/index");
    }
  }

  // 表示モードに切り替える
  // 保存待ちの編集があれば、待たずに今すぐ保存してから切り替える
  // 保存に失敗したときは、編集が失われないよう編集モードのままにする
  async function handleSwitchToView() {
    setError(null);
    if (latestMarkdownRef.current !== savedMarkdownRef.current) {
      await saveNow();
      if (latestMarkdownRef.current !== savedMarkdownRef.current) return;
    }
    void changeMode("view");
  }

  async function handleDelete() {
    if (!window.confirm("この文書を削除しますか？この操作は取り消せません。")) {
      return;
    }

    // 保存待ちの編集が削除のあとに保存されて、ファイルが復活しないようにする
    clearSaveTimer();
    latestMarkdownRef.current = "";
    savedMarkdownRef.current = "";
    setSaveStatus("idle");

    setDeleting(true);
    setError(null);

    const result = await deleteDocument(slug);

    setDeleting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    // 削除後は「このURLに対応するファイルが存在しない」状態になるので、
    // README.md の仕様どおり空の編集モードに戻す
    setMarkdown("");
    setHtml("");
    setExists(false);
    existsRef.current = false;
    setEditorInstanceKey((key) => key + 1);
    setMode("edit");
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <Header
        projectName={projectName}
        rootDirName={rootDirName}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
        pageTitle={`/${slug.join("/")}`}
        saveStatus={exists ? saveStatus : "new"}
        newPageActions={{
          onSave: handleCreate,
          onCancel: handleCancelNew,
          disabled: creating,
        }}
        actions={
          mode === "view" ? (
            <>
              <NewPageButton slug={slug} />
              <button
                type="button"
                className={styles.modeButton}
                onClick={handleEdit}
              >
                編集モードに切り替え
              </button>
              <button
                type="button"
                className={styles.buttonDanger}
                onClick={handleDelete}
                disabled={deleting}
              >
                削除
              </button>
            </>
          ) : (
            <>
              {exists && <NewPageButton slug={slug} />}
              {exists && (
                <button
                  type="button"
                  className={styles.modeButton}
                  onClick={handleSwitchToView}
                  disabled={deleting}
                >
                  表示モードに切り替え
                </button>
              )}
              {exists && (
                <button
                  type="button"
                  className={styles.buttonDanger}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  削除
                </button>
              )}
            </>
          )
        }
      />

      <div className={styles.body}>
        {sidebarVisible && (
          <Sidebar
            settings={sidebarSettings}
            starredPages={starredPages}
            histories={histories}
            pages={{ slug, folderEntries }}
            toc={{ headings, onSelectHeading: handleSelectHeading }}
          />
        )}
        <div className={styles.main} ref={mainRef}>
          {showSaveFailedNotice && (
            <div className={styles.noticeAnchor}>
              <div className={styles.errorNotice}>文書の保存に失敗しました。</div>
            </div>
          )}
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
                onChange={handleEditorChange}
                onUnmount={handleEditorUnmount}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
