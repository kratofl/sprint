// Resolves a layout's color palette and theme presets. Port of `packages/dashboard/src/palette.ts`
// (itself ported from the desktop client's `DashPalette.cs` / `DashThemePresets.cs`).
//
// The dash is hardware output, not app UI: it owns its palette and does not follow the app's
// design tokens. Change these values only as a deliberate dash change — they are what the
// wheel screen shows.
//
// Unlike the TypeScript, colors here are parsed values (`Rgba`), not CSS strings: hex is parsed
// once at the boundary (theme overrides), so nothing on the draw path handles strings. Each
// color remembers how the TypeScript would have written it (`CssForm`), because `dimColor` and
// `withAlpha` read the string themselves, differently from CSS (see `dim_color`).

use serde_json::{Map, Value};

use crate::model::{ColorSystem, DashLayout, DashTheme};

/// How the TypeScript writes a color as a string. CSS paints every form the same way, but
/// `dimColor`/`withAlpha` parse the string by hand: 8-digit hex alpha-first (`#AARRGGBB`, where
/// CSS reads `#RRGGBBAA`), and anything that is not 3, 6 or 8 hex digits throws.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CssForm {
    /// `#rgb` or `#rrggbb`: opaque, read the same by CSS and by `dimColor`.
    Hex,
    /// `#rgba`: CSS reads it; `dimColor`/`withAlpha` throw.
    Hex4,
    /// `#rrggbbaa` as CSS reads it, which `dimColor`/`withAlpha` read as `#aarrggbb`.
    Hex8,
    /// An `rgba(...)` string (`withAlpha`'s output); `dimColor`/`withAlpha` throw.
    Function,
}

/// An 8-bit straight-alpha color, as CSS resolves one, and the form its string had.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
    pub form: CssForm,
}

impl Rgba {
    pub const TRANSPARENT: Rgba = Rgba { r: 0, g: 0, b: 0, a: 0, form: CssForm::Function };
    pub const BLACK: Rgba = Rgba::rgb(0, 0, 0);

    pub const fn rgb(r: u8, g: u8, b: u8) -> Rgba {
        Rgba { r, g, b, a: 255, form: CssForm::Hex }
    }

    /// A compile-time `#rrggbb` literal. Only for the constants below; theme input goes
    /// through `parse_css_hex`, which rejects instead of panicking.
    pub const fn hex(literal: &str) -> Rgba {
        let bytes = literal.as_bytes();
        assert!(bytes.len() == 7 && bytes[0] == b'#', "expected #rrggbb");
        Rgba::rgb(hex_byte(bytes[1], bytes[2]), hex_byte(bytes[3], bytes[4]), hex_byte(bytes[5], bytes[6]))
    }
}

const fn hex_digit(digit: u8) -> u8 {
    match digit {
        b'0'..=b'9' => digit - b'0',
        b'a'..=b'f' => digit - b'a' + 10,
        b'A'..=b'F' => digit - b'A' + 10,
        _ => panic!("not a hex digit"),
    }
}

const fn hex_byte(high: u8, low: u8) -> u8 {
    hex_digit(high) * 16 + hex_digit(low)
}

/// Parses a CSS hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), the way the browser reads a
/// theme override the TypeScript passes straight to CSS. `None` for anything else.
pub fn parse_css_hex(value: &str) -> Option<Rgba> {
    let digits = value.trim().strip_prefix('#')?;
    if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let nibble = |i: usize| hex_digit(digits.as_bytes()[i]);
    let pair = |i: usize| nibble(i) * 16 + nibble(i + 1);
    match digits.len() {
        3 => Some(Rgba::rgb(nibble(0) * 17, nibble(1) * 17, nibble(2) * 17)),
        4 => Some(Rgba { r: nibble(0) * 17, g: nibble(1) * 17, b: nibble(2) * 17, a: nibble(3) * 17, form: CssForm::Hex4 }),
        6 => Some(Rgba::rgb(pair(0), pair(2), pair(4))),
        8 => Some(Rgba { r: pair(0), g: pair(2), b: pair(4), a: pair(6), form: CssForm::Hex8 }),
        _ => None,
    }
}

