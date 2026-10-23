import { readdir } from "node:fs/promises";
import path from "node:path";
import { getRootDir, resolveDocPath, resolveFilePath } from "@/lib/docPath";

/**
 * 文書ルート以下のファイルの一覧をサーバーのメモリに保持するモジュール
 * リンク設定モーダルの候補表示に使う
 *
 * 一覧は定期的なスキャンで更新する
 * Dockerのバインドマウントではファイルの変更を監視できないことが多いため、監視は使わない
 * 利用する側は、その時点で保持している一覧をそのまま使う（利用のたびに再取得はしない）
 *
 * アプリの操作でページを作成・移動・削除したときは、registerFile / unregisterFile で
 * 一覧にすぐ反映する
 * スキャン中に呼ばれた場合は、古いスキャン結果で上書きされないよう、
 * スキャンの完了を待ってから反映する
 */

// スキャンの周期（前回のスキャンが終わってから次を始めるまでの時間）
const SCAN_INTERVAL_MS = 10 * 60 * 1000;

type PendingChange = { kind: "add" | "remove"; file: string };

type FileIndexState = {
  // 文書ルートからの相対パス（"/" 区切り、拡張子付き）の集合
  files: Set<string>;
  // 最初のスキャンが完了しているか
  ready: boolean;
  // スキャン中の Promise（スキャン中でなければ null）
  scanning: Promise<void> | null;
  // スキャン中に受け付けた変更。スキャンの完了後に順に反映する
  pending: PendingChange[];
  started: boolean;
};

/**
 * 状態は globalThis に持つ
 * Next.js はサーバー起動時の処理（instrumentation.ts）とServer Actionを別々にバンドルするため、
 * モジュール変数だと両者で別々の状態になってしまう
 */
const globalForIndex = globalThis as typeof globalThis & {
  orenoFileIndex?: FileIndexState;
};

function getState(): FileIndexState {
  globalForIndex.orenoFileIndex ??= {
    files: new Set(),
    ready: false,
    scanning: null,
    pending: [],
    started: false,
  };
  return globalForIndex.orenoFileIndex;
}

/**
 * ファイルのスキャンを始める（サーバー起動時に一度だけ呼ぶ）
 * 最初のスキャンはすぐに始め、以降は完了するたびに次のタイマーをセットする
 * 呼び出し元（register）の完了を待たせないよう、スキャンの完了は待たない
 */
export function startFileScan(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  const run = async () => {
    await scanOnce(state);
    // 終わってから次をセットするので、スキャンが重なることはない
    // タイマーがあってもプロセスの終了を妨げないようにする
    setTimeout(run, SCAN_INTERVAL_MS).unref();
  };
  void run();
}

/**
 * スキャンを始めるよう依頼する
 * すでにスキャン中のときは、何もしない（次のスキャンを予約することもしない）
 * スキャンの完了は待たない
 */
export function requestFileScan(): void {
  void scanOnce(getState());
}

/**
 * 保持している一覧を返す
 * ready が false の間は、最初のスキャンがまだ終わっていない
 * scanning が true の間は、files はスキャン前の一覧
 */
export function getFileIndex(): {
  ready: boolean;
  scanning: boolean;
  files: string[];
} {
  const state = getState();
  return {
    ready: state.ready,
    scanning: state.scanning !== null,
    files: [...state.files],
  };
}

/**
 * ページの作成・保存を一覧に反映する
 * slug は resolveDocPath で検証済みのものを渡すこと
 */
export function registerFile(slug: string[]): void {
  applyChange({ kind: "add", file: slugToFile(slug) });
}

/**
 * ページの削除・移動元を一覧に反映する
 */
export function unregisterFile(slug: string[]): void {
  applyChange({ kind: "remove", file: slugToFile(slug) });
}

function slugToFile(slug: string[]): string {
  return slug.join("/") + ".md";
}

function applyChange(change: PendingChange): void {
  const state = getState();
  if (state.scanning) {
    state.pending.push(change);
    return;
  }
  applyToFiles(state.files, change);
}

function applyToFiles(files: Set<string>, { kind, file }: PendingChange) {
  if (kind === "remove") {
    files.delete(file);
    return;
  }
  // "." から始まる名前は処理対象外
  if (file.split("/").some((segment) => segment.startsWith("."))) return;
  files.add(file);
}

/**
 * スキャンを1回行う
 * すでにスキャン中のときは、新しく始めずに、そのスキャンの完了を待つ Promise を返す
 */
function scanOnce(state: FileIndexState): Promise<void> {
  state.scanning ??= scan(state)
    // 失敗しても、未処理の拒否でプロセスが落ちないようにする
    .catch((error) => console.error("ファイル一覧のスキャンに失敗しました", error))
    .finally(() => {
      state.scanning = null;
    });
  return state.scanning;
}

/**
 * 文書ルート以下をフォルダ単位で順に readdir して、一覧を作り直す
 * 読めないフォルダは飛ばして続ける
 * "." から始まる名前とシンボリックリンクは無視する
 */
async function scan(state: FileIndexState): Promise<void> {
  const found = new Set<string>();

  try {
    const root = getRootDir();
    // まだ調べていないフォルダ（文書ルートからのセグメントの配列）
    const folders: string[][] = [[]];

    for (let folder = folders.pop(); folder; folder = folders.pop()) {
      let dirents;
      try {
        dirents = await readdir(path.join(root, ...folder), {
          withFileTypes: true,
        });
      } catch {
        continue;
      }

      for (const dirent of dirents) {
        if (dirent.name.startsWith(".")) continue;

        if (dirent.isDirectory()) {
          folders.push([...folder, dirent.name]);
        } else if (dirent.isFile() && isLinkable([...folder, dirent.name])) {
          found.add([...folder, dirent.name].join("/"));
        }
      }
    }
  } finally {
    // スキャンの結果で一覧を置き換え、スキャン中に受け付けた変更を順に反映する
    state.files = found;
    for (const change of state.pending) applyToFiles(state.files, change);
    state.pending = [];
    state.ready = true;
  }
}

/**
 * URL にできない名前（"*" を含むなど）のファイルは、リンク先にできないので除く
 * Markdown は拡張子 ".md" を除いた名前のページとして検証する
 */
function isLinkable(segments: string[]): boolean {
  const last = segments[segments.length - 1];
  if (last.endsWith(".md")) {
    const name = last.slice(0, -".md".length);
    return name !== "" && resolveDocPath([...segments.slice(0, -1), name]) !== null;
  }
  return resolveFilePath(segments) !== null;
}
