use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::block_tag::parse_block_tag;
use crate::build::step3::paragraph::parse_paragraph;
use crate::build::step3::try_parse;
use crate::build::step3::BlockContents;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

pub struct Block {
    contents: BlockContents,
}

impl Block {
    pub fn new(contents: BlockContents) -> Block {
        Block { contents }
    }
}

pub enum BlankLine {
    INSTANCE,
}

pub fn parse_block(unit_stream: &mut UnitStream, warnings: &mut Warnings) -> ParseResult<Block> {
    abstract_parse_block(unit_stream, warnings, true)
}

pub fn parse_raw_block(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<Block> {
    abstract_parse_block(unit_stream, warnings, false)
}

fn abstract_parse_block(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
    parse_tags: bool,
) -> ParseResult<Block> {
    // 開始位置がブロック開始でなければ不適合
    if unit_stream.peek() != Unit::BlockBeginning {
        return Ok(None);
    }

    let mut contents: BlockContents = vec![];

    loop {
        match unit_stream.peek() {
            Unit::Char(c) => {
                if parse_tags && c == ':' {
                    if let Some(block_tag) = try_parse(parse_block_tag, unit_stream, warnings)? {
                        contents.push(Box::new(block_tag));
                        continue;
                    }
                }

                // 開始位置に文字がある以上は段落のパースは成功する
                let paragraph = try_parse(parse_paragraph, unit_stream, warnings)?.unwrap();
                contents.push(Box::new(paragraph));
            }
            Unit::NewLine => {
                contents.push(Box::new(BlankLine::INSTANCE));
                unit_stream.read();
            }
            Unit::BlockBeginning => {
                // ブロック開始があった以上はその後に文字があるので空ではあり得ない
                let block = try_parse(parse_block, unit_stream, warnings)?.unwrap();
                contents.push(Box::new(block));
            }
            Unit::BlockEnd => {
                break;
            }
            Unit::Eof => {
                return Err(ParseError::new(
                    unit_stream.file_position(),
                    "Although there is a block beginning, there is no block end.".to_owned(),
                ));
            }
        }
    }

    if !contents.is_empty() {
        Ok(Some(Block { contents }))
    } else {
        Ok(None)
    }
}
