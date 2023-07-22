use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::call_parser;
use crate::build::step3::inline_tag::parse_inline_tag;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

#[derive(Debug)]
pub struct BlockTagHeader {
    contents: InlineContents,
}

impl ContentModel for BlockTagHeader {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut s = String::new();
        s.push('[');
        let mut first = true;
        for content in &self.contents {
            if !first {
                s.push(',');
            }
            first = false;
            s.push_str(content.to_json().as_str());
        }
        s.push(']');
        s
    }
}

/// タグと空白の後に読み込み位置がある状態で呼ぶ。
/// 改行かEOFでパースを終了するが、改行は消費しない。
pub fn parse_block_tag_header(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<BlockTagHeader> {
    let mut contents: InlineContents = vec![];
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' => {
                    if let Some(inline_tag) = call_parser(parse_inline_tag, unit_stream, context)? {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }
                        contents.push(Box::new(inline_tag));
                    } else {
                        text.push(c);
                        unit_stream.read();
                    }
                }
                _ => {
                    text.push(c);
                    unit_stream.read();
                }
            },
            Unit::NewLine | Unit::BlockEnd | Unit::Eof => {
                break;
            }
            Unit::BlockBeginning => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    context.parser_name(),
                    "Unexpected block beginning.".to_owned(),
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

#[cfg(test)]
mod test_parse_block_tag_header {
    use super::parse_block_tag_header;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::ContentModel;
    use crate::build::step3::ParseContext;
    use indoc::indoc;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
            :ta[a=1 b=2]{ccc
                123}xyz:tb{ddd}
            ...
        "})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let header = parse_block_tag_header(&mut us, &mut context)
            .unwrap()
            .unwrap();

        assert_model(
            &header,
            r#"[
                {"it":"ta","a":{"a":"1","b":"2"},"c":["ccc\n    123"]},
                "xyz",
                {"it":"tb","c":["ddd"]}
            ]"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_ends_with_block_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let header = parse_block_tag_header(&mut us, &mut context)
            .unwrap()
            .unwrap();

        assert_eq!(header.contents.len(), 1);
        assert_eq!(header.to_json(), "[\"abc\"]".to_owned());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_starts_with_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    abc")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let header = parse_block_tag_header(&mut us, &mut context).unwrap_err();

        assert_eq!(&header.message, "Unexpected block beginning.");

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\n")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let header = parse_block_tag_header(&mut us, &mut context).unwrap();

        assert!(header.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }
}
