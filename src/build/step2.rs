use crate::build::step1::Char as Step1Char;
use crate::build::step1::CharStream;
use crate::build::step1::Mark as Step1Mark;
use std::collections::VecDeque;

const INDENT_SIZE: u64 = 4;

#[derive(Clone, PartialEq)]
pub enum Unit {
    Char(Step1Char),
    NewLine,
    Indent,
    UnIndent,
    Eof,
}

pub struct UnitStream {
    char_stream: CharStream,
    status: Status,
}

impl UnitStream {
    pub fn new(char_stream: CharStream) -> UnitStream {
        UnitStream {
            char_stream,
            status: Status::new(),
        }
    }

    pub fn read(&mut self) -> Unit {
        if self.status.unit_queue.is_empty() {
            self.read_line();
        }
        self.status
            .unit_queue
            .pop_back()
            .or(Some(Unit::Eof))
            .unwrap()
    }

    fn read_line(&mut self) {
        // 行頭の空白
        let mut spaces = vec![];
        loop {
            match self.char_stream.read() {
                Some(c) if c.character == ' ' => {
                    spaces.push(c);
                }
                Some(c) if c.character == '\n' => {
                    self.status.unit_queue.push_front(Unit::NewLine);
                    return;
                }
                None => {
                    self.move_indent_depth(0);
                    self.status.unit_queue.push_front(Unit::Eof);
                    return;
                }
                Some(c) => {
                    let indent_depth = spaces.len() as u64 / INDENT_SIZE;
                    self.move_indent_depth(indent_depth);

                    // あまった空白を文字とする
                    for space in spaces
                        .into_iter()
                        .skip((indent_depth * INDENT_SIZE) as usize)
                    {
                        self.status.unit_queue.push_front(Unit::Char(space));
                    }

                    self.status.unit_queue.push_front(Unit::Char(c));

                    break;
                }
            }
        }

        // 行末の空白は削除するので、空白はこのVecに保存しておいて他の文字が出現したらキューに追加する
        let mut trailing_spaces = Vec::<Step1Char>::with_capacity(1);

        loop {
            match self.char_stream.read() {
                Some(c) if c.character == '\n' => {
                    self.status.unit_queue.push_front(Unit::NewLine);
                    break;
                }
                Some(c) if c.character == ' ' => {
                    trailing_spaces.push(c);
                }
                Some(c) => {
                    for space in trailing_spaces.into_iter() {
                        self.status.unit_queue.push_front(Unit::Char(space));
                    }
                    self.status.unit_queue.push_front(Unit::Char(c));
                    trailing_spaces = Vec::<Step1Char>::with_capacity(1);
                }
                None => {
                    self.move_indent_depth(0);
                    self.status.unit_queue.push_front(Unit::Eof);
                    break;
                }
            }
        }
    }

    pub fn mark(&self) -> Mark {
        Mark {
            step2_mark: self.char_stream.mark(),
            status: self.status.clone(),
        }
    }

    pub fn reset(&mut self, mark: Mark) {
        self.char_stream.reset(mark.step2_mark);
        self.status = mark.status;
    }

    fn move_indent_depth(&mut self, indent_depth: u64) {
        while self.status.indent_depth < indent_depth {
            self.status.unit_queue.push_front(Unit::Indent);
            self.status.indent_depth += 1;
        }
        while self.status.indent_depth > indent_depth {
            self.status.unit_queue.push_front(Unit::UnIndent);
            self.status.indent_depth -= 1;
        }
    }
}

#[derive(Clone)]
pub struct Status {
    unit_queue: VecDeque<Unit>,
    indent_depth: u64,
}

impl Status {
    pub fn new() -> Status {
        Status {
            unit_queue: VecDeque::new(),
            indent_depth: 0,
        }
    }
}

pub struct Mark {
    step2_mark: Step1Mark,
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

    #[test]
    fn test_read_unit() -> Result<(), Box<dyn Error>> {
        let data = fs::read("resources/test/source_unit_reader/source_1.oreno").unwrap();
        let mut us = UnitStream::new(CharStream::new(data)?);
        let mut units = vec![];
        loop {
            let unit = us.read();
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
                    chars.push(c.character);
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
                        Unit::Indent => "Indent",
                        Unit::UnIndent => "UnIndent",
                        Unit::Eof => "Eof",
                        Unit::Char(_) => panic!("never"),
                    };
                    result.push_str(token);
                    result.push('\n');
                }
            }
        }

        result
    }
}
