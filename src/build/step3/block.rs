use crate::build::step2::Mark;
use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::block_tag::parse_block_tag;
use crate::build::step3::paragraph::parse_paragraph;
use crate::build::step3::paragraph::parse_raw_paragraph;
use crate::build::step3::try_parse;
use crate::build::step3::BlockContent;
use crate::build::step3::BlockContents;
use crate::build::step3::ContentModel;
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

impl ContentModel for Block {
    #[cfg(test)]
    fn to_json(&self) -> String {
        let mut contents = String::new();

        let mut first = true;
        for content in &self.contents {
            if !first {
                contents.push(',');
            }
            first = false;

            contents.push_str(content.to_json().as_str());
        }

        format!("{{\"b\":[{}]}}", &contents)
    }
}

impl BlockContent for Block {}

pub enum BlankLine {
    INSTANCE,
}

impl ContentModel for BlankLine {
    #[cfg(test)]
    fn to_json(&self) -> String {
        "\"<bl>\"".to_owned()
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

    let mut blank_lines_beginning: Option<Mark> = None;
    let mut blank_line_count = 0;

    loop {
        if blank_lines_beginning.is_some() {
            match unit_stream.peek() {
                Unit::Char(_) | Unit::BlockBeginning => {
                    for _ in 0..blank_line_count {
                        contents.push(Box::new(BlankLine::INSTANCE));
                    }
                    blank_lines_beginning = None;
                    blank_line_count = 0;
                }
                _ => {}
            }
        }

        match unit_stream.peek() {
            Unit::Char(c) => {
                if c == ':' && parse_tags {
                    if let Some(block_tag) = try_parse(parse_block_tag, unit_stream, warnings)? {
                        contents.push(Box::new(block_tag));
                        continue;
                    }
                }

                // 開始位置に文字がある以上は段落のパースは成功する
                let paragraph_parser = if parse_tags {
                    parse_paragraph
                } else {
                    parse_raw_paragraph
                };
                let paragraph = try_parse(paragraph_parser, unit_stream, warnings)?.unwrap();
                contents.push(Box::new(paragraph));
            }
            Unit::NewLine => {
                if blank_lines_beginning.is_none() {
                    blank_lines_beginning = Some(unit_stream.mark());
                }
                blank_line_count += 1;

                unit_stream.read();
            }
            Unit::BlockBeginning => {
                // ブロック開始があった以上はその後に文字があるので空ではあり得ない
                let block_parser = if parse_tags {
                    parse_block
                } else {
                    parse_raw_block
                };
                let block = try_parse(block_parser, unit_stream, warnings)?.unwrap();
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
        if let Some(mark) = blank_lines_beginning {
            unit_stream.reset(mark);
        }
        Ok(Some(Block { contents }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod test_parse_block {
    use super::parse_block;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::test_utils::assert_model;
    use crate::build::step3::Warnings;
    use indoc::indoc;
    use std::error::Error;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(indoc! {"
                block
            abc
            xyz
            
            :tag[a=1]
                contents
                
                
            "})?;
        let mut warnings = Warnings::new();
        let block = parse_block(&mut us, &mut warnings).unwrap().unwrap();

        assert_model(
            &block,
            r#"{
                "b":[
                    {"b":[{"p":["block\n"]}]},
                    {"p":["abc\nxyz\n"]},
                    "<bl>",
                    {
                        "bt":"tag",
                        "a":{"a":"1"},"h":null,
                        "c":{"b":[{"p":["contents\n"]}]}
                    }
                ]
            }"#,
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
        let mut us = unit_stream(indoc! {"
            :tag_[a=1]
                contents
        "})?;
        let mut warnings = Warnings::new();
        let block = parse_block(&mut us, &mut warnings).unwrap().unwrap();

        assert_model(
            &block,
            r#"{"b":[
                {"p":[":tag_[a=1]\n"]},
                {"b":[{"p":["contents\n"]}]}
            ]}"#,
        );

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
