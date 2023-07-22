use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::attribute::NamelessAttributeValues;
use crate::build::step3::block::parse_block;
use crate::build::step3::block::Block;
use crate::build::step3::block_tag_header::parse_block_tag_header;
use crate::build::step3::block_tag_header::BlockTagHeader;
use crate::build::step3::call_parser;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::tag::TagName;
use crate::build::step3::BlockContent;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

pub struct BlockTag {
    name: TagName,
    attributes: Attributes,
    nameless_attribute_values: NamelessAttributeValues,
    header: Option<BlockTagHeader>,
    contents: Option<Block>,
}

impl ContentModel for BlockTag {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut result = format!("{{\"bt\":{}", &self.name.to_json());

        if !self.attributes.is_empty() {
            result.push_str(format!(",\"a\":{}", &self.attributes.to_json()).as_str());
        }

        if !self.nameless_attribute_values.is_empty() {
            result
                .push_str(format!(",\"v\":{}", &self.nameless_attribute_values.to_json()).as_str());
        }

        if let Some(header) = &self.header {
            result.push_str(format!(",\"h\":{}", &header.to_json()).as_str());
        }

        if let Some(contents) = &self.contents {
            result.push_str(format!(",\"c\":{}", &contents.to_json()).as_str());
        }

        result.push_str("}");

        result
    }
}

impl BlockContent for BlockTag {}

pub fn parse_block_tag(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<BlockTag> {
    let mut context = context.change_parser_name(Some("block tag".to_owned()));
    let context = &mut context;

    let (tag_name, attributes, nameless_attribute_values) =
        match call_parser(parse_tag_and_attributes, unit_stream, context)? {
            Some(x) => x,
            None => return Ok(None),
        };

    let parse_tags = tag_name.name() != "code-block" && tag_name.name() != "raw-html";

    match unit_stream.peek() {
        Unit::Char(' ') | Unit::NewLine | Unit::BlockEnd | Unit::Eof => {}
        Unit::Char(c) => {
            if c == ':' && parse_tags && !tag_name.abbreviation() {
                if let Some(block_tag) = call_parser(parse_block_tag, unit_stream, context)? {
                    return Ok(Some(BlockTag {
                        name: tag_name,
                        attributes,
                        nameless_attribute_values,
                        header: None,
                        contents: Some(Block::new(vec![Box::new(block_tag)])),
                    }));
                }
            }

            context.warn(
                unit_stream.file_position(),
                format!("There is an illegal character. '{}'", c),
            );
            return Ok(None);
        }
        Unit::BlockBeginning => {
            return Err(ParseError::new(
                unit_stream.file_position(),
                context.parser_name(),
                "Unexpected block beginning or end.".to_owned(),
            ));
        }
    }

    let header = if unit_stream.peek() == Unit::Char(' ') {
        unit_stream.read();
        call_parser(parse_block_tag_header, unit_stream, context)?
    } else {
        None
    };

    let contents = if unit_stream.peek() == Unit::NewLine {
        unit_stream.read();
        call_parser(
            parse_block,
            unit_stream,
            &mut context.change_parse_mode(parse_tags),
        )?
    } else {
        None
    };

    Ok(Some(BlockTag {
        name: tag_name,
        attributes,
        nameless_attribute_values,
        header,
        contents,
    }))
}

#[cfg(test)]
mod test_parse_block_tag {
    use super::parse_block_tag;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step2::Unit;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::ParseContext;
    use indoc::indoc;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
            :tag[a=x b="yy" 123]
                zzz
                :b{bold}
            
            ???"#})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert!(tag.header.is_none());
        assert!(tag.contents.is_some());

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "a":{"a":"x","b":"yy"},
                "v":["123"],
                "c":{
                    "b":[
                        {"p":[
                            "zzz\n",
                            {"it":"b","c":["bold"]},
                            "\n"
                        ]}
                    ]
                }
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// 属性なし
    #[test]
    fn test_no_attrs() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
            :tag
                zzz
            
            ???"#})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert!(tag.header.is_none());
        assert!(tag.contents.is_some());

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "c":{
                    "b":[
                        {"p":["zzz\n"]}
                    ]
                }
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// 属性の後に不正な文字
    #[test]
    fn test_attrs_follewed_by_illegal_char() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
        :tag[a=x]*
            zzz
        
        ???"#})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. '*'");

        Ok(())
    }

    /// rawタグ
    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
            :code-block[oreno]
                zzz:b{bold}???
            
            "})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert!(tag.contents.is_some());

        assert_model(
            &tag,
            r#"{
                "bt":"code-block",
                "v":["oreno"],
                "c":{"b":[{"p":["zzz:b{bold}???\n"]}]}
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// 内容なし
    /// 属性の後でEOF
    #[test]
    fn test_no_contents() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "v":["a"]
            }"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    /// 内容あり
    /// EOFで終わり
    #[test]
    fn test_contents_ends_with_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag\n    xxx")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "c":{"b":[{"p":["xxx"]}]}
            }"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    /// ヘッダーあり
    /// 改行で終わり
    #[test]
    fn test_header_ends_with_wrap() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
            :tag xxx
                zzz
        "})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "h":["xxx"],
                "c":{"b":[{"p":["zzz\n"]}]}
            }"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    /// ヘッダーあり
    /// EOFで終わり
    #[test]
    fn test_header_ends_with_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a=1] :b{xxx}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"tag",
                "a":{"a":"1"},
                "h":[
                    {"it":"b","c":["xxx"]}
                ]
            }"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_no_contents_without_attr() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag$")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. '$'");

        Ok(())
    }

    /// ネスト
    /// 属性なし
    #[test]
    fn test_nest_no_attr() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
            :parent:child
                zzz
            
            ???"#})?;
        assert_eq!(us.read().0, Unit::BlockBeginning);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"parent",
                "c":{"b":[
                    {
                        "bt":"child",
                        "c":{"b":[{"p":["zzz\n"]}]}
                    }
                ]}
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// ネスト
    /// 親がrawタグならネストを許可しない
    #[test]
    fn test_nest_parent_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
            :code-block:child
                zzz
            
            ???"#})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. ':'");

        Ok(())
    }

    /// ネスト
    /// 子がrawタグ
    #[test]
    fn test_nest_child_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {r#"
            :parent:code-block
                zzz
            
            ???"#})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_block_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "bt":"parent",
                "c":{"b":[
                    {
                        "bt":"code-block",
                        "c":{"b":[{"p":["zzz\n"]}]}
                    }
                ]}
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }
}
