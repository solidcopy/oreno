use crate::build::step1::CharStream;
use crate::build::step1::Mark as Step1Mark;
use std::collections::VecDeque;
use std::path::PathBuf;

const INDENT_SIZE: u64 = 4;

#[derive(Clone, PartialEq)]
pub enum Unit {
    Char(char),
    NewLine,
    BlockBeginning,
    BlockEnd,
    Eof,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    line_number: u64,
    column_number: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FilePosition {
    filepath: PathBuf,
    position: Option<Position>,
}

impl Position {
    pub fn new(line_number: u64, column_number: u64) -> Position {
        Position {
            line_number,
            column_number,
        }
    }
}

pub struct UnitStream {
    filepath: PathBuf,
    char_stream: CharStream,
    status: Status,
}

impl UnitStream {
    pub fn new(filepath: PathBuf, char_stream: CharStream) -> Self {
        UnitStream {
            filepath,
            char_stream,
            status: Status::new(),
        }
    }

    pub fn file_position(&mut self) -> FilePosition {
        FilePosition {
            filepath: self.filepath.clone(),
            position: self.position(),
        }
    }

    fn position(&mut self) -> Option<Position> {
        if self.status.unit_queue.is_empty() {
            self.read_line();
        }

        self.status.unit_queue.back().unwrap().1.clone()
    }

    pub fn read(&mut self) -> (Unit, Option<Position>) {
        if self.peek() == Unit::Eof {
            return self.status.unit_queue.back().unwrap().clone();
        }

        self.status.unit_queue.pop_back().unwrap()
    }

    pub fn peek(&mut self) -> Unit {
        if self.status.unit_queue.is_empty() {
            self.read_line();
        }

        self.status.unit_queue.back().unwrap().0.clone()
    }

    fn read_line(&mut self) {
        let line_number = self.status.next_line_number;

        // 冒頭にブロック開始を挿入する
        if line_number == 0 {
            self.move_block_depth(1);

            self.status.next_line_number += 1;

            return;
        }

        let mut column_number = 1;

        // 行頭の空白
        let mut space_count = 0;

        loop {
            if let Some(c) = self.char_stream.read() {
                match c {
                    ' ' => {
                        space_count += 1;
                        column_number += 1;
                    }
                    '\n' => {
                        self.status.unit_queue.push_front((
                            Unit::NewLine,
                            Some(Position::new(line_number, column_number)),
                        ));
                        self.status.next_line_number += 1;
                        return;
                    }
                    _ => {
                        // インデントチェックが有効ならブロックの深さを検出して、
                        // 変わっていたら必要な数のブロック開始/終了をキューに追加する
                        if self.status.indent_check_mode {
                            let block_depth = space_count / INDENT_SIZE + 1;
                            self.move_block_depth(block_depth);

                            column_number = INDENT_SIZE * block_depth + 1;

                            // あまった空白を文字とする
                            for _ in 0..space_count - (block_depth - 1) * INDENT_SIZE {
                                self.status.unit_queue.push_front((
                                    Unit::Char(' '),
                                    Some(Position::new(line_number, column_number)),
                                ));
                                column_number += 1;
                            }
                        }
                        // インデントチェックが無効ならインデント分の空白は文字としてキューに追加する
                        else {
                            column_number = 1;

                            for _ in 0..space_count {
                                self.status.unit_queue.push_front((
                                    Unit::Char(' '),
                                    Some(Position::new(line_number, column_number)),
                                ));
                                column_number += 1;
                            }
                        }

                        self.status.unit_queue.push_front((
                            Unit::Char(c),
                            Some(Position::new(line_number, column_number)),
                        ));
                        column_number += 1;

                        break;
                    }
                }
            } else {
                self.move_block_depth(0);
                self.status
                    .unit_queue
                    .push_front((Unit::Eof, Some(Position::new(line_number, column_number))));
                return;
            }
        }

        // 行末の空白は削除するので、空白はカウントしておいて他の文字が出現したらキューに追加する
        let mut trailing_spaces_count = 0;

        loop {
            if let Some(c) = self.char_stream.read() {
                match c {
                    '\n' => {
                        self.status.unit_queue.push_front((
                            Unit::NewLine,
                            Some(Position::new(line_number, column_number)),
                        ));
                        self.status.next_line_number += 1;
                        break;
                    }
                    ' ' => {
                        trailing_spaces_count += 1;
                    }
                    _ => {
                        for _ in 0..trailing_spaces_count {
                            self.status.unit_queue.push_front((
                                Unit::Char(' '),
                                Some(Position::new(line_number, column_number)),
                            ));
                            column_number += 1;
                        }
                        trailing_spaces_count = 0;

                        self.status.unit_queue.push_front((
                            Unit::Char(c),
                            Some(Position::new(line_number, column_number)),
                        ));
                    }
                }
            } else {
                self.move_block_depth(0);
                self.status
                    .unit_queue
                    .push_front((Unit::Eof, Some(Position::new(line_number, column_number))));
                break;
            }
        }
    }

