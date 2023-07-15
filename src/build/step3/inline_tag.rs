use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::attribute::NamelessAttributeValues;
use crate::build::step3::call_parser;
use crate::build::step3::tag::parse_tag_and_attributes;
use crate::build::step3::tag::TagName;
use crate::build::step3::ContentModel;
use crate::build::step3::InlineContent;
use crate::build::step3::InlineContents;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

#[derive(Debug)]
pub struct InlineTag {
    name: TagName,
    attributes: Attributes,
    nameless_attribute_values: NamelessAttributeValues,
    contents: InlineContents,
}

impl ContentModel for InlineTag {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut result = format!("{{\"it\":{}", &self.name.to_json());

        if !self.attributes.is_empty() {
            result.push_str(format!(",\"a\":{}", &self.attributes.to_json()).as_str());
        }

        if !self.nameless_attribute_values.is_empty() {
            result
                .push_str(format!(",\"v\":{}", &self.nameless_attribute_values.to_json()).as_str());
        }

        if !self.contents.is_empty() {
            let contents: String = self
                .contents
                .iter()
                .map(|content| content.to_json())
                .collect::<Vec<String>>()
                .join(",");
            result.push_str(format!(",\"c\":[{}]", contents.as_str()).as_str());
        };

        result.push_str("}");

        result
    }
}

impl InlineContent for InlineTag {}

