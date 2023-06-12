use std::collections::HashMap;

use crate::build::step2::UnitStream;
use crate::build::step3;

use super::ParseResult;
use super::{try_parse, InlineContents, ParseError};
use crate::build::step2::Unit;
use crate::build::step3::tag::parse_tag_and_attributes;

pub struct InlineTag {
    name: String,
    attributes: HashMap<Option<String>, String>,
    contents: InlineContents,
}

pub fn parse_inline_tag(unit_stream: &mut UnitStream) -> ParseResult<InlineTag> {
    let mut all_errors = Vec::<ParseError>::with_capacity(0);

    let tag_and_attributes = parse_tag_and_attributes(unit_stream, &mut all_errors)?;
    if tag_and_attributes.is_none() {
        return Ok((None, all_errors));
    }

    let (tag_name, attributes) = tag_and_attributes.unwrap();

    let parse_tags = match tag_name.as_str() {
        "code" | "raw-html" => false,
        _ => true,
    };
    let (contents, mut errors) = parse_inline_tag_contents(unit_stream, parse_tags)?;
    all_errors.append(&mut errors);
    if contents.is_none() {
        all_errors.push(ParseError {
            filename: unit_stream.get_filepath(),
            position: unit_stream.read().1,
            message: "There is no tag's contents.".to_owned(),
        });
        return Ok((None, all_errors));
    }
    let contents = contents.unwrap();

    step3::parsed(InlineTag {
        name: tag_name,
        attributes,
        contents,
    })
}

fn parse_inline_tag_contents(
    unit_stream: &mut UnitStream,
    parse_tags: bool,
) -> ParseResult<InlineContents> {
    // 開始が"{"でなければ不適合
    if unit_stream.peek() != Unit::Char('{') {
        return step3::mismatched();
    }
    unit_stream.read();

    // {}の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut inline_contents: InlineContents = vec![];

    let mut all_errors = Vec::with_capacity(0);

    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' if parse_tags => {
                    if let (Some(inline_tag), mut errors) =
                        try_parse(parse_inline_tag, unit_stream)?
                    {
                        all_errors.append(&mut errors);
                        if !text.is_empty() {
                            inline_contents.push(Box::new(text));
                            text = String::new();
                        }
                        inline_contents.push(Box::new(inline_tag));
                    } else {
                        text.push(c);
                    }
                }
                '}' => {
                    if !text.is_empty() {
                        inline_contents.push(Box::new(text));
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
                all_errors.push(step3::ParseError {
                    filename: unit_stream.get_filepath(),
                    position: unit_stream.read().1,
                    message: "} is required.".to_owned(),
                });
                return Ok((None, all_errors));
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return step3::fatal_error(
                    unit_stream.get_filepath(),
                    None,
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                );
            }
        }
    }

    Ok((Some(inline_contents), all_errors))
}