/// The resolved on-wheel color set for a dash. Focal values stay neutral and orange is kept for
/// warnings, apart from race-control yellow; the driver's colour theme (`themed_palette`)
/// recolours the scale's cold and good. The canvas remains a near-black surface.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DashPaletteColors {
    pub background: Rgba,
    /// Bar track / container.
    pub surface: Rgba,
    /// Wheel-instrument outline.
    pub border: Rgba,
    /// Large values.
    pub foreground: Rgba,
    /// Secondary text.
    pub secondary: Rgba,
    /// Labels.
    pub muted: Rgba,
    /// Functional focal value.
    pub primary: Rgba,
    /// Comparison/system.
    pub accent: Rgba,
    pub success: Rgba,
    /// Attention required.
    pub warning: Rgba,
    pub danger: Rgba,
    pub race_control_yellow: Rgba,
    pub rpm_normal: Rgba,
    pub rpm_near_limit: Rgba,
    pub rpm_shift: Rgba,
    pub neutral: Rgba,
    pub good_on_target: Rgba,
    pub cold_low: Rgba,
    pub assist_active: Rgba,
    pub critical: Rgba,
    pub fault: Rgba,
    pub timing_fastest_overall: Rgba,
    pub timing_personal_best: Rgba,
    /// Each driver-adjustable setting's identity color (`dash_setting_colors` unless the theme
    /// overrides it): its knob widget's label and its change popup wear it.
    pub setting_tc: Rgba,
    pub setting_abs: Rgba,
    pub setting_brake_bias: Rgba,
    pub setting_engine_map: Rgba,
    pub setting_migration: Rgba,
    pub setting_arb: Rgba,
}

/// The raw on-wheel colors every palette slot and theme preset is built from (`dashColor`).
pub mod dash_color {
    pub const BACKGROUND: &str = "#08080A";
    pub const SURFACE: &str = "#1B1B1E";
    // A solid mid-grey, not a translucent white: USB wheel panels wash out near-black, and a
    // faint hairline disappears on them entirely.
    pub const BORDER: &str = "#3F3F46";
    pub const TEXT: &str = "#F5F5F7";
    pub const TEXT2: &str = "#A1A1AA";
    pub const TEXT3: &str = "#6F6F78";
    pub const ORANGE: &str = "#FF6A00";
    pub const GREEN: &str = "#16B566";
    pub const RED: &str = "#F02744";
    pub const YELLOW: &str = "#E0A30C";
    pub const BLUE: &str = "#1F7FE6";
    pub const PURPLE: &str = "#A06BFF";
    pub const SUZUKI_PRIMARY: &str = "#7C3AED";
    pub const SUZUKI_ACCENT: &str = "#B15CFF";
    pub const MONO_PRIMARY: &str = "#F6F6F6";
    pub const MONO_ACCENT: &str = "#7A7A7A";
}

/// Each driver-adjustable setting's default identity color (`dashSettingColors`). A knob widget
/// carries it in its frame and its change popup fills the screen with it. Identity, not a
/// condition: it never colors a value at rest. A theme may override each (`settingTc`, ...).
pub mod dash_setting_colors {
    use super::{Rgba, dash_color};
    /// TC, TC 2 and TC slip.
    pub const TC: Rgba = Rgba::hex(dash_color::BLUE);
    pub const ABS: Rgba = Rgba::hex(dash_color::YELLOW);
    pub const BRAKE_BIAS: Rgba = Rgba::hex(dash_color::YELLOW);
    pub const ENGINE_MAP: Rgba = Rgba::hex(dash_color::GREEN);
    pub const MIGRATION: Rgba = Rgba::hex(dash_color::RED);
    /// Both anti-roll bars.
    pub const ARB: Rgba = Rgba::hex(dash_color::ORANGE);
}

/// A racing class's colour on the dash, as the app's class tags wear it (`views/CarBadges.css`:
/// Hypercar red, LMP2 blue, LMP3 purple, GT3 green, GTE orange), from the class in any spelling
/// LMU uses (`CarNames.ClassOf` in Core); `None` for a class it does not know. The relative's
/// stripe wears it.
pub fn class_color(car_class: &str) -> Option<Rgba> {
    let upper = car_class.to_ascii_uppercase();
    let spelled = upper.split([' ', '-', '_']).filter(|part| !part.is_empty()).collect::<Vec<_>>().join("_");
    let hex = match spelled.as_str() {
        "HYPER" | "HYPERCAR" | "LMH" | "LMDH" | "GTP" => dash_color::RED,
        "LMP2" | "LMP2_ELMS" => dash_color::BLUE,
        "LMP3" => dash_color::PURPLE,
        "GT3" | "LMGT3" => dash_color::GREEN,
        "GTE" | "LMGTE" | "GTE_AM" | "GTE_PRO" => dash_color::ORANGE,
        _ => return None,
    };
    Some(Rgba::hex(hex))
}

