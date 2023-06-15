use std::collections::HashMap;

use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::symbol;
use crate::build::step3::try_parse;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

pub fn parse_attributes(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<HashMap<Option<String>, String>> {
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
                ']' => break,
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
                            attributes.insert(attribute_name, attribute_value);
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
        None => return Ok(None),
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
                warnings.push(
                    unit_stream.file_position(),
                    "A quoted attribute value is not closed.".to_owned(),
                );
                return Ok(None);
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

    // 文字があるのに属性としてパースできない状況はある？

    /// EOFが出現したら不適合
    /// 多分ブロック終了がキャッシュされているせいでダメ
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
