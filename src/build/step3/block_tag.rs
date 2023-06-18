use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::block::parse_block;
use crate::build::step3::block::parse_raw_block;
use crate::build::step3::block::Block;
use crate::build::step3::block_tag_header::parse_block_tag_header;
use crate::build::step3::block_tag_header::BlockTagHeader;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::try_parse;
use crate::build::step3::BlockContent;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

#[cfg(test)]
use crate::build::step3::Reversing;

pub struct BlockTag {
    name: String,
    attributes: Attributes,
    header: Option<BlockTagHeader>,
    contents: Option<Block>,
}

impl ContentModel for BlockTag {
    #[cfg(test)]
    fn reverse(&self, r: &mut Reversing) {
        r.write(":");
        r.write(&self.name);
        self.attributes.reverse(r);
        if self.header.is_some() {
            r.write(" ");
            self.header.as_ref().unwrap().reverse(r);
        }
        r.wrap();
        if self.contents.is_some() {
            self.contents.as_ref().unwrap().reverse(r);
        }
    }
}

impl BlockContent for BlockTag {}

pub fn parse_block_tag(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<BlockTag> {
    let (tag_name, attributes) = match try_parse(parse_tag_and_attributes, unit_stream, warnings)? {
        Some(tag_and_attributes) => tag_and_attributes,
        None => return Ok(None),
    };

    match unit_stream.peek() {
        Unit::Char(' ') | Unit::NewLine | Unit::Eof => {}
        Unit::Char(c) => {
            if c == ':' {
                if let Some(block_tag) = try_parse(parse_block_tag, unit_stream, warnings)? {
                    return Ok(Some(BlockTag {
                        name: tag_name,
                        attributes,
                        header: None,
                        contents: Some(Block::new(vec![Box::new(block_tag)])),
                    }));
                }
            }

            warnings.push(
                unit_stream.file_position(),
                format!("There is an illegal character. '{}'", c),
            );
            return Ok(None);
        }
        Unit::BlockBeginning | Unit::BlockEnd => {
            return Err(ParseError::new(
                unit_stream.file_position(),
                "Unexpected block beginning or end.".to_owned(),
            ));
        }
    }

    let header = if unit_stream.peek() == Unit::Char(' ') {
        unit_stream.read();
        try_parse(parse_block_tag_header, unit_stream, warnings)?
    } else {
        None
    };

    let contents = if unit_stream.peek() == Unit::NewLine {
        unit_stream.read();
        let block_parser = match tag_name.as_str() {
            "code-block" | "raw-html" => parse_raw_block,
            _ => parse_block,
        };
        try_parse(block_parser, unit_stream, warnings)?
    } else {
        None
    };

    Ok(Some(BlockTag {
        name: tag_name,
        attributes,
        header,
        contents,
    }))
}
