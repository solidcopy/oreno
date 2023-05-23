use crate::build::source_code_reader::SourceCodeReader;

const INDENT_SIZE: u64 = 4;

pub struct SourceUnitReader {
    source_code_reader: SourceCodeReader,
    current_status: Marker,
}

impl SourceUnitReader {
    pub fn new(source_code_reader: SourceCodeReader) -> Self {
        SourceUnitReader {
            source_code_reader,
            current_status: Marker::new(),
        }
    }

    pub fn read_unit(&mut self) -> SourceUnit {
        if self.current_status.unit_queue.is_empty() {
            self.queue_units();
        }

        self.current_status.unit_queue.pop().unwrap()
    }

    fn queue_units(&mut self) {
        let status = &mut self.current_status;

        let mut space_count = 0;

        while status.unit_queue.is_empty() {
            let c = self.source_code_reader.read();

            if c.is_none() {
                while status.indent_depth > 0 {
                    status.unit_queue.push(SourceUnit::Unindent);
                    status.indent_depth -= 1;
                }
                status.unit_queue.push(SourceUnit::Eof);
                break;
            }

            let c = c.unwrap();

            match status.reading_mode {
                ReadingMode::Init => match c {
                    b' ' => {
                        space_count = 1;
                        status.reading_mode = ReadingMode::ReadingIndent;
                    }
                    b'\n' => status.unit_queue.push(SourceUnit::NewLine),
                    _ => {
                        while status.indent_depth > 0 {
                            status.unit_queue.push(SourceUnit::Unindent);
                            status.indent_depth -= 1;
                        }
                        status.unit_queue.push(SourceUnit::Char(c));
                        status.reading_mode = ReadingMode::ReadingText;
                    }
                },
                ReadingMode::ReadingIndent => match c {
                    b' ' => space_count += 1,
                    b'\n' => {
                        status.unit_queue.push(SourceUnit::NewLine);
                        status.reading_mode = ReadingMode::Init;
                    }
                    _ => {
                        let indent_depth = space_count / INDENT_SIZE;
                        while indent_depth > status.indent_depth {
                            status.unit_queue.push(SourceUnit::Indent);
                            status.indent_depth += 1;
                        }
                        while indent_depth < status.indent_depth {
                            status.unit_queue.push(SourceUnit::Unindent);
                            status.indent_depth -= 1;
                        }

                        for _ in 0..(space_count % INDENT_SIZE) {
                            status.unit_queue.push(SourceUnit::Char(b' '));
                        }

                        status.unit_queue.push(SourceUnit::Char(c));

                        status.reading_mode = ReadingMode::ReadingText;
                    }
                },
                ReadingMode::ReadingText => match c {
                    b' ' => {
                        space_count = 1;
                        status.reading_mode = ReadingMode::ReadingSpaces;
                    }
                    b'\n' => {
                        status.unit_queue.push(SourceUnit::NewLine);
                        status.reading_mode = ReadingMode::Init;
                    }
                    _ => {
                        status.unit_queue.push(SourceUnit::Char(c));
                    }
                },
                ReadingMode::ReadingSpaces => match c {
                    b' ' => space_count += 1,
                    b'\n' => {
                        status.unit_queue.push(SourceUnit::NewLine);
                        status.reading_mode = ReadingMode::Init;
                    }
                    _ => {
                        for _ in 0..space_count {
                            status.unit_queue.push(SourceUnit::Char(b' '));
                        }
                        status.unit_queue.push(SourceUnit::Char(c));
                        status.reading_mode = ReadingMode::ReadingText;
                    }
                },
            }
        }

        if self.current_status.unit_queue.len() > 1 {
            self.current_status.unit_queue.reverse();
        }
    }

    pub fn mark(&self) -> Marker {
        let mut marker = self.current_status.clone();
        marker.pointer = self.source_code_reader.pointer();
        marker
    }

    pub fn reset(&mut self, marker: Marker) {
        self.current_status = marker;
        self.source_code_reader.seek(self.current_status.pointer);
    }
}

#[derive(Clone)]
enum ReadingMode {
    Init,
    ReadingIndent,
    ReadingText,
    ReadingSpaces,
}

#[derive(Clone, PartialEq, Debug)]
pub enum SourceUnit {
    Char(u8),
    NewLine,
    Indent,
    Unindent,
    Eof,
}

#[derive(Clone)]
pub struct Marker {
    reading_mode: ReadingMode,
    pointer: usize,
    indent_depth: u64,
    unit_queue: Vec<SourceUnit>,
}

impl Marker {
    fn new() -> Marker {
        Marker {
            reading_mode: ReadingMode::Init,
            pointer: 0,
            indent_depth: 0,
            unit_queue: Vec::<SourceUnit>::new(),
        }
    }
}

#[cfg(test)]
mod test {
    use crate::build::source_unit_reader::source_unit;
    use crate::build::source_unit_reader::SourceCodeReader;
    use crate::build::source_unit_reader::SourceUnit;
    use crate::build::source_unit_reader::SourceUnitReader;
    use std::fs;

