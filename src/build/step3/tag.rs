use crate::build::step2::Unit;
use crate::build::step2::UnitStream;
use crate::build::step3::attribute::parse_attributes;
use crate::build::step3::attribute::Attributes;
use crate::build::step3::attribute::NamelessAttributeValues;
use crate::build::step3::call_parser;
use crate::build::step3::symbol;
use crate::build::step3::ContentModel;
use crate::build::step3::ParseContext;
use crate::build::step3::ParseResult;

/// タグ名
#[derive(Debug, PartialEq)]
pub struct TagName {
    name: String,
    abbreviation: bool,
}

impl TagName {
    pub fn new(name: String, abbreviation: bool) -> TagName {
        TagName { name, abbreviation }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn abbreviation(&self) -> bool {
        self.abbreviation
    }
}

impl ContentModel for TagName {
    #[cfg(test)]
    fn to_json(&self) -> String {
        format!("\"{}\"", self.name())
    }
}

/// タグをパースする。
/// タグとはコロンからタグ名の部分まで。
/// パースできたらタグ名を返す。
///
/// 開始位置はコロンである想定。
pub fn parse_tag(unit_stream: &mut UnitStream, context: &mut ParseContext) -> ParseResult<TagName> {
    // 開始がコロンか省略記法でなければ不適合
    if let (Unit::Char(c), _) = unit_stream.read() {
        let abbreviated_tag_name = match c {
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

        if let Some(abbreviated_tag_name) = abbreviated_tag_name {
            return Ok(Some(TagName::new(abbreviated_tag_name, true)));
        }

        if c == ':' {
            if let Some(tag_name) = call_parser(symbol::parse_symbol, unit_stream, context)? {
                return Ok(Some(TagName::new(tag_name, false)));
            } else {
                return Ok(Some(TagName::new("".to_owned(), false)));
            }
        } else {
            return Ok(None);
        }
    } else {
        Ok(None)
    }
}

pub fn parse_tag_and_attributes(
    unit_stream: &mut UnitStream,
    context: &mut ParseContext,
) -> ParseResult<(TagName, Attributes, NamelessAttributeValues)> {
    let tag_name = match call_parser(parse_tag, unit_stream, context)? {
        Some(tag_name) => tag_name,
        None => return Ok(None),
    };

    let (attributes, nameless_attribute_values) =
        match call_parser(parse_attributes, unit_stream, context)? {
            Some(x) => x,
            None => (
                Attributes::with_capacity(0),
                NamelessAttributeValues::with_capacity(0),
            ),
        };

    Ok(Some((tag_name, attributes, nameless_attribute_values)))
}

#[cfg(test)]
mod test_parse_tag {
    use std::error::Error;

    use super::parse_tag;
    use super::TagName;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;

    #[test]
    fn test_normal() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":mytag{}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        assert_eq!(
            parse_tag(&mut us, &mut context).unwrap(),
            Some(TagName::new("mytag".to_owned(), false))
        );
        Ok(())
    }

    #[test]
    fn test_abbreviation() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("&[a]")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        assert_eq!(
            parse_tag(&mut us, &mut context).unwrap(),
            Some(TagName::new("link".to_owned(), true))
        );
        Ok(())
    }

    #[test]
    fn test_mismatched() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("<{}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        assert_eq!(parse_tag(&mut us, &mut context).unwrap(), None);
        Ok(())
    }

    #[test]
    fn test_not_a_char() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("\nabc")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        assert_eq!(parse_tag(&mut us, &mut context).unwrap(), None);
        Ok(())
    }
}

#[cfg(test)]
mod test_parse_tag_and_attributes {
    use std::error::Error;

    use super::parse_tag_and_attributes;
    use super::TagName;
    use crate::build::step2::test_utils::unit_stream;
    use crate::build::step3::ParseContext;

    #[test]
    fn test_with_attributes() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":font[gothic]{text}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (tag_name, attributes, values) = parse_tag_and_attributes(&mut us, &mut context)
            .unwrap()
            .unwrap();
        assert_eq!(tag_name, TagName::new("font".to_owned(), false));
        assert_eq!(attributes.len(), 0);
        assert_eq!(values.len(), 1);
        assert_eq!(values[0], "gothic");
        Ok(())
    }

    #[test]
    fn test_without_attributes() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream(":i{text}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let (tag_name, attributes, values) = parse_tag_and_attributes(&mut us, &mut context)
            .unwrap()
            .unwrap();
        assert_eq!(tag_name, TagName::new("i".to_owned(), false));
        assert_eq!(attributes.len(), 0);
        assert_eq!(values.len(), 0);
        Ok(())
    }

    #[test]
    fn test_not_a_tag() -> Result<(), Box<dyn Error>> {
        let mut us = unit_stream("i{text}")?;
        us.read();
        let mut warnings = vec![];
        let mut context = ParseContext::new(&mut warnings);
        let result = parse_tag_and_attributes(&mut us, &mut context).unwrap();
        assert_eq!(&result, &None);
        Ok(())
    }
}
