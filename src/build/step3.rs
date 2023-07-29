mod attribute;
mod block;
mod block_tag;
mod block_tag_header;
mod inline_tag;
mod paragraph;
mod symbol;
mod tag;

use crate::build::step2::FilePosition;
use crate::build::step2::UnitStream;

pub trait ContentModel {
    #[cfg(test)]
    fn to_json(&self) -> String;
}

pub trait BlockContent: ContentModel {}
pub type BlockContents = Vec<Box<dyn BlockContent>>;

pub trait InlineContent: ContentModel + core::fmt::Debug {}
pub type InlineContents = Vec<Box<dyn InlineContent>>;

impl ContentModel for String {
    #[cfg(test)]
    fn to_json(&self) -> String {
        format!("\"{}\"", self.replace("\n", "\\n").replace("\"", "\\\""))
    }
}

impl InlineContent for String {}

pub type ParseResult<S> = Result<Option<S>, ParseError>;

#[derive(Debug, PartialEq)]
pub struct ParseError {
    pub file_position: FilePosition,
    pub parser_name: Option<String>,
    pub message: String,
}

impl ParseError {
    pub fn new(
        file_position: FilePosition,
        parser_name: Option<String>,
        message: String,
    ) -> ParseError {
        ParseError {
            file_position,
            parser_name,
            message,
        }
    }

    pub fn parser_name(&self) -> Option<String> {
        self.parser_name.clone()
    }
}

pub struct ParseContext<'a> {
    pub warnings: &'a mut Vec<ParseError>,
    save_warnings: bool,
    parser_name: Option<String>,
    parse_tags: bool,
}

impl<'a> ParseContext<'a> {
    pub fn new(warnings: &'a mut Vec<ParseError>) -> ParseContext<'a> {
        ParseContext {
            warnings,
            save_warnings: true,
            parser_name: None,
            parse_tags: true,
        }
    }

    pub fn parser_name(&self) -> Option<String> {
        self.parser_name.clone()
    }

    pub fn is_parse_tags(&self) -> bool {
        self.parse_tags
    }

    pub fn warn(&mut self, file_position: FilePosition, message: String) {
        if self.save_warnings {
            self.warnings
                .push(ParseError::new(file_position, self.parser_name(), message));
        }
    }

    pub fn change_warn_mode(&mut self, save_warnings: bool) -> ParseContext {
        ParseContext {
            warnings: self.warnings,
            save_warnings,
            parser_name: self.parser_name.clone(),
            parse_tags: self.parse_tags,
        }
    }

    pub fn change_parser_name(&mut self, parser_name: Option<String>) -> ParseContext {
        ParseContext {
            warnings: self.warnings,
            save_warnings: self.save_warnings,
            parser_name: parser_name,
            parse_tags: self.parse_tags,
        }
    }

    pub fn change_parse_mode(&mut self, parse_tags: bool) -> ParseContext {
        ParseContext {
            warnings: self.warnings,
            save_warnings: self.save_warnings,
            parser_name: self.parser_name.clone(),
            parse_tags,
        }
    }
}

type ParseFunc<S> = fn(&mut UnitStream, &mut ParseContext) -> ParseResult<S>;

/// 指定されたパース関数でパースを試みる。
/// パースの結果が成功以外だったらユニットストリームの状態を元に戻す。
fn call_parser<S>(
    parse_func: ParseFunc<S>,
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<S> {
    let mark = unit_stream.mark();
    let indent_check_mode = unit_stream.get_indent_check_mode();

    let result = parse_func(unit_stream, context);

    // インデントチェックモードは正否にかかわらず元に戻す
    unit_stream.set_indent_check_mode(indent_check_mode);

    // 不適合なら読み込み位置を戻す
    // ビルドエラーだと実行されないがビルドを中止するので必要ない
    if let Ok(None) = result {
        unit_stream.reset(mark);
    }

    result
}

#[cfg(test)]
mod test_parse_error {
    use std::path::PathBuf;

    use crate::build::step1::Position;
    use crate::build::step2::FilePosition;

    use super::ParseError;

    #[test]
    fn test_new_with_position() {
        let subject = ParseError::new(
            FilePosition {
                filepath: PathBuf::from("a/b.c"),
                position: Some(Position::new(10, 21)),
            },
            Some("some".to_owned()),
            "!error!".to_owned(),
        );

        assert_eq!(&subject.file_position.filepath, &PathBuf::from("a/b.c"));
        assert_eq!(
            &subject.file_position.position,
            &Some(Position::new(10, 21))
        );
        assert_eq!(&subject.parser_name, &Some("some".to_owned()));
        assert_eq!(&subject.message, "!error!");
    }

    #[test]
    fn test_new_without_position() {
        let subject = ParseError::new(
            FilePosition {
                filepath: PathBuf::from("a/b.c"),
                position: None,
            },
            Some("some".to_owned()),
            "!error!".to_owned(),
        );

        assert_eq!(&subject.file_position.filepath, &PathBuf::from("a/b.c"));
        assert_eq!(&subject.file_position.position, &None);
        assert_eq!(&subject.parser_name, &Some("some".to_owned()));
        assert_eq!(&subject.message, "!error!");
    }
}

#[cfg(test)]
mod test_parse_context {
    use std::path::PathBuf;

    use super::ParseContext;
    use crate::build::step1::Position;
    use crate::build::step2::FilePosition;

    #[test]
    fn test_new() {
        let mut warnings = vec![];
        let subject = ParseContext::new(&mut warnings);
        assert!(subject.warnings.is_empty());
    }

    #[test]
    fn test_push() {
        let mut warnings = vec![];
        let mut subject = ParseContext::new(&mut warnings);
        subject.warn(
            FilePosition {
                filepath: PathBuf::from("a/b.c"),
                position: Some(Position::new(10, 21)),
            },
            "!error!".to_owned(),
        );

        assert_eq!(subject.warnings.len(), 1);
        let error = &subject.warnings[0];
        assert_eq!(&error.file_position.filepath, &PathBuf::from("a/b.c"));
        assert_eq!(&error.file_position.position, &Some(Position::new(10, 21)));
        assert_eq!(&error.message, "!error!");
    }
}

#[cfg(test)]
mod test_try_parse {
    use std::error::Error;

    use super::call_parser;
    use super::ParseContext;
    use super::ParseError;
    use super::ParseResult;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step2::UnitStream;

    #[test]
    fn test_parsed() -> Result<(), Box<dyn Error>> {
        let mut unit_stream = unit_stream("abc\nxyz\n123")?;
        for _ in 0..5 {
            unit_stream.read();
        }
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);

        let result = call_parser(parse_success, &mut unit_stream, &mut context);

        assert!(result.is_ok());
        assert_eq!(&result.unwrap().unwrap(), "xxx");
        assert_eq!(
            &unit_stream.file_position().position,
            &Some(Position::new(3, 1))
        );

        Ok(())
    }

    #[test]
    fn test_mismatched() -> Result<(), Box<dyn Error>> {
        let mut unit_stream = unit_stream("abc\nxyz\n123")?;
        for _ in 0..5 {
            unit_stream.read();
        }
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);

        let result = call_parser(parse_mismatched, &mut unit_stream, &mut context);

        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
        assert_eq!(
            &unit_stream.file_position().position,
            &Some(Position::new(2, 1))
        );

        Ok(())
    }

