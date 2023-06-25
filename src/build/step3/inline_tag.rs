use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::try_parse;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContent;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseError;
use crate::build::step3::ParseFunc;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

#[derive(Debug)]
pub struct InlineTag {
    name: String,
    attributes: Attributes,
    contents: InlineContents,
}

impl ContentModel for InlineTag {
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

        format!(
            r#"{{"it":{},"a":{},"c":[{}]}}"#,
            &self.name.to_json(),
            &self.attributes.to_json(),
            &contents
        )
    }
}

impl InlineContent for InlineTag {}

pub fn parse_inline_tag(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineTag> {
    let (tag_name, attributes) = match parse_tag_and_attributes(unit_stream, warnings)? {
        Some((tag_name, attributes)) => (tag_name, attributes),
        None => return Ok(None),
    };

    let contents_parser: ParseFunc<InlineContents> = match tag_name.as_str() {
        "code" | "raw-html" => parse_raw_inline_tag_contents,
        _ => parse_inline_tag_contents,
    };

    let contents = match try_parse(contents_parser, unit_stream, warnings)? {
        Some(contents) => contents,
        None => {
            warnings.push(
                unit_stream.file_position(),
                "There is no tag's contents.".to_owned(),
            );
            return Ok(None);
        }
    };

    Ok(Some(InlineTag {
        name: tag_name,
        attributes,
        contents,
    }))
}

fn parse_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineContents> {
    abstract_parse_inline_tag_contents(unit_stream, warnings, true)
}

fn parse_raw_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<InlineContents> {
    abstract_parse_inline_tag_contents(unit_stream, warnings, false)
}

fn abstract_parse_inline_tag_contents(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
    parse_tags: bool,
) -> ParseResult<InlineContents> {
    // 開始が"{"でなければ不適合
    if unit_stream.read().0 != Unit::Char('{') {
        return Ok(None);
    }

    // いくつ"{"が出現したか、同時にいくつ"}"が出現したら終了するか
    let mut bracket_depth = 1;

    // {}の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut contents: InlineContents = vec![];
    let mut text = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ':' if parse_tags => match try_parse(parse_inline_tag, unit_stream, warnings)? {
                    Some(inline_tag) => {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                            text = String::new();
                        }
                        contents.push(Box::new(inline_tag));
                    }
                    None => {
                        text.push(c);
                        unit_stream.read();
                    }
                },
                '{' => {
                    bracket_depth += 1;
                    text.push('{');
                    unit_stream.read();
                }
                '}' => {
                    bracket_depth -= 1;
                    if bracket_depth == 0 {
                        if !text.is_empty() {
                            contents.push(Box::new(text));
                        }
                        unit_stream.read();
                        break;
                    } else {
                        text.push('}');
                        unit_stream.read();
                    }
                }
                _ => {
                    text.push(c);
                    unit_stream.read();
                }
            },
            Unit::NewLine => {
                text.push('\n');
                unit_stream.read();
            }
            Unit::Eof => {
                warnings.push(unit_stream.file_position(), "} is required.".to_owned());
                return Ok(None);
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                ));
            }
        }
    }

    Ok(Some(contents))
}

#[cfg(test)]
mod test_parse_inline_tag {
    use super::parse_inline_tag;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a=x,b=\"yy\",123]{zzz:b{bold}???}")?;
        us.read();
        let mut warnings = Warnings::new();
        let tag = parse_inline_tag(&mut us, &mut warnings).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"tag",
                "a":{"":"123","a":"x","b":"yy"},
                "c":[
                    "zzz",
                    {"it":"b","a":null,"c":["bold"]},
                    "???"
                ]
            }"#,
        );

        assert!(warnings.warnings.is_empty());

        Ok(())
    }

    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":code[a=x,b=\"yy\",123]{zzz:b{bold}???}")?;
        us.read();
        let mut warnings = Warnings::new();
        let tag = parse_inline_tag(&mut us, &mut warnings).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"code",
                "a":{"":"123","a":"x","b":"yy"},
                "c":["zzz:b{bold}???"]
            }"#,
        );

        assert!(warnings.warnings.is_empty());

        Ok(())
    }

    #[test]
    fn test_no_contents() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a]")?;
        us.read();
        let mut warnings = Warnings::new();
        let tag = parse_inline_tag(&mut us, &mut warnings).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.warnings.len(), 1);
        assert_eq!(warnings.warnings[0].message, "There is no tag's contents.");

        Ok(())
    }

    #[test]
    fn test_no_contents_without_attr() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag$")?;
        us.read();
        let mut warnings = Warnings::new();
        let tag = parse_inline_tag(&mut us, &mut warnings).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.warnings.len(), 1);
        assert_eq!(warnings.warnings[0].message, "There is no tag's contents.");

        Ok(())
    }
}

#[cfg(test)]
mod test_abstract_parse_inline_tag_contents {
    use super::abstract_parse_inline_tag_contents;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 3);
        assert_model(result[0].as_ref(), r#""abc""#);
        assert_model(
            result[1].as_ref(),
            r#"{
                "it":"tag",
                "a":null,
                "c":["xxx"]
            }"#,
        );
        assert_eq!(result[2].to_json(), r#""zzz""#.to_owned());

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, false)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc:tag{xxx}zzz""#);

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_no_bracket() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_count_brackets() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc{{xxx}zzz}}??")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc{{xxx}zzz}""#);

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc\nxxx}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc\nxxx""#);

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.warnings.len(), 1);
        assert_eq!(warnings.warnings[0].message, "} is required.");

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = abstract_parse_inline_tag_contents(&mut us, &mut warnings, true)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 0);

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }
}