pub const DEFAULT_DASH_PALETTE: DashPaletteColors = {
    use dash_color as c;
    DashPaletteColors {
        background: Rgba::hex(c::BACKGROUND),
        surface: Rgba::hex(c::SURFACE),
        border: Rgba::hex(c::BORDER),
        foreground: Rgba::hex(c::TEXT),
        secondary: Rgba::hex(c::TEXT2),
        muted: Rgba::hex(c::TEXT3),
        primary: Rgba::hex(c::TEXT),
        accent: Rgba::hex(c::BLUE),
        success: Rgba::hex(c::GREEN),
        warning: Rgba::hex(c::ORANGE),
        danger: Rgba::hex(c::RED),
        race_control_yellow: Rgba::hex(c::YELLOW),
        rpm_normal: Rgba::hex(c::GREEN),
        rpm_near_limit: Rgba::hex(c::RED),
        rpm_shift: Rgba::hex(c::BLUE),
        neutral: Rgba::hex(c::TEXT),
        good_on_target: Rgba::hex(c::GREEN),
        cold_low: Rgba::hex(c::BLUE),
        assist_active: Rgba::hex(c::BLUE),
        critical: Rgba::hex(c::RED),
        fault: Rgba::hex(c::RED),
        timing_fastest_overall: Rgba::hex(c::PURPLE),
        timing_personal_best: Rgba::hex(c::GREEN),
        setting_tc: dash_setting_colors::TC,
        setting_abs: dash_setting_colors::ABS,
        setting_brake_bias: dash_setting_colors::BRAKE_BIAS,
        setting_engine_map: dash_setting_colors::ENGINE_MAP,
        setting_migration: dash_setting_colors::MIGRATION,
        setting_arb: dash_setting_colors::ARB,
    }
};

const THEME_KEYS: [&str; 22] = [
    "neutral",
    "goodOnTarget",
    "coldLow",
    "assistActive",
    "critical",
    "fault",
    "timingFastestOverall",
    "timingPersonalBest",
    "primary",
    "accent",
    "foreground",
    "surface",
    "border",
    "success",
    "warning",
    "danger",
    "settingTc",
    "settingAbs",
    "settingBrakeBias",
    "settingEngineMap",
    "settingMigration",
    "settingArb",
];

fn theme_value<'a>(theme: &'a DashTheme, key: &str) -> Option<&'a str> {
    theme.get(key).map(String::as_str).filter(|value| !value.is_empty())
}

fn is_theme_empty(theme: Option<&DashTheme>) -> bool {
    theme.is_none_or(|t| THEME_KEYS.iter().all(|key| theme_value(t, key).is_none()))
}

/// A theme override is only honored when it parses as a hex color; anything else inherits.
fn hex(theme: &DashTheme, key: &str) -> Option<Rgba> {
    theme_value(theme, key).and_then(parse_css_hex)
}

/// Resolves a layout theme into a concrete palette: the default palette with each supplied hex
/// override applied. Styled themes recolor the optical RPM endpoints while protected safety
/// states (critical/fault/danger) stay functional regardless of the theme.
pub fn resolve_dash_palette(theme: Option<&DashTheme>, color_system: ColorSystem) -> DashPaletteColors {
    let d = DEFAULT_DASH_PALETTE;
    let t = match theme {
        Some(t) if color_system == ColorSystem::Styled && !is_theme_empty(Some(t)) => t,
        _ => return d,
    };
    DashPaletteColors {
        primary: hex(t, "primary").unwrap_or(d.primary),
        accent: hex(t, "accent").unwrap_or(d.accent),
        foreground: hex(t, "foreground").unwrap_or(d.foreground),
        surface: hex(t, "surface").unwrap_or(d.surface),
        border: hex(t, "border").unwrap_or(d.border),
        success: hex(t, "success").unwrap_or(d.success),
        warning: hex(t, "warning").unwrap_or(d.warning),
        danger: d.critical,
        rpm_normal: hex(t, "primary").unwrap_or(d.rpm_normal),
        rpm_near_limit: d.critical,
        rpm_shift: hex(t, "accent").unwrap_or(d.rpm_shift),
        neutral: hex(t, "neutral").or_else(|| hex(t, "foreground")).unwrap_or(d.neutral),
        good_on_target: hex(t, "goodOnTarget").or_else(|| hex(t, "success")).unwrap_or(d.good_on_target),
        cold_low: hex(t, "coldLow").or_else(|| hex(t, "accent")).unwrap_or(d.cold_low),
        assist_active: hex(t, "assistActive").or_else(|| hex(t, "accent")).unwrap_or(d.assist_active),
        critical: d.critical,
        fault: d.fault,
        timing_fastest_overall: hex(t, "timingFastestOverall").unwrap_or(d.timing_fastest_overall),
        timing_personal_best: hex(t, "timingPersonalBest").or_else(|| hex(t, "success")).unwrap_or(d.timing_personal_best),
        setting_tc: hex(t, "settingTc").unwrap_or(d.setting_tc),
        setting_abs: hex(t, "settingAbs").unwrap_or(d.setting_abs),
        setting_brake_bias: hex(t, "settingBrakeBias").unwrap_or(d.setting_brake_bias),
        setting_engine_map: hex(t, "settingEngineMap").unwrap_or(d.setting_engine_map),
        setting_migration: hex(t, "settingMigration").unwrap_or(d.setting_migration),
        setting_arb: hex(t, "settingArb").unwrap_or(d.setting_arb),
        ..d
    }
}

/// Sprint's colour themes (Settings › Colours, `ColourTheme` in Core): each sets the scale's cold
/// and good colours. Warm stays amber and hot red; timing and knob colours are the same in all.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ColourTheme {
    /// Cold blue, good green.
    #[default]
    Sprint,
    /// Cold grey, good in the plain text colour: colour only when something is off.
    Calm,
    /// Cold red, good green: outside the window is red.
    Strict,
}

