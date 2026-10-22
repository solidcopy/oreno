import { $prose } from "@milkdown/kit/utils";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { findLinkAtCursor, removeLink } from "./linkEdit";
import { unlinkIcon } from "./unlinkIcon";

/**
 * カーソルがリンク上にあるとき、リンクの真上にリンク解除ボタンを表示するプラグイン
 *
 * Crepe のツールバーはテキストを選択したときしか出ないため、
 * 範囲選択なしでカーソルだけがリンク上にある場合は、これとは別に
 * ボタンを1つだけ載せた小さなバーを出している
 * 見た目はツールバーと揃えるため、同じクラス名（milkdown-toolbar など）を使う
 */
export const unlinkButtonPlugin = $prose((ctx) => {
  const linkType = linkSchema.type(ctx);

  return new Plugin({
    view(view: EditorView) {
      // バーは .milkdown の中に置く（Crepe の配色の変数がそこで定義されているため）
      // 位置はビューポート基準の fixed で指定する
      const bar = document.createElement("div");
      bar.className = "milkdown-toolbar";
      bar.style.position = "fixed";
      bar.style.display = "none";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar-item";
      button.title = "Unlink";
      button.setAttribute("aria-label", "Unlink");
      button.innerHTML = unlinkIcon;
      // マウスを押した時点でフォーカスがエディタから外れないようにする
      // 外れると、カーソルの位置が変わらなくてもバーが消えてしまう
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        removeLink(view, linkType);
      });
      bar.append(button);
      view.dom.parentElement?.append(bar);

      // カーソルがリンク上にあるかを調べて、バーの表示と位置を更新する
      const refresh = () => {
        const link = view.hasFocus() ? findLinkAtCursor(view, linkType) : null;
        if (!link) {
          bar.style.display = "none";
          return;
        }
        bar.style.display = "flex";

        // リンクの先頭のすぐ上に出す
        // 先頭と末尾が同じ行にあれば、その中央に合わせる
        const start = view.coordsAtPos(link.from);
        const end = view.coordsAtPos(link.to);
        const sameLine = Math.abs(start.top - end.top) < 2;
        const centerX = sameLine ? (start.left + end.left) / 2 : start.left;
        bar.style.left = `${centerX - bar.offsetWidth / 2}px`;
        bar.style.top = `${start.top - bar.offsetHeight - 6}px`;
      };

      // フォーカスの出入りと、スクロール・リサイズでも位置を更新する
      // スクロールは、エディタ以外の要素で起きても拾えるようキャプチャで受ける
      view.dom.addEventListener("focus", refresh);
      view.dom.addEventListener("blur", refresh);
      window.addEventListener("scroll", refresh, true);
      window.addEventListener("resize", refresh);

      return {
        update: refresh,
        destroy() {
          view.dom.removeEventListener("focus", refresh);
          view.dom.removeEventListener("blur", refresh);
          window.removeEventListener("scroll", refresh, true);
          window.removeEventListener("resize", refresh);
          bar.remove();
        },
      };
    },
  });
});