pub fn parse_inline_tag(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<InlineTag> {
    let mut context = context.change_parser_name(Some("inline tag".to_owned()));
    let context = &mut context;

    let (tag_name, attributes, nameless_attribute_values) =
        match parse_tag_and_attributes(unit_stream, context)? {
            Some(x) => x,
            None => return Ok(None),
        };

    let parse_tags = match tag_name.name() {
        "code" | "raw-html" => false,
        _ => true,
    };

    if parse_tags && !tag_name.abbreviation() {
        if let Some(nested_tag) = call_parser(parse_inline_tag, unit_stream, context)? {
            let contents: Vec<Box<dyn InlineContent>> = vec![Box::new(nested_tag)];
            return Ok(Some(InlineTag {
                name: tag_name,
                attributes,
                nameless_attribute_values,
                contents,
            }));
        }
    }

    let contents = match unit_stream.peek() {
        Unit::Char(' ') | Unit::NewLine | Unit::BlockEnd | Unit::Eof => {
            if tag_name.abbreviation() {
                return Ok(None);
            }
            Vec::with_capacity(0)
        }
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
            if !tag_name.abbreviation() {
                context.warn(
                    unit_stream.file_position(),
                    format!("There is an illegal character. '{}'", c),
                );
            }
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
        nameless_attribute_values,
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
    use crate::build::step1::Position;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::test_utils::test_parser;
    use std::error::Error;

    /// タグ名あり、属性なし、内容なし、終端は空白
    #[test]
    fn test_name_no_attrs_no_contents_space() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag ");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag"}"#);

        assert_eq!(p, Position::new(1, 5));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性なし、内容なし、終端は改行
    #[test]
    fn test_name_no_attrs_no_contents_wrap() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag\n");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag"}"#);

        assert_eq!(p, Position::new(1, 5));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性なし、内容なし、終端はブロック終了
    #[test]
    fn test_name_no_attrs_no_contents_block_end() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag"}"#);

        assert_eq!(p, Position::new(1, 5));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性あり、内容なし、終端は空白
    #[test]
    fn test_name_attrs_no_contents_space() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag[a=x,b=\"yy\",123] ");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag", "a":{"a":"x","b":"yy"}, "v":["123"]}"#);

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性あり、内容なし、終端は改行
    #[test]
    fn test_name_attrs_no_contents_wrap() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag[a=x,b=\"yy\",123]\n ");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag", "a":{"a":"x","b":"yy"}, "v":["123"]}"#);

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性あり、内容なし、終端はブロック終了
    #[test]
    fn test_name_attrs_no_contents_block_end() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag[a=x,b=\"yy\",123]");

        let tag = r.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"tag", "a":{"a":"x","b":"yy"}, "v":["123"]}"#);

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性なし、内容あり、終端は空白
    #[test]
    fn test_name_no_attrs_contents_space() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag{zzz:b{bold}???} ");

        let tag = r.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{"it":"tag", "c":[
                "zzz",
                {"it":"b","c":["bold"]},
                "???"
            ]}"#,
        );

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性なし、内容あり、終端は改行
    #[test]
    fn test_name_no_attrs_contents_wrap() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag{zzz:b{bold}???}\n ");

        let tag = r.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{"it":"tag", "c":[
                "zzz",
                {"it":"b","c":["bold"]},
                "???"
            ]}"#,
        );

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性なし、内容あり、終端はブロック終了
    #[test]
    fn test_name_no_attrs_contents_block_end() {
        let (r, p, w) = test_parser(parse_inline_tag, ":tag{zzz:b{bold}???}");

        let tag = r.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{"it":"tag", "c":[
                "zzz",
                {"it":"b","c":["bold"]},
                "???"
            ]}"#,
        );

        assert_eq!(p, Position::new(1, 21));

        assert!(w.is_empty());
    }

    /// タグ名あり、属性あり、内容あり、終端は空白
    #[test]
    fn test_name_attrs_contents_space() {
        let (result, position, warnings) =
            test_parser(parse_inline_tag, ":tag[a=x,b=\"yy\",123]{zzz:b{bold}???} ");

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"tag",
                "a":{"a":"x","b":"yy"},
                "v":["123"],
                "c":[
                    "zzz",
                    {"it":"b","c":["bold"]},
                    "???"
                ]
            }"#,
        );

        assert_eq!(position, Position::new(1, 37));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名あり、属性あり、内容あり、終端は改行
    #[test]
    fn test_name_attrs_contents_wrap() {
        let (result, position, warnings) = test_parser(
            parse_inline_tag,
            ":tag[a=x,b=\"yy\",123]{zzz:b{bold}???}\n ",
        );

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"tag",
                "a":{"a":"x","b":"yy"},
                "v":["123"],
                "c":[
                    "zzz",
                    {"it":"b","c":["bold"]},
                    "???"
                ]
            }"#,
        );

        assert_eq!(position, Position::new(1, 37));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名あり、属性あり、内容あり、終端はブロック終了
    #[test]
    fn test_name_attrs_contents_block_end() {
        let (result, position, warnings) =
            test_parser(parse_inline_tag, ":tag[a=x,b=\"yy\",123]{zzz:b{bold}???}");

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"tag",
                "a":{"a":"x","b":"yy"},
                "v":["123"],
                "c":[
                    "zzz",
                    {"it":"b","c":["bold"]},
                    "???"
                ]
            }"#,
        );

        assert_eq!(position, Position::new(1, 37));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容なし、終端は空白
    #[test]
    fn test_no_name_no_attrs_no_contents_space() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ": ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":""}"#);

        assert_eq!(position, Position::new(1, 2));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容なし、終端は改行
    #[test]
    fn test_no_name_no_attrs_no_contents_wrap() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":\n ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":""}"#);

        assert_eq!(position, Position::new(1, 2));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容なし、終端はブロック終了
    #[test]
    fn test_no_name_no_attrs_no_contents_block_end() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":""}"#);

        assert_eq!(position, Position::new(1, 2));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容なし、終端は空白
    #[test]
    fn test_no_name_attrs_no_contents_space() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c] ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"]}"#);

        assert_eq!(position, Position::new(1, 10));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容なし、終端は改行
    #[test]
    fn test_no_name_attrs_no_contents_wrap() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c]\n ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"]}"#);

        assert_eq!(position, Position::new(1, 10));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容なし、終端はブロック終了
    #[test]
    fn test_no_name_attrs_no_contents_block_end() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c]");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"]}"#);

        assert_eq!(position, Position::new(1, 10));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容あり、終端は空白
    #[test]
    fn test_no_name_no_attrs_contents_space() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":{xxx} ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 7));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容あり、終端は改行
    #[test]
    fn test_no_name_no_attrs_contents_wrap() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":{xxx}\n ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 7));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性なし、内容あり、終端はブロック終了
    #[test]
    fn test_no_name_no_attrs_contents_block_end() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":{xxx}");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 7));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容あり、終端は空白
    #[test]
    fn test_no_name_attrs_contents_space() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c]{xxx} ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"], "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 15));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容あり、終端は改行
    #[test]
    fn test_no_name_attrs_contents_wrap() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c]{xxx}\n ");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"], "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 15));

        assert_eq!(warnings.len(), 0);
    }

    /// タグ名なし、属性あり、内容あり、終端はブロック終了
    #[test]
    fn test_no_name_attrs_contents_block_end() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":[aa,b=c]{xxx}");

        let tag = result.unwrap().unwrap();
        assert_model(&tag, r#"{"it":"", "a":{"b":"c"}, "v":["aa"], "c":["xxx"]}"#);

        assert_eq!(position, Position::new(1, 15));

        assert_eq!(warnings.len(), 0);
    }

    /// 最初がコロンではない
    #[test]
    fn test_no_colon() {
        let (result, _, warnings) = test_parser(parse_inline_tag, "{xxx}");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 0);
    }

    /// コロンの後に不正な文字
    #[test]
    fn test_colon_followed_by_illegal_character() {
        let (result, _, warnings) = test_parser(parse_inline_tag, ":$");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. '$'");
    }

    /// タグ名の後に不正な文字
    #[test]
    fn test_name_followed_by_illegal_character() {
        let (result, _, warnings) = test_parser(parse_inline_tag, ":tag;");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. ';'");
    }

    /// rawタグなら内容のタグをパースしない
    #[test]
    fn test_raw() {
        let (result, position, warnings) =
            test_parser(parse_inline_tag, ":code[a=x,b=\"yy\",123]{zzz:b{bold}???}");

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"code",
                "a":{"a":"x","b":"yy"},
                "v":["123"],
                "c":["zzz:b{bold}???"]
            }"#,
        );

        assert_eq!(position, Position::new(1, 38));

        assert_eq!(warnings.len(), 0);
    }

    /// ネスト
    /// 属性なし
    #[test]
    fn test_nest_no_attrs() {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":a:b{ccc}");

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"a",
                "c":[{"it":"b","c":["ccc"]}]
            }"#,
        );

        assert_eq!(position, Position::new(1, 10));

        assert_eq!(warnings.len(), 0);
    }

    /// ネスト
    /// 属性あり
    #[test]
    fn test_nest_with_attr() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) = test_parser(parse_inline_tag, ":a[x=1]:b[y=2]{ccc}");

        let tag = result.unwrap().unwrap();
        assert_model(
            &tag,
            r#"{
                "it":"a",
                "a":{"x":"1"},
                "c":[{"it":"b","a":{"y":"2"},"c":["ccc"]}]
            }"#,
        );

        assert_eq!(position, Position::new(1, 20));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    /// ネスト
    /// 親がrawタグならネストを許可しない
    #[test]
    fn test_nest_parent_raw() -> Result<(), Box<dyn Error>> {
        let (result, _, warnings) = test_parser(parse_inline_tag, ":code:b{ccc}");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is an illegal character. ':'");

        Ok(())
    }
}