impl ColourTheme {
    /// The host's name for it; anything else, or nothing, is Sprint.
    pub fn parse(name: Option<&str>) -> ColourTheme {
        match name {
            Some("Calm") => ColourTheme::Calm,
            Some("Strict") => ColourTheme::Strict,
            _ => ColourTheme::Sprint,
        }
    }
}

/// Where values change colour (`ColourLimits` in Core), °C and percent; the host has checked their
/// ranges and order. Tyres against the compound's ideal: cold more than `tyre_cold_below` under it,
/// warm and hot more than `tyre_warm_above` and `tyre_hot_above` over it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ColourLimits {
    pub tyre_cold_below: f64,
    pub tyre_warm_above: f64,
    pub tyre_hot_above: f64,
    pub brake_cold_below: f64,
    pub brake_warm_above: f64,
    pub brake_hot_above: f64,
    /// Tread left, percent.
    pub wear_low_below: f64,
    pub wear_critical_below: f64,
    /// A fuel, battery or virtual-energy bar's level, percent.
    pub energy_low_below: f64,
    pub energy_critical_below: f64,
}

impl Default for ColourLimits {
    fn default() -> Self {
        ColourLimits {
            tyre_cold_below: 10.0,
            tyre_warm_above: 10.0,
            tyre_hot_above: 20.0,
            brake_cold_below: 300.0,
            brake_warm_above: 650.0,
            brake_hot_above: 800.0,
            wear_low_below: 60.0,
            wear_critical_below: 30.0,
            energy_low_below: 50.0,
            energy_critical_below: 20.0,
        }
    }
}

impl ColourLimits {
    /// The host's `limits` object; a missing or non-numeric field keeps its default.
    pub fn parse(raw: Option<&Map<String, Value>>) -> ColourLimits {
        let d = ColourLimits::default();
        let Some(raw) = raw else { return d };
        let num = |key: &str, fallback: f64| raw.get(key).and_then(Value::as_f64).filter(|v| v.is_finite()).unwrap_or(fallback);
        ColourLimits {
            tyre_cold_below: num("tyreColdBelow", d.tyre_cold_below),
            tyre_warm_above: num("tyreWarmAbove", d.tyre_warm_above),
            tyre_hot_above: num("tyreHotAbove", d.tyre_hot_above),
            brake_cold_below: num("brakeColdBelow", d.brake_cold_below),
            brake_warm_above: num("brakeWarmAbove", d.brake_warm_above),
            brake_hot_above: num("brakeHotAbove", d.brake_hot_above),
            wear_low_below: num("wearLowBelow", d.wear_low_below),
            wear_critical_below: num("wearCriticalBelow", d.wear_critical_below),
            energy_low_below: num("energyLowBelow", d.energy_low_below),
            energy_critical_below: num("energyCriticalBelow", d.energy_critical_below),
        }
    }
}

/// The app-wide colours a scene's settings carry (`colours`): the theme and the limits.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Colours {
    pub theme: ColourTheme,
    pub limits: ColourLimits,
}

impl Colours {
    /// The host's `colours` object; absent is Sprint's theme with the default limits.
    pub fn parse(raw: Option<&Value>) -> Colours {
        let raw = raw.and_then(Value::as_object);
        Colours {
            theme: ColourTheme::parse(raw.and_then(|r| r.get("theme")).and_then(Value::as_str)),
            limits: ColourLimits::parse(raw.and_then(|r| r.get("limits")).and_then(Value::as_object)),
        }
    }
}

/// The dash palette in the driver's colour theme: the default with the scale's cold and good recoloured.
pub fn themed_palette(theme: ColourTheme) -> DashPaletteColors {
    let d = DEFAULT_DASH_PALETTE;
    match theme {
        ColourTheme::Sprint => d,
        ColourTheme::Calm => DashPaletteColors { cold_low: d.secondary, good_on_target: d.foreground, ..d },
        ColourTheme::Strict => DashPaletteColors { cold_low: d.critical, ..d },
    }
}

/// Where a temperature sits on the colour scale.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Heat {
    Cold,
    Good,
    Warm,
    Hot,
}

impl Heat {
    /// The scale's colour for it in `palette`.
    pub fn color(self, palette: &DashPaletteColors) -> Rgba {
        match self {
            Heat::Cold => palette.cold_low,
            Heat::Good => palette.good_on_target,
            Heat::Warm => palette.warning,
            Heat::Hot => palette.critical,
        }
    }
}

/// The ideal tyre temperature assumed when the game names none for the compound, °C.
pub const FALLBACK_TYRE_IDEAL: f64 = 90.0;

