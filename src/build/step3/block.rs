use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::block_tag::parse_block_tag;
use crate::build::step3::paragraph::parse_paragraph;
use crate::build::step3::try_parse;
use crate::build::step3::BlockContent;
use crate::build::step3::BlockContents;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseError;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

#[cfg(test)]
use crate::build::step3::Reversing;

pub struct Block {
    contents: BlockContents,
}

impl Block {
    pub fn new(contents: BlockContents) -> Block {
        Block { contents }
    }
}

impl ContentModel for Block {
    #[cfg(test)]
    fn reverse(&self, r: &mut Reversing) {
        r.indent();
        for content in &self.contents {
            content.reverse(r);
        }
        r.unindent();
    }
}

impl BlockContent for Block {}

pub enum BlankLine {
    INSTANCE,
}

impl ContentModel for BlankLine {
    #[cfg(test)]
    fn reverse(&self, r: &mut Reversing) {
        r.wrap();
    }
}

impl BlockContent for BlankLine {}

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
    unit_stream.read();

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
                unit_stream.read();
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

#[cfg(test)]
mod test_parse_block {
    use super::parse_block;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Reversing;
    use crate::build::step3::Warnings;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("    block\nabc\nxyz\n\n:tag[a=1]\n    contents\n")?;
        let mut warnings = Warnings::new();
        let block = parse_block(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(block.contents.len(), 4);
        let mut r = Reversing::new();
        for content in &block.contents {
            content.reverse(&mut r);
        }
        assert_eq!(
            r.to_string(),
            "    block\nabc\nxyz\n\n:tag[a=1]\n    contents\n".to_owned()
        );

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    /// 開始がブロック開始でなければ不適合
    #[test]
    fn test_no_block_beginning() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_block(&mut us, &mut warnings).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }

    /// コロンから始まる段落があるがブロックタグではない
    #[test]
    fn test_not_block_tag() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":tag_[a=1]\n    contents\n")?;
        let mut warnings = Warnings::new();
        let block = parse_block(&mut us, &mut warnings).unwrap().unwrap();

        assert_eq!(block.contents.len(), 2);
        let mut r = Reversing::new();
        for content in &block.contents {
            content.reverse(&mut r);
        }
        assert_eq!(r.to_string(), ":tag_[a=1]\n    contents\n".to_owned());

        assert_eq!(warnings.warnings.len(), 2);
        assert_eq!(
            warnings.warnings[0].message,
            "There is an illegal character. '_'"
        );
        assert_eq!(warnings.warnings[1].message, "There is no tag's contents.");

        Ok(())
    }

    /// 要素がなければ不適合
    #[test]
    fn test_empty() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("")?;
        let mut warnings = Warnings::new();
        let result = parse_block(&mut us, &mut warnings).unwrap();

        assert!(result.is_none());

        assert_eq!(warnings.warnings.len(), 0);

        Ok(())
    }
}
