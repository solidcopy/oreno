pub struct SourceCodeReader {
    pub source_code: Vec<u8>,
    pub pointer: usize,
}

impl SourceCodeReader {
    pub fn new(s: Vec<u8>) -> Self {
        SourceCodeReader {
            source_code: s,
            pointer: 0,
        }
    }

    pub fn read(&mut self) -> Option<u8> {
        if self.pointer < self.source_code.len() {
            let result = Some(self.source_code[self.pointer]);
            self.pointer += 1;
            return result;
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
        let mut r = SourceCodeReader::new("abc".into());
        assert_eq!(Some(b'a'), r.read());
        assert_eq!(Some(b'b'), r.read());
        assert_eq!(Some(b'c'), r.read());
        assert_eq!(None, r.read());
    }

    #[test]
    fn test_pointer() {
        let mut r = SourceCodeReader::new("abc".into());
        assert_eq!(0, r.pointer());
        r.read();
        assert_eq!(1, r.pointer());
    }

    #[test]
    fn test_seek() {
        let mut r = SourceCodeReader::new("abc".into());
        r.seek(2);
        assert_eq!(2, r.pointer());
        assert_eq!(Some(b'c'), r.read());
    }
}
