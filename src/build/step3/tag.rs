use std::collections::HashMap;

use super::symbol;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3;
use crate::build::step3::attribute::parse_attributes;
use crate::build::step3::try_parse;
use crate::build::step3::ParseError;

/// タグをパースする。
/// タグとはコロンからタグ名の部分まで。
/// パースできたらタグ名を返す。
///
/// 開始位置はコロンである想定。
pub fn parse_tag(unit_stream: &mut UnitStream) -> ParseResult<String> {
    // 開始がコロンか省略記法でなければ不適合
    if let (Unit::Char(c), _) = unit_stream.read() {
        match c {
            ':' => symbol::parse_symbol(unit_stream),
            '*' => step3::parsed("b".to_owned()),
            '/' => step3::parsed("i".to_owned()),
            '_' => step3::parsed("u".to_owned()),
            '-' => step3::parsed("del".to_owned()),
            '"' => step3::parsed("q".to_owned()),
            '`' => step3::parsed("code".to_owned()),
            '\\' => step3::parsed("raw".to_owned()),
            '%' => step3::parsed("image".to_owned()),
            '#' => step3::parsed("sequence".to_owned()),
            '$' => step3::parsed("section".to_owned()),
            '&' => step3::parsed("link".to_owned()),
            '@' => step3::parsed("apply-template".to_owned()),
            _ => step3::mismatched(),
        }
    } else {
        step3::mismatched()
    }
}

pub fn parse_tag_and_attributes(
    unit_stream: &mut UnitStream,
    all_errors: &mut Vec<ParseError>,
) -> Result<Option<(String, HashMap<Option<String>, String>)>, ParseError> {
    let (tag_name, mut errors) = parse_tag(unit_stream)?;
    all_errors.append(&mut errors);
    if tag_name.is_none() {
        return Ok(None);
    }
    let tag_name = tag_name.unwrap();

    let (attributes, mut errors) = try_parse(parse_attributes, unit_stream)?;
    all_errors.append(&mut errors);
    let attributes = if attributes.is_some() {
        attributes.unwrap()
    } else {
        HashMap::with_capacity(0)
    };

    Ok(Some((tag_name, attributes)))
}
