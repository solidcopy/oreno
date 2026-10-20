import {
  InitReady,
  remarkPluginsCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { Handle } from "mdast-util-to-markdown";
import type { RemarkPlugin } from "@milkdown/kit/transformer";
import { hardbreakSchema } from "@milkdown/kit/preset/commonmark";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $useKeymap } from "@milkdown/kit/utils";

/**
 * 表のセル内の改行を Milkdown で扱えるようにするプラグイン群
 *
 * マークダウンの表はセル内に改行を書けないため、HTML の <br> として保存する
 * エディタ上では、Shift+Enter で入れる改行（hardbreak ノード）がこれに当たる
 * 何もしないと、読み込み時に <br> が文字のまま見えてしまい、
 * 書き出し時には改行が空白に置き換わって失われる
 */

// mdast のノードのうち、このファイルで扱う部分だけの型
type MdNode = { type: string; value?: string; children?: MdNode[] };

/** <br> <br/> <br /> のいずれか（大文字小文字は問わない）にだけ当てはまる正規表現 */
const BR_TAG = /^<br\s*\/?>$/i;

/** 構文木をたどり、表のセルの中にある <br> の html ノードを break ノードに変える */
function replaceBrInCells(node: MdNode, inCell: boolean) {
  if (!node.children) return;
  const nextInCell = inCell || node.type === "tableCell";
  node.children = node.children.map((child) => {
    if (nextInCell && child.type === "html" && BR_TAG.test(child.value?.trim() ?? "")) {
      return { type: "break" };
    }
    replaceBrInCells(child, nextInCell);
    return child;
  });
}

/**
 * 読み込み時に、セル内の <br> を改行（break ノード）へ変換する remark プラグイン
 *
 * Milkdown 標準の remark-preserve-empty-line が、空行を保つ目的で
 * すべての <br> の html ノードを取り除いてしまう
 * 取り除かれる前に変換するため、remark プラグインの並びの先頭に差し込んでいる
 * （$remark は末尾に追加するので使えない）
 */
const remarkTableBreak: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(InitReady);
  const remarkPlugin: RemarkPlugin = {
    plugin: () => (tree) => {
      replaceBrInCells(tree as MdNode, false);
    },
    options: {},
  };
  ctx.update(remarkPluginsCtx, (plugins) => [remarkPlugin, ...plugins]);
  return () => {
    ctx.update(remarkPluginsCtx, (plugins) =>
      plugins.filter((p) => p !== remarkPlugin),
    );
  };
};

/**
 * 改行の書き出し処理
 * 表のセルの中では <br> を出力し、それ以外は標準の処理に任せる
 */
const stringifyBreak: Handle = (node, parent, state, info) =>
  state.stack.includes("tableCell")
    ? "<br>"
    : defaultHandlers.break(node, parent, state, info);

/** 書き出し時に stringifyBreak を使うようにする設定 */
const breakStringifyHandler: MilkdownPlugin = (ctx) => () => {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      break: stringifyBreak,
    },
  }));
};

/**
 * 表のセルの中で Shift+Enter を押したとき、常に改行を入れるショートカット
 *
 * Milkdown 標準の改行は、改行の直後にもう一度押すと、改行を段落に置き換える
 * 段落はセルに入れられないため、表が分割されたり、カーソルが表の外へ出たりする
 * そのためセルの中では標準より優先して、押した回数だけ改行を入れる
 * セルの外では false を返し、標準の処理に任せる
 */
const tableBreakKeymap = $useKeymap("tableBreakKeymap", {
  InsertTableBreak: {
    shortcuts: "Shift-Enter",
    priority: 100,
    command: (ctx) => (state, dispatch) => {
      const { selection } = state;
      if (!(selection instanceof TextSelection)) return false;

      // 段落の親（深さ -1）がセルかどうかで、セルの中にいるかを判定する
      const parent = selection.$from.node(-1)?.type.name;
      if (parent !== "table_cell" && parent !== "table_header") return false;

      dispatch?.(
        state.tr
          .setMeta("hardbreak", true)
          .replaceSelectionWith(hardbreakSchema.type(ctx).create())
          .scrollIntoView(),
      );
      return true;
    },
  },
});

export const tableBreakPlugin: MilkdownPlugin[] = [
  remarkTableBreak,
  breakStringifyHandler,
  tableBreakKeymap,
].flat();
