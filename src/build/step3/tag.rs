use std::collections::HashMap;

use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::parse_attributes;
use crate::build::step3::symbol;
use crate::build::step3::try_parse;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

/// タグをパースする。
/// タグとはコロンからタグ名の部分まで。
/// パースできたらタグ名を返す。
///
/// 開始位置はコロンである想定。
pub fn parse_tag(unit_stream: &mut UnitStream, warnings: &mut Warnings) -> ParseResult<String> {
    // 開始がコロンか省略記法でなければ不適合
    if let (Unit::Char(c), _) = unit_stream.read() {
        let tag_name_or_none = match c {
            ':' => symbol::parse_symbol(unit_stream, warnings)?,
            '*' => Some("b".to_owned()),
            '/' => Some("i".to_owned()),
            '_' => Some("u".to_owned()),
            '-' => Some("del".to_owned()),
            '"' => Some("q".to_owned()),
            '`' => Some("code".to_owned()),
            '\\' => Some("raw".to_owned()),
            '%' => Some("image".to_owned()),
            '#' => Some("sequence".to_owned()),
            '$' => Some("section".to_owned()),
            '&' => Some("link".to_owned()),
            '@' => Some("apply-template".to_owned()),
            _ => None,
        };

        Ok(tag_name_or_none)
    } else {
        Ok(None)
    }
}

pub fn parse_tag_and_attributes(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<(String, HashMap<Option<String>, String>)> {
    let tag_name = match try_parse(parse_tag, unit_stream, warnings)? {
        Some(tag_name) => tag_name,
        None => return Ok(None),
    };

    let attributes = match try_parse(parse_attributes, unit_stream, warnings)? {
        Some(attributes) => attributes,
        None => HashMap::with_capacity(0),
    };

    Ok(Some((tag_name, attributes)))
}
