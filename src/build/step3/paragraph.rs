pub struct Paragraph {
    contents: InlineContents,
}

fn parse_paragraph(unit_stream: &mut UnitStream) -> ParseResult<Paragraph> {
    let mut inline_contents: InlineContents = vec![];

    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char { c, position: _ } => {
                if *c == ':' {
                    match try_parse(parse_inline_tag, unit_stream) {
                        ParseResult::Parsed(inline_tag) => {
                            if !text.is_empty() {
                                inline_contents.push(Box::new(text));
                                text = String::new();
                            }
                            inline_contents.push(Box::new(inline_tag))
                            continue;
                        }
                        ParseResult::Mismatched => {}
                        ParseResult::Error { message } => return ParseResult::Error { message },
                    }
                }
                text.push(*c);
                unit_stream.read();
            }
            Unit::NewLine => {
                unit_stream.read();
                text.push('\n');

                match unit_stream.peek() {
                    Unit::NewLine | Unit::BlockBeginning | Unit::BlockEnd => {
                        break;
                    }
                    _ => {}
                }
            }
            Unit::Eof => {
                break;
            }
            _ => panic!("never"),
        }
    }

    if !text.is_empty() {
        inline_contents.push(Box::new(text));
    }

    ParseResult::Parsed(Paragraph {contents: inline_contents, })
}