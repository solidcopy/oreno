use std::cmp::Ordering;
use std::collections::hash_map::Entry;
use std::collections::HashMap;

use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::symbol;
use crate::build::step3::try_parse;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Reversing;
use crate::build::step3::Warnings;

pub type Attributes = HashMap<Option<String>, String>;

impl ContentModel for Attributes {
    fn reverse(&self, r: &mut Reversing) {
        if self.is_empty() {
            return;
        }

        r.write("[");

        let mut first = true;

        for k in sort_keys(&self) {
            let v = self.get(k).unwrap();

            if !first {
                r.write(",");
            }
            first = false;

            if k.is_some() {
                r.write(k.as_ref().unwrap().as_str());
                r.write("=");
            }

            r.write(v.as_str());
        }

        r.write("]");
    }
}

pub fn sort_keys(attributes: &Attributes) -> Vec<&Option<String>> {
    let mut keys = attributes.keys().collect::<Vec<&Option<String>>>();
    keys.sort_by({
        |a, b| match (a, b) {
            (Some(x), Some(y)) => x.partial_cmp(y).unwrap(),
            (None, Some(_)) => Ordering::Less,
            (Some(_), None) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        }
    });

    keys
}

pub fn parse_attributes(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<Attributes> {
    // 開始が"["でなければ不適合
    if unit_stream.peek() != Unit::Char('[') {
        return Ok(None);
    }
    unit_stream.read();

    // 属性の[]の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut attributes = HashMap::new();

    // 次の属性の前に区切り文字が必要か
    let mut need_separator = false;

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ']' => {
                    unit_stream.read();
                    break;
                }
                ',' => {
                    if !need_separator {
                        warnings.push(
                            unit_stream.file_position(),
                            "It's a comma you don't need.".to_owned(),
                        );
                        return Ok(None);
                    }
                    need_separator = false;
                    unit_stream.read();
                }
                ' ' => {
                    unit_stream.read();
                }
                _ => {
                    if need_separator {
                        warnings.push(
                            unit_stream.file_position(),
                            "A comma is required.".to_owned(),
                        );
                        return Ok(None);
                    }

                    match try_parse(parse_attribute, unit_stream, warnings)? {
                        Some((attribute_name, attribute_value)) => {
                            match attributes.entry(attribute_name) {
                                Entry::Occupied(_) => warnings.push(
                                    unit_stream.file_position(),
                                    "The attributes are duplicated.".to_owned(),
                                ),
                                Entry::Vacant(entry) => {
                                    entry.insert(attribute_value);
                                }
                            }
                            need_separator = true;
                        }
                        None => {
                            warnings.push(
                                unit_stream.file_position(),
                                "The attribute is malformed.".to_owned(),
                            );
                            return Ok(None);
                        }
                    }
                }
            },
            Unit::NewLine => {
                unit_stream.read();
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                ));
            }
            Unit::Eof => {
                warnings.push(unit_stream.file_position(), "] is required.".to_owned());
                return Ok(None);
            }
        }
    }

    Ok(Some(attributes))
}

fn parse_attribute(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<(Option<String>, String)> {
    // 無名属性をパースする
    // 普通の属性が書かれていた時に"="の警告を捨てるためにダミーのWarningsを使う
    let mut ignored = Warnings::new();
    if let Some(attribute_value) =
        try_parse(parse_quoted_attribute_value, unit_stream, &mut ignored)?
    {
        return Ok(Some((None, attribute_value)));
    }
    if let Some(attribute_value) =
        try_parse(parse_simple_attribute_value, unit_stream, &mut ignored)?
    {
        return Ok(Some((None, attribute_value)));
    }

    // 属性名をパースする
    let attribute_name = match try_parse(symbol::parse_symbol, unit_stream, warnings)? {
        Some(attribute_name) => attribute_name,
        None => {
            warnings.push(
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
    match try_parse(parse_quoted_attribute_value, unit_stream, warnings)? {
        Some(attribute_value) => return Ok(Some((Some(attribute_name), attribute_value))),
        None => {}
    }

    // 単純属性値がパースできればパース成功
    match try_parse(parse_simple_attribute_value, unit_stream, warnings)? {
        Some(attribute_value) => Ok(Some((Some(attribute_name), attribute_value))),
        None => Ok(None),
    }
}

/// 引用符付き属性値をパースする。
fn parse_quoted_attribute_value(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
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
                    warnings.push(
                        unit_stream.file_position(),
                        "A quoted attribute value is not closed.".to_owned(),
                    );
                    return Ok(None);
                }
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
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
    warnings: &mut Warnings,
) -> ParseResult<String> {
    let mut attribute_value = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                '"' | '=' => {
                    let invalid_char_name = if c == '"' { "Quotes" } else { "Equal Signs" };
                    warnings.push(
                        unit_stream.file_position(),
                        format!(
                            "{} cannot be written in the middle of an attribute value.",
                            invalid_char_name
                        ),
                    );
                    return Ok(None);
                }
                ',' | ']' => break,
                _ => {
                    attribute_value.push(c);
                    unit_stream.read();
                }
            },
            Unit::NewLine | Unit::Eof => break,
            Unit::BlockBeginning | Unit::BlockEnd => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Unexpected block beginning or end.".to_owned(),
                ));
            }
        }
    }

    Ok(Some(attribute_value))
}

