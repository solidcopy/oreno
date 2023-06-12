use std::collections::HashMap;

use super::symbol;
use super::try_parse;
use super::ParseError;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3;

pub fn parse_attributes(
    unit_stream: &mut UnitStream,
) -> ParseResult<HashMap<Option<String>, String>> {
    // 開始が"["でなければ不適合
    if unit_stream.peek() != Unit::Char('[') {
        return step3::mismatched();
    }
    unit_stream.read();

    // 属性の[]の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut attributes = HashMap::new();

    let mut all_errors = Vec::with_capacity(0);

    // 次の属性の前に区切り文字が必要か
    let mut need_separator = false;

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                ']' => break,
                ',' => {
                    if !need_separator {
                        return step3::error(
                            unit_stream.get_filepath(),
                            unit_stream.read().1,
                            "It's a comma you don't need.".to_owned(),
                        );
                    }
                    need_separator = false;
                }
                ' ' => {}
                _ => {
                    if need_separator {
                        return step3::error(
                            unit_stream.get_filepath(),
                            unit_stream.read().1,
                            "comma is required.".to_owned(),
                        );
                    }

                    match parse_attribute(unit_stream)? {
                        (Some((attribute_name, attribute_value)), mut errors) => {
                            attributes.insert(attribute_name, attribute_value);
                            all_errors.append(&mut errors);
                            need_separator = true;
                        }
                        (_, mut errors) => {
                            all_errors.append(&mut errors);
                            all_errors.push(step3::ParseError {
                                filename: unit_stream.get_filepath(),
                                position: unit_stream.read().1,
                                message: "The attribute is malformed.".to_owned(),
                            });
                            return Ok((None, all_errors));
                        }
                    }
                }
            },
            Unit::NewLine => {}
            Unit::BlockBeginning | Unit::BlockEnd => {
                return step3::fatal_error(
                    unit_stream.get_filepath(),
                    None,
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                );
            }
            Unit::Eof => {
                all_errors.push(step3::ParseError {
                    filename: unit_stream.get_filepath(),
                    position: unit_stream.read().1,
                    message: "] is required.".to_owned(),
                });
                return Ok((None, all_errors));
            }
        }
    }

    step3::parsed(attributes)
}

fn parse_attribute(unit_stream: &mut UnitStream) -> ParseResult<(Option<String>, String)> {
    // 無名属性をパースする
    if let (Some(attribute_value), errors) = try_parse(parse_quoted_attribute_value, unit_stream)? {
        return Ok((Some((None, attribute_value)), errors));
    }
    if let (Some(attribute_value), errors) = try_parse(parse_simple_attribute_value, unit_stream)? {
        return Ok((Some((None, attribute_value)), errors));
    }

    let mut all_errors = Vec::<ParseError>::new();

    // 属性名をパースする
    let attribute_name = match symbol::parse_symbol(unit_stream)? {
        (attribute_name, mut errors) => {
            all_errors.append(&mut errors);
            if attribute_name.is_none() {
                return Ok((None, all_errors));
            }
            attribute_name.unwrap()
        }
    };

    // 次が"="でなければ不適合
    if unit_stream.peek() != Unit::Char('=') {
        return Ok((None, all_errors));
    }
    unit_stream.read();

    // 引用符付き属性値がパースできればパース成功
    let (attribute_value, mut errors) = try_parse(parse_quoted_attribute_value, unit_stream)?;
    all_errors.append(&mut errors);
    if let Some(attribute_value) = attribute_value {
        return Ok((Some((Some(attribute_name), attribute_value)), all_errors));
    }

    // 単純属性値がパースできればパース成功
    let (attribute_value, mut errors) = try_parse(parse_simple_attribute_value, unit_stream)?;
    all_errors.append(&mut errors);
    if let Some(attribute_value) = attribute_value {
        return Ok((Some((Some(attribute_name), attribute_value)), all_errors));
    } else {
        Ok((None, all_errors))
    }
}

/// 引用符付き属性値をパースする。
fn parse_quoted_attribute_value(unit_stream: &mut UnitStream) -> ParseResult<String> {
    // 開始が引用符でなければ不適合
    if unit_stream.peek() != Unit::Char('"') {
        return step3::mismatched();
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
                return step3::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "A quoted attribute value is not closed.".to_owned(),
                );
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

    step3::parsed(attribute_value)
}

/// 引用符なしの属性値をパースする。
fn parse_simple_attribute_value(unit_stream: &mut UnitStream) -> ParseResult<String> {
    let mut attribute_value = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match c {
                '"' | '=' => {
                    let invalid_char_name = if c == '"' { "Quotes" } else { "Equal Signs" };
                    return step3::error(
                        unit_stream.get_filepath(),
                        unit_stream.read().1,
                        format!(
                            "{} cannot be written in the middle of an attribute value.",
                            invalid_char_name
                        ),
                    );
                }
                ',' | ']' => {
                    break;
                }
                _ => {
                    attribute_value.push(c);
                    unit_stream.read();
                }
            },
            Unit::NewLine | Unit::Eof => {
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

    step3::parsed(attribute_value)
}
