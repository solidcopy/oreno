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
 * カーソル（範囲選択なし）がリンク上にあるとき、そのリンク全体の範囲とリンク先を返す
 * カーソルがリンク上にない、または範囲選択中のときは null を返す
 */
export function findLinkAtCursor(
  view: EditorView,
  linkType: MarkType,
): { from: number; to: number; url: string } | null {
  const { empty, from, to, $from } = view.state.selection;
  if (!empty) return null;

  const linkMark = $from.marks().find((mark) => mark.type === linkType);
  if (!linkMark) return null;

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

  return { from: linkFrom, to: linkTo, url: linkMark.attrs.href as string };
}

/**
 * 現在の選択範囲から、リンク設定モーダルが置き換える対象と初期値を求める
 *
 * - カーソルがリンク上: そのリンク全体が対象。初期値はリンク先とリンクテキスト
 * - テキストを選択中: 選択範囲が対象。初期値は両方とも選択中のテキスト
 * - それ以外: カーソル位置への挿入。初期値は両方とも空欄
 */
export function getLinkTarget(view: EditorView, linkType: MarkType): LinkTarget {
  const { state } = view;
  const { from, to, empty } = state.selection;

  if (!empty) {
    const text = state.doc.textBetween(from, to);
    return { from, to, url: text, text };
  }

  const link = findLinkAtCursor(view, linkType);
  if (!link) {
    return { from, to, url: "", text: "" };
  }
  return { ...link, text: state.doc.textBetween(link.from, link.to) };
}

/**
 * 解除できるリンクが、選択範囲またはカーソル位置にあるかどうか
 * 範囲選択中は選択範囲の中にリンクがあるか、範囲選択がなければカーソルがリンク上にあるか
 */
export function canRemoveLink(view: EditorView, linkType: MarkType): boolean {
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) return findLinkAtCursor(view, linkType) !== null;
  return state.doc.rangeHasMark(from, to, linkType);
}

/**
 * リンクを解除する
 * 範囲選択中は選択した部分だけ、範囲選択がなければカーソルがあるリンク全体を解除する
 * 解除するリンクがなければ何もしない
 */
export function removeLink(view: EditorView, linkType: MarkType) {
  const { state } = view;
  const { from, to, empty } = state.selection;

  const range = empty ? findLinkAtCursor(view, linkType) : { from, to };
  if (!range) return;

  view.dispatch(state.tr.removeMark(range.from, range.to, linkType));
  view.focus();
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
