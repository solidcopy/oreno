import { unified } from "unified";
import remarkParse from "remark-parse";

/**
 * マークダウンの見出し1つ分
 * level は # の数（1〜6）
 */
export type Heading = {
  level: number;
  text: string;
};

// remark が作る構文木（mdast）のうち、ここで使う部分だけの型
type MdNode = {
  type: string;
  depth?: number;
  value?: string;
  alt?: string;
  children?: MdNode[];
};

// 見出しの中のテキストを集める
// 強調やリンクの中にある文字も含め、記号は取り除いた表示用の文字列にする
function collectText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value ?? "";
  }
  if (node.type === "image") {
    return node.alt ?? "";
  }
  return (node.children ?? []).map(collectText).join("");
}

// 構文木をたどり、見つけた見出しを文書の上から順に集める
// 引用や箇条書きの中の見出しも、画面上では見出しとして描画されるため対象にする
function collectHeadings(node: MdNode, result: Heading[]): void {
  if (node.type === "heading" && node.depth) {
    result.push({ level: node.depth, text: collectText(node).trim() });
    return;
  }
  for (const child of node.children ?? []) {
    collectHeadings(child, result);
  }
}

/**
 * マークダウンから見出しを取り出し、文書の上から順に返す
 * コードブロックの中の「#」は見出しではないので、文字列ではなく
 * 構文木として解析して判別している
 */
export function extractHeadings(markdown: string): Heading[] {
  const tree = unified().use(remarkParse).parse(markdown) as MdNode;
  const result: Heading[] = [];
  collectHeadings(tree, result);
  return result;
}
