use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::inline_tag::parse_inline_tag;
use crate::build::step3::try_parse;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Reversing;
use crate::build::step3::Warnings;

pub struct BlockTagHeader {
    contents: InlineContents,
}

impl ContentModel for BlockTagHeader {
    fn reverse(&self, r: &mut Reversing) {
        for content in &self.contents {
            content.reverse(r);
        }
    }
}

/// タグと空白の後に読み込み位置がある状態で呼ぶ。
/// 改行かEOFでパースを終了するが、改行は消費しない。
pub fn parse_block_tag_header(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<BlockTagHeader> {
    let mut contents: InlineContents = vec![];
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' => {
                    if let Some(inline_tag) = try_parse(parse_inline_tag, unit_stream, warnings)? {
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
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Unexpected block beginning or end.".to_owned(),
                ));
            }
        }
    }

    if !text.is_empty() {
        contents.push(Box::new(text));
    }

    if !contents.is_empty() {
        Ok(Some(BlockTagHeader { contents }))
    } else {
        Ok(None)
    }
}
