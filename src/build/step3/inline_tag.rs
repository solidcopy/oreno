use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::call_parser;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContent;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

#[derive(Debug)]
pub struct InlineTag {
    name: String,
    attributes: Attributes,
    contents: InlineContents,
}

impl ContentModel for InlineTag {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let contents = if self.contents.is_empty() {
            "null".to_owned()
        } else {
            let attributes: String = self
                .contents
                .iter()
                .map(|content| content.to_json())
                .collect::<Vec<String>>()
                .join(",");
            format!("[{}]", attributes.as_str())
        };

        format!(
            r#"{{"it":{},"a":{},"c":{}}}"#,
            &self.name.to_json(),
            &self.attributes.to_json(),
            &contents
        )
    }
}

impl InlineContent for InlineTag {}

pub fn parse_inline_tag(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<InlineTag> {
    let mut context = context.change_parser_name(Some("inline tag".to_owned()));
    let context = &mut context;

    let (tag_name, attributes) = match parse_tag_and_attributes(unit_stream, context)? {
        Some((tag_name, attributes)) => (tag_name, attributes),
        None => return Ok(None),
    };

    let parse_tags = match tag_name.as_str() {
        "code" | "raw-html" => false,
        _ => true,
    };

    if parse_tags {
        if let Some(nested_tag) = call_parser(parse_inline_tag, unit_stream, context)? {
            let contents: Vec<Box<dyn InlineContent>> = vec![Box::new(nested_tag)];
            return Ok(Some(InlineTag {
                name: tag_name,
                attributes,
                contents,
            }));
        }
    }

    let contents = match unit_stream.peek() {
        Unit::Char(' ') | Unit::NewLine | Unit::BlockEnd | Unit::Eof => Vec::with_capacity(0),
        Unit::Char('{') => {
            match call_parser(
                parse_inline_tag_contents,
                unit_stream,
                &mut context.change_parse_mode(parse_tags),
            )? {
                Some(contents) => contents,
                None => return Ok(None),
            }
        }
        Unit::Char(c) => {
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
                "Unexpected block beginning.".to_owned(),
            ));
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
    context: &mut ParseContext,
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
                ':' if context.is_parse_tags() => {
                    match call_parser(parse_inline_tag, unit_stream, context)? {
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
                    }
                }
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
                context.warn(unit_stream.file_position(), "} is required.".to_owned());
                return Ok(None);
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    context.parser_name(),
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
    use crate::build::step3::ParseContext;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a=x,b=\"yy\",123]{zzz:b{bold}???}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap().unwrap();

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

        assert!(warnings.is_empty());

        Ok(())
    }

    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":code[a=x,b=\"yy\",123]{zzz:b{bold}???}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"code",
                "a":{"":"123","a":"x","b":"yy"},
                "c":["zzz:b{bold}???"]
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    #[test]
    fn test_no_contents() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag[a]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"tag",
                "a":{"":"a"},
                "c":null
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    #[test]
    fn test_no_contents_without_attr() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag;")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap();

        assert!(tag.is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. ';'");

        Ok(())
    }

    /// ネスト
    /// 属性なし
    #[test]
    fn test_nest() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":a:b{ccc}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"a",
                "a":null,
                "c":[{"it":"b","a":null,"c":["ccc"]}]
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// ネスト
    /// 属性あり
    #[test]
    fn test_nest_with_attr() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":a[x=1]:b[y=2]{ccc}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap().unwrap();

        assert_model(
            &tag,
            r#"{
                "it":"a",
                "a":{"x":"1"},
                "c":[{"it":"b","a":{"y":"2"},"c":["ccc"]}]
            }"#,
        );

        assert!(warnings.is_empty());

        Ok(())
    }

    /// ネスト
    /// 親がrawタグならネストを許可しない
    #[test]
    fn test_nest_parent_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":code:b{ccc}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let tag = parse_inline_tag(&mut us, &mut context).unwrap();

        assert!(tag.is_none());
        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. ':'");

        Ok(())
    }
}

#[cfg(test)]
mod test_parse_inline_tag_contents {
    use super::parse_inline_tag_contents;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::ParseContext;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context)
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

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context.change_parse_mode(false))
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc:tag{xxx}zzz""#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_no_bracket() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc:tag{xxx}zzz}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_count_brackets() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc{{xxx}zzz}}??")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc{{xxx}zzz}""#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc\nxxx}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc\nxxx""#);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{abc")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].message, "} is required.");

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_inline_tag_contents(&mut us, &mut context)
            .unwrap()
            .unwrap();

        assert_eq!(result.len(), 0);

        assert_eq!(warnings.len(), 0);

        Ok(())
    }
}
