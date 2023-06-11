use super::ParseResult;
use crate::build::step2::{Unit, UnitStream};

pub struct BlankLine {}

/// 空白行をパースする。
///
/// 開始位置は行頭である想定。
/// 行末の空白はUnitStreamに除去されている。
/// 読み込み位置に改行があればパース成功、それ以外なら不適合。
fn parse_blank_line(unit_stream: &mut UnitStream) -> ParseResult<BlankLine> {
    if Unit::NewLine == unit_stream.read().0 {
        ParseResult::Parsed(BlankLine {})
    } else {
        ParseResult::Mismatched
    }
}
