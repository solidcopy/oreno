use super::ParseError;
use super::{inline_tag::parse_inline_tag, try_parse, InlineContents, ParseResult};
use crate::build::step2::{Unit, UnitStream};
use crate::build::step3;

pub struct Paragraph {
    contents: InlineContents,
}

pub fn parse_paragraph(unit_stream: &mut UnitStream) -> ParseResult<Paragraph> {
    match unit_stream.peek() {
        Unit::NewLine | Unit::BlockBeginning | Unit::BlockEnd => {
            return step3::mismatched();
        }
        _ => {}
    }

    let mut contents: InlineContents = vec![];
    let mut all_errors = Vec::<ParseError>::with_capacity(0);
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if *c == ':' {
                    if let (Some(inline_tag), mut errors) =
                        try_parse(parse_inline_tag, unit_stream)?
                    {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }

                        contents.push(Box::new(inline_tag));
                        all_errors.append(&mut errors);

                        continue;
                    }
                }

                text.push(*c);
                unit_stream.read();
            }
            Unit::NewLine => {
                text.push('\n');
                unit_stream.read();

                match unit_stream.peek() {
                    Unit::NewLine | Unit::BlockBeginning | Unit::BlockEnd => {
                        break;
                    }
                    _ => {}
                }
            }
            Unit::Eof => {
                break;
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return step3::fatal_error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "Unexpected block beginning or end.".to_owned(),
                );
            }
        }
    }

    if !text.is_empty() {
        contents.push(Box::new(text));
    }

    if !contents.is_empty() {
        Ok((Some(Paragraph { contents }), all_errors))
    } else {
        Ok((None, all_errors))
    }
}