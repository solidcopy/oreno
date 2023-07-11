use crate::build::step1::CharStream;
use crate::build::step1::Mark as Step1Mark;
use crate::build::step1::Position;
use std::path::PathBuf;

pub const INDENT_SIZE: u64 = 4;

#[derive(Clone, Debug, PartialEq)]
pub enum Unit {
    Char(char),
    NewLine,
    BlockBeginning,
    BlockEnd,
    Eof,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FilePosition {
    pub filepath: PathBuf,
    pub position: Option<Position>,
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
        let mark = self.mark();
        let (_, position) = self.read();
        self.reset(mark);
        position
    }

    pub fn read(&mut self) -> (Unit, Option<Position>) {
        match self.status.reading_mode {
            ReadingMode::HeadOfLine => {
                if self.status.indent_check_mode {
                    match self.scan_indent_depth() {
                        Some(indent_depth) => {
                            self.status.indent_depth = indent_depth;
                            self.status.reading_mode = ReadingMode::UpdatingBlockDepth;
                            self.read()
                        }
                        None => {
                            self.status.reading_mode = ReadingMode::ReadingText;
                            self.read()
                        }
                    }
                } else {
                    self.status.reading_mode = ReadingMode::ReadingText;
                    self.read()
                }
            }
            ReadingMode::UpdatingBlockDepth => {
                if self.status.indent_depth > self.status.block_depth {
                    self.status.block_depth += 1;
                    (Unit::BlockBeginning, None)
                } else if self.status.indent_depth < self.status.block_depth {
                    self.status.block_depth -= 1;
                    (Unit::BlockEnd, None)
                } else if self.status.block_depth == 0 {
                    self.status.reading_mode = ReadingMode::Eof;
                    self.read()
                } else {
                    self.status.reading_mode = ReadingMode::ReadingText;
                    self.read()
                }
            }
            ReadingMode::ReadingText => {
                let (c, position) = self.char_stream.read();
                if let Some(c) = c {
                    match c {
                        ' ' => {
                            let mark = self.char_stream.mark();

                            loop {
                                match self.char_stream.read() {
                                    (Some(' '), _) => {}
                                    (Some('\n'), position) => {
                                        self.status.reading_mode = ReadingMode::HeadOfLine;
                                        return (Unit::NewLine, Some(position));
                                    }
                                    (None, _) => {
                                        // 再実行でEOFが読み込まれるのでEOFモードになる
                                        return self.read();
                                    }
                                    (Some(_), position) => {
                                        self.char_stream.reset(mark);
                                        return (Unit::Char(' '), Some(position));
                                    }
                                }
                            }
                        }
                        '\n' => {
                            self.status.reading_mode = ReadingMode::HeadOfLine;
                            (Unit::NewLine, Some(position))
                        }
                        _ => (Unit::Char(c), Some(position)),
                    }
                } else {
                    if self.status.indent_check_mode {
                        self.status.indent_depth = 0;
                        self.status.reading_mode = ReadingMode::UpdatingBlockDepth;
                    } else {
                        self.status.reading_mode = ReadingMode::Eof;
                    }
                    self.read()
                }
            }
            ReadingMode::Eof => (Unit::Eof, Some(self.char_stream.get_position())),
        }
    }

    pub fn peek(&mut self) -> Unit {
        let mark = self.mark();
        let (unit, _) = self.read();
        self.reset(mark);
        unit
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

    pub fn get_indent_check_mode(&self) -> bool {
        self.status.indent_check_mode
    }

    pub fn set_indent_check_mode(&mut self, indent_check_mode: bool) {
        self.status.indent_check_mode = indent_check_mode;
    }

    fn scan_indent_depth(&mut self) -> Option<u64> {
        let mut result = 1;

        'l: loop {
            let indent_mark = self.char_stream.mark();
            for _ in 0..INDENT_SIZE {
                let mark = self.char_stream.mark();
                let (c, _) = self.char_stream.read();
                match c {
                    Some(' ') => {}
                    // 空白しかない行ならインデント深度なし
                    Some('\n') => {
                        self.char_stream.reset(mark);
                        return None;
                    }
                    None => {
                        self.char_stream.reset(mark);
                        return Some(0);
                    }
                    _ => {
                        self.char_stream.reset(indent_mark);
                        break 'l;
                    }
                }
            }
            result += 1;
        }

        Some(result)
    }

    #[cfg(test)]
    pub fn char_stream_position(&self) -> Position {
        self.char_stream.get_position()
    }
}

#[derive(Clone)]
pub struct Status {
    reading_mode: ReadingMode,
    block_depth: u64,
    indent_depth: u64,
    indent_check_mode: bool,
}

impl Status {
    pub fn new() -> Status {
        Status {
            reading_mode: ReadingMode::HeadOfLine,
            block_depth: 0,
            indent_depth: 0,
            indent_check_mode: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum ReadingMode {
    HeadOfLine,
    UpdatingBlockDepth,
    ReadingText,
    Eof,
}

pub struct Mark {
    step1_mark: Step1Mark,
    status: Status,
}

#[cfg(test)]
mod test {
    use crate::build::step1::CharStream;
    use crate::build::step1::Position;
    use crate::build::step2::test_utils;
    use crate::build::step2::test_utils::unit_stream;
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
        let actual_tokens = test_utils::to_tokens(&units);

        let expected_tokens =
            fs::read_to_string("resources/test/source_unit_reader/source_units_1.txt").unwrap();
        assert_eq!(&actual_tokens, &expected_tokens);

        Ok(())
    }

    #[test]
    fn test_mark_reset() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("abc\n    xyz\n123")?;
        assert_eq!(&us.read().1, &None); // block beginning
        assert_eq!(&us.read().1, &Some(Position::new(1, 1)));
        assert_eq!(&us.read().1, &Some(Position::new(1, 2)));
        assert_eq!(&us.read().1, &Some(Position::new(1, 3)));
        assert_eq!(&us.read().1, &Some(Position::new(1, 4)));
        assert_eq!(&us.read().1, &None); // block beginning
        assert_eq!(&us.read().1, &Some(Position::new(2, 5)));
        let mark = us.mark();
        assert_eq!(&us.read().1, &Some(Position::new(2, 6)));
        assert_eq!(&us.read().1, &Some(Position::new(2, 7)));
        assert_eq!(&us.read().1, &Some(Position::new(2, 8)));
        assert_eq!(&us.read().1, &None); // block end
        assert_eq!(&us.read().1, &Some(Position::new(3, 1)));
        assert_eq!(&us.read().1, &Some(Position::new(3, 2)));
        us.reset(mark);
        assert_eq!(&us.read().1, &Some(Position::new(2, 6)));
        assert_eq!(&us.read().1, &Some(Position::new(2, 7)));

        Ok(())
    }
}

#[cfg(test)]
pub mod test_utils {
    use std::error::Error;
    use std::path::PathBuf;

    use super::Unit;
    use super::UnitStream;
    use crate::build::step1::CharStream;

    pub fn unit_stream(data: &str) -> Result<UnitStream, Box<dyn Error>> {
        let char_stream = CharStream::new(data.as_bytes().to_vec())?;
        let unit_stream = UnitStream::new(PathBuf::from("a/b.c"), char_stream);
        Ok(unit_stream)
    }

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
