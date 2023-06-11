use std::collections::HashMap;

use super::symbol;
use super::try_parse;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;

fn parse_attributes(unit_stream: &mut UnitStream) -> ParseResult<HashMap<Option<String>, String>> {
    // 開始が"["でなければ不適合
    if unit_stream.peek() != &Unit::Char('[') {
        return ParseResult::Mismatched;
    }
    unit_stream.read();

    // 属性の[]の中ではインデントの増減をブロック開始/終了と見なさない
    unit_stream.set_indent_check_mode(false);

    let mut attributes = HashMap::new();

    // 次の属性の前に区切り文字が必要か
    let mut need_separator = false;

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match *c {
                ']' => break,
                ',' => {
                    if !need_separator {
                        return ParseResult::warn(
                            unit_stream.get_filepath(),
                            unit_stream.read().1,
                            "It's a comma you don't need.".to_owned(),
                        );
                    }
                    need_separator = false;
                }
                ' ' => {}
                _ => {
                    if need_separator {}

                    match parse_attribute(unit_stream) {
                        ParseResult::Parsed((attribute_name, attribute_value)) => {
                            attributes.insert(attribute_name, attribute_value);
                            need_separator = true;
                        }
                        ParseResult::Mismatched => {
                            return ParseResult::warn(
                                unit_stream.get_filepath(),
                                unit_stream.read().1,
                                "The attribute is malformed.".to_owned(),
                            );
                        }
                        ParseResult::Warning(error_info) => {
                            return ParseResult::Warning(error_info)
                        }
                        ParseResult::Error(error_info) => return ParseResult::Error(error_info),
                    }
                }
            },
            Unit::NewLine => {}
            Unit::BlockBeginning | Unit::BlockEnd => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    None,
                    "Block beginning or end occurred while indent check mode is off.".to_owned(),
                );
            }
            Unit::Eof => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "] is required.".to_owned(),
                );
            }
        }
    }

    ParseResult::Parsed(attributes)
}

fn parse_attribute(unit_stream: &mut UnitStream) -> ParseResult<(Option<String>, String)> {
    // 無名属性をパースする
    if let ParseResult::Parsed(attribute_value) =
        try_parse(parse_quoted_attribute_value, unit_stream)
    {
        return ParseResult::Parsed((None, attribute_value));
    }
    if let ParseResult::Parsed(attribute_value) =
        try_parse(parse_simple_attribute_value, unit_stream)
    {
        return ParseResult::Parsed((None, attribute_value));
    }

    // 属性名をパースする
    let attribute_name = match symbol::parse_symbol(unit_stream) {
        ParseResult::Parsed(attribute_name) => attribute_name,
        ParseResult::Mismatched => return ParseResult::Mismatched,
        ParseResult::Warning(error_info) => return ParseResult::Warning(error_info),
        ParseResult::Error(error_info) => return ParseResult::Error(error_info),
    };

    // 次が"="でなければ不適合
    if unit_stream.peek() != &Unit::Char('=') {
        return ParseResult::Mismatched;
    }
    unit_stream.read();

    // 引用符付き属性値がパースできればパース成功
    match try_parse(parse_quoted_attribute_value, unit_stream) {
        ParseResult::Parsed(attribute_value) => {
            return ParseResult::Parsed((Some(attribute_name), attribute_value))
        }
        ParseResult::Mismatched => {}
        ParseResult::Warning(error_info) => return ParseResult::Warning(error_info),
        ParseResult::Error(error_info) => return ParseResult::Error(error_info),
    }

    // 単純属性値がパースできればパース成功
    match parse_simple_attribute_value(unit_stream) {
        ParseResult::Parsed(attribute_value) => {
            ParseResult::Parsed((Some(attribute_name), attribute_value))
        }
        ParseResult::Mismatched => ParseResult::Mismatched,
        ParseResult::Warning(error_info) => return ParseResult::Warning(error_info),
        ParseResult::Error(error_info) => return ParseResult::Error(error_info),
    }
}

/// 引用符付き属性値をパースする。
fn parse_quoted_attribute_value(unit_stream: &mut UnitStream) -> ParseResult<String> {
    // 開始が引用符でなければ不適合
    if unit_stream.peek() != &Unit::Char('"') {
        return ParseResult::Mismatched;
    }
    unit_stream.read();

    let mut attribute_value = String::new();
    let mut quotation_found = false;

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if *c == '"' {
                    if quotation_found {
                        attribute_value.push('"');
                        quotation_found = false;
                    } else {
                        quotation_found = true;
                    }
                    unit_stream.read();
                } else {
                    if quotation_found {
                        break;
                    } else {
                        attribute_value.push(*c);
                        unit_stream.read();
                    }
                }
            }
            Unit::NewLine | Unit::Eof => {
                return ParseResult::warn(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "A quoted attribute value is not closed.".to_owned(),
                );
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "Unexpected block beginning or end.".to_owned(),
                );
            }
        }
    }

    ParseResult::Parsed(attribute_value)
}

/// 引用符なしの属性値をパースする。
fn parse_simple_attribute_value(unit_stream: &mut UnitStream) -> ParseResult<String> {
    let mut attribute_value = String::new();

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => match *c {
                '"' | '=' => {
                    let invalid_char_name = if *c == '"' { "Quotes" } else { "Equal Signs" };
                    return ParseResult::warn(
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
                    attribute_value.push(*c);
                    unit_stream.read();
                }
            },
            Unit::NewLine | Unit::Eof => {
                break;
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return ParseResult::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "Unexpected block beginning or end.".to_owned(),
                );
            }
        }
    }

    ParseResult::Parsed(attribute_value)
}