/// A tyre temperature (°C) against the compound's ideal (`optimal`, 0 when unknown, then
/// `FALLBACK_TYRE_IDEAL`): cold more than the cold limit under it, hot and warm more than their
/// limits over it, good in between.
pub fn tyre_heat(celsius: f64, optimal: f64, limits: &ColourLimits) -> Heat {
    let ideal = if optimal > 0.0 { optimal } else { FALLBACK_TYRE_IDEAL };
    if celsius > ideal + limits.tyre_hot_above {
        Heat::Hot
    } else if celsius > ideal + limits.tyre_warm_above {
        Heat::Warm
    } else if celsius < ideal - limits.tyre_cold_below {
        Heat::Cold
    } else {
        Heat::Good
    }
}

/// A brake disc temperature (°C) against the brake limits.
pub fn brake_heat(celsius: f64, limits: &ColourLimits) -> Heat {
    if celsius > limits.brake_hot_above {
        Heat::Hot
    } else if celsius > limits.brake_warm_above {
        Heat::Warm
    } else if celsius < limits.brake_cold_below {
        Heat::Cold
    } else {
        Heat::Good
    }
}

/// A tyre temperature's colour (°C): `tyre_heat` in `palette`. Every tyre widget colours its
/// temperatures with this.
pub fn resolve_tyre_color(celsius: f64, optimal: f64, palette: &DashPaletteColors, limits: &ColourLimits) -> Rgba {
    tyre_heat(celsius, optimal, limits).color(palette)
}

/// The channels `parseHexColor` reads from the color's string: (r, g, b, a). `None` where it
/// throws (`#rgba`, `rgba(...)`). An 8-digit string is read alpha-first, so a theme override
/// `#RRGGBBAA` (which CSS paints as written) comes out as a = RR, r = GG, g = BB, b = AA.
fn ts_hex_channels(color: Rgba) -> Option<(u8, u8, u8, u8)> {
    match color.form {
        CssForm::Hex => Some((color.r, color.g, color.b, 255)),
        CssForm::Hex8 => Some((color.g, color.b, color.a, color.r)),
        CssForm::Hex4 | CssForm::Function => None,
    }
}

/// Dims a color toward black (0..1 factor), truncating each channel — used for bar tracks and
/// unlit segments. A port of `dimColor` including how it reads and writes the string: its output
/// is `#rrggbb`, or `#aarrggbb` when the alpha it read is not 255, which CSS then paints as
/// `#rrggbbaa`. `None` where the TypeScript throws (the color is not 3, 6 or 8 hex digits).
pub fn dim_color(color: Rgba, factor: f64) -> Option<Rgba> {
    let (r, g, b, a) = ts_hex_channels(color)?;
    let scale = |channel: u8| (f64::from(channel) * factor).trunc().clamp(0.0, 255.0) as u8;
    let (r, g, b) = (scale(r), scale(g), scale(b));
    Some(if a == 255 { Rgba::rgb(r, g, b) } else { Rgba { r: a, g: r, b: g, a: b, form: CssForm::Hex8 } })
}

/// The color at `alpha` (0..1): the CSS `rgba(r, g, b, alpha)` `withAlpha` builds, quantized to
/// a byte the way the browser stores it, its r/g/b read from the string like `dim_color` reads
/// them. Every caller passes an opaque palette constant (the canvas color); for the forms the
/// TypeScript cannot parse (it throws), this keeps the CSS channels.
pub fn with_alpha(color: Rgba, alpha: f64) -> Rgba {
    let (r, g, b, _) = ts_hex_channels(color).unwrap_or((color.r, color.g, color.b, color.a));
    Rgba { r, g, b, a: (alpha.clamp(0.0, 1.0) * 255.0).round() as u8, form: CssForm::Function }
}

/// A named layout theme offered by the editor's theme manager: hex overrides drawn from the dash
/// colors. "Graphite" is the empty (default) theme.
#[derive(Debug)]
pub struct DashThemePreset {
    pub name: &'static str,
    pub alert_color_token: &'static str,
    /// The overrides, as (theme key, hex) pairs.
    pub theme: &'static [(&'static str, &'static str)],
}

pub const DASH_THEME_PRESETS: [DashThemePreset; 7] = {
    use dash_color as c;
    [
        DashThemePreset { name: "Graphite", alert_color_token: "auto", theme: &[] },
        DashThemePreset { name: "Ember", alert_color_token: "ember", theme: &[("primary", c::ORANGE), ("accent", c::YELLOW)] },
        DashThemePreset { name: "Ice", alert_color_token: "ice", theme: &[("primary", c::BLUE), ("accent", c::GREEN)] },
        DashThemePreset { name: "Viper", alert_color_token: "viper", theme: &[("primary", c::GREEN), ("accent", c::ORANGE)] },
        DashThemePreset { name: "Suzuki", alert_color_token: "suzuki", theme: &[("primary", c::SUZUKI_PRIMARY), ("accent", c::SUZUKI_ACCENT)] },
        DashThemePreset { name: "Crimson", alert_color_token: "crimson", theme: &[("primary", c::RED), ("accent", c::YELLOW)] },
        DashThemePreset { name: "Mono", alert_color_token: "mono", theme: &[("primary", c::MONO_PRIMARY), ("accent", c::MONO_ACCENT)] },
    ]
};

