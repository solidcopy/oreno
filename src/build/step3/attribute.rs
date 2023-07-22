#[cfg(test)]
use std::cmp::Ordering;
use std::collections::hash_map::Entry;
use std::collections::HashMap;

use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::call_parser;
use crate::build::step3::symbol;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;

pub type Attributes = HashMap<String, String>;

impl ContentModel for Attributes {
    #[cfg(test)]
    fn to_json(&self) -> String {
        if self.is_empty() {
            return "null".to_owned();
        }

        let mut s = String::new();

        s.push('{');

        let mut first = true;

        for attr_name in sort_keys(&self) {
            let v = self.get(attr_name).unwrap();

            if !first {
                s.push(',');
            }
            first = false;

            let value = v.to_json();
            let value = value.as_str();
            s.push_str(&format!("\"{}\":{}", &attr_name, value));
        }

        s.push('}');

        s
    }
}

pub type NamelessAttributeValues = Vec<String>;

impl ContentModel for NamelessAttributeValues {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut result = "[".to_owned();

        let values = self
            .iter()
            .map(|x| format!("\"{}\"", x.as_str()))
            .collect::<Vec<String>>()
            .join(",");
        result.push_str(values.as_str());

        result.push(']');

        result
    }
}

pub fn parse_attributes(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<(Attributes, NamelessAttributeValues)> {
    // 開始が"["でなければ不適合
    if unit_stream.peek() != Unit::Char('[') {
        return Ok(None);
    }
    unit_stream.read();

    // 属性の[]の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut attributes = HashMap::new();
    let mut nameless_attribute_values = vec![];

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ']' => {
                    unit_stream.read();
                    break;
                }
                ' ' => {
                    unit_stream.read();
                }
                _ => match call_parser(parse_attribute, unit_stream, context)? {
                    Some((attribute_name, attribute_value)) => {
                        if let Some(attribute_name) = attribute_name {
                            match attributes.entry(attribute_name) {
                                Entry::Occupied(_) => context.warn(
                                    unit_stream.file_position(),
                                    "The attributes are duplicated.".to_owned(),
                                ),
                                Entry::Vacant(entry) => {
                                    entry.insert(attribute_value);
                                }
                            }
                        } else {
                            nameless_attribute_values.push(attribute_value);
                        }
                    }
                    None => {
                        return Ok(None);
                    }
                },
            },
            Unit::NewLine => {
                unit_stream.read();
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    context.parser_name(),
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                ));
            }
            Unit::Eof => {
                context.warn(unit_stream.file_position(), "']' is required.".to_owned());
                return Ok(None);
            }
        }
    }

    Ok(Some((attributes, nameless_attribute_values)))
}

fn parse_attribute(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<(Option<String>, String)> {
    // 無名属性をパースする
    // 普通の属性が書かれていた時に"="がないことの警告を無効にする
    let mut no_warning = context.change_warn_mode(false);
    if let Some(attribute_value) =
        call_parser(parse_quoted_attribute_value, unit_stream, &mut no_warning)?
    {
        return Ok(Some((None, attribute_value)));
    }
    if let Some(attribute_value) =
        call_parser(parse_simple_attribute_value, unit_stream, &mut no_warning)?
    {
        return Ok(Some((None, attribute_value)));
    }

    // 属性名をパースする
    let attribute_name = match call_parser(symbol::parse_symbol, unit_stream, context)? {
        Some(attribute_name) => attribute_name,
        None => {
            context.warn(
                unit_stream.file_position(),
                "There is no attribute name.".to_owned(),
            );
            return Ok(None);
        }
    };

    // 次が"="でなければ不適合
    if unit_stream.peek() != Unit::Char('=') {
        return Ok(None);
    }
    unit_stream.read();

    // 引用符付き属性値がパースできればパース成功
    match call_parser(parse_quoted_attribute_value, unit_stream, context)? {
        Some(attribute_value) => return Ok(Some((Some(attribute_name), attribute_value))),
        None => {}
    }

    // 単純属性値がパースできればパース成功
    match call_parser(parse_simple_attribute_value, unit_stream, context)? {
        Some(attribute_value) => Ok(Some((Some(attribute_name), attribute_value))),
        None => Ok(None),
    }
}

/// 引用符付き属性値をパースする。
fn parse_quoted_attribute_value(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<String> {
    // 開始が引用符でなければ不適合
    if unit_stream.peek() != Unit::Char('"') {
        return Ok(None);
    }
    unit_stream.read();

    let mut attribute_value = String::new();
    let mut quotation_found = false;

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if c == '"' {
                    if quotation_found {
                        attribute_value.push('"');
                        quotation_found = false;
                    } else {
                        quotation_found = true;
                    }
                    unit_stream.read();
                } else if quotation_found {
                    break;
                } else {
                    attribute_value.push(c);
                    unit_stream.read();
                }
            }
            Unit::NewLine | Unit::Eof => {
                if quotation_found {
                    break;
                } else {
                    context.warn(
                        unit_stream.file_position(),
                        "A quoted attribute value is not closed.".to_owned(),
                    );
                    return Ok(None);
                }
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    context.parser_name(),
                    "Unexpected block beginning or end.".to_owned(),
                ));
            }
        }
    }

    Ok(Some(attribute_value))
}

