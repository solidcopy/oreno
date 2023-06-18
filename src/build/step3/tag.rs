use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::parse_attributes;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::symbol;
use crate::build::step3::try_parse;
use crate::build::step3::ParseResult;
use crate::build::step3::Warnings;

/// タグをパースする。
/// タグとはコロンからタグ名の部分まで。
/// パースできたらタグ名を返す。
///
/// 開始位置はコロンである想定。
pub fn parse_tag(unit_stream: &mut UnitStream, warnings: &mut Warnings) -> ParseResult<String> {
    // 開始がコロンか省略記法でなければ不適合
    if let (Unit::Char(c), _) = unit_stream.read() {
        let tag_name_or_none = match c {
            ':' => symbol::parse_symbol(unit_stream, warnings)?,
            '*' => Some("b".to_owned()),
            '/' => Some("i".to_owned()),
            '_' => Some("u".to_owned()),
            '-' => Some("del".to_owned()),
            '"' => Some("q".to_owned()),
            '`' => Some("code".to_owned()),
            '\\' => Some("raw".to_owned()),
            '%' => Some("image".to_owned()),
            '#' => Some("sequence".to_owned()),
            '$' => Some("section".to_owned()),
            '&' => Some("link".to_owned()),
            '@' => Some("apply-template".to_owned()),
            _ => None,
        };

        Ok(tag_name_or_none)
    } else {
        Ok(None)
    }
}

pub fn parse_tag_and_attributes(
    unit_stream: &mut UnitStream,
    warnings: &mut Warnings,
) -> ParseResult<(String, Attributes)> {
    let tag_name = match try_parse(parse_tag, unit_stream, warnings)? {
        Some(tag_name) => tag_name,
        None => return Ok(None),
    };

    let attributes = match try_parse(parse_attributes, unit_stream, warnings)? {
        Some(attributes) => attributes,
        None => Attributes::with_capacity(0),
    };

    Ok(Some((tag_name, attributes)))
}

#[cfg(test)]
mod test_parse_tag {
    use std::error::Error;

    use super::parse_tag;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Warnings;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":mytag{}")?;
        us.read();
        let mut warnings = Warnings::new();
        assert_eq!(
            parse_tag(&mut us, &mut warnings).unwrap(),
            Some("mytag".to_owned())
        );
        Ok(())
    }

    #[test]
    fn test_abbreviation() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("&[a]")?;
        us.read();
        let mut warnings = Warnings::new();
        assert_eq!(
            parse_tag(&mut us, &mut warnings).unwrap(),
            Some("link".to_owned())
        );
        Ok(())
    }

    #[test]
    fn test_mismatched() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("<{}")?;
        us.read();
        let mut warnings = Warnings::new();
        assert_eq!(parse_tag(&mut us, &mut warnings).unwrap(), None);
        Ok(())
    }

    #[test]
    fn test_not_a_char() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\nabc")?;
        us.read();
        let mut warnings = Warnings::new();
        assert_eq!(parse_tag(&mut us, &mut warnings).unwrap(), None);
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_tag_and_attributes {
    use std::error::Error;

    use super::parse_tag_and_attributes;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::Warnings;

    #[test]
    fn test_with_attributes() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":font[gothic]{text}")?;
        us.read();
        let mut warnings = Warnings::new();
        let (tag_name, attributes) = parse_tag_and_attributes(&mut us, &mut warnings)
            .unwrap()
            .unwrap();
        assert_eq!(&tag_name, "font");
        assert_eq!(attributes.len(), 1);
        assert_eq!(attributes[&None].as_str(), "gothic");
        Ok(())
    }

    #[test]
    fn test_without_attributes() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":i{text}")?;
        us.read();
        let mut warnings = Warnings::new();
        let (tag_name, attributes) = parse_tag_and_attributes(&mut us, &mut warnings)
            .unwrap()
            .unwrap();
        assert_eq!(&tag_name, "i");
        assert!(attributes.is_empty());
        Ok(())
    }

    #[test]
    fn test_not_a_tag() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("i{text}")?;
        us.read();
        let mut warnings = Warnings::new();
        let result = parse_tag_and_attributes(&mut us, &mut warnings).unwrap();
        assert_eq!(&result, &None);
        Ok(())
    }
}
