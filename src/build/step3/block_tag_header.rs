use crate::build::step2::Unit;
use crate::build::{step2::UnitStream, step3::InlineContents};

use crate::build::step3;
use crate::build::step3::inline_tag::parse_inline_tag;
use crate::build::step3::try_parse;
use crate::build::step3::ParseResult;

pub struct BlockTagHeader {
    contents: InlineContents,
}

/// タグと空白の後に読み込み位置がある状態で呼ぶ。
/// 改行かEOFでパースを終了するが、改行は消費しない。
pub fn parse_block_tag_header(unit_stream: &mut UnitStream) -> ParseResult<BlockTagHeader> {
    let mut contents: InlineContents = vec![];

    let mut all_errors = Vec::with_capacity(0);

    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' => {
                    if let (Some(inline_tag), mut errors) =
                        try_parse(parse_inline_tag, unit_stream)?
                    {
                        all_errors.append(&mut errors);
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }
                        contents.push(Box::new(inline_tag));
                    } else {
                        text.push(c);
                    }
                }
                _ => {
                    text.push(c);
                }
            },
            Unit::NewLine | Unit::Eof => {
                break;
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return step3::fatal_error(
                    unit_stream.get_filepath(),
                    None,
                    "Unexpected block beginning or end.".to_owned(),
                );
            }
        }
    }

    if !text.is_empty() {
        contents.push(Box::new(text));
    }

    if contents.len() > 0 {
        Ok((Some(BlockTagHeader { contents }), all_errors))
    } else {
        Ok((None, all_errors))
    }
}
