pub struct InlineTag {
    name: String,
    attributes: HashMap<String, String>,
    contents: InlineContents,
}

fn parse_inline_tag(unit_stream: &mut UnitStream) -> ParseResult<InlineTag> {
    match unit_stream.read() {
        Unit::Char { c, position } if c == ':' => {}
        _ => return ParseResult::Mismatched,
    };

    let name = match try_parse(parse_tag_name, unit_stream) {
        ParseResult::Parsed(tag_name) => tag_name,
        ParseResult::Mismatched => panic!("never"),
        ParseResult::Error { message } => return ParseResult::Error { message },
    };

    let attributes = match try_parse(parse_attributes, unit_stream) {
        ParseResult::Parsed(attributes) => attributes,
        ParseResult::Mismatched => HashMap::new(),
        ParseResult::Error { message } => return ParseResult::Error { message },
    };

    let contents = match parse_enclosed_inline_contents(unit_stream, '{', '}') {
        ParseResult::Parsed(inline_contents) => inline_contents,
        ParseResult::Mismatched => {
            return ParseResult::Error {
                message: "error".to_owned(),
            }
        }
        ParseResult::Error { message } => return ParseResult::Error { message },
    };

    ParseResult::Parsed(InlineTag {
        name,
        attributes,
        contents,
    })
}
