mod attribute;
mod blank_line;
mod block;
mod block_tag;
mod block_tag_header;
mod inline_tag;
mod inline_tag_contents;
mod paragraph;
mod symbol;
mod tag;

use crate::build::step2::Position;
use crate::build::step2::UnitStream;
use std::path::PathBuf;

trait BlockContent {}
type BlockContents = Vec<Box<dyn BlockContent>>;
impl BlockContent for block::Block {}
impl BlockContent for block_tag::BlockTag {}
impl BlockContent for paragraph::Paragraph {}
impl BlockContent for blank_line::BlankLine {}

trait InlineContent {}
type InlineContents = Vec<Box<dyn InlineContent>>;
impl InlineContent for inline_tag::InlineTag {}
impl InlineContent for String {}

#[derive(PartialEq)]
enum ParseResult<S> {
    Parsed(S),
    Mismatched,
    Warning(Box<ErrorInfo>),
    Error(Box<ErrorInfo>),
}

impl<S> ParseResult<S> {
    pub fn warn(filename: PathBuf, position: Option<Position>, message: String) -> ParseResult<S> {
        ParseResult::Warning(Box::new(ErrorInfo {
            filename,
            position,
            message,
        }))
    }

    pub fn error(filename: PathBuf, position: Option<Position>, message: String) -> ParseResult<S> {
        ParseResult::Error(Box::new(ErrorInfo {
            filename,
            position,
            message,
        }))
    }
}

#[derive(PartialEq)]
struct ErrorInfo {
    filename: PathBuf,
    position: Option<Position>,
    message: String,
}

type ParseFunc<S> = fn(&mut UnitStream) -> ParseResult<S>;

/// 指定されたパース関数でパースを試みる。
/// パースの結果が成功以外だったらユニットストリームの状態を元に戻す。
fn try_parse<S>(parse_func: ParseFunc<S>, unit_stream: &mut UnitStream) -> ParseResult<S> {
    let mark = unit_stream.mark();

    let result = parse_func(unit_stream);

    // パース成功でなければ読み込み位置を戻す
    match result {
        ParseResult::Parsed(_) => {}
        _ => {
            unit_stream.reset(mark);
        }
    }

    // インデントチェックが無効にされていても有効に戻す
    unit_stream.set_indent_check_mode(true);

    result
}
