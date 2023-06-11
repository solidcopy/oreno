pub struct BlockTagHeader {
    contents: InlineContents,
}

// /// タグと空白の後に読み込み位置がある状態で呼ぶ。
// fn parse_block_tag_header(unit_stream: &mut UnitStream) -> ParseResult<BlockTagHeader> {
//     let mut contents = vec![];
//
// loop {
//     match try_parse(parse_inline_content, unit_stream)) {
// ParseResult::Parsed(inline_content) => {
//     contents.push(inline_content);
// }
// ParseResult::Mismatched => break,
// error => return ParseResult::Error{message:error.message},
//     }}
//
//     ParseResult::Parsed(BlockTagHeader{contents})
// }
//
// fn parse_inline_content(unit_stream:&mut UnitStream)->ParseResult<Box<InlineContent>>{
// match unit_stream.peek(){
//     Unit::Char{c,position:_} if *c==':'=>{
//         match try_parse(parse_inline_tag, unit_stream) {
//             ParseResult::Parsed(inline_tag)=>{
//                 return Box::new(inline_tag);
//             }
//             -=>{}
//         }
//     }
// }
//
// let mut text = String::new();
//
// loop {
// match unit_stream.peek() {
//     Unit::Char{c,position:_}=>{
// text.push(*c);
//     }
// }
// }
