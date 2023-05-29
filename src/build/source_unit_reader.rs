use crate::build::source_code_reader::SourceCodeReader;
use std::ops::Range;

const INDENT_SIZE: u64 = 4;

pub fn read_units(sur: &mut SourceCodeReader) -> Vec<SourceUnit> {
    let mut units = vec![];

    let mut reading_mode = ReadingMode::Init;
    let mut current_indent_depth = 0;
    let mut space_count = 0;
    let mut string_beginning = 0;
    let mut spaces_beginning = 0;

    loop {
        let c = sur.read();

        if c.is_none() {
            while current_indent_depth > 0 {
                units.push(SourceUnit::Unindent);
                current_indent_depth -= 1;
            }
            units.push(SourceUnit::Eof);
            break;
        }

        let c = c.unwrap();

        match reading_mode {
            ReadingMode::Init => match c {
                b' ' => {
                    space_count = 1;
                    reading_mode = ReadingMode::ReadingIndent;
                }
                b'\n' => units.push(SourceUnit::NewLine),
                _ => {
                    while current_indent_depth > 0 {
                        units.push(SourceUnit::Unindent);
                        current_indent_depth -= 1;
                    }
                    string_beginning = sur.pointer() - 1;
                    reading_mode = ReadingMode::ReadingText;
                }
            },
            ReadingMode::ReadingIndent => match c {
                b' ' => space_count += 1,
                b'\n' => {
                    units.push(SourceUnit::NewLine);
                    reading_mode = ReadingMode::Init;
                }
                _ => {
                    let indent_depth = space_count / INDENT_SIZE;
                    while indent_depth > current_indent_depth {
                        units.push(SourceUnit::Indent);
                        current_indent_depth += 1;
                    }
                    while indent_depth < current_indent_depth {
                        units.push(SourceUnit::Unindent);
                        current_indent_depth -= 1;
                    }

                    string_beginning = sur.pointer() - 1 - (space_count % INDENT_SIZE) as usize;

                    reading_mode = ReadingMode::ReadingText;
                }
            },
            ReadingMode::ReadingText => match c {
                b' ' => {
                    spaces_beginning = sur.pointer() - 1;
                    reading_mode = ReadingMode::ReadingSpaces;
                }
                b'\n' => {
                    units.push(SourceUnit::Char(string_beginning..sur.pointer() - 1));
                    units.push(SourceUnit::NewLine);
                    reading_mode = ReadingMode::Init;
                }
                _ => {}
            },
            ReadingMode::ReadingSpaces => match c {
                b' ' => {}
                b'\n' => {
                    units.push(SourceUnit::Char(string_beginning..spaces_beginning));
                    units.push(SourceUnit::NewLine);
                    reading_mode = ReadingMode::Init;
                }
                _ => {
                    reading_mode = ReadingMode::ReadingText;
                }
            },
        }
    }

    units
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
    Char(Range<usize>),
    NewLine,
    Indent,
    Unindent,
    Eof,
}

#[cfg(test)]
mod test {
    use crate::build::source_unit_reader::read_units;
    use crate::build::source_unit_reader::source_unit;
    use crate::build::source_unit_reader::SourceCodeReader;
    use std::fs;

    #[test]
    fn test_read_unit() {
        let data = fs::read_to_string("resources/test/source_unit_reader/source_1.oreno").unwrap();
        let mut scr = SourceCodeReader::new(&data);
        let source_units = read_units(&mut scr);

        let actual_tokens = source_unit::to_tokens(&data, &source_units);
        let expected_tokens =
            fs::read_to_string("resources/test/source_unit_reader/source_units_1.txt").unwrap();
        assert_eq!(&actual_tokens, &expected_tokens);
    }
}

#[cfg(test)]
pub mod source_unit {
    use crate::build::source_unit_reader::SourceUnit;

    pub fn to_tokens(source_code: &str, source_units: &Vec<SourceUnit>) -> String {
        let mut result = String::new();

        for source_unit in source_units {
            if let SourceUnit::Char(range) = source_unit {
                result.push_str("Char:");
                result.push_str(&source_code[range.start..range.end]);
            } else {
                let token = match source_unit {
                    SourceUnit::NewLine => "NewLine",
                    SourceUnit::Indent => "Indent",
                    SourceUnit::Unindent => "Unindent",
                    SourceUnit::Eof => "Eof",
                    SourceUnit::Char(_) => panic!("never"),
                };

                result.push_str(token);
            }
            result.push('\n');
        }

        result
    }
}
