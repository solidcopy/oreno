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
        r.wrap();
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
            Unit::Eof => break,
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
        Ok(Some(Paragraph { contents }))
    } else {
        Ok(None)
    }
}
