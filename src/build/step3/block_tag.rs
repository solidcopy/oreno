use std::collections::HashMap;

use crate::build::step2::{Unit, UnitStream};
use crate::build::step3;
use crate::build::step3::block::Block;
use crate::build::step3::block_tag_header::BlockTagHeader;

use super::block::parse_block;
use super::block::parse_raw_block;
use super::{
    block_tag_header::parse_block_tag_header, tag::parse_tag_and_attributes, try_parse, ParseError,
    ParseResult,
};

pub struct BlockTag {
    name: String,
    attributes: HashMap<Option<String>, String>,
    header: Option<BlockTagHeader>,
    contents: Option<Block>,
}

pub fn parse_block_tag(unit_stream: &mut UnitStream) -> ParseResult<BlockTag> {
    let mut all_errors = Vec::<ParseError>::with_capacity(0);

    let tag_and_attributes = parse_tag_and_attributes(unit_stream, &mut all_errors)?;
    if tag_and_attributes.is_none() {
        return Ok((None, all_errors));
    }

    let (tag_name, attributes) = tag_and_attributes.unwrap();

    match unit_stream.peek() {
        Unit::Char(' ') | Unit::NewLine | Unit::Eof => {}
        Unit::Char(c) => {
            if c == ':' {
                let (block_tag, mut errors) = try_parse(parse_block_tag, unit_stream)?;
                all_errors.append(&mut errors);
                if block_tag.is_some() {
                    return Ok((
                        Some(BlockTag {
                            name: tag_name,
                            attributes,
                            header: None,
                            contents: Some(Block::new(vec![Box::new(block_tag.unwrap())])),
                        }),
                        all_errors,
                    ));
                }
            }

            let (_, position) = unit_stream.read();
            all_errors.push(ParseError::new(
                unit_stream.get_filepath(),
                position,
                format!("There is an illegal character. '{}'", c),
            ));
            return Ok((None, all_errors));
        }
        Unit::BlockBeginning | Unit::BlockEnd => {
            return step3::fatal_error(
                unit_stream.get_filepath(),
                unit_stream.read().1,
                "Unexpected block beginning or end.".to_owned(),
            );
        }
    }

    let header = if unit_stream.peek() == Unit::Char(' ') {
        unit_stream.read();
        let (header, mut errors) = try_parse(parse_block_tag_header, unit_stream)?;
        all_errors.append(&mut errors);
        header
    } else {
        None
    };

    let contents = if unit_stream.peek() == Unit::NewLine {
        unit_stream.read();
        let block_parser = match tag_name.as_str() {
            "code-block" | "raw-html" => parse_raw_block,
            _ => parse_block,
        };
        let (block, mut errors) = try_parse(block_parser, unit_stream)?;
        all_errors.append(&mut errors);
        block
    } else {
        None
    };

    Ok((
        Some(BlockTag {
            name: tag_name,
            attributes,
            header,
            contents,
        }),
        all_errors,
    ))
}
