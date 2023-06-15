use std::string::FromUtf8Error;

pub struct CharStream {
    chars: Vec<char>,
    pointer: usize,
    position: Position,
}

impl CharStream {
    pub fn new(binary: Vec<u8>) -> Result<CharStream, FromUtf8Error> {
        let string = String::from_utf8(binary)?;
        let mut chars = string.chars().peekable();
        chars.next_if_eq(&'\u{feff}');

        Ok(CharStream {
            chars: chars.collect(),
            pointer: 0,
            position: Position::new(1, 1),
        })
    }

    pub fn get_position(&self) -> Position {
        self.position.clone()
    }

    pub fn read(&mut self) -> (Option<char>, Position) {
        if self.pointer >= self.chars.len() {
            return (None, self.position.clone());
        }

        let mut c = self.chars[self.pointer];

        self.pointer += 1;

        if c == '\r' {
            // 改行を'\n'に統一する
            c = '\n';
            // 次が\nならその次まで読み込み位置を進める
            if self.chars.get(self.pointer) == Some(&'\n') {
                self.pointer += 1;
            }
        }

        let position = if c == '\n' {
            self.position.next_line()
        } else {
            self.position.next_char()
        };

        (Some(c), position)
    }

    pub fn mark(&self) -> Mark {
        Mark::new(self.pointer, self.position.clone())
    }

    pub fn reset(&mut self, mark: Mark) {
        self.pointer = mark.pointer;
        self.position = mark.position;
    }
}

#[derive(Debug, PartialEq)]
pub struct Mark {
    pointer: usize,
    position: Position,
}

impl Mark {
    fn new(pointer: usize, position: Position) -> Mark {
        Mark { pointer, position }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    pub line_number: u64,
    pub column_number: u64,
}

impl Position {
    pub fn new(line_number: u64, column_number: u64) -> Position {
        Position {
            line_number,
            column_number,
        }
    }

    fn next_char(&mut self) -> Position {
        let result = self.clone();
        self.column_number += 1;
        result
    }

    fn next_line(&mut self) -> Position {
        let result = self.clone();
        self.line_number += 1;
        self.column_number = 1;
        result
    }
}

#[cfg(test)]
mod test {
    use std::error::Error;

    use crate::build::step1::CharStream;
    use crate::build::step1::Mark;
    use crate::build::step1::Position;

    #[test]
    fn test_read() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz\n123".to_vec())?;

        let mut s = String::new();
        let mut p = vec![];

        while let (Some(c), position) = r.read() {
            s.push(c);
            p.push(position);
        }

        assert_eq!("abc\nxyz\n123", s.as_str());
        assert_eq!(
            "1:1,1:2,1:3,1:4,2:1,2:2,2:3,2:4,3:1,3:2,3:3",
            format_positions(&p).as_str()
        );

        Ok(())
    }

    #[test]
    fn test_read_with_bom() -> Result<(), Box<dyn Error>> {
        let binary = Vec::from(&b"\xEF\xBB\xBFabc"[..]);
        let mut r = CharStream::new(binary)?;

        assert_eq!((Some('a'), Position::new(1, 1)), r.read());
        assert_eq!((Some('b'), Position::new(1, 2)), r.read());
        assert_eq!((Some('c'), Position::new(1, 3)), r.read());
        assert_eq!((None, Position::new(1, 4)), r.read());

        Ok(())
    }

    #[test]
    fn test_mark_reset() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz".to_vec())?;

        assert_eq!(Mark::new(0, Position::new(1, 1)), r.mark());
        assert_eq!((Some('a'), Position::new(1, 1)), r.read());
        assert_eq!(Mark::new(1, Position::new(1, 2)), r.mark());

        let mark = r.mark();

        assert_eq!((Some('b'), Position::new(1, 2)), r.read());
        assert_eq!((Some('c'), Position::new(1, 3)), r.read());
        assert_eq!((Some('\n'), Position::new(1, 4)), r.read());
        assert_eq!(Mark::new(5, Position::new(2, 1)), r.mark());

        r.reset(mark);
        assert_eq!((Some('b'), Position::new(1, 2)), r.read());

        Ok(())
    }

    #[test]
    fn test_eof() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"a".to_vec())?;

        assert_eq!((Some('a'), Position::new(1, 1)), r.read());
        assert_eq!((None, Position::new(1, 2)), r.read());
        assert_eq!((None, Position::new(1, 2)), r.read());

        Ok(())
    }

    fn format_positions(positions: &Vec<Position>) -> String {
        let mut s = String::new();
        for position in positions {
            if !s.is_empty() {
                s.push(',');
            }
            s.push_str(format!("{}:{}", position.line_number, position.column_number).as_str());
        }
        s
    }
}
