use super::BlockContents;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3;

pub struct Block {
    contents: BlockContents,
}

pub fn parse_block(unit_stream: &mut UnitStream) -> ParseResult<Block> {
    // 開始位置がブロック開始でなければ不適合
    if unit_stream.read() != Unit::BlockBeginning {
        return ParseResult::Mismatched;
    }

    let mut contents = Vec::<Box<dyn BlockContent>>::new();

    loop {
        let next_unit = unit_stream.peek();

        if let Unit::Char { c, position } = next_unit {
            if *c == ':' {
                match step3::try_parse(parse_block_tag, unit_stream) {
                    Ok(block_tag) => {
                        contents.push(block_tag);
                        continue;
                    }
                    Mismatched => {}
                    Error { message } => {
                        return ParseResult::Error { message };
                    }
                }
            }

            if let ParseResult::Ok(paragraph) = step3::try_parse(parse_paragraph, unit_stream) {
                contents.push(paragraph);
                continue;
            }
        }

        match unit_stream.peek() {
            Char { c, position } if *c == ':' => {}
        }
        let block = step3::try_parse(parse_block_tag, unit_stream);

        match step3::try_parse(parse_block, unit_stream) {
            Ok(option) => option.unwrap(),
            _ => {
                panic!("never");
            }
        }
    }

    Block { contents }
}
