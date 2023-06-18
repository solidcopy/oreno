use crate::build::step2::{Unit, UnitStream};
use crate::build::step3::inline_tag::parse_inline_tag;
use crate::build::step3::try_parse;
use crate::build::step3::BlockContent;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

#[cfg(test)]
use crate::build::step3::Reversing;

pub struct Paragraph {
    contents: InlineContents,
}

impl ContentModel for Paragraph {
    #[cfg(test)]
    fn reverse(&self, r: &mut Reversing) {
        for content in &self.contents {
            content.reverse(r);
        }
    }
}

impl BlockContent for Paragraph {}

pub fn parse_paragraph(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
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
                if c == ':' {
                    if let Some(inline_tag) = try_parse(parse_inline_tag, unit_stream, warnings)? {
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
    use crate::build::step3::ContentModel;
    use crate::build::step3::Reversing;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc:t{xyz}:a[b=c]{...}0\n123")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 4);
        let mut r = Reversing::new();
        paragraph.reverse(&mut r);
        assert_eq!(r.to_string(), "abc:t{xyz}:a[b=c]{...}0\n123".to_owned());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_starts_with_wrap() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\nabc:t{xyz}0\n123")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_starts_with_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    abc:t{xyz}0\n123")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(&warnings.warnings.len(), &0);

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
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_colon_but_tag() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(": abc")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        let mut r = Reversing::new();
        paragraph.reverse(&mut r);
        assert_eq!(r.to_string(), ": abc".to_owned());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_ends_with_blank_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc\nxyz\n\n123")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        let mut r = Reversing::new();
        paragraph.reverse(&mut r);
        assert_eq!(r.to_string(), "abc\nxyz\n".to_owned());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_ends_with_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc\nxyz\n    123")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        let mut r = Reversing::new();
        paragraph.reverse(&mut r);
        assert_eq!(r.to_string(), "abc\nxyz\n".to_owned());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_ends_with_block_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    abc\n    xyz\n123")?;
        us.read();
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(paragraph.contents.len(), 1);
        let mut r = Reversing::new();
        paragraph.reverse(&mut r);
        assert_eq!(r.to_string(), "abc\nxyz\n".to_owned());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("")?;
        us.read();
        let mut warnings = Warnings::new();
        let paragraph = parse_paragraph(&mut us, &mut warnings).unwrap();

        assert!(paragraph.is_none());

        assert_eq!(&warnings.warnings.len(), &0);

        Ok(())
    }
}
