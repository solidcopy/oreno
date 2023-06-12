use std::collections::HashMap;

use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::try_parse;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseError;
use crate::build::step3::ParseFunc;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

pub struct InlineTag {
    name: String,
    attributes: HashMap<Option<String>, String>,
    contents: InlineContents,
}

pub fn parse_inline_tag(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineTag> {
    let (tag_name, attributes) = match parse_tag_and_attributes(unit_stream, warnings)? {
        Some((tag_name, attributes)) => (tag_name, attributes),
        None => return Ok(None),
    };

    let contents_parser: ParseFunc<InlineContents> = match tag_name.as_str() {
        "code" | "raw-html" => parse_raw_inline_tag_contents,
        _ => parse_inline_tag_contents,
    };

    let contents = match try_parse(contents_parser, unit_stream, warnings)? {
        Some(contents) => contents,
        None => {
            warnings.push(
                unit_stream.file_position(),
                "There is no tag's contents.".to_owned(),
            );
            return Ok(None);
        }
    };

    Ok(Some(InlineTag {
        name: tag_name,
        attributes,
        contents,
    }))
}

fn parse_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineContents> {
    abstract_parse_inline_tag_contents(unit_stream, warnings, true)
}

fn parse_raw_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineContents> {
    abstract_parse_inline_tag_contents(unit_stream, warnings, false)
}

fn abstract_parse_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
    parse_tags: bool,
) -> ParseResult<InlineContents> {
    // 開始が"{"でなければ不適合
    if unit_stream.read().0 != Unit::Char('{') {
        return Ok(None);
    }

    // {}の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut contents: InlineContents = vec![];
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' if parse_tags => match try_parse(parse_inline_tag, unit_stream, warnings)? {
                    Some(inline_tag) => {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }
                        contents.push(Box::new(inline_tag));
                    }
                    None => text.push(c),
                },
                '}' => {
                    if !text.is_empty() {
                        contents.push(Box::new(text));
                    }
                    unit_stream.read();
                    break;
                }
                _ => {
                    text.push(c);
                }
            },
            Unit::NewLine => {
                text.push('\n');
            }
            Unit::Eof => {
                warnings.push(unit_stream.file_position(), "} is required.".to_owned());
                return Ok(None);
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                ));
            }
        }
    }

    if !contents.is_empty() {
        Ok(Some(contents))
    } else {
        Ok(None)
    }
}
