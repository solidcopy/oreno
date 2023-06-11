mod attribute;
mod blank_line;
mod block;
mod block_tag;
mod block_tag_header;
mod inline_tag;
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
impl BlockContent for block::BlankLine {}

trait InlineContent {}
type InlineContents = Vec<Box<dyn InlineContent>>;
impl InlineContent for inline_tag::InlineTag {}
impl InlineContent for String {}

type ParseResult<S> = Result<(Option<S>, Vec<ParseError>), ParseError>;

#[derive(Debug, PartialEq)]
struct ParseError {
    filename: PathBuf,
    position: Option<Position>,
    message: String,
}

impl ParseError {
    pub fn new(filename: PathBuf, position: Option<Position>, message: String) -> ParseError {
        ParseError {
            filename,
            position,
            message,
        }
    }
}

type ParseFunc<S> = fn(&mut UnitStream) -> ParseResult<S>;

/// 指定されたパース関数でパースを試みる。
/// パースの結果が成功以外だったらユニットストリームの状態を元に戻す。
fn try_parse<S>(parse_func: ParseFunc<S>, unit_stream: &mut UnitStream) -> ParseResult<S> {
    let mark = unit_stream.mark();

    let result = parse_func(unit_stream);

    // インデントチェックが無効にされていても有効に戻す
    unit_stream.set_indent_check_mode(true);

    // 不適合なら読み込み位置を戻す
    // ビルドエラーだと実行されないがビルドを中止するので必要ない
    if let Ok((None, _)) = result {
        unit_stream.reset(mark);
    }

    result
}

fn parsed<S>(model: S) -> ParseResult<S> {
    Ok((Some(model), Vec::with_capacity(0)))
}

fn mismatched<S>() -> ParseResult<S> {
    Ok((None, Vec::with_capacity(0)))
}

fn error<S>(filename: PathBuf, position: Option<Position>, message: String) -> ParseResult<S> {
    let error = ParseError {
        filename,
        position,
        message,
    };
    Ok((None, vec![error]))
}

fn fatal_error<S>(
    filename: PathBuf,
    position: Option<Position>,
    message: String,
) -> ParseResult<S> {
    let error = ParseError {
        filename,
        position,
        message,
    };
    Err(error)
}
