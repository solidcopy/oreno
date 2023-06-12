use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3;

/// シンボルをパースする。
/// シンボルはタグ名、属性名。
pub fn parse_symbol(unit_stream: &mut UnitStream) -> ParseResult<String> {
    let mut symbol = String::new();

    // 英数字とハイフンが続く限りバッファに追加していく。
    // 他の文字、改行、EOFが出現したらその直前までをシンボルにする。
    // ブロック開始/終了は出現しない。
    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if c.is_ascii_alphanumeric() || c == '-' {
                    symbol.push(c);
                    unit_stream.read();
                } else {
                    break;
                }
            }
            Unit::NewLine | Unit::Eof => {
                break;
            }
            Unit::BlockBeginning | Unit::BlockEnd => {
                return step3::error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "Unexpected block beginning or end.".to_owned(),
                );
            }
        }
    }

    // 1文字もなければ不適合
    if symbol.is_empty() {
        return step3::mismatched();
    }

    step3::parsed(symbol)
}