#[cfg(test)]
mod test_parse_inline_tag_contents {
    use super::parse_inline_tag_contents;
    use crate::build::step1::Position;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::test_utils::test_parser;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) =
            test_parser(parse_inline_tag_contents, "{abc:tag{xxx}zzz}");

        let result = result.unwrap().unwrap();
        assert_eq!(result.len(), 3);
        assert_model(result[0].as_ref(), r#""abc""#);
        assert_model(
            result[1].as_ref(),
            r#"{
                "it":"tag",
                "c":["xxx"]
            }"#,
        );
        assert_eq!(result[2].to_json(), r#""zzz""#.to_owned());

        assert_eq!(position, Position::new(1, 18));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_raw() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) =
            test_parser(parse_inline_tag_contents, "!r!{abc:tag{xxx}zzz}");

        let result = result.unwrap().unwrap();
        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc:tag{xxx}zzz""#);

        assert_eq!(position, Position::new(1, 21));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_no_bracket() -> Result<(), Box<dyn Error>> {
        let (result, _, warnings) = test_parser(parse_inline_tag_contents, "abc:tag{xxx}zzz}");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_count_brackets() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) =
            test_parser(parse_inline_tag_contents, "{abc{{xxx}zzz}}??");

        let result = result.unwrap().unwrap();
        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc{{xxx}zzz}""#);

        assert_eq!(position, Position::new(1, 16));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_new_line() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) = test_parser(parse_inline_tag_contents, "{abc\nxxx}");

        let result = result.unwrap().unwrap();
        assert_eq!(result.len(), 1);
        assert_model(result[0].as_ref(), r#""abc\nxxx""#);

        assert_eq!(position, Position::new(2, 5));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }

    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let (result, _, warnings) = test_parser(parse_inline_tag_contents, "{abc");

        assert!(result.unwrap().is_none());

        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].message, "} is required.");

        Ok(())
    }

    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let (result, position, warnings) = test_parser(parse_inline_tag_contents, "{}");

        let result = result.unwrap().unwrap();
        assert_eq!(result.len(), 0);

        assert_eq!(position, Position::new(1, 3));

        assert_eq!(warnings.len(), 0);

        Ok(())
    }
}
