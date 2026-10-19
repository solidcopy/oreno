import {
  SchemaReady,
  commandsCtx,
  inputRulesCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Handle } from "mdast-util-to-markdown";
import { markRule } from "@milkdown/kit/prose";
import { toggleMark } from "@milkdown/kit/prose/commands";
import {
  $command,
  $markSchema,
  $remark,
  $useKeymap,
} from "@milkdown/kit/utils";

/**
 * 下線の文字修飾を Milkdown に追加するプラグイン群
 *
 * マークダウンの中では HTML の <u>…</u> として保存する
 * マークダウンの構文木（mdast）では、<u> と </u> は
 * それぞれ別の「html」ノードになる
 * そのため、読み込み時に対になる html ノードを1つの
 * 「underline」ノードにまとめ、書き出し時に <u>…</u> へ戻している
 */

// mdast のノードのうち、このファイルで扱う部分だけの型
type MdNode = { type: string; value?: string; children?: MdNode[] };

/**
 * 同じ親の子の並びから、<u> と </u> の対を探して underline ノードにまとめる
 * 対応する </u> がない <u> は、そのまま html ノードとして残す
 */
function groupUnderline(parent: MdNode) {
  const children = parent.children;
  if (!children) return;

  // 入れ子の子を先に処理する
  children.forEach(groupUnderline);

  const result: MdNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "html" && child.value?.trim() === "<u>") {
      const end = children.findIndex(
        (c, j) => j > i && c.type === "html" && c.value?.trim() === "</u>",
      );
      if (end !== -1) {
        result.push({ type: "underline", children: children.slice(i + 1, end) });
        i = end;
        continue;
      }
    }
    result.push(child);
  }
  parent.children = result;
}

/** 読み込み時に <u>…</u> を underline ノードへ変換する remark プラグイン */
const remarkUnderline = $remark("remarkUnderline", () => () => (tree) => {
  groupUnderline(tree as MdNode);
});

/** underline ノードを <u>…</u> の文字列にする書き出し処理 */
const stringifyUnderline: Handle = (node, _parent, state, info) =>
  `<u>${state.containerPhrasing(node, info)}</u>`;

/** 書き出し時に stringifyUnderline を使うようにする設定 */
const underlineStringifyHandler: MilkdownPlugin = (ctx) => () => {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      underline: stringifyUnderline,
    },
  }));
};

/** 下線のマーク（ProseMirror 上での定義） */
export const underlineSchema = $markSchema("underline", () => ({
  parseDOM: [
    { tag: "u" },
    // 貼り付け元が text-decoration で下線を表している場合
    {
      style: "text-decoration",
      getAttrs: (value) => String(value).includes("underline") && null,
    },
  ],
  toDOM: () => ["u"],
  parseMarkdown: {
    match: (node) => node.type === "underline",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "underline",
    runner: (state, mark) => {
      state.withMark(mark, "underline");
    },
  },
}));

/** 下線のオン・オフを切り替えるコマンド */
export const toggleUnderlineCommand = $command(
  "ToggleUnderline",
  (ctx) => () => toggleMark(underlineSchema.type(ctx)),
);

/** Mod-u（Mac では Cmd+U）で下線を切り替えるショートカット */
export const underlineKeymap = $useKeymap("underlineKeymap", {
  ToggleUnderline: {
    shortcuts: ["Mod-u"],
    command: (ctx) => {
      const commands = ctx.get(commandsCtx);
      return () => commands.call(toggleUnderlineCommand.key);
    },
  },
});

/**
 * __text__ と入力したら下線にする入力ルール
 *
 * Milkdown 標準では __text__ が太字になる
 * 入力ルールは先に登録されたものから順に試され、最初に当てはまったものだけが
 * 使われるため、標準の太字のルールより前に差し込んでこちらを優先させている
 */
const underlineInputRule: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const rule = markRule(
    /(?<![\w:/])__([^_]+?)__$/,
    underlineSchema.type(ctx),
  );
  ctx.update(inputRulesCtx, (rules) => [rule, ...rules]);
  return () => {
    ctx.update(inputRulesCtx, (rules) => rules.filter((r) => r !== rule));
  };
};

export const underlinePlugin: MilkdownPlugin[] = [
  remarkUnderline,
  underlineStringifyHandler,
  underlineSchema,
  toggleUnderlineCommand,
  underlineKeymap,
  underlineInputRule,
].flat();
