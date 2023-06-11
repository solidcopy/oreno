use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::InlineContents;

fn parse_inline_tag_contents(unit_stream: &mut UnitStream) -> ParseResult<InlineContents> {
    // 開始が"{"でなければ不適合
    if unit_stream.peek() != &Unit::Char('{') {
        return ParseResult::Mismatched;
    }
    unit_stream.read();

    // {}の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut inline_contents: InlineContents = vec![];

    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                match *c {
                    ':' => {
                        if let ParseResult::Parsed(inline_tag)= try_parse(parse_inline_tag, unit_stream) {
                                if !text.is_empty() {
                                    inline_contents.push(Box::new(text));
                                    text = String::new();
                                }
                                inline_contents.push(Box::new(inline_tag))
                            } else {
                                text.push(c);
                            }
                        }
                    }
                    Unit::Char { c, position } if *c == '}' => {
                        if !text.is_empty() {
                            inline_contents.push(Box::new(text));
                        }
                        unit_stream.read();
                        break;
                    }
                    Unit::Char { c, position } => {
                        text.push(*c);
                        unit_stream.read();
                    }
                    Unit::NewLine => {
                        // TODO 改行できてもいいはず。単純に改行文字をpushするだけではダメ。Indent/UnIndentをどうする？

                        return ParseResult::Error {
                            message: "no closed".into(),
                        };
                    }
                    Unit::Eof => {
                        return ParseResult::Error {
                            message: "no closed".into(),
                        }
                    }
                    _ => panic!("never"),
                }
            }
            Unit::NewLine => {
                text.push('\n');
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    None,
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                );
            }
            Unit::Eof => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "} is required.".to_owned(),
                );
            }
        }
    }

    ParseResult::Parsed(inline_contents)
}
