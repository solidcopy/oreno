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
        if let Some(header) = &self.header {
            r.write(" ");
            header.reverse(r);
        }
        r.wrap();
        if let Some(contents) = &self.contents {
            contents.reverse(r);
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

#[cfg(test)]
mod test_parse_block_tag {
    use super::parse_block_tag;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ContentModel;
    use crate::build::step3::Reversing;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a=x,b=\"yy\",123]\n    zzz\n    :b{bold}\n\n???")?;
        us.read();
        let mut warnings = Warnings::new();
        let tag = parse_block_tag(&mut us, &mut warnings).unwrap().unwrap();

        assert!(tag.header.is_none());
        assert!(tag.contents.is_some());

        let mut r = Reversing::new();
        tag.reverse(&mut r);
        assert_eq!(
            r.to_string(),
            ":tag[123,a=x,b=yy]\n    zzz\n    :b{bold}\n}".to_owned()
        );

        assert!(warnings.warnings.is_empty());

        Ok(())
    }

    //     #[test]
    //     fn test_raw() -> Result<(), Box<dyn Error>> {
    //         let mut us = unit_stream(":code[a=x,b=\"yy\",123]{zzz:b{bold}???}")?;
    //         us.read();
    //         let mut warnings = Warnings::new();
    //         let tag = parse_block_tag(&mut us, &mut warnings).unwrap().unwrap();
    //
    //         assert_eq!(tag.contents.len(), 1);
    //
    //         let mut r = Reversing::new();
    //         tag.reverse(&mut r);
    //         assert_eq!(
    //             r.to_string(),
    //             ":code[123,a=x,b=yy]{zzz:b{bold}???}".to_owned()
    //         );
    //
    //         assert!(warnings.warnings.is_empty());
    //
    //         Ok(())
    //     }
    //
    //     #[test]
    //     fn test_no_contents() -> Result<(), Box<dyn Error>> {
    //         let mut us = unit_stream(":tag[a]")?;
    //         us.read();
    //         let mut warnings = Warnings::new();
    //         let tag = parse_block_tag(&mut us, &mut warnings).unwrap();
    //
    //         assert!(tag.is_none());
    //
    //         assert_eq!(warnings.warnings.len(), 1);
    //         assert_eq!(warnings.warnings[0].message, "There is no tag's contents.");
    //
    //         Ok(())
    //     }
    //
    //     #[test]
    //     fn test_no_contents_without_attr() -> Result<(), Box<dyn Error>> {
    //         let mut us = unit_stream(":tag$")?;
    //         us.read();
    //         let mut warnings = Warnings::new();
    //         let tag = parse_block_tag(&mut us, &mut warnings).unwrap();
    //
    //         assert!(tag.is_none());
    //
    //         assert_eq!(warnings.warnings.len(), 1);
    //         assert_eq!(warnings.warnings[0].message, "There is no tag's contents.");
    //
    //         Ok(())
    //     }
}

// #[cfg(test)]
// mod test_abstract_parse_block_tag_contents {
//     use super::abstract_parse_block_tag_contents;
//     use crate::build::step2::test_utils::unit_stream;
//     use crate::build::step3::InlineContent;
//     use crate::build::step3::Reversing;
//     use crate::build::step3::Warnings;
//     use std::error::Error;
//
//     #[test]
//     fn test_normal() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true)
//             .unwrap()
//             .unwrap();
//
//         assert_eq!(result.len(), 3);
//         assert_eq!(reverse(&result), "abc:tag{xxx}zzz".to_owned());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_raw() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, false)
//             .unwrap()
//             .unwrap();
//
//         assert_eq!(result.len(), 1);
//         assert_eq!(reverse(&result), "abc:tag{xxx}zzz".to_owned());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_no_bracket() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("abc:tag{xxx}zzz}")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true).unwrap();
//
//         assert!(result.is_none());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_count_brackets() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{abc{{xxx}zzz}}??")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true)
//             .unwrap()
//             .unwrap();
//
//         assert_eq!(result.len(), 1);
//         assert_eq!(reverse(&result), "abc{{xxx}zzz}".to_owned());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_new_line() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{abc\nxxx}")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true)
//             .unwrap()
//             .unwrap();
//
//         assert_eq!(result.len(), 1);
//         assert_eq!(reverse(&result), "abc\nxxx".to_owned());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_eof() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{abc")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true).unwrap();
//
//         assert!(result.is_none());
//
//         assert_eq!(warnings.warnings.len(), 1);
//         assert_eq!(warnings.warnings[0].message, "} is required.");
//
//         Ok(())
//     }
//
//     #[test]
//     fn test_empty() -> Result<(), Box<dyn Error>> {
//         let mut us = unit_stream("{}")?;
//         us.read();
//         let mut warnings = Warnings::new();
//         let result = abstract_parse_block_tag_contents(&mut us, &mut warnings, true)
//             .unwrap()
//             .unwrap();
//
//         assert_eq!(result.len(), 0);
//         assert_eq!(reverse(&result), "".to_owned());
//
//         assert_eq!(warnings.warnings.len(), 0);
//
//         Ok(())
//     }
//
//     fn reverse(contents: &Vec<Box<dyn InlineContent>>) -> String {
//         let mut r = Reversing::new();
//         for content in contents {
//             content.reverse(&mut r);
//         }
//         r.to_string()
//     }
// }
