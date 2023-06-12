use super::block_tag::parse_block_tag;
use super::paragraph::parse_paragraph;
use super::BlockContents;
use super::ParseError;
use super::ParseResult;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3;

pub struct Block {
    contents: BlockContents,
}

pub enum BlankLine {
    INSTANCE,
}

pub fn parse_block(unit_stream: &mut UnitStream) -> ParseResult<Block> {
    // 開始位置がブロック開始でなければ不適合
    if unit_stream.peek() != &Unit::BlockBeginning {
        return step3::mismatched();
    }

    let mut contents: BlockContents = vec![];
    let mut all_errors = Vec::<ParseError>::with_capacity(0);

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if *c == ':' {
                    let (block_tag, mut errors) = step3::try_parse(parse_block_tag, unit_stream)?;
                    all_errors.append(&mut errors);
                    if block_tag.is_some() {
                        contents.push(Box::new(block_tag.unwrap()));
                        continue;
                    }
                }

                let (paragraph, mut errors) = step3::try_parse(parse_paragraph, unit_stream)?;
                all_errors.append(&mut errors);
                contents.push(Box::new(paragraph.unwrap()));
            }
            Unit::NewLine => {
                contents.push(Box::new(BlankLine::INSTANCE));
                unit_stream.read();
            }
            Unit::BlockBeginning => {
                if let (Some(block), mut errors) = step3::try_parse(parse_block, unit_stream)? {
                    all_errors.append(&mut errors);
                    contents.push(Box::new(block));
                }
                // ブロック開始があった以上はその後に文字があるので空ではあり得ない
                else {
                    return step3::fatal_error(
                        unit_stream.get_filepath(),
                        unit_stream.read().1,
                        "The block is empty even though there was a block beginning.".to_owned(),
                    );
                }
            }
            Unit::BlockEnd => {
                break;
            }
            Unit::Eof => {
                return step3::fatal_error(
                    unit_stream.get_filepath(),
                    unit_stream.read().1,
                    "Although there is a block beginning, there is no block end.".to_owned(),
                );
            }
        }
    }

    Ok((Some(Block { contents }), all_errors))
}