impl DashThemePreset {
    fn get(&self, key: &str) -> Option<&'static str> {
        self.theme.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)
    }
}

/// The swatch color shown for a preset in the theme picker.
pub fn preset_swatch_color(preset: &DashThemePreset) -> Rgba {
    Rgba::hex(preset.get("primary").unwrap_or(dash_color::TEXT))
}

/// Maps a layout/alert color token to the theme-preset token it's a shorthand for.
pub fn canonical_alert_color_token(token: Option<&str>) -> String {
    let normalized = token.unwrap_or("").trim().to_ascii_lowercase();
    match normalized.as_str() {
        "blue" => "ice".to_owned(),
        "green" => "viper".to_owned(),
        "purple" => "suzuki".to_owned(),
        "red" => "crimson".to_owned(),
        "white" => "mono".to_owned(),
        "primary" => "ember".to_owned(),
        _ => normalized,
    }
}

pub fn find_preset_by_alert_color_token(token: Option<&str>) -> Option<&'static DashThemePreset> {
    let canonical = canonical_alert_color_token(token);
    DASH_THEME_PRESETS.iter().find(|preset| preset.alert_color_token.eq_ignore_ascii_case(&canonical))
}

fn same_color_token(a: Option<&str>, b: Option<&str>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        (a, b) => a == b,
    }
}

/// The name of the preset whose complete override set matches `theme`, or `None` for a custom theme.
pub fn match_theme_name(theme: Option<&DashTheme>) -> Option<&'static str> {
    let empty = DashTheme::new();
    let t = theme.unwrap_or(&empty);
    DASH_THEME_PRESETS
        .iter()
        .find(|preset| THEME_KEYS.iter().all(|key| same_color_token(preset.get(key), t.get(*key).map(String::as_str))))
        .map(|preset| preset.name)
}

/// The layout's effective color system: an explicit choice, or styled whenever a theme override is set.
pub fn effective_color_system(layout: &DashLayout) -> ColorSystem {
    layout.color_system.unwrap_or(if is_theme_empty(layout.theme.as_ref()) { ColorSystem::Functional } else { ColorSystem::Styled })
}