#[cfg(test)]
mod test_parse_attributes {
    use super::parse_attributes;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=xxx,b=\"y,y\"\"y\",\n    zzz]")?;
        us.read();
        let mut warnings = Warnings::new();
        let attributes = parse_attributes(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(attributes[&Some("a".to_owned())], "xxx");
        assert_eq!(attributes[&Some("b".to_owned())], "y,y\"y");
        assert_eq!(attributes[&None], "zzz");
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    /// 同じ属性名があったら警告
    #[test]
    fn test_duplicated_key() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=xxx,a=yyy]")?;
        us.read();
        let mut warnings = Warnings::new();
        let attributes = parse_attributes(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(attributes[&Some("a".to_owned())], "xxx");
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
            "The attributes are duplicated."
        );
        Ok(())
    }

    /// 開始が"["でなければ不適合
    #[test]
    fn test_starts_with_other() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("{a=x}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    /// 余分なカンマがあると不適合
    #[test]
    fn test_unnecessary_comma() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=x,,b=y]")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
            "It's a comma you don't need."
        );
        Ok(())
    }

    /// 必要なカンマがないと不適合
    #[test]
    fn test_missing_comma() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=\"x\"b=y]")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(&warnings.warnings[0].message, "A comma is required.");
        Ok(())
    }

    // 属性の形式が不正なら不適合
    #[test]
    fn test_malformed_attribute() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[?=a]")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &2);
        assert_eq!(&warnings.warnings[0].message, "There is no attribute name.");
        assert_eq!(&warnings.warnings[1].message, "The attribute is malformed.");
        Ok(())
    }

    /// EOFが出現したら不適合
    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("[a=x,b=y")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(&warnings.warnings[0].message, "] is required.");
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_attribute {
    use super::parse_attribute;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_simple_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a=xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let (k, v) = parse_attribute(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, "xxx");
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    #[test]
    fn test_quoted_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a=\"xxx\"]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let (k, v) = parse_attribute(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, "xxx");
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    #[test]
    fn test_nameless_simple_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let (k, v) = parse_attribute(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(&k, &None);
        assert_eq!(&v, "xxx");
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    #[test]
    fn test_nameless_quoted_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\"\n  ,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let (k, v) = parse_attribute(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(&k, &None);
        assert_eq!(&v, "xxx");
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    /// 属性名が不正なら不適合
    #[test]
    fn test_bad_name() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("$=xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_attribute(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(&warnings.warnings[0].message, "There is no attribute name.");
        Ok(())
    }

    /// 属性名の後が"="でなければ不適合
    #[test]
    fn test_no_equal_sign() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a\"xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_attribute(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    /// 開始が"="なら不適合
    #[test]
    fn test_starts_with_equal_sign() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("=xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_attribute(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(&warnings.warnings[0].message, "There is no attribute name.");
        Ok(())
    }

    /// 値が空
    #[test]
    fn test_empty_value() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("a=,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let (k, v) = parse_attribute(&mut us, &mut warnings).unwrap().unwrap();
        assert_eq!(&k, &Some("a".to_owned()));
        assert_eq!(&v, &"".to_owned());
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_quoted_attribute_value {
    use super::parse_quoted_attribute_value;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\",")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 6)));
        Ok(())
    }

    /// 引用符がなければ不適合
    #[test]
    fn test_no_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &0);
        Ok(())
    }

    /// 内容に引用符を含む
    #[test]
    fn test_has_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"zz\",")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xx\"zz".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 9)));
        Ok(())
    }

    /// 連続した引用符を含む
    #[test]
    fn test_has_two_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"\"\"zz\",")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xx\"\"zz".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 11)));
        Ok(())
    }

    /// 引用符の直後で終了
    #[test]
    fn test_quotation_and_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xx\"\"\"\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xx\"".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 7)));
        Ok(())
    }

    /// 引用符の前で改行
    #[test]
    fn test_ends_with_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\"xxx\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
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
        let mut warnings = Warnings::new();
        let result = parse_quoted_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
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
    use crate::build::step3::Warnings;
    use std::error::Error;

    /// カンマで終了
    #[test]
    fn test_ends_with_comma() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// "]"で終了
    #[test]
    fn test_ends_with_brace() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx]")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// 改行で終了
    #[test]
    fn test_ends_with_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx\n")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// EOFで終了
    #[test]
    fn test_ends_with_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xxx")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &Some("xxx".to_owned()));
        assert_eq!(&warnings.warnings.len(), &0);
        assert_eq!(us.file_position().position, Some(Position::new(1, 4)));
        Ok(())
    }

    /// 引用符があれば不適合
    #[test]
    fn test_has_quotations() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xx\",")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
            "Quotes cannot be written in the middle of an attribute value."
        );
        Ok(())
    }

    /// 等号があれば不適合
    #[test]
    fn test_has_equal_signs() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("xx=,")?;
        us.read();
        us.set_indent_check_mode(false);
        let mut warnings = Warnings::new();
        let result = parse_simple_attribute_value(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        assert_eq!(&warnings.warnings.len(), &1);
        assert_eq!(
            &warnings.warnings[0].message,
            "Equal Signs cannot be written in the middle of an attribute value."
        );
        Ok(())
    }
}
