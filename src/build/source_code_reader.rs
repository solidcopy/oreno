pub struct SourceCodeReader<'a> {
    pub source_code: &'a str,
    pub pointer: usize,
}

const BOM: &[u8] = b"\xEF\xBB\xBF";

impl<'a> SourceCodeReader<'a> {
    pub fn new(s: &'a str) -> Self {
        let pointer = if s.len() >= BOM.len() && s[0..3].as_bytes() == BOM {
            BOM.len()
        } else {
            0
        };
        SourceCodeReader {
            source_code: s,
            pointer,
        }
    }

    pub fn read(&mut self) -> Option<u8> {
        if let Some(result) = self.source_code.as_bytes().get(self.pointer) {
            self.pointer += 1;
            if *result == b'\r' {
                if self.source_code.as_bytes().get(self.pointer) == Some(&b'\n') {
                    self.pointer += 1;
                }
                return Some(b'\n');
            }
            return Some(*result);
        } else {
            return None;
        }
    }

    pub fn pointer(&self) -> usize {
        self.pointer
    }

    pub fn seek(&mut self, pointer: usize) {
        self.pointer = pointer;
    }
}

#[cfg(test)]
mod test {
    use crate::build::source_code_reader::SourceCodeReader;

    #[test]
    fn test_read() {
        let mut r = SourceCodeReader::new("abc\r\nxyz\n123".into());
        assert_eq!(Some(b'a'), r.read());
        assert_eq!(Some(b'b'), r.read());
        assert_eq!(Some(b'c'), r.read());
        assert_eq!(Some(b'\n'), r.read());
        assert_eq!(Some(b'x'), r.read());
        assert_eq!(Some(b'y'), r.read());
        assert_eq!(Some(b'z'), r.read());
        assert_eq!(Some(b'\n'), r.read());
        assert_eq!(Some(b'1'), r.read());
        assert_eq!(Some(b'2'), r.read());
        assert_eq!(Some(b'3'), r.read());
        assert_eq!(None, r.read());
    }

    #[test]
    fn test_read_with_bom() {
        let s = String::from_utf8(Vec::from(&b"\xEF\xBB\xBFabc"[..])).unwrap();
        let mut r = SourceCodeReader::new(&s);

        assert_eq!(Some(b'a'), r.read());
        assert_eq!(Some(b'b'), r.read());
        assert_eq!(Some(b'c'), r.read());
    }

    #[test]
    fn test_pointer() {
        let mut r = SourceCodeReader::new("abc\r\nxyz".into());
        assert_eq!(0, r.pointer());
        r.read();
        assert_eq!(1, r.pointer());
        r.read();
        r.read();
        r.read();
        assert_eq!(5, r.pointer());
    }

    #[test]
    fn test_seek() {
        let mut r = SourceCodeReader::new("abc".into());
        r.seek(2);
        assert_eq!(2, r.pointer());
        assert_eq!(Some(b'c'), r.read());
    }
}
