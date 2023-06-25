use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseResult;

/// シンボルをパースする。
/// シンボルはタグ名、属性名。
pub fn parse_symbol(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<String> {
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
            _ => break,
        }
    }

    // 1文字もなければ不適合
    if !symbol.is_empty() {
        Ok(Some(symbol))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod test_parse_symbol {
    use std::error::Error;

    use super::parse_symbol;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;

    #[test]
    fn test_end_by_char() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("code-block???")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let symbol = parse_symbol(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&symbol, "code-block");
        Ok(())
    }

    #[test]
    fn test_end_by_new_line() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("code\nblock")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let symbol = parse_symbol(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&symbol, "code");
        Ok(())
    }

    #[test]
    fn test_end_by_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("x")?;
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let symbol = parse_symbol(&mut us, &mut context).unwrap();
        assert_eq!(&symbol, &None);
        Ok(())
    }

    #[test]
    fn test_end_by_block_end() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("code-block")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let symbol = parse_symbol(&mut us, &mut context).unwrap().unwrap();
        assert_eq!(&symbol, "code-block");
        Ok(())
    }

    #[test]
    fn test_end_by_eof() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("")?;
        us.read();
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let symbol = parse_symbol(&mut us, &mut context).unwrap();
        assert_eq!(&symbol, &None);
        Ok(())
    }
}
