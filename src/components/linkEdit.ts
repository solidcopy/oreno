import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

/**
 * リンク設定モーダルを開いた時点の、リンクを置き換える対象
 * モーダルを開いている間は文書が変わらないので、位置（from, to）を
 * そのまま保存しておき、「リンクを挿入」を押したときに使う
 */
export type LinkTarget = {
  /** 置き換える範囲の開始位置 */
  from: number;
  /** 置き換える範囲の終了位置 */
  to: number;
  /** モーダルのリンク先の初期値 */
  url: string;
  /** モーダルのリンクテキストの初期値 */
  text: string;
};

/**
 * 現在の選択範囲から、リンク設定モーダルが置き換える対象と初期値を求める
 *
 * - カーソルがリンク上: そのリンク全体が対象。初期値はリンク先とリンクテキスト
 * - テキストを選択中: 選択範囲が対象。初期値は両方とも選択中のテキスト
 * - それ以外: カーソル位置への挿入。初期値は両方とも空欄
 */
export function getLinkTarget(view: EditorView, linkType: MarkType): LinkTarget {
  const { state } = view;
  const { from, to, empty, $from } = state.selection;

  if (!empty) {
    const text = state.doc.textBetween(from, to);
    return { from, to, url: text, text };
  }

  const linkMark = $from.marks().find((mark) => mark.type === linkType);
  if (!linkMark) {
    return { from, to, url: "", text: "" };
  }

  // カーソルがある段落の中で、同じリンク先が続いている範囲を求める
  // 同じ href でも書式（太字など）が違う部分は別のテキストノードに分かれるため、
  // ノードを順に見て、カーソルを含む連続した範囲をつなげている
  const parent = $from.parent;
  const parentStart = $from.start();
  let linkFrom = from;
  let linkTo = to;
  let runStart = -1;
  parent.forEach((node, offset) => {
    const isSameLink = node.marks.some(
      (mark) => mark.type === linkType && mark.attrs.href === linkMark.attrs.href,
    );
    const nodeFrom = parentStart + offset;
    const nodeTo = nodeFrom + node.nodeSize;
    if (isSameLink) {
      if (runStart === -1) runStart = nodeFrom;
      // カーソルが連続範囲の端（nodeTo）にあるときも含める
      if (runStart <= from && from <= nodeTo) {
        linkFrom = runStart;
        linkTo = nodeTo;
      }
    } else {
      runStart = -1;
    }
  });

  return {
    from: linkFrom,
    to: linkTo,
    url: linkMark.attrs.href as string,
    text: state.doc.textBetween(linkFrom, linkTo),
  };
}

/**
 * target の範囲を、リンクテキスト text のリンク（リンク先 url）に置き換える
 * リンクテキストが空欄のときは、リンク先をそのままリンクテキストにする
 */
export function applyLink(
  view: EditorView,
  linkType: MarkType,
  target: LinkTarget,
  url: string,
  text: string,
) {
  const { state } = view;
  const linkText = text === "" ? url : text;

  // 置き換え前の先頭の文字に付いていた書式（太字など）は引き継ぐ
  // リンク自体は新しいものに差し替えるので、古いリンクのマークは除く
  const baseMarks = (state.doc.nodeAt(target.from)?.marks ?? []).filter(
    (mark) => mark.type !== linkType,
  );
  const marks = linkType.create({ href: url }).addToSet(baseMarks);

  const tr = state.tr.replaceWith(
    target.from,
    target.to,
    state.schema.text(linkText, marks),
  );
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