/// 引用符なしの属性値をパースする。
fn parse_simple_attribute_value(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<String> {
    let mut attribute_value = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                '"' | '=' => {
                    let invalid_char_name = if c == '"' { "Quotes" } else { "Equal Signs" };
                    context.warn(
                        unit_stream.file_position(),
                        format!(
                            "{} cannot be written in the middle of an attribute value.",
                            invalid_char_name
                        ),
                    );
                    return Ok(None);
                }
                ' ' | ']' => break,
                _ => {
                    attribute_value.push(c);
                    unit_stream.read();
                }
            },
            Unit::NewLine | Unit::Eof => break,
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    context.parser_name(),
                    "Unexpected block beginning or end.".to_owned(),
                ));
            }
        }
    }

    Ok(Some(attribute_value))
}

#[cfg(test)]
pub fn sort_keys(attributes: &Attributes) -> Vec<&String> {
    let mut keys = attributes.keys().collect::<Vec<&String>>();
    keys.sort_by(|a, b| a.partial_cmp(b).unwrap());

    keys
}

#[cfg(test)]
mod test_parse_attributes {
    use super::parse_attributes;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=xxx b=\"y y\"\"y\"\n    zzz]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (attributes, values) = parse_attributes(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(attributes.len(), 2);
        assert_eq!(attributes["a"], "xxx");
        assert_eq!(attributes["b"], "y y\"y");
        assert_eq!(values.len(), 1);
        assert_eq!(values[0], "zzz");
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    /// 同じ属性名があったら警告
    #[test]
    fn test_duplicated_key() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=xxx a=yyy]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (attributes, values) = parse_attributes(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(attributes.len(), 1);
        assert_eq!(attributes["a"], "xxx");
        assert_eq!(values.len(), 0);
        assert_eq!(&context.warnings.len(), &1);
        assert_eq!(&warnings[0].message, "The attributes are duplicated.");
        Ok(())
    }

    /// 開始が"["でなければ不適合
    #[test]
    fn test_starts_with_other() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{a=x}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attributes(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    /// 区切り文字なしで連続していてもOK
    #[test]
    fn test_missing_comma() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=\"x\"b=y]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (attributes, values) = parse_attributes(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(attributes.len(), 2);
        assert_eq!(attributes["a"], "x");
        assert_eq!(attributes["b"], "y");
        assert_eq!(values.len(), 0);
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    // 属性の形式が不正なら不適合
    #[test]
    fn test_malformed_attribute() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[?=a]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attributes(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is no attribute name.");
        Ok(())
    }

    /// EOFが出現したら不適合
    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=x b=y")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attributes(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "']' is required.");
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_attribute {
    use super::parse_attribute;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;
    use std::error::Error;

    #[test]
    fn test_simple_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a=xxx ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (k, v) = parse_attribute(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, "xxx");
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    #[test]
    fn test_quoted_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a=\"xxx\"]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (k, v) = parse_attribute(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, "xxx");
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    #[test]
    fn test_nameless_simple_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (k, v) = parse_attribute(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&k, &None);
        assert_eq!(&v, "xxx");
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    #[test]
    fn test_nameless_quoted_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\"\n   ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (k, v) = parse_attribute(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&k, &None);
        assert_eq!(&v, "xxx");
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    /// 属性名が不正なら不適合
    #[test]
    fn test_bad_name() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("$=xxx ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attribute(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is no attribute name.");
        Ok(())
    }

    /// 属性名の後が"="でなければ不適合
    #[test]
    fn test_no_equal_sign() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a\"xxx ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attribute(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    /// 開始が"="なら不適合
    #[test]
    fn test_starts_with_equal_sign() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("=xxx ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_attribute(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(&warnings[0].message, "There is no attribute name.");
        Ok(())
    }

    /// 値が空
    #[test]
    fn test_empty_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a= ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (k, v) = parse_attribute(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, &"".to_owned());
        assert_eq!(warnings.len(), 0);
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_quoted_attribute_value {
    use super::parse_quoted_attribute_value;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\" x")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 6)));
        Ok(())
    }

    /// 引用符がなければ不適合
    #[test]
    fn test_no_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx ")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 0);
        Ok(())
    }

    /// 内容に引用符を含む
    #[test]
    fn test_has_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"zz\" x")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xx\"zz".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 9)));
        Ok(())
    }

    /// 連続した引用符を含む
    #[test]
    fn test_has_two_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"\"\"zz\" x")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xx\"\"zz".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 11)));
        Ok(())
    }

    /// 引用符の直後で終了
    #[test]
    fn test_quotation_and_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"\"\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xx\"".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 7)));
        Ok(())
    }

    /// 引用符の前で改行
    #[test]
    fn test_ends_with_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(
            &warnings[0].message,
            "A quoted attribute value is not closed."
        );
        Ok(())
    }

    /// 引用符の前でEOF
    #[test]
    fn test_ends_with_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_quoted_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(
            &warnings[0].message,
            "A quoted attribute value is not closed."
        );
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_simple_attribute_value {
    use super::parse_simple_attribute_value;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;
    use std::error::Error;

    /// カンマで終了
    #[test]
    fn test_ends_with_comma() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx x")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// "]"で終了
    #[test]
    fn test_ends_with_brace() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// 改行で終了
    #[test]
    fn test_ends_with_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// EOFで終了
    #[test]
    fn test_ends_with_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(warnings.len(), 0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// 引用符があれば不適合
    #[test]
    fn test_has_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xx\"")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(
            &warnings[0].message,
            "Quotes cannot be written in the middle of an attribute value."
        );
        Ok(())
    }

    /// 等号があれば不適合
    #[test]
    fn test_has_equal_signs() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xx= x")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_simple_attribute_value(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(warnings.len(), 1);
        assert_eq!(
            &warnings[0].message,
            "Equal Signs cannot be written in the middle of an attribute value."
        );
        Ok(())
    }
}
