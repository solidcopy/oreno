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
        format!("\"{}\"", self.replace("\n", "\\n"))
    }
}

impl InlineContent for String {}

pub type ParseResult<S> = Result<Option<S>, ParseError>;

#[derive(Debug, PartialEq)]
pub struct ParseError {
    pub file_position: FilePosition,
    pub message: String,
}

impl ParseError {
    pub fn new(file_position: FilePosition, message: String) -> ParseError {
        ParseError {
            file_position,
            message,
        }
    }
}

pub struct Warnings {
    pub warnings: Vec<ParseError>,
}

impl Warnings {
    pub fn new() -> Warnings {
        Warnings {
            warnings: Vec::with_capacity(0),
        }
    }

    pub fn push(&mut self, file_position: FilePosition, message: String) {
        self.warnings.push(ParseError::new(file_position, message));
    }
}

type ParseFunc<S> = fn(&mut UnitStream, &mut Warnings) -> ParseResult<S>;

/// 指定されたパース関数でパースを試みる。
/// パースの結果が成功以外だったらユニットストリームの状態を元に戻す。
fn try_parse<S>(
    parse_func: ParseFunc<S>,
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<S> {
    let mark = unit_stream.mark();
    let indent_check_mode = unit_stream.get_indent_check_mode();

    let result = parse_func(unit_stream, warnings);

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
            "!error!".to_owned(),
        );

        assert_eq!(&subject.file_position.filepath, &PathBuf::from("a/b.c"));
        assert_eq!(
            &subject.file_position.position,
            &Some(Position::new(10, 21))
        );
        assert_eq!(&subject.message, "!error!");
    }

    #[test]
    fn test_new_without_position() {
        let subject = ParseError::new(
            FilePosition {
                filepath: PathBuf::from("a/b.c"),
                position: None,
            },
            "!error!".to_owned(),
        );

        assert_eq!(&subject.file_position.filepath, &PathBuf::from("a/b.c"));
        assert_eq!(&subject.file_position.position, &None);
        assert_eq!(&subject.message, "!error!");
    }
}

#[cfg(test)]
mod test_warnings {
    use std::path::PathBuf;

    use super::Warnings;
    use crate::build::step1::Position;
    use crate::build::step2::FilePosition;

    #[test]
    fn test_new() {
        let subject = Warnings::new();
        assert!(subject.warnings.is_empty());
    }

    #[test]
    fn test_push() {
        let mut subject = Warnings::new();
        subject.push(
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

    use super::try_parse;
    use super::ParseError;
    use super::ParseResult;
    use super::Warnings;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step2::UnitStream;

    #[test]
    fn test_parsed() -> Result<(), Box<dyn Error>> {
        let mut unit_stream = unit_stream("abc\nxyz\n123")?;
        for _ in 0..5 {
            unit_stream.read();
        }
        let mut warnings = Warnings::new();

        let result = try_parse(parse_success, &mut unit_stream, &mut warnings);

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
        let mut warnings = Warnings::new();

        let result = try_parse(parse_mismatched, &mut unit_stream, &mut warnings);

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
        let mut warnings = Warnings::new();

        let result = try_parse(parse_error, &mut unit_stream, &mut warnings);

        assert!(result.is_err());

        Ok(())
    }

    fn parse_success(unit_stream: &mut UnitStream, _: &mut Warnings) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        Ok(Some("xxx".to_owned()))
    }

    fn parse_mismatched(
        unit_stream: &mut UnitStream,
        warnings: &mut Warnings,
    ) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        warnings.push(unit_stream.file_position(), "!warn!".to_owned());
        Ok(None)
    }

    fn parse_error(unit_stream: &mut UnitStream, warnings: &mut Warnings) -> ParseResult<String> {
        for _ in 0..4 {
            unit_stream.read();
        }
        Err(ParseError::new(
            unit_stream.file_position(),
            "!fatalerror!".to_owned(),
        ))
    }
}

#[cfg(test)]
pub mod test_utils {
    use super::ContentModel;
    use serde_json::{from_str, Value};

    /// モデルをJSONに変換して期待値と一致するか検証する。
    pub fn assert_model<T: ContentModel + ?Sized>(a: &T, b: &str) {
        let x = from_str::<Value>(&a.to_json()).unwrap();
        let y = from_str::<Value>(b).unwrap();
        assert_eq!(x, y);
    }
}
