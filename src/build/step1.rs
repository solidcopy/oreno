use std::string::FromUtf8Error;

pub struct CharStream {
    chars: Vec<char>,
    pointer: usize,
    current_position: Position,
}

impl CharStream {
    pub fn new(binary: Vec<u8>) -> Result<CharStream, FromUtf8Error> {
        let string = String::from_utf8(binary)?;
        let mut chars = string.chars().peekable();
        chars.next_if_eq(&'\u{feff}');

        Ok(CharStream {
            chars: chars.collect(),
            pointer: 0,
            current_position: Position::new(1, 1),
        })
    }

    pub fn read(&mut self) -> Option<Char> {
        if self.pointer >= self.chars.len() {
            return None;
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

        let position = self.current_position.clone();
        if c == '\n' {
            self.current_position.line_number += 1;
            self.current_position.column_number = 1;
        } else {
            self.current_position.column_number += 1;
        }

        Some(Char {
            character: c,
            position,
        })
    }

    pub fn mark(&self) -> Mark {
        Mark {
            pointer: self.pointer,
            position: self.current_position.clone(),
        }
    }

    pub fn reset(&mut self, mark: Mark) {
        self.pointer = mark.pointer;
        self.current_position = mark.position;
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Char {
    pub character: char,
    pub position: Position,
}

impl Char {
    pub fn new(character: char, position: Position) -> Char {
        Char {
            character,
            position,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Mark {
    pointer: usize,
    position: Position,
}

impl Mark {
    pub fn new(pointer: usize, position: Position) -> Mark {
        Mark { pointer, position }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    line_number: u64,
    column_number: u64,
}

impl Position {
    pub fn new(line_number: u64, column_number: u64) -> Position {
        Position {
            line_number,
            column_number,
        }
    }
}

#[cfg(test)]
mod test {
    use std::error::Error;

    use crate::build::step1::Char;
    use crate::build::step1::CharStream;
    use crate::build::step1::Mark;
    use crate::build::step1::Position;

    #[test]
    fn test_read() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz\n123".to_vec())?;

        let mut s = String::new();
        let mut positions = Vec::<(u64, u64)>::new();

        while let Some(c) = r.read() {
            s.push(c.character);
            positions.push((c.position.line_number, c.position.column_number));
        }

        assert_eq!("abc\nxyz\n123", s.as_str());
        assert_eq!(
            vec![
                (1, 1),
                (1, 2),
                (1, 3),
                (1, 4),
                (2, 1),
                (2, 2),
                (2, 3),
                (2, 4),
                (3, 1),
                (3, 2),
                (3, 3)
            ],
            positions
        );

        Ok(())
    }

    #[test]
    fn test_read_with_bom() -> Result<(), Box<dyn Error>> {
        let binary = Vec::from(&b"\xEF\xBB\xBFabc"[..]);
        let mut r = CharStream::new(binary)?;

        assert_eq!(Char::new('a', Position::new(1, 1)), r.read().unwrap());
        assert_eq!(Char::new('b', Position::new(1, 2)), r.read().unwrap());
        assert_eq!(Char::new('c', Position::new(1, 3)), r.read().unwrap());

        Ok(())
    }

    #[test]
    fn test_mark_reset() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz".to_vec())?;

        assert_eq!(Mark::new(0, Position::new(1, 1)), r.mark());
        assert_eq!(Char::new('a', Position::new(1, 1)), r.read().unwrap());
        assert_eq!(Mark::new(1, Position::new(1, 2)), r.mark());

        let mark = r.mark();

        assert_eq!(Char::new('b', Position::new(1, 2)), r.read().unwrap());
        assert_eq!(Char::new('c', Position::new(1, 3)), r.read().unwrap());
        assert_eq!(Char::new('\n', Position::new(1, 4)), r.read().unwrap());
        assert_eq!(Mark::new(5, Position::new(2, 1)), r.mark());

        r.reset(mark);
        assert_eq!(Char::new('b', Position::new(1, 2)), r.read().unwrap());

        Ok(())
    }
}
