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

pub trait BlockContent {}
pub type BlockContents = Vec<Box<dyn BlockContent>>;
impl BlockContent for block::Block {}
impl BlockContent for block_tag::BlockTag {}
impl BlockContent for paragraph::Paragraph {}
impl BlockContent for block::BlankLine {}

pub trait InlineContent {}
pub type InlineContents = Vec<Box<dyn InlineContent>>;
impl InlineContent for inline_tag::InlineTag {}
impl InlineContent for String {}

pub type ParseResult<S> = Result<Option<S>, ParseError>;

#[derive(Debug, PartialEq)]
pub struct ParseError {
    file_position: FilePosition,
    message: String,
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
    warnings: Vec<ParseError>,
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

    let result = parse_func(unit_stream, warnings);

    // インデントチェックが無効にされていても有効に戻す
    unit_stream.set_indent_check_mode(true);

    // 不適合なら読み込み位置を戻す
    // ビルドエラーだと実行されないがビルドを中止するので必要ない
    if let Ok(None) = result {
        unit_stream.reset(mark);
    }

    result
}