    #[test]
    fn test_error() -> Result<(), Box<dyn Error>> {
        let mut unit_stream = unit_stream("abc\nxyz\n123")?;
        for _ in 0..5 {
            unit_stream.read();
        }
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);

        let result = call_parser(parse_error, &mut unit_stream, &mut context);

        assert!(result.is_err());

        Ok(())
    }

    fn parse_success(unit_stream: &mut UnitStream, _: &mut ParseContext) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        Ok(Some("xxx".to_owned()))
    }

    fn parse_mismatched(
        unit_stream: &mut UnitStream,
        context: &mut ParseContext,
    ) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        context.warn(unit_stream.file_position(), "!warn!".to_owned());
        Ok(None)
    }

    fn parse_error(
        unit_stream: &mut UnitStream,
        context: &mut ParseContext,
    ) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        Err(ParseError::new(
            unit_stream.file_position(),
            Some("some".to_owned()),
            "!fatalerror!".to_owned(),
        ))
    }
}

#[cfg(test)]
pub mod test_utils {
    use super::ContentModel;
    use super::ParseContext;
    use super::ParseError;
    use super::ParseFunc;
    use super::ParseResult;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step2::Unit;
    use serde_json::{from_str, Value};

    pub fn test_parser<S>(
        parser: ParseFunc<S>,
        source: &str,
    ) -> (ParseResult<S>, Position, Vec<ParseError>) {
        let mut us = unit_stream(source).unwrap();
        // 最初のブロック開始を読み捨てる
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);

        let mut parse_tags = true;

        if us.peek() == Unit::Char('!') {
            us.read();
            loop {
                match us.read().0 {
                    Unit::Char('r') => parse_tags = false,
                    Unit::Char('i') => us.set_indent_check_mode(false),
                    Unit::Char('!') => break,
                    _ => panic!(),
                }
            }
        }

        let result = parser(&mut us, &mut context.change_parse_mode(parse_tags));

        let position = us.char_stream_position();

        (result, position, warnings)
    }

    /// モデルをJSONに変換して期待値と一致するか検証する。
    pub fn assert_model<T: ContentModel + ?Sized>(a: &T, b: &str) {
        let x = from_str::<Value>(&a.to_json()).unwrap();
        let y = from_str::<Value>(b).unwrap();
        assert_eq!(x, y);
    }
}