    fn move_block_depth(&mut self, indent_depth: u64) {
        while self.status.block_depth < indent_depth {
            self.status
                .unit_queue
                .push_front((Unit::BlockBeginning, None));
            self.status.block_depth += 1;
        }
        while self.status.block_depth > indent_depth {
            self.status.unit_queue.push_front((Unit::BlockEnd, None));
            self.status.block_depth -= 1;
        }
    }

    pub fn mark(&self) -> Mark {
        Mark {
            step1_mark: self.char_stream.mark(),
            status: self.status.clone(),
        }
    }

    pub fn reset(&mut self, mark: Mark) {
        self.char_stream.reset(mark.step1_mark);
        self.status = mark.status;
    }

    pub fn set_indent_check_mode(&mut self, indent_check_mode: bool) {
        self.status.indent_check_mode = indent_check_mode;
    }
}

#[derive(Clone)]
pub struct Status {
    unit_queue: VecDeque<(Unit, Option<Position>)>,
    block_depth: u64,
    next_line_number: u64,
    indent_check_mode: bool,
}

impl Status {
    pub fn new() -> Status {
        Status {
            unit_queue: VecDeque::new(),
            block_depth: 0,
            next_line_number: 0,
            indent_check_mode: true,
        }
    }
}

pub struct Mark {
    step1_mark: Step1Mark,
    status: Status,
}

#[cfg(test)]
mod test {
    use crate::build::step1::CharStream;
    use crate::build::step2::source_unit;
    use crate::build::step2::Unit;
    use crate::build::step2::UnitStream;
    use std::error::Error;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn test_read_unit() -> Result<(), Box<dyn Error>> {
        let filepath = PathBuf::from("resources/test/source_unit_reader/source_1.oreno");
        let data = fs::read(&filepath).unwrap();
        let mut us = UnitStream::new(filepath, CharStream::new(data)?);
        let mut units = vec![];
        loop {
            let (unit, _) = us.read();
            let eof = unit == Unit::Eof;
            units.push(unit);
            if eof {
                break;
            }
        }
        let actual_tokens = source_unit::to_tokens(&units);

        let expected_tokens =
            fs::read_to_string("resources/test/source_unit_reader/source_units_1.txt").unwrap();
        assert_eq!(&actual_tokens, &expected_tokens);

        Ok(())
    }
}

#[cfg(test)]
pub mod source_unit {
    use crate::build::step2::Unit;

    pub fn to_tokens(units: &Vec<Unit>) -> String {
        let mut result = String::new();

        let mut chars = vec![];

        for unit in units {
            match unit {
                Unit::Char(c) => {
                    chars.push(*c);
                }
                unit => {
                    if !chars.is_empty() {
                        result.push_str("Char:");
                        for c in chars {
                            result.push(c);
                        }
                        chars = vec![];
                        result.push('\n');
                    }

                    let token = match unit {
                        Unit::NewLine => "NewLine",
                        Unit::BlockBeginning => "Begin",
                        Unit::BlockEnd => "End",
                        Unit::Eof => "Eof",
                        _ => panic!("never"),
                    };
                    result.push_str(token);
                    result.push('\n');
                }
            }
        }

        result
    }
}
