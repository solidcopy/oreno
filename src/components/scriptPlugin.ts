import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Handle } from "mdast-util-to-markdown";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { $command, $markSchema, $remark } from "@milkdown/kit/utils";

/**
 * 上付き文字・下付き文字を Milkdown に追加するプラグイン群
 *
 * マークダウンの中では HTML の <sup>…</sup> と <sub>…</sub> として保存する
 * 仕組みは下線（underlinePlugin.ts）と同じで、構文木の上では
 * <sup> と </sup> がそれぞれ別の「html」ノードになるため、
 * 読み込み時に対になるものを1つのノードにまとめ、書き出し時に元の形へ戻している
 * ショートカットとマークダウン入力からの自動変換は用意していない
 */

// mdast のノードのうち、このファイルで扱う部分だけの型
type MdNode = { type: string; value?: string; children?: MdNode[] };

/** HTML のタグ名と、構文木・ProseMirror 上でのマークの名前の対応 */
const SCRIPTS = [
  { tag: "sup", name: "superscript" },
  { tag: "sub", name: "subscript" },
] as const;

/**
 * 同じ親の子の並びから、<sup> と </sup>（<sub> と </sub>）の対を探して
 * superscript（subscript）ノードにまとめる
 * 対応する閉じタグがない開きタグは、そのまま html ノードとして残す
 */
function groupScripts(parent: MdNode) {
  const children = parent.children;
  if (!children) return;

  // 入れ子の子を先に処理する
  children.forEach(groupScripts);

  const result: MdNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const script = SCRIPTS.find(
      ({ tag }) => child.type === "html" && child.value?.trim() === `<${tag}>`,
    );
    if (script) {
      const end = children.findIndex(
        (c, j) =>
          j > i && c.type === "html" && c.value?.trim() === `</${script.tag}>`,
      );
      if (end !== -1) {
        result.push({
          type: script.name,
          children: children.slice(i + 1, end),
        });
        i = end;
        continue;
      }
    }
    result.push(child);
  }
  parent.children = result;
}

/** 読み込み時に <sup>・<sub> を構文木のノードへ変換する remark プラグイン */
const remarkScripts = $remark("remarkScripts", () => () => (tree) => {
  groupScripts(tree as MdNode);
});

/** 指定したタグで囲んで書き出す処理を作る */
const stringifyWith =
  (tag: string): Handle =>
  (node, _parent, state, info) =>
    `<${tag}>${state.containerPhrasing(node, info)}</${tag}>`;

/** 書き出し時に上付き・下付きのノードを <sup>・<sub> にする設定 */
const scriptStringifyHandlers: MilkdownPlugin = (ctx) => () => {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      superscript: stringifyWith("sup"),
      subscript: stringifyWith("sub"),
    },
  }));
};

/**
 * 上付きのマーク
 * 上付きと下付きは同時に付けられないよう、excludes で互いを排他にしている
 * （片方を付けると、もう片方は外れる）
 * inclusive を false にしているため、マークの末尾に続けて入力した文字には
 * マークが付かない（上付きの直後を、修飾なしの文字として入力できる）
 */
export const superscriptSchema = $markSchema("superscript", () => ({
  excludes: "superscript subscript",
  inclusive: false,
  parseDOM: [{ tag: "sup" }],
  toDOM: () => ["sup"],
  parseMarkdown: {
    match: (node) => node.type === "superscript",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "superscript",
    runner: (state, mark) => {
      state.withMark(mark, "superscript");
    },
  },
}));

/** 下付きのマーク */
export const subscriptSchema = $markSchema("subscript", () => ({
  excludes: "superscript subscript",
  inclusive: false,
  parseDOM: [{ tag: "sub" }],
  toDOM: () => ["sub"],
  parseMarkdown: {
    match: (node) => node.type === "subscript",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "subscript",
    runner: (state, mark) => {
      state.withMark(mark, "subscript");
    },
  },
}));

/** 上付きのオン・オフを切り替えるコマンド */
export const toggleSuperscriptCommand = $command(
  "ToggleSuperscript",
  (ctx) => () => toggleMark(superscriptSchema.type(ctx)),
);

/** 下付きのオン・オフを切り替えるコマンド */
export const toggleSubscriptCommand = $command(
  "ToggleSubscript",
  (ctx) => () => toggleMark(subscriptSchema.type(ctx)),
);

export const scriptPlugin: MilkdownPlugin[] = [
  remarkScripts,
  scriptStringifyHandlers,
  superscriptSchema,
  subscriptSchema,
  toggleSuperscriptCommand,
  toggleSubscriptCommand,
].flat();
