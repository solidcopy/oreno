/**
 * リンク設定モーダルの、リンク先の候補を絞り込むモジュール
 * サーバーから受け取ったファイルの一覧を、入力中のリンク先で絞り込んで並べ替える
 */

export type LinkCandidate = {
  /** 文書ルートからの相対パス（拡張子付き。例: "docs/guide.md"） */
  path: string;
  /** ファイル名（拡張子付き。例: "guide.md"） */
  name: string;
  /** フォルダのパス（末尾の "/" なし。ルート直下は "."） */
  dir: string;
  /** リンク先に設定する文字列（Markdownは拡張子なし。例: "/docs/guide"） */
  link: string;
};

/**
 * 候補の該当条件。小さいほど優先して前に並べる
 * 0: ファイル名が入力中のリンク先から始まる
 * 1: 文書ルートからの相対パスが入力中のリンク先から始まる
 * 2: 文書ルートからの相対パスが入力中のリンク先を含んでいる
 */
type Rank = 0 | 1 | 2;

/**
 * files（文書ルートからの相対パス）のうち、input に該当するものを候補として返す
 * 該当した条件の順に並べ、同じ条件の中は相対パスの昇順（文字コード順）にする
 * 大文字小文字は区別しない
 *
 * リンク先は "/" から始まる絶対形式で入力されることが多いので、
 * 相対パスとの比較（条件1、2）では先頭の "/" を1つ取り除いた入力を使う
 */
export function searchLinkCandidates(
  files: string[],
  input: string,
): LinkCandidate[] {
  const query = input.toLowerCase();
  const pathQuery = query.startsWith("/") ? query.slice(1) : query;

  const matched: { candidate: LinkCandidate; rank: Rank }[] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    const slash = file.lastIndexOf("/");
    const name = file.slice(slash + 1);

    let rank: Rank;
    if (name.toLowerCase().startsWith(query)) {
      rank = 0;
    } else if (lower.startsWith(pathQuery)) {
      rank = 1;
    } else if (lower.includes(pathQuery)) {
      rank = 2;
    } else {
      continue;
    }

    matched.push({
      rank,
      candidate: {
        path: file,
        name,
        dir: slash === -1 ? "." : file.slice(0, slash),
        link: "/" + (file.endsWith(".md") ? file.slice(0, -".md".length) : file),
      },
    });
  }

  matched.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.candidate.path < b.candidate.path
        ? -1
        : a.candidate.path > b.candidate.path
          ? 1
          : 0),
  );
  return matched.map(({ candidate }) => candidate);
}
