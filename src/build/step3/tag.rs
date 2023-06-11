use super::symbol;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;

/// タグをパースする。
/// タグとはコロンからタグ名の部分まで。
/// パースできたらタグ名を返す。
///
/// 開始位置はコロンである想定。
fn parse_tag(unit_stream: &mut UnitStream) -> ParseResult<String> {
    // 開始がコロンか省略記法でなければ不適合
    if let (Unit::Char(c), _) = unit_stream.read() {
        match c {
            ':' => symbol::parse_symbol(unit_stream),
            '*' => ParseResult::Parsed("b".to_owned()),
            '/' => ParseResult::Parsed("i".to_owned()),
            '_' => ParseResult::Parsed("u".to_owned()),
            '-' => ParseResult::Parsed("del".to_owned()),
            '"' => ParseResult::Parsed("q".to_owned()),
            '`' => ParseResult::Parsed("code".to_owned()),
            '\\' => ParseResult::Parsed("raw".to_owned()),
            '%' => ParseResult::Parsed("image".to_owned()),
            '#' => ParseResult::Parsed("sequence".to_owned()),
            '$' => ParseResult::Parsed("section".to_owned()),
            '&' => ParseResult::Parsed("link".to_owned()),
            '@' => ParseResult::Parsed("apply-template".to_owned()),
            _ => ParseResult::Mismatched,
        }
    } else {
        ParseResult::Mismatched
    }
}
