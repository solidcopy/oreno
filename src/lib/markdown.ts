import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * rehypeSanitize の既定スキーマ（許可するタグ・属性の一覧）を複製し、
 * rehypeHighlight が付与する class 属性だけ追加で許可したものです。
 *
 * rehypeHighlight はコードの構文要素ごとに <code class="hljs"> や
 * <span class="hljs-keyword"> のような class 属性を付けることで色分けを
 * 表現します。既定のスキーマは class 属性を許可していないため、そのままだと
 * rehypeSanitize がこれらをすべて取り除いてしまい、色分けが効きません。
 */
const sanitizeSchema = structuredClone(defaultSchema);
sanitizeSchema.attributes = sanitizeSchema.attributes ?? {};
sanitizeSchema.attributes.code = [
  ...(sanitizeSchema.attributes.code ?? []),
  "className",
];
sanitizeSchema.attributes.span = [
  ...(sanitizeSchema.attributes.span ?? []),
  "className",
];

/**
 * マークダウン文字列を HTML 文字列に変換します。
 *
 * unified というライブラリのパイプラインを使っています。処理は左から右へ流れます。
 *   remarkParse   : マークダウンの文字列を構文木（AST）に変換する
 *   remarkGfm     : GitHub Flavored Markdown（表、取り消し線など）を解釈できるようにする
 *   remarkRehype  : マークダウンの構文木を HTML の構文木に変換する
 *   rehypeHighlight: コードブロックの中身を構文解析し、キーワードや文字列などの
 *                    トークンごとに class 属性（hljs-xxx）を付与する
 *   rehypeSanitize: HTML構文木から <script> など危険な要素・属性を取り除く
 *   rehypeStringify: HTML の構文木を実際の HTML 文字列に変換する
 *
 * rehypeSanitize を挟んでいるのは、この関数の戻り値をブラウザ側で
 * dangerouslySetInnerHTML を使ってそのまま描画するためです。
 * 文書ファイルは誰でも編集できる想定なので、悪意のあるスクリプトが
 * 埋め込まれても実行されないようにしています。
 * rehypeHighlight を rehypeSanitize より前に置いているのは、
 * サニタイズ後の構文木には自由な HTML 要素を追加しにくいためです
 * （サニタイズ前に済ませ、その結果だけを上のスキーマで許可します）。
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
