pub struct BlockTag {
    name: String,
    attributes: HashMap<String, String>,
    header: BlockTagHeader,
    contents: BlockContents,
}

// fn parse_block_tag(unit_stream: &mut UnitStream) -> ParseResult<BlockTag> {
//     ParseResult::Parsed(BlockTag {
//         name,
//         attributes,
//         header,
//         contents,
//     })
// }
