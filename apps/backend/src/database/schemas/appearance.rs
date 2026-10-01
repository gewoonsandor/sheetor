use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

impl Theme {
    pub fn as_str(self) -> &'static str {
        match self {
            Theme::System => "system",
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    Amber,
    Teal,
    Indigo,
    Violet,
    Rose,
}

impl Accent {
    pub fn as_str(self) -> &'static str {
        match self {
            Accent::Amber => "amber",
            Accent::Teal => "teal",
            Accent::Indigo => "indigo",
            Accent::Violet => "violet",
            Accent::Rose => "rose",
        }
    }
}

/// An unknown theme or accent fails deserialization, so the allowed values
/// live here and nowhere else on the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Appearance {
    pub theme: Theme,
    pub accent: Accent,
    pub paper_score: bool,
}
