import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * マークダウン文字列を HTML 文字列に変換します。
 *
 * unified というライブラリのパイプラインを使っています。処理は左から右へ流れます。
 *   remarkParse   : マークダウンの文字列を構文木（AST）に変換する
 *   remarkGfm     : GitHub Flavored Markdown（表、取り消し線など）を解釈できるようにする
 *   remarkRehype  : マークダウンの構文木を HTML の構文木に変換する
 *   rehypeSanitize: HTML構文木から <script> など危険な要素・属性を取り除く
 *   rehypeStringify: HTML の構文木を実際の HTML 文字列に変換する
 *
 * rehypeSanitize を挟んでいるのは、この関数の戻り値をブラウザ側で
 * dangerouslySetInnerHTML を使ってそのまま描画するためです。
 * 文書ファイルは誰でも編集できる想定なので、悪意のあるスクリプトが
 * 埋め込まれても実行されないようにしています。
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
