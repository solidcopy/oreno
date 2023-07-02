use crate::build::step2::{Unit, UnitStream};
use crate::build::step3::call_parser;
use crate::build::step3::inline_tag::parse_inline_tag;
use crate::build::step3::BlockContent;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

pub struct Paragraph {
    contents: InlineContents,
}

impl Paragraph {
    pub fn new(contents: InlineContents) -> Paragraph {
        Paragraph { contents }
    }
}

impl ContentModel for Paragraph {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut contents = String::new();

        let mut first = true;
        for content in &self.contents {
            if !first {
                contents.push(',');
            }
            first = false;
            contents.push_str(content.to_json().as_str());
        }

        format!("{{\"p\":[{}]}}", &contents)
    }
}

impl BlockContent for Paragraph {}

pub fn parse_paragraph(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<Paragraph> {
    match unit_stream.peek() {
        Unit::NewLine | Unit::BlockBeginning | Unit::BlockEnd => return Ok(None),
        _ => {}
    }

    let mut contents: InlineContents = vec![];
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if c == ':' && context.is_parse_tags() {
                    if let Some(inline_tag) = call_parser(parse_inline_tag, unit_stream, context)? {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }

                        contents.push(Box::new(inline_tag));

                        continue;
                    }
                }

                text.push(c);
                unit_stream.read();
            }
            Unit::NewLine => {
                text.push('\n');
                unit_stream.read();

                match unit_stream.peek() {
                    Unit::NewLine | Unit::BlockBeginning | Unit::BlockEnd => break,
                    _ => {}
                }
            }
            Unit::Eof | Unit::BlockEnd => break,
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
        Ok(Some(Paragraph { contents }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod test_parse_paragraph {
    use super::parse_paragraph;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step2::Unit;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::ParseContext;
    use indoc::indoc;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc:t{xyz}:a[b=c]{...}0\n123")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &paragraph,
            r#"{
                "p":[
                    "abc",
                    {"it":"t","a":null,"c":["xyz"]},
                    {"it":"a","a":{"b":"c"},"c":["..."]},
                    "0\n123"
                ]
            }"#,
        );

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_starts_with_wrap() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\nabc:t{xyz}0\n123")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_starts_with_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    abc:t{xyz}0\n123")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_starts_with_block_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    x\nabc")?;
        us.read();
        us.read();
        us.read();
        us.read();
        assert_eq!(us.peek(), Unit::BlockEnd);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_colon_but_not_tag() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(": abc")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap().unwrap();

        assert_model(&paragraph, r#"{"p":[": abc"]}"#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_ends_with_blank_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
            abc
            xyz
            
            123
        "})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap().unwrap();

        assert_model(&paragraph, r#"{"p":["abc\nxyz\n"]}"#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_ends_with_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
            abc
            xyz
                123
        "})?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        assert_model(&paragraph, r#"{"p":["abc\nxyz\n"]}"#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_ends_with_block_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
                abc
                xyz
            123
        "})?;
        us.read();
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        assert_model(&paragraph, r#"{"p":["abc\nxyz\n"]}"#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let paragraph = parse_paragraph(&mut us, &mut context).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }
}