/// The preset whose output matches the layout's effective color system, or `None` for a custom styled theme.
pub fn match_layout_theme_name(layout: &DashLayout) -> Option<&'static str> {
    if effective_color_system(layout) == ColorSystem::Functional { Some("Graphite") } else { match_theme_name(layout.theme.as_ref()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme(pairs: &[(&str, &str)]) -> DashTheme {
        pairs.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect()
    }

    fn layout(color_system: Option<ColorSystem>, t: Option<DashTheme>) -> DashLayout {
        DashLayout { color_system, theme: t, ..DashLayout::default() }
    }

    #[test]
    fn the_default_palette_keeps_the_wheel_colors_the_hardware_output_was_tuned_with() {
        assert_eq!(DEFAULT_DASH_PALETTE.surface, Rgba::hex("#1B1B1E"));
        assert_eq!(DEFAULT_DASH_PALETTE.warning, Rgba::hex("#FF6A00"));
        assert_eq!(DEFAULT_DASH_PALETTE.danger, Rgba::hex("#F02744"));
        assert_eq!(DEFAULT_DASH_PALETTE.rpm_shift, Rgba::hex("#1F7FE6"));
    }

    #[test]
    fn resolve_dash_palette_ignores_the_theme_under_the_functional_color_system() {
        let t = theme(&[("primary", "#123456"), ("accent", "#654321")]);
        assert_eq!(resolve_dash_palette(Some(&t), ColorSystem::Functional), DEFAULT_DASH_PALETTE);
    }

    #[test]
    fn resolve_dash_palette_returns_the_default_for_an_empty_or_missing_theme() {
        assert_eq!(resolve_dash_palette(None, ColorSystem::Styled), DEFAULT_DASH_PALETTE);
        assert_eq!(resolve_dash_palette(Some(&theme(&[])), ColorSystem::Styled), DEFAULT_DASH_PALETTE);
    }

    #[test]
    fn resolve_dash_palette_applies_valid_hex_overrides_and_ignores_unparseable_ones() {
        let palette = resolve_dash_palette(Some(&theme(&[("primary", "#112233"), ("accent", "not-a-color")])), ColorSystem::Styled);
        assert_eq!(palette.primary, Rgba::hex("#112233"));
        assert_eq!(palette.rpm_normal, Rgba::hex("#112233"));
        assert_eq!(palette.accent, DEFAULT_DASH_PALETTE.accent);
    }

    #[test]
    fn a_theme_may_override_each_settings_identity_color() {
        let palette = resolve_dash_palette(Some(&theme(&[("settingAbs", "#123456")])), ColorSystem::Styled);
        assert_eq!(palette.setting_abs, Rgba::hex("#123456"));
        assert_eq!(palette.setting_tc, dash_setting_colors::TC, "the others keep their own");
        assert_eq!(DEFAULT_DASH_PALETTE.setting_arb, Rgba::hex(dash_color::ORANGE));
    }

    #[test]
    fn resolve_dash_palette_pins_danger_critical_fault_and_rpm_near_limit_regardless_of_the_theme() {
        let t = theme(&[("danger", "#00FF00"), ("critical", "#00FF00"), ("fault", "#00FF00")]);
        let palette = resolve_dash_palette(Some(&t), ColorSystem::Styled);
        assert_eq!(palette.danger, DEFAULT_DASH_PALETTE.critical);
        assert_eq!(palette.critical, DEFAULT_DASH_PALETTE.critical);
        assert_eq!(palette.fault, DEFAULT_DASH_PALETTE.fault);
        assert_eq!(palette.rpm_near_limit, DEFAULT_DASH_PALETTE.critical);
    }

    #[test]
    fn resolve_dash_palette_falls_back_neutral_to_foreground_then_to_the_default() {
        assert_eq!(resolve_dash_palette(Some(&theme(&[("foreground", "#AABBCC")])), ColorSystem::Styled).neutral, Rgba::hex("#AABBCC"));
        assert_eq!(resolve_dash_palette(Some(&theme(&[("primary", "#112233")])), ColorSystem::Styled).neutral, DEFAULT_DASH_PALETTE.neutral);
    }

    #[test]
    fn theme_overrides_parse_as_css_reads_them() {
        assert_eq!(parse_css_hex(" #abc "), Some(Rgba::rgb(0xAA, 0xBB, 0xCC)));
        assert_eq!(parse_css_hex("#11223380"), Some(Rgba { r: 0x11, g: 0x22, b: 0x33, a: 0x80, form: CssForm::Hex8 }));
        assert_eq!(parse_css_hex("#f008").map(|c| (c.r, c.a, c.form)), Some((0xFF, 0x88, CssForm::Hex4)));
        assert_eq!(parse_css_hex("#12345"), None);
        assert_eq!(parse_css_hex("red"), None);
    }

    #[test]
    fn a_tyre_temperature_is_coloured_against_the_compounds_ideal_or_the_fallback_ideal_without_one() {
        let (p, l) = (DEFAULT_DASH_PALETTE, ColourLimits::default());
        let at = |celsius| resolve_tyre_color(celsius, 85.0, &p, &l);
        assert_eq!(
            (at(74.0), at(75.0), at(95.0), at(96.0), at(105.0), at(106.0)),
            (p.cold_low, p.good_on_target, p.good_on_target, p.warning, p.warning, p.critical)
        );
        assert_eq!(tyre_heat(79.0, 0.0, &l), Heat::Cold, "the fallback ideal is 90°");
        assert_eq!(tyre_heat(101.0, 0.0, &l), Heat::Warm);
    }

    #[test]
    fn the_drivers_limits_move_where_tyres_and_brakes_change_colour() {
        let l = ColourLimits {
            tyre_cold_below: 5.0,
            tyre_warm_above: 3.0,
            tyre_hot_above: 8.0,
            brake_cold_below: 200.0,
            brake_warm_above: 500.0,
            brake_hot_above: 700.0,
            ..ColourLimits::default()
        };
        assert_eq!([79.0, 86.0, 89.0, 94.0].map(|c| tyre_heat(c, 85.0, &l)), [Heat::Cold, Heat::Good, Heat::Warm, Heat::Hot]);
        assert_eq!([150.0, 400.0, 600.0, 750.0].map(|c| brake_heat(c, &l)), [Heat::Cold, Heat::Good, Heat::Warm, Heat::Hot]);
    }

    #[test]
    fn a_colour_theme_recolours_only_the_scales_cold_and_good() {
        let d = DEFAULT_DASH_PALETTE;
        assert_eq!(themed_palette(ColourTheme::Sprint), d);
        let calm = themed_palette(ColourTheme::Calm);
        assert_eq!((calm.cold_low, calm.good_on_target, calm.warning, calm.critical), (d.secondary, d.foreground, d.warning, d.critical));
        let strict = themed_palette(ColourTheme::Strict);
        assert_eq!((strict.cold_low, strict.good_on_target), (d.critical, d.good_on_target));
        assert_eq!(strict.timing_fastest_overall, d.timing_fastest_overall, "timing colours are the same in every theme");
    }

    #[test]
    fn the_scenes_colours_read_the_theme_by_name_and_each_limit_falling_back_to_its_default() {
        let raw = serde_json::json!({ "theme": "Strict", "limits": { "brakeHotAbove": 900, "tyreColdBelow": "x" } });
        let colours = Colours::parse(Some(&raw));
        assert_eq!(colours.theme, ColourTheme::Strict);
        assert_eq!(colours.limits, ColourLimits { brake_hot_above: 900.0, ..ColourLimits::default() });
        assert_eq!(Colours::parse(None), Colours::default());
        assert_eq!(ColourTheme::parse(Some("calm")), ColourTheme::Sprint, "by name, as the host writes it");
    }

    #[test]
    fn dim_color_scales_rgb_channels_by_the_factor_truncating_toward_zero() {
        // 255 * 0.5 = 127.5, truncated to 127 (0x7f).
        assert_eq!(dim_color(Rgba::hex("#64C8FF"), 0.5), Some(Rgba::hex("#32647f")));
        assert_eq!(dim_color(Rgba::hex("#010101"), 0.5), Some(Rgba::hex("#000000")));
    }

    #[test]
    fn dim_color_reads_8_digit_hex_alpha_first_like_dim_color_in_typescript() {
        // palette.test.ts: dimColor('#8064C8FF', 0.5) === '#8032647f' (AARRGGBB in, AARRGGBB out).
        // Here the color arrives as CSS read that string (#RRGGBBAA), and leaves the same way.
        let translucent = parse_css_hex("#8064C8FF").expect("hex");
        assert_eq!(dim_color(translucent, 0.5), parse_css_hex("#8032647f"));
        // An alpha byte of ff drops back to six digits.
        assert_eq!(dim_color(parse_css_hex("#FF64C8FF").expect("hex"), 0.5), Some(Rgba::hex("#32647f")));
    }

    #[test]
    fn dim_color_fails_where_the_typescript_throws() {
        assert_eq!(dim_color(parse_css_hex("#f008").expect("hex"), 0.5), None);
        assert_eq!(dim_color(with_alpha(Rgba::hex("#08080A"), 0.5), 0.5), None);
    }

    #[test]
    fn with_alpha_replaces_alpha_quantized_like_css() {
        assert_eq!(with_alpha(Rgba::hex("#08080A"), 0.78).a, 199);
        assert_eq!(with_alpha(Rgba::hex("#08080A"), 2.0).a, 255);
        // 8-digit hex is read alpha-first: '#11223344' -> rgba(0x22, 0x33, 0x44, a).
        let c = with_alpha(parse_css_hex("#11223344").expect("hex"), 0.5);
        assert_eq!((c.r, c.g, c.b), (0x22, 0x33, 0x44));
    }

    #[test]
    fn canonical_alert_color_token_maps_shorthand_tokens_to_their_preset_name() {
        assert_eq!(canonical_alert_color_token(Some("blue")), "ice");
        assert_eq!(canonical_alert_color_token(Some("PRIMARY")), "ember");
        assert_eq!(canonical_alert_color_token(Some("auto")), "auto");
        assert_eq!(canonical_alert_color_token(None), "");
    }

    #[test]
    fn find_preset_by_alert_color_token_resolves_shorthand_and_canonical_tokens() {
        assert_eq!(find_preset_by_alert_color_token(Some("green")).map(|p| p.name), Some("Viper"));
        assert_eq!(find_preset_by_alert_color_token(Some("crimson")).map(|p| p.name), Some("Crimson"));
        assert!(find_preset_by_alert_color_token(Some("not-a-preset")).is_none());
    }

    #[test]
    fn preset_swatch_color_falls_back_to_the_default_foreground_for_the_themeless_preset() {
        let graphite = find_preset_by_alert_color_token(Some("auto")).expect("graphite");
        assert_eq!(preset_swatch_color(graphite), DEFAULT_DASH_PALETTE.foreground);
    }

    #[test]
    fn match_theme_name_recognizes_an_exact_preset_and_returns_none_for_a_custom_theme() {
        assert_eq!(match_theme_name(Some(&theme(&[]))), Some("Graphite"));
        assert_eq!(match_theme_name(Some(&theme(&[("primary", "#16B566"), ("accent", "#FF6A00")]))), Some("Viper"));
        assert_eq!(match_theme_name(Some(&theme(&[("primary", "#123456")]))), None);
    }

    #[test]
    fn effective_color_system_defaults_to_styled_only_when_a_theme_override_is_set() {
        assert_eq!(effective_color_system(&layout(None, None)), ColorSystem::Functional);
        assert_eq!(effective_color_system(&layout(None, Some(theme(&[("primary", "#112233")])))), ColorSystem::Styled);
        assert_eq!(effective_color_system(&layout(Some(ColorSystem::Functional), Some(theme(&[("primary", "#112233")])))), ColorSystem::Functional);
    }

    #[test]
    fn match_layout_theme_name_reports_graphite_for_functional_layouts_without_inspecting_the_theme() {
        assert_eq!(match_layout_theme_name(&layout(Some(ColorSystem::Functional), Some(theme(&[("primary", "#123456")])))), Some("Graphite"));
        assert_eq!(match_layout_theme_name(&layout(Some(ColorSystem::Styled), Some(theme(&[])))), Some("Graphite"));
    }
}