    #[test]
    fn test_read_unit() {
        let data = fs::read_to_string("resources/test/source_unit_reader/source_1.oreno").unwrap();
        let scr = SourceCodeReader::new(data);
        let mut sur = SourceUnitReader::new(scr);

        let mut source_units = vec![];
        let mut eof = false;
        while !eof {
            let unit = sur.read_unit();
            if let SourceUnit::Eof = unit {
                eof = true;
            }
            source_units.push(unit);
        }
        assert_eq!(sur.read_unit(), SourceUnit::Eof);

        let actual_tokens = source_unit::to_tokens(&source_units);
        let expected_tokens =
            fs::read_to_string("resources/test/source_unit_reader/source_units_1.txt").unwrap();
        assert_eq!(&actual_tokens, &expected_tokens);
    }

    /// 行頭に改行があり、その改行が消費された後
    #[test]
    fn test_mark_1() {
        let data = String::from("\nabc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
    }

    /// 行頭に文字があり、その文字が消費された後
    #[test]
    fn test_mark_2() {
        let data = String::from("\nabc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
    }

    /// 行頭に文字があり、アンインデントが消費された後
    #[test]
    fn test_mark_3() {
        let data = String::from("    x\nabc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        for _ in 0..3 {
            sur.read_unit();
        }
        assert_eq!(sur.read_unit(), SourceUnit::Unindent);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
    }

    /// インデントの読み込み中に改行があり、その改行が消費された後
    #[test]
    fn test_mark_4() {
        let data = String::from("    \nabc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
    }

    /// インデントの読み込み中に文字があり、インデントレベルが変わっていないのでその文字が消費された後
    #[test]
    fn test_mark_5() {
        let data = String::from("    x\n    abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
    }

    /// インデントの読み込み中に文字があり、インデントレベルが上がったのでインデントが消費された後
    #[test]
    fn test_mark_6() {
        let data = String::from("    x\n            abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
    }

    /// インデントの読み込み中に文字があり、インデントレベルが下がったのでアンインデントが消費された後
    #[test]
    fn test_mark_7() {
        let data = String::from("        x\n    abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        assert_eq!(sur.read_unit(), SourceUnit::Unindent);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
    }

    /// テキストの読み込み中に改行があり、その改行が消費された後
    #[test]
    fn test_mark_8() {
        let data = String::from("    x\n    abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
    }

    /// テキストの読み込み中に文字があり、その文字が消費された後
    #[test]
    fn test_mark_9() {
        let data = String::from("    x\n    abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
    }

    /// 文中空白の読み込み中に文字があり、空白が消費された後
    #[test]
    fn test_mark_10() {
        let data = String::from("abc  xyz");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'c'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b' '));
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b' '));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b' '));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
    }

    /// 文中空白の読み込み中に改行があり、その改行が消費された後
    #[test]
    fn test_mark_11() {
        let data = String::from("abc  \nxyz");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'c'));
        assert_eq!(sur.read_unit(), SourceUnit::NewLine);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'x'));
    }

    /// ファイル終端に達してEOFが消費された後
    #[test]
    fn test_mark_12() {
        let data = String::from("abc");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'b'));
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'c'));
        assert_eq!(sur.read_unit(), SourceUnit::Eof);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Eof);
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Eof);
    }

    /// ファイル終端に達してアンインデントが消費された後
    #[test]
    fn test_mark_13() {
        let data = String::from("    a");
        let mut sur = SourceUnitReader::new(SourceCodeReader::new(data));
        assert_eq!(sur.read_unit(), SourceUnit::Indent);
        assert_eq!(sur.read_unit(), SourceUnit::Char(b'a'));
        assert_eq!(sur.read_unit(), SourceUnit::Unindent);
        let mark = sur.mark();
        assert_eq!(sur.read_unit(), SourceUnit::Eof);
        sur.reset(mark);
        assert_eq!(sur.read_unit(), SourceUnit::Eof);
    }
}

#[cfg(test)]
pub mod source_unit {
    use crate::build::source_unit_reader::SourceUnit;

    pub fn to_tokens(source_units: &Vec<SourceUnit>) -> String {
        let mut result = String::new();
        let mut chars = vec![];

        for source_unit in source_units {
            if let SourceUnit::Char(c) = source_unit {
                chars.push(*c);
            } else {
                if !chars.is_empty() {
                    result.push_str("Char:");
                    result.push_str(&String::from_utf8(chars.clone()).unwrap());
                    result.push('\n');
                    chars.clear();
                }

                let token = match source_unit {
                    SourceUnit::NewLine => "NewLine",
                    SourceUnit::Indent => "Indent",
                    SourceUnit::Unindent => "Unindent",
                    SourceUnit::Eof => "Eof",
                    SourceUnit::Char(_) => panic!("never"),
                };

                result.push_str(token);
                result.push('\n');
            }
        }

        if !chars.is_empty() {
            result.push_str("Char:");
            result.push_str(&String::from_utf8(chars.clone()).unwrap());
            result.push('\n');
        }

        result
    }
}
