use std::string::FromUtf8Error;

pub struct CharStream {
    chars: Vec<char>,
    pointer: usize,
}

impl CharStream {
    pub fn new(binary: Vec<u8>) -> Result<CharStream, FromUtf8Error> {
        let string = String::from_utf8(binary)?;
        let mut chars = string.chars().peekable();
        chars.next_if_eq(&'\u{feff}');

        Ok(CharStream {
            chars: chars.collect(),
            pointer: 0,
        })
    }

    pub fn read(&mut self) -> Option<char> {
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

        Some(c)
    }

    pub fn mark(&self) -> Mark {
        Mark {
            pointer: self.pointer,
        }
    }

    pub fn reset(&mut self, mark: Mark) {
        self.pointer = mark.pointer;
    }
}

#[derive(Debug, PartialEq)]
pub struct Mark {
    pointer: usize,
}

impl Mark {
    fn new(pointer: usize) -> Mark {
        Mark { pointer }
    }
}

#[cfg(test)]
mod test {
    use std::error::Error;

    use crate::build::step1::CharStream;
    use crate::build::step1::Mark;

    #[test]
    fn test_read() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz\n123".to_vec())?;

        let mut s = String::new();

        while let Some(c) = r.read() {
            s.push(c);
        }

        assert_eq!("abc\nxyz\n123", s.as_str());

        Ok(())
    }

    #[test]
    fn test_read_with_bom() -> Result<(), Box<dyn Error>> {
        let binary = Vec::from(&b"\xEF\xBB\xBFabc"[..]);
        let mut r = CharStream::new(binary)?;

        assert_eq!('a', r.read().unwrap());
        assert_eq!('b', r.read().unwrap());
        assert_eq!('c', r.read().unwrap());

        Ok(())
    }

    #[test]
    fn test_mark_reset() -> Result<(), Box<dyn Error>> {
        let mut r = CharStream::new(b"abc\r\nxyz".to_vec())?;

        assert_eq!(Mark::new(0), r.mark());
        assert_eq!('a', r.read().unwrap());
        assert_eq!(Mark::new(1), r.mark());

        let mark = r.mark();

        assert_eq!('b', r.read().unwrap());
        assert_eq!('c', r.read().unwrap());
        assert_eq!('\n', r.read().unwrap());
        assert_eq!(Mark::new(5), r.mark());

        r.reset(mark);
        assert_eq!('b', r.read().unwrap());

        Ok(())
    }
}
