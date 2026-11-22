// Stateful alert detection. Compares each frame to the previous one for the alert types the
// layout carries (a driver setting turned, a new flag, a penalty, damage, the engine
// overheating) and watches levels that need no diff (fuel running low, a finished lap). The
// `pit_limiter` alert raises no popup: it only turns the pit limiter overlay on or off
// (`pit_limiter_alert_on`, drawn by `pit_limiter.rs`). Live alerts (launch, pit now, lift now)
// are up while their condition holds, their content followed every frame. A flag out after its
// popup stays as a thin bar across the top (`DashAlertTracker::flag_bar`).
// What it raises stays up for its duration, or until the driver acknowledges it (`untilAck`).
// There is no internal clock: callers drive time explicitly via `advance_to`, which is what makes
// expiry deterministic to test. Nothing here blinks: a popup or bar only changes when the frame
// or the clock moves it on.
//
// Alerts are app-wide: whoever hands a dash to the renderer stamps the driver's alert settings
// onto the layout's `alerts` (packages/dashboard/src/alerts.ts, `dashAlertFromSettings`), so
// every dash shows the same alerts in its own palette. The tracker reads only the layout.
//
// The banner types deserialize from exactly the JSON the TypeScript `DashAlertBanner` union
// serializes to, so a banner built by the TypeScript (the editor's preview) can be drawn here.

use serde::{Deserialize, Deserializer};
use serde_json::{Map, Value};

use crate::format::{Units, format_degrees, format_front_brake_bias, format_setting, js_number_string, to_fixed};
use crate::grid::AlertSpan;
use crate::lap_summary::{LapSector, LapSummary, LapSummaryWatcher};
use crate::model::{DashAlert, DashLayout, DashTargets, TelemetryFrame};
use crate::multi_dial::DashMultiDialPopup;
use crate::palette::{DashPaletteColors, Rgba, canonical_alert_color_token, dash_color, find_preset_by_alert_color_token, parse_css_hex, preset_swatch_color};
use crate::widgets::{Range, SectorState, race_laps_left, range};

/// Every alert type, by its wire id (`DashAlertType`; `dashAlertTypes` in alerts.ts lists the
/// same ids, which a test checks).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DashAlertType {
    TcChange,
    AbsChange,
    BiasChange,
    EnginemapChange,
    MigrationChange,
    ArbChange,
    /// The wheel's multi-position dial turned: drawn by `multi_dial`, gated by this alert's settings.
    DialChange,
    /// Whether the pit limiter overlay shows (`pit_limiter_alert_on`); never a popup.
    PitLimiter,
    /// Live: standing with the clutch in, LAUNCH and the revs (`LaunchWindow`).
    Launch,
    Flag,
    Penalty,
    Damage,
    EngineWarning,
    /// The fuel warning's second level: LOW FUEL once a stint (`FuelWarning`).
    FuelLow,
    /// Live: on the last part of a lap the fuel or energy will not outlast by another.
    PitNow,
    /// Live: while the game's lift-and-coast cue is above the lift point.
    LiftNow,
    LapSummary,
}

impl DashAlertType {
    pub const ALL: [DashAlertType; 17] = [
        DashAlertType::TcChange,
        DashAlertType::AbsChange,
        DashAlertType::BiasChange,
        DashAlertType::EnginemapChange,
        DashAlertType::MigrationChange,
        DashAlertType::ArbChange,
        DashAlertType::DialChange,
        DashAlertType::PitLimiter,
        DashAlertType::Launch,
        DashAlertType::Flag,
        DashAlertType::Penalty,
        DashAlertType::Damage,
        DashAlertType::EngineWarning,
        DashAlertType::FuelLow,
        DashAlertType::PitNow,
        DashAlertType::LiftNow,
        DashAlertType::LapSummary,
    ];

    /// The alerts that are up while their condition holds rather than raised by a change.
    const LIVE: [DashAlertType; 3] = [DashAlertType::Launch, DashAlertType::PitNow, DashAlertType::LiftNow];

    /// The wire id ("tc_change").
    pub fn id(self) -> &'static str {
        match self {
            DashAlertType::TcChange => "tc_change",
            DashAlertType::AbsChange => "abs_change",
            DashAlertType::BiasChange => "bias_change",
            DashAlertType::EnginemapChange => "enginemap_change",
            DashAlertType::MigrationChange => "migration_change",
            DashAlertType::ArbChange => "arb_change",
            DashAlertType::DialChange => "dial_change",
            DashAlertType::PitLimiter => "pit_limiter",
            DashAlertType::Launch => "launch",
            DashAlertType::Flag => "flag",
            DashAlertType::Penalty => "penalty",
            DashAlertType::Damage => "damage",
            DashAlertType::EngineWarning => "engine_warning",
            DashAlertType::FuelLow => "fuel_low",
            DashAlertType::PitNow => "pit_now",
            DashAlertType::LiftNow => "lift_now",
            DashAlertType::LapSummary => "lap_summary",
        }
    }

    pub fn parse(id: &str) -> Option<DashAlertType> {
        DashAlertType::ALL.into_iter().find(|t| t.id() == id)
    }

    /// The longest it may stay up when it is not held until acknowledged.
    pub fn max_seconds(self) -> f64 {
        if self == DashAlertType::LapSummary { LAP_SUMMARY_MAX_SECONDS } else { MAX_ALERT_SECONDS }
    }
}

/// How big an alert shows: a band across the middle of the dash, or the whole dash.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSize {
    #[default]
    Full,
    Strip,
}

/// Where a popup sits (its JSON `displayMode`): over the whole dash, in a band across its middle
/// (drawn full when the band would be too small to read, see `overlays::strip_fits`), or in the
/// alert's own grid rect (older per-dash layouts).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(tag = "displayMode", rename_all = "lowercase")]
pub enum AlertPlacement {
    Full,
    Strip,
    Center(AlertSpan),
}

/// A transient popup: a small title, the value big and a small detail line ("WAS 4",
/// "LAPS LEFT"), in the alert's colour (a fill, or the lettering when `invert_colors`).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashAlertPopup {
    pub alert_type: DashAlertType,
    pub title: String,
    pub value: String,
    pub detail: Option<String>,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
    pub invert_colors: bool,
    #[serde(flatten)]
    pub placement: AlertPlacement,
}

/// What the renderer draws over the dash (`DashAlertBanner`): a popup the tracker raised, the
/// lap summary, the multi-dial popup, or the engineer's radio message. The JSON's `kind` is
/// `"alert"`, `"lapSummary"`, `"multiDial"` or `"radio"`.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "kind")]
pub enum DashAlertBanner {
    #[serde(rename = "alert")]
    Alert(DashAlertPopup),
    /// The full-screen summary of a finished lap (`DashLapSummaryPopup`), boxed: it is by far the largest.
    #[serde(rename = "lapSummary")]
    LapSummary(Box<LapSummary>),
    /// A turn of the wheel's multi-position dial (`DashMultiDialPopup`). Never raised by the
    /// tracker: `multi_dial::MultiDialPopupWatcher` decides when it is up.
    #[serde(rename = "multiDial")]
    MultiDial(DashMultiDialPopup),
    /// The race engineer's message over the live link (`DashRadioBanner`). Never raised by the
    /// tracker: the host sets it (`Renderer::set_radio`) while it is on the wheel.
    #[serde(rename = "radio")]
    Radio(DashRadioBanner),
}

impl DashAlertBanner {
    /// True for a popup of the flag alert, which says what the flag bar would.
    pub fn is_flag_alert(&self) -> bool {
        matches!(self, DashAlertBanner::Alert(popup) if popup.alert_type == DashAlertType::Flag)
    }
}

/// The race engineer's message, up until the driver presses a wheel button or the host takes it
/// down. The host writes the text ("Box now", "Target lap 2:04.5").
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct DashRadioBanner {
    pub text: String,
}

/// Parses the engineer's message (`DashRadioBanner` as JSON). An error names what is wrong.
pub fn parse_radio(json: &[u8]) -> Result<DashRadioBanner, String> {
    serde_json::from_slice(json).map_err(|e| format!("radio is not a valid radio message: {e}"))
}

/// A banner's color: the TypeScript always writes a resolved hex color there.
pub(crate) fn css_hex_color<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Rgba, D::Error> {
    let text = String::deserialize(deserializer)?;
    parse_css_hex(&text).ok_or_else(|| serde::de::Error::custom(format!("banner color {text:?} is not a hex color")))
}

/// Parses a banner (the TypeScript `DashAlertBanner` as JSON). An error names what is wrong.
pub fn parse_banner(json: &[u8]) -> Result<DashAlertBanner, String> {
    serde_json::from_slice(json).map_err(|e| format!("banner is not a valid alert banner: {e}"))
}

/// How long the lap summary stays up unless its alert sets its own duration: longer than a
/// setting popup, there is a whole lap to read.
pub const LAP_SUMMARY_SECONDS: f64 = 5.0;

/// The longest a lap summary may stay up. Every other alert keeps to `MAX_ALERT_SECONDS`.
pub const LAP_SUMMARY_MAX_SECONDS: f64 = 15.0;

/// The shortest and longest an alert stays up (`MIN_ALERT_SECONDS`, `MAX_ALERT_SECONDS` in alerts.ts).
pub const MIN_ALERT_SECONDS: f64 = 1.0;
pub const MAX_ALERT_SECONDS: f64 = 30.0;

/// The duration when neither the alert nor the layout's `alertConfig` sets one.
pub(crate) const DEFAULT_DURATION_SECONDS: f64 = 1.5;

/// The fuel warning's two levels, laps of fuel (or virtual energy) left, unless the `fuel_low`
/// alert sets its own: the first (`warningLapsLeft`) turns the fuel widgets amber, the second
/// (`lapsLeft`) turns them red and pops LOW FUEL. Both kept to
/// `FUEL_LAPS_LEFT_MIN..=FUEL_LAPS_LEFT_MAX`, the first never under the second.
pub const FUEL_WARNING_LAPS_LEFT: f64 = 4.0;
pub const FUEL_LAPS_LEFT: f64 = 2.0;
pub const FUEL_LAPS_LEFT_MIN: f64 = 1.0;
pub const FUEL_LAPS_LEFT_MAX: f64 = 9.0;

/// The app-wide fuel warning, laps left: the fuel and energy widgets turn amber at `amber` and red
/// at `red` or under. Read from the `fuel_low` alert (the host stamps the app's alerts on every
/// dash it shows) whether or not the alert itself is on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FuelWarning {
    pub amber: f64,
    pub red: f64,
}

impl Default for FuelWarning {
    fn default() -> Self {
        FuelWarning { amber: FUEL_WARNING_LAPS_LEFT, red: FUEL_LAPS_LEFT }
    }
}

/// The game's lift-and-coast cue (0–255) above which LIFT NOW shows and the Lift & coast widget
/// lights, unless the `lift_now` alert sets its own `liftPoint` (the point Lovely Dash Pro uses).
pub const LIFT_POINT: f64 = 220.0;
pub const LIFT_POINT_MIN: f64 = 0.0;
pub const LIFT_POINT_MAX: f64 = 255.0;

/// The app-wide limits the widgets warn from, read off the layout's alerts whether or not the
/// alerts themselves are on: the fuel warning, the engine's temperatures and the lift point.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AlertLimits {
    pub fuel: FuelWarning,
    pub engine: EngineLimits,
    pub lift_point: f64,
}

impl Default for AlertLimits {
    fn default() -> Self {
        AlertLimits { fuel: FuelWarning::default(), engine: EngineLimits::default(), lift_point: LIFT_POINT }
    }
}

/// A number field of the layout's first alert of `alert_type`, kept to `min..=max`; `fallback`
/// when the layout has no such alert or the field is absent.
fn alert_number(layout: &DashLayout, alert_type: &str, key: &str, fallback: f64, min: f64, max: f64) -> f64 {
    let alert = layout.alerts.iter().find(|alert| alert.alert_type == alert_type);
    clamp(alert.and_then(|alert| alert.fields.get(key)).and_then(Value::as_f64).unwrap_or(fallback), min, max)
}

pub(crate) fn alert_limits(layout: &DashLayout) -> AlertLimits {
    let laps = |key: &str, fallback: f64| alert_number(layout, "fuel_low", key, fallback, FUEL_LAPS_LEFT_MIN, FUEL_LAPS_LEFT_MAX);
    let red = laps("lapsLeft", FUEL_LAPS_LEFT);
    AlertLimits {
        fuel: FuelWarning { amber: laps("warningLapsLeft", FUEL_WARNING_LAPS_LEFT).max(red), red },
        engine: engine_limits(layout),
        lift_point: alert_number(layout, "lift_now", "liftPoint", LIFT_POINT, LIFT_POINT_MIN, LIFT_POINT_MAX),
    }
}

/// The engine's temperature limits, °C: the app-wide water and oil limits the driver sets on the
/// `engine_warning` alert (`waterLimitCelsius`, `oilLimitCelsius`; the host stamps the app's
/// alerts on every dash it shows), else `WATER_LIMIT`/`OIL_LIMIT`. The Oil and Water widgets warn
/// from them whether or not the alert itself is on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EngineLimits {
    pub water: f64,
    pub oil: f64,
}

pub const WATER_LIMIT: f64 = 110.0;
pub const OIL_LIMIT: f64 = 130.0;
/// The range either limit is kept to (`ENGINE_LIMIT_MIN`/`MAX` in alerts.ts).
pub const ENGINE_LIMIT_MIN: f64 = 60.0;
pub const ENGINE_LIMIT_MAX: f64 = 160.0;

impl Default for EngineLimits {
    fn default() -> Self {
        EngineLimits { water: WATER_LIMIT, oil: OIL_LIMIT }
    }
}

fn engine_limits(layout: &DashLayout) -> EngineLimits {
    let limit = |key: &str, fallback: f64| alert_number(layout, "engine_warning", key, fallback, ENGINE_LIMIT_MIN, ENGINE_LIMIT_MAX);
    EngineLimits { water: limit("waterLimitCelsius", WATER_LIMIT), oil: limit("oilLimitCelsius", OIL_LIMIT) }
}

/// How far under its limit a hot engine reading must drop before it counts as cool again, °C, so
/// a reading hovering at the limit does not warn over and over.
const ENGINE_COOL_BAND: f64 = 2.0;

/// The launch alert's settings (`launch`'s fields): it shows while the clutch is pressed more
/// than `clutch_percent` and the car is slower than `speed_kmh`, green while the revs and the
/// throttle are inside their windows.
#[derive(Clone, Copy, Debug, PartialEq)]
struct LaunchWindow {
    clutch_percent: f64,
    speed_kmh: f64,
    rpm: (f64, f64),
    throttle_percent: (f64, f64),
}

/// The launch defaults and ranges (`LAUNCH_*` in alerts.ts). The revs differ per car, so their
/// window is only a starting point for the driver to set.
pub const LAUNCH_CLUTCH_PERCENT: f64 = 50.0;
pub const LAUNCH_SPEED_KMH: f64 = 10.0;
pub const LAUNCH_RPM: (f64, f64) = (5000.0, 6000.0);
pub const LAUNCH_THROTTLE_PERCENT: (f64, f64) = (20.0, 30.0);

impl LaunchWindow {
    fn of(spec: &AlertSpec) -> LaunchWindow {
        let rpm_from = spec.number("rpmFrom", LAUNCH_RPM.0, 1000.0, 20000.0);
        let throttle_from = spec.number("throttleFrom", LAUNCH_THROTTLE_PERCENT.0, 0.0, 100.0);
        LaunchWindow {
            clutch_percent: spec.number("clutchPercent", LAUNCH_CLUTCH_PERCENT, 5.0, 95.0),
            speed_kmh: spec.number("speedKmh", LAUNCH_SPEED_KMH, 1.0, 50.0),
            rpm: (rpm_from, spec.number("rpmTo", LAUNCH_RPM.1, 1000.0, 20000.0).max(rpm_from)),
            throttle_percent: (throttle_from, spec.number("throttleTo", LAUNCH_THROTTLE_PERCENT.1, 0.0, 100.0).max(throttle_from)),
        }
    }
}

/// The share of a lap after which PIT NOW may show: its last quarter, early enough to make the
/// pit entry, late enough not to call a stop a lap early.
pub const PIT_NOW_FROM_LAP_SHARE: f64 = 0.75;

/// Whether `layout` shows the pit limiter overlay while the limiter is on: its `pit_limiter` alert
/// (the app-wide setting, stamped on by the host) is on. A layout without one shows none.
pub(crate) fn pit_limiter_alert_on(layout: &DashLayout) -> bool {
    layout.alerts.iter().any(|alert| alert.alert_type == "pit_limiter" && js_truthy(alert.fields.get("enabled")))
}

/// The thin bar across the top of the dash while a flag is out (once its popup is down), in the
/// flag's colour.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlagBar {
    pub color: Rgba,
}

/// Whether `layout` shows the flag bar: unless its `flag` alert is turned off. A layout without
/// one (a dash in its designer) shows it, as the flag overlay it replaced always did.
fn flag_bar_on(layout: &DashLayout) -> bool {
    !layout.alerts.iter().any(|alert| alert.alert_type == "flag" && !js_truthy(alert.fields.get("enabled")))
}

/// The flag bar a still shows for `frame`, which has no history: the highest flag out. A live
/// output follows its tracker instead (`DashAlertTracker::flag_bar`), where Ack hides it.
pub fn flag_bar(layout: &DashLayout, frame: &TelemetryFrame, palette: &DashPaletteColors) -> Option<FlagBar> {
    let flag = FLAGS.into_iter().find(|flag| flag.is_out(frame))?;
    flag_bar_on(layout).then(|| flag.bar(palette))
}

/// Fuel gained since `fuel_low` fired that counts as a refuel: the next stint, the alert re-arms.
/// Above what a frame-to-frame reading wobbles by, below any real refuel.
const REFUEL_LITERS: f64 = 1.0;

/// How an alert is placed when it does not say.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DisplayMode {
    Full,
    Strip,
    Center,
}

impl DisplayMode {
    fn parse(value: Option<&Value>) -> Option<DisplayMode> {
        match value?.as_str()? {
            "full" => Some(DisplayMode::Full),
            "strip" => Some(DisplayMode::Strip),
            "center" => Some(DisplayMode::Center),
            _ => None,
        }
    }
}

/// The layout's `alertConfig`: the look of every alert that does not set its own. The host
/// stamps a neutral one; older per-dash layouts carry their own.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ResolvedAlertConfig {
    display: DisplayMode,
    duration_seconds: f64,
    invert_colors: bool,
    color_token: String,
}

/// Narrows the layout's untyped `alertConfig` bag to the fields the tracker reads.
pub(crate) fn read_alert_config(raw: Option<&Map<String, Value>>) -> ResolvedAlertConfig {
    let get = |key: &str| raw.and_then(|r| r.get(key));
    ResolvedAlertConfig {
        display: DisplayMode::parse(get("displayMode")).unwrap_or(DisplayMode::Full),
        duration_seconds: get("durationSeconds").and_then(Value::as_f64).unwrap_or(DEFAULT_DURATION_SECONDS),
        invert_colors: get("invertColors").and_then(Value::as_bool).unwrap_or(false),
        color_token: get("colorToken").and_then(Value::as_str).unwrap_or("auto").to_owned(),
    }
}

/// `Math.min(max, Math.max(min, value))`.
fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

/// JavaScript truthiness of a JSON value.
fn js_truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|n| n != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

/// "auto" is the setting's own identity color; a named token overrides it with that preset's
/// swatch, and "yellow" is the palette's warning color.
fn resolve_alert_color(token: Option<&str>, setting_color: Rgba, palette: &DashPaletteColors) -> Rgba {
    if let Some(preset) = find_preset_by_alert_color_token(token)
        && !preset.alert_color_token.eq_ignore_ascii_case("auto")
    {
        return preset_swatch_color(preset);
    }
    if canonical_alert_color_token(token) == "yellow" { palette.warning } else { setting_color }
}

/// The colour an alert colour token paints a popup, for a colour picker: a theme preset's
/// swatch, or the palette's warning yellow. `None` for "auto" (each setting's own colour) and
/// for a token nothing knows.
pub fn alert_color_swatch(token: &str, palette: &DashPaletteColors) -> Option<Rgba> {
    if let Some(preset) = find_preset_by_alert_color_token(Some(token)) {
        return (!preset.alert_color_token.eq_ignore_ascii_case("auto")).then(|| preset_swatch_color(preset));
    }
    (canonical_alert_color_token(Some(token)) == "yellow").then_some(palette.warning)
}

/// A driver-adjustable setting a change alert watches. `tc_change` watches three (TC, its slip
/// and its cut), `arb_change` two.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Knob {
    Tc,
    TcSlip,
    TcCut,
    Abs,
    Bias,
    EngineMap,
    Migration,
    ArbFront,
    ArbRear,
}

/// Every knob, in declaration order (`Readings::knobs` is indexed by `Knob as usize`).
const KNOBS: [Knob; 9] = [Knob::Tc, Knob::TcSlip, Knob::TcCut, Knob::Abs, Knob::Bias, Knob::EngineMap, Knob::Migration, Knob::ArbFront, Knob::ArbRear];

impl Knob {
    /// The settings `alert_type` watches, in the order a change is looked for.
    fn of(alert_type: DashAlertType) -> &'static [Knob] {
        match alert_type {
            DashAlertType::TcChange => &[Knob::Tc, Knob::TcSlip, Knob::TcCut],
            DashAlertType::AbsChange => &[Knob::Abs],
            DashAlertType::BiasChange => &[Knob::Bias],
            DashAlertType::EnginemapChange => &[Knob::EngineMap],
            DashAlertType::MigrationChange => &[Knob::Migration],
            DashAlertType::ArbChange => &[Knob::ArbFront, Knob::ArbRear],
            _ => &[],
        }
    }

    /// The setting and its highest step (0 when the game reports none).
    fn read(self, frame: &TelemetryFrame) -> (f64, f64) {
        let e = &frame.electronics;
        match self {
            Knob::Tc => (e.tc, e.tc_max),
            Knob::TcSlip => (e.tc_slip, e.tc_slip_max),
            Knob::TcCut => (e.tc_cut, e.tc_cut_max),
            Knob::Abs => (e.abs, e.abs_max),
            Knob::Bias => (frame.car.brake_bias_rear, 0.0),
            Knob::EngineMap => (e.motor_map, e.motor_map_max),
            Knob::Migration => (e.migration, e.migration_max),
            Knob::ArbFront => (e.front_anti_roll_bar, e.front_anti_roll_bar_max),
            Knob::ArbRear => (e.rear_anti_roll_bar, e.rear_anti_roll_bar_max),
        }
    }

    /// The value as the popup prints it. Changes are detected on the printed value, so sensor
    /// noise below the display precision never fires.
    /// TC and ABS print a setting of 0 as "OFF", as their widgets do.
    fn shown(self, value: f64) -> String {
        match self {
            Knob::Bias => format_front_brake_bias(value),
            Knob::Tc | Knob::TcSlip | Knob::TcCut | Knob::Abs => format_setting(value, true),
            _ => js_number_string(value.trunc()),
        }
    }

    /// The knob widgets' names.
    fn title(self) -> &'static str {
        match self {
            Knob::Tc => "TC",
            Knob::TcSlip => "TC SLIP",
            Knob::TcCut => "TC 2",
            Knob::Abs => "ABS",
            Knob::Bias => "BIAS",
            Knob::EngineMap => "MAP",
            Knob::Migration => "MIGRATION",
            Knob::ArbFront => "ARB F",
            Knob::ArbRear => "ARB R",
        }
    }

    /// The setting's identity colour in `palette` (a theme may override it), as its widget wears it.
    fn color(self, palette: &DashPaletteColors) -> Rgba {
        match self {
            Knob::Tc | Knob::TcSlip | Knob::TcCut => palette.setting_tc,
            Knob::Abs => palette.setting_abs,
            Knob::Bias => palette.setting_brake_bias,
            Knob::EngineMap => palette.setting_engine_map,
            Knob::Migration => palette.setting_migration,
            Knob::ArbFront | Knob::ArbRear => palette.setting_arb,
        }
    }

    /// Migration and the anti-roll bars are also set in the garage and jump when the driver
    /// gets in: they alert only while driving.
    fn only_while_driving(self) -> bool {
        matches!(self, Knob::Migration | Knob::ArbFront | Knob::ArbRear)
    }

    /// The made-up change the designer plays the alert with: (value, previous).
    fn sample(self) -> (&'static str, &'static str) {
        match self {
            Knob::Tc | Knob::TcSlip | Knob::TcCut => ("5", "4"),
            Knob::Abs => ("3", "4"),
            Knob::Bias => ("56.5", "56.0"),
            Knob::EngineMap | Knob::Migration => ("3", "2"),
            Knob::ArbFront | Knob::ArbRear => ("4", "3"),
        }
    }
}

/// A flag the driver can be shown, highest priority first: when several come out on one frame,
/// the first is the one the alert names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FlagKind {
    Red,
    SafetyCar,
    Vsc,
    DoubleYellow,
    Yellow,
    Blue,
}

const FLAGS: [FlagKind; 6] = [FlagKind::Red, FlagKind::SafetyCar, FlagKind::Vsc, FlagKind::DoubleYellow, FlagKind::Yellow, FlagKind::Blue];

impl FlagKind {
    fn is_out(self, frame: &TelemetryFrame) -> bool {
        let f = &frame.flags;
        match self {
            FlagKind::Red => f.red,
            FlagKind::SafetyCar => f.safety_car,
            FlagKind::Vsc => f.vsc,
            FlagKind::DoubleYellow => f.double_yellow,
            FlagKind::Yellow => f.yellow,
            FlagKind::Blue => frame.field.iter().any(|car| car.is_player && car.blue_flag),
        }
    }

    fn name(self) -> &'static str {
        match self {
            FlagKind::Red => "RED",
            FlagKind::SafetyCar => "SAFETY CAR",
            FlagKind::Vsc => "VSC",
            FlagKind::DoubleYellow => "DOUBLE YELLOW",
            FlagKind::Yellow => "YELLOW",
            FlagKind::Blue => "BLUE",
        }
    }

    /// The signal's own colour (RaceControl): red, the race-control yellow, or the blue flag's blue.
    fn color(self, palette: &DashPaletteColors) -> Rgba {
        match self {
            FlagKind::Red => palette.critical,
            FlagKind::Blue => Rgba::hex(dash_color::BLUE),
            _ => palette.race_control_yellow,
        }
    }

    /// The bar it stays as while it is out.
    fn bar(self, palette: &DashPaletteColors) -> FlagBar {
        FlagBar { color: self.color(palette) }
    }
}

/// LMU's eight dent places (`Damage::dents`), clockwise from front left as the damage widget reads them.
const DENT_PLACES: [&str; 8] = ["FRONT LEFT", "FRONT", "FRONT RIGHT", "RIGHT", "REAR RIGHT", "REAR", "REAR LEFT", "LEFT"];

/// The damage report as the tracker diffs it.
#[derive(Clone, Copy, Debug, PartialEq)]
struct DamageReading {
    dents: [f64; 8],
    detached: bool,
}

/// Whether the engine is too hot: the game says it overheats, or the water or the oil is at the
/// driver's limit (and not yet `ENGINE_COOL_BAND` back under it).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct EngineHeat {
    overheating: bool,
    water: bool,
    oil: bool,
}

impl EngineHeat {
    fn of(frame: &TelemetryFrame, limits: &EngineLimits, before: EngineHeat) -> EngineHeat {
        let hot = |temp: Option<f64>, limit: f64, was: bool| temp.is_some_and(|t| t.is_finite() && (t >= limit || (was && t > limit - ENGINE_COOL_BAND)));
        EngineHeat {
            overheating: frame.damage.as_ref().is_some_and(|d| d.overheating),
            water: hot(frame.car.water_temp, limits.water, before.water),
            oil: hot(frame.car.oil_temp, limits.oil, before.oil),
        }
    }

    fn hot(self) -> bool {
        self.overheating || self.water || self.oil
    }
}

/// The frame fields the alerts read, kept from the previous frame to diff against.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Readings {
    knobs: [(f64, f64); KNOBS.len()],
    /// In the car and out of the garage.
    driving: bool,
    flags: [bool; FLAGS.len()],
    /// The player's penalties to serve; `None` while the player's car is not in the field.
    penalties: Option<f64>,
    damage: Option<DamageReading>,
    engine: EngineHeat,
    water_temp: Option<f64>,
    oil_temp: Option<f64>,
    fuel: f64,
    fuel_per_lap: f64,
}

impl Readings {
    /// `prev` carries the engine's heat over, for the band a hot reading cools through.
    fn of(frame: &TelemetryFrame, limits: &EngineLimits, prev: Option<&Readings>) -> Readings {
        Readings {
            knobs: KNOBS.map(|knob| knob.read(frame)),
            driving: driving(frame),
            flags: FLAGS.map(|flag| flag.is_out(frame)),
            penalties: frame.field.iter().find(|car| car.is_player).map(|car| car.penalties),
            damage: frame.damage.as_ref().map(|d| DamageReading { dents: d.dents, detached: d.detached_parts }),
            engine: EngineHeat::of(frame, limits, prev.map(|p| p.engine).unwrap_or_default()),
            water_temp: frame.car.water_temp,
            oil_temp: frame.car.oil_temp,
            fuel: frame.car.fuel,
            fuel_per_lap: frame.car.fuel_per_lap,
        }
    }

    fn knob(&self, knob: Knob) -> (f64, f64) {
        self.knobs[knob as usize]
    }

    fn flag(&self, flag: FlagKind) -> bool {
        self.flags[flag as usize]
    }
}

/// In the car and out of the garage.
fn driving(frame: &TelemetryFrame) -> bool {
    frame.session.in_car && frame.car.in_garage != Some(true)
}

/// What takes an alert down before its time runs out (or while it waits to be acknowledged):
/// its condition is over.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Ends {
    FlagIn(FlagKind),
    Refuelled,
}

impl Ends {
    fn ended(self, now: &Readings, refuelled: bool) -> bool {
        match self {
            Ends::FlagIn(flag) => !now.flag(flag),
            Ends::Refuelled => refuelled,
        }
    }
}

/// `fuel_low` fires once per stint, when the laps of fuel left drop through the threshold:
/// disarmed when it fires (so a fuel-per-lap estimate wobbling round the threshold fires once),
/// armed again once the car has taken on `REFUEL_LITERS` more than the lowest it has been since.
/// A crossing, not a level, so a car being refuelled through the threshold never fires.
#[derive(Clone, Copy, Debug)]
struct FuelWatch {
    armed: bool,
    lowest: f64,
}

impl Default for FuelWatch {
    fn default() -> Self {
        FuelWatch { armed: true, lowest: 0.0 }
    }
}

impl FuelWatch {
    /// Follows the fuel level; true on the frame a refuel re-arms the alert.
    fn follow(&mut self, fuel: f64) -> bool {
        if self.armed {
            return false;
        }
        if fuel >= self.lowest + REFUEL_LITERS {
            self.armed = true;
            return true;
        }
        self.lowest = self.lowest.min(fuel);
        false
    }

    /// The laps of fuel left when they have just dropped to `laps_left` or below while driving.
    fn fire(&mut self, now: &Readings, prev: Option<&Readings>, laps_left: f64) -> Option<f64> {
        let laps = |r: &Readings| (r.fuel_per_lap > 0.0).then(|| r.fuel / r.fuel_per_lap);
        let (Some(laps_now), Some(laps_before)) = (laps(now), prev.and_then(laps)) else {
            return None;
        };
        if !self.armed || !now.driving || laps_now > laps_left || laps_before <= laps_left {
            return None;
        }
        self.armed = false;
        self.lowest = now.fuel;
        Some(laps_now)
    }
}

/// One layout alert's settings as the tracker reads them. The TypeScript reads them unchecked
/// from the stored JSON; here a field of the wrong type reads as absent (and the span as 0).
pub(crate) struct AlertSpec<'a> {
    pub(crate) alert_type: DashAlertType,
    pub(crate) enabled: bool,
    display: Option<DisplayMode>,
    color_token: Option<&'a str>,
    duration_seconds: Option<f64>,
    invert_colors: Option<bool>,
    until_ack: bool,
    laps_left: f64,
    span: AlertSpan,
    fields: &'a Map<String, Value>,
}

impl<'a> AlertSpec<'a> {
    /// `None` for a type this renderer does not know.
    pub(crate) fn of(alert: &'a DashAlert, layout: &DashLayout) -> Option<AlertSpec<'a>> {
        let f = &alert.fields;
        let num = |key: &str| f.get(key).and_then(Value::as_f64);
        Some(AlertSpec {
            alert_type: DashAlertType::parse(&alert.alert_type)?,
            enabled: js_truthy(f.get("enabled")),
            display: DisplayMode::parse(f.get("displayMode")),
            color_token: f.get("colorToken").and_then(Value::as_str),
            duration_seconds: num("durationSeconds"),
            invert_colors: f.get("invertColors").and_then(Value::as_bool),
            until_ack: f.get("untilAck") == Some(&Value::Bool(true)),
            laps_left: clamp(num("lapsLeft").unwrap_or(FUEL_LAPS_LEFT), FUEL_LAPS_LEFT_MIN, FUEL_LAPS_LEFT_MAX),
            fields: f,
            span: AlertSpan {
                col: num("col").unwrap_or(0.0),
                row: num("row").unwrap_or(0.0),
                col_span: num("colSpan").unwrap_or(0.0),
                row_span: num("rowSpan").unwrap_or(0.0),
                grid_cols: layout.grid_cols,
                grid_rows: layout.grid_rows,
            },
        })
    }

    /// Where the popup sits: the alert's own choice when it has one, otherwise the layout's.
    fn placement(&self, config: &ResolvedAlertConfig) -> AlertPlacement {
        match self.display.unwrap_or(config.display) {
            DisplayMode::Full => AlertPlacement::Full,
            DisplayMode::Strip => AlertPlacement::Strip,
            DisplayMode::Center => AlertPlacement::Center(self.span),
        }
    }

    /// The size of a popup that has no grid rect of its own (the multi-dial popup): a centered
    /// one shows full.
    pub(crate) fn size(&self, config: &ResolvedAlertConfig) -> AlertSize {
        if self.placement(config) == AlertPlacement::Strip { AlertSize::Strip } else { AlertSize::Full }
    }

    pub(crate) fn inverted(&self, config: &ResolvedAlertConfig) -> bool {
        self.invert_colors.unwrap_or(config.invert_colors)
    }

    /// How long it stays up, seconds; `None` until the driver acknowledges it. Unset, the lap
    /// summary takes `LAP_SUMMARY_SECONDS` and everything else the layout's duration (or
    /// `fallback` when that is not positive).
    pub(crate) fn seconds(&self, config: &ResolvedAlertConfig, fallback: f64) -> Option<f64> {
        if self.until_ack {
            return None;
        }
        let default = match self.alert_type {
            DashAlertType::LapSummary => LAP_SUMMARY_SECONDS,
            _ if config.duration_seconds <= 0.0 => fallback,
            _ => config.duration_seconds,
        };
        Some(clamp(self.duration_seconds.unwrap_or(default), MIN_ALERT_SECONDS, self.alert_type.max_seconds()))
    }

    /// The colour of a setting popup: the setting's identity colour, or the one its colour token names.
    fn knob_color(&self, knob: Knob, config: &ResolvedAlertConfig, palette: &DashPaletteColors) -> Rgba {
        resolve_alert_color(Some(self.color_token.unwrap_or(&config.color_token)), knob.color(palette), palette)
    }

    /// One of the alert's own number settings, kept to `min..=max`; `fallback` when it has none.
    fn number(&self, key: &str, fallback: f64, min: f64, max: f64) -> f64 {
        clamp(self.fields.get(key).and_then(Value::as_f64).unwrap_or(fallback), min, max)
    }
}

/// What a detector raises, before it is placed.
struct Raised {
    title: &'static str,
    value: String,
    detail: Option<String>,
    color: Rgba,
    ends: Option<Ends>,
}

impl Raised {
    fn new(title: &'static str, value: impl Into<String>, detail: Option<String>, color: Rgba) -> Raised {
        Raised { title, value: value.into(), detail, color, ends: None }
    }

    fn ending(self, ends: Ends) -> Raised {
        Raised { ends: Some(ends), ..self }
    }

    fn popup(self, spec: &AlertSpec, config: &ResolvedAlertConfig) -> DashAlertPopup {
        DashAlertPopup {
            alert_type: spec.alert_type,
            title: self.title.to_owned(),
            value: self.value,
            detail: self.detail,
            color: self.color,
            invert_colors: spec.inverted(config),
            placement: spec.placement(config),
        }
    }
}

/// "WAS 4": the value before a setting change. Never the setting's highest step: the dash shows
/// no maximum anywhere.
fn was(previous: &str) -> String {
    format!("WAS {previous}")
}

/// The engine's readings for its warning: "WATER 118° · OIL 142°", whichever the game reports.
fn engine_temps(now: &Readings, units: Units) -> Option<String> {
    let temps: Vec<String> = [("WATER", now.water_temp), ("OIL", now.oil_temp)]
        .into_iter()
        .filter_map(|(name, temp)| temp.filter(|t| t.is_finite()).map(|t| format!("{name} {}", format_degrees(t, units))))
        .collect();
    (!temps.is_empty()).then(|| temps.join(" · "))
}

/// What `spec` raises on this frame, given the last one (`None`: nothing to diff against yet).
fn detect(
    spec: &AlertSpec,
    now: &Readings,
    prev: Option<&Readings>,
    fuel: &mut FuelWatch,
    config: &ResolvedAlertConfig,
    palette: &DashPaletteColors,
    units: Units,
) -> Option<Raised> {
    if spec.alert_type == DashAlertType::FuelLow {
        let laps = fuel.fire(now, prev, spec.laps_left)?;
        return Some(Raised::new("FUEL", to_fixed(laps, 1), Some("LAPS LEFT".to_owned()), palette.critical).ending(Ends::Refuelled));
    }
    let prev = prev?;
    match spec.alert_type {
        // The overlay, and the live alerts (`live`).
        DashAlertType::PitLimiter | DashAlertType::Launch | DashAlertType::PitNow | DashAlertType::LiftNow => None,
        DashAlertType::Flag => {
            let flag = FLAGS.into_iter().find(|flag| now.flag(*flag) && !prev.flag(*flag))?;
            Some(Raised::new("FLAG", flag.name(), None, flag.color(palette)).ending(Ends::FlagIn(flag)))
        }
        DashAlertType::Penalty => match (now.penalties, prev.penalties) {
            (Some(count), Some(before)) if count > before => {
                Some(Raised::new("PENALTY", js_number_string(count), Some("TO SERVE".to_owned()), palette.critical))
            }
            _ => None,
        },
        DashAlertType::Damage => {
            let (damage, before) = (now.damage?, prev.damage?);
            // The worst new dent (the first place on a tie), and whether a part just came off.
            let dent = (0..DENT_PLACES.len())
                .filter(|&i| damage.dents[i] > before.dents[i])
                .max_by(|&a, &b| damage.dents[a].total_cmp(&damage.dents[b]).then(b.cmp(&a)));
            let part_off = damage.detached && !before.detached;
            let heavy = dent.is_some_and(|i| damage.dents[i] >= 2.0);
            let color = if heavy || part_off { palette.critical } else { palette.warning };
            match dent {
                Some(i) => {
                    let severity = if heavy { "HEAVY" } else { "LIGHT" };
                    let detail = if part_off { format!("{severity} · PART OFF") } else { severity.to_owned() };
                    Some(Raised::new("DAMAGE", DENT_PLACES[i], Some(detail), color))
                }
                None => part_off.then(|| Raised::new("DAMAGE", "PART OFF", None, color)),
            }
        }
        // The game's overheating, or the water or oil reaching the driver's limit.
        DashAlertType::EngineWarning => {
            (now.engine.hot() && !prev.engine.hot()).then(|| Raised::new("ENGINE", "OVERHEAT", engine_temps(now, units), palette.critical))
        }
        alert_type => Knob::of(alert_type).iter().find_map(|&knob| {
            if knob.only_while_driving() && !(now.driving && prev.driving) {
                return None;
            }
            let ((value, _), (before, _)) = (now.knob(knob), prev.knob(knob));
            let (value, previous) = (knob.shown(value), knob.shown(before));
            (value != previous).then(|| Raised::new(knob.title(), value, Some(was(&previous)), spec.knob_color(knob, config, palette)))
        }),
    }
}

/// What a live alert shows on this frame, or `None` while its condition does not hold (only
/// while driving, never in the pit lane):
/// - launch: the clutch pressed past its point and the car slower than its speed: LAUNCH and the
///   revs, green while the revs and the throttle are inside their windows, amber otherwise;
/// - pit now: on the last quarter of the lap when what runs out first (fuel or virtual energy)
///   will not last another full lap after this one, unless it reaches the flag;
/// - lift now: while the game's lift-and-coast cue is above the lift point.
fn live(spec: &AlertSpec, frame: &TelemetryFrame, palette: &DashPaletteColors, limits: &AlertLimits) -> Option<Raised> {
    let car = &frame.car;
    if !driving(frame) || car.in_pit_lane == Some(true) {
        return None;
    }
    match spec.alert_type {
        DashAlertType::Launch => {
            let window = LaunchWindow::of(spec);
            if car.clutch * 100.0 <= window.clutch_percent || car.speed_ms * 3.6 >= window.speed_kmh {
                return None;
            }
            let throttle = car.throttle * 100.0;
            let inside = |(from, to): (f64, f64), value: f64| from <= value && value <= to;
            let ready = inside(window.rpm, car.rpm) && inside(window.throttle_percent, throttle);
            let detail = format!("THROTTLE {}%", js_number_string(throttle.round()));
            Some(Raised::new("LAUNCH", js_number_string(car.rpm.round()), Some(detail), if ready { palette.success } else { palette.warning }))
        }
        DashAlertType::PitNow => {
            let into_lap = frame.lap.track_position.clamp(0.0, 1.0);
            let (title, left) = match range(frame)? {
                Range::Fuel(laps) => ("FUEL", laps),
                Range::Energy(laps) => ("ENERGY", laps),
            };
            let short = into_lap >= PIT_NOW_FROM_LAP_SHARE && left - (1.0 - into_lap) < 1.0;
            let reaches_flag = race_laps_left(frame).is_some_and(|race| race <= left);
            (short && !reaches_flag).then(|| Raised::new(title, "PIT NOW", Some(format!("{} LAPS LEFT", to_fixed(left, 1))), palette.critical))
        }
        DashAlertType::LiftNow => (frame.energy.lift_and_coast > limits.lift_point).then(|| Raised::new("LIFT & COAST", "LIFT NOW", None, palette.warning)),
        _ => None,
    }
}

/// The made-up lap the designer plays the lap review with (`SAMPLE_LAP` in alerts.ts): a new best
/// whose sectors show all three timing colours.
const SAMPLE_LAP: LapSummary = LapSummary {
    lap: 12.0,
    total_laps: Some(24.0),
    position: Some(4.0),
    total_positions: Some(22.0),
    lap_time: 124.912,
    valid: true,
    lap_delta: Some(-0.214),
    best_lap: Some(124.912),
    target_delta: Some(-0.088),
    sectors: [
        Some(LapSector { seconds: 38.412, rating: SectorState::PersonalBest, delta: Some(-0.104) }),
        Some(LapSector { seconds: 44.187, rating: SectorState::Fastest, delta: Some(-0.051) }),
        Some(LapSector { seconds: 42.313, rating: SectorState::Slower, delta: Some(0.213) }),
    ],
    fuel_used: Some(2.41),
    fuel_delta: Some(-0.09),
    fuel_left_laps: Some(12.4),
    energy_used: Some(4.2),
    energy_left_laps: Some(13.8),
    tyre_wear_left: Some(81.0),
    gap_ahead: Some(1.384),
    top_speed: Some(86.4),
};

/// The multi-dial popup the designer plays `dial_change` with.
const SAMPLE_DIAL: (&str, &str, &str) = ("MULTI", "TC2", dash_color::YELLOW);

/// The made-up popup content the designer plays `spec` with (the `SAMPLES` table in alerts.ts).
fn sample(spec: &AlertSpec, config: &ResolvedAlertConfig, palette: &DashPaletteColors, units: Units) -> Option<Raised> {
    let raised = match spec.alert_type {
        DashAlertType::PitLimiter => return None,
        DashAlertType::Flag => Raised::new("FLAG", FlagKind::Yellow.name(), None, FlagKind::Yellow.color(palette)),
        DashAlertType::Penalty => Raised::new("PENALTY", "1", Some("TO SERVE".to_owned()), palette.critical),
        DashAlertType::Damage => Raised::new("DAMAGE", "FRONT LEFT", Some("HEAVY".to_owned()), palette.critical),
        DashAlertType::EngineWarning => {
            let detail = format!("WATER {} · OIL {}", format_degrees(118.0, units), format_degrees(142.0, units));
            Raised::new("ENGINE", "OVERHEAT", Some(detail), palette.critical)
        }
        DashAlertType::FuelLow => Raised::new("FUEL", "1.8", Some("LAPS LEFT".to_owned()), palette.critical),
        // Inside its window, as the driver wants to see it.
        DashAlertType::Launch => Raised::new("LAUNCH", "5400", Some("THROTTLE 25%".to_owned()), palette.success),
        DashAlertType::PitNow => Raised::new("FUEL", "PIT NOW", Some("1.1 LAPS LEFT".to_owned()), palette.critical),
        DashAlertType::LiftNow => Raised::new("LIFT & COAST", "LIFT NOW", None, palette.warning),
        alert_type => {
            let knob = *Knob::of(alert_type).first()?;
            let (value, previous) = knob.sample();
            Raised::new(knob.title(), value, Some(was(previous)), spec.knob_color(knob, config, palette))
        }
    };
    Some(raised)
}

/// The popup `alert` would show, with made-up values, for the designer to play on the dash so its
/// look can be set without turning a knob in the car. Built exactly as a real one is, so it
/// honours the alert's own look and the layout's, and prints in `units`. `None` for a type the
/// tracker does not know, and for the pit limiter, which is an overlay, not a popup.
pub fn preview_alert_banner(layout: &DashLayout, alert: &DashAlert, palette: &DashPaletteColors, units: Units) -> Option<DashAlertBanner> {
    let spec = AlertSpec::of(alert, layout)?;
    let config = read_alert_config(layout.alert_config.as_ref());
    match spec.alert_type {
        DashAlertType::LapSummary => Some(DashAlertBanner::LapSummary(Box::new(SAMPLE_LAP))),
        DashAlertType::DialChange => {
            let (caption, label, color) = SAMPLE_DIAL;
            Some(DashAlertBanner::MultiDial(DashMultiDialPopup {
                caption: caption.to_owned(),
                label: label.to_owned(),
                color: Rgba::hex(color),
                inverted: spec.inverted(&config),
                size: spec.size(&config),
            }))
        }
        _ => Some(DashAlertBanner::Alert(sample(&spec, &config, palette, units)?.popup(&spec, &config))),
    }
}

/// One alert that is up: until when (`None`: until acknowledged) and what ends it early.
#[derive(Clone, Debug)]
struct UpAlert {
    alert_type: DashAlertType,
    banner: DashAlertBanner,
    until: Option<f64>,
    ends: Option<Ends>,
}

/// Feeds frames through the detectors and holds what they raise. Alerts that are up stack, newest
/// on top and at most one per type (a new one replaces its type's older one): the top one shows,
/// and when it runs out, is acknowledged or its condition ends, the one beneath shows again, so a
/// penalty held until acknowledged is never lost under a passing TC change. A live alert is
/// raised when its condition starts, follows the frame while it holds and goes when it ends; once
/// it has run out or been acknowledged it stays down until its condition ends and starts again.
/// The flag out (the highest) is kept for its bar, which Ack hides until the flag changes. Time is
/// supplied explicitly via `advance_to` (milliseconds) rather than read from a clock.
#[derive(Clone, Debug)]
pub struct DashAlertTracker {
    fallback_duration_seconds: f64,
    laps: LapSummaryWatcher,
    fuel: FuelWatch,
    now: f64,
    prev: Option<Readings>,
    up: Vec<UpAlert>,
    /// The live alerts whose condition held on the last frame.
    holding: Vec<DashAlertType>,
    /// The flag out on the last frame (`None` with none out, or the flag alert off), its bar,
    /// and whether Ack hid it.
    flag: Option<FlagKind>,
    flag_bar: Option<FlagBar>,
    flag_bar_hidden: bool,
}

impl Default for DashAlertTracker {
    fn default() -> Self {
        DashAlertTracker::new(DEFAULT_DURATION_SECONDS)
    }
}

impl DashAlertTracker {
    pub fn new(fallback_duration_seconds: f64) -> DashAlertTracker {
        DashAlertTracker {
            fallback_duration_seconds,
            laps: LapSummaryWatcher::default(),
            fuel: FuelWatch::default(),
            now: 0.0,
            prev: None,
            up: Vec::new(),
            holding: Vec::new(),
            flag: None,
            flag_bar: None,
            flag_bar_hidden: false,
        }
    }

    /// Advances the tracker's clock to `now_ms` (milliseconds; only differences are read). Call before `evaluate`.
    pub fn advance_to(&mut self, now_ms: f64) {
        self.now = now_ms;
    }

    /// Feeds a frame in and returns the popup to draw this tick, or `None` when none is up.
    /// `targets` is the driver's plan in force; the lap summary scores each lap against the
    /// targets it was driven with. A popup's values print in `units`.
    pub fn evaluate(
        &mut self,
        layout: &DashLayout,
        frame: &TelemetryFrame,
        palette: &DashPaletteColors,
        targets: Option<&DashTargets>,
        units: Units,
    ) -> Option<&DashAlertBanner> {
        let config = read_alert_config(layout.alert_config.as_ref());
        let limits = alert_limits(layout);
        let enabled = || layout.alerts.iter().filter_map(|alert| AlertSpec::of(alert, layout)).filter(|spec| spec.enabled);
        let readings = Readings::of(frame, &limits.engine, self.prev.as_ref());

        // Followed even while fuel_low is off, so turning it on mid-stint knows the stint.
        let refuelled = self.fuel.follow(readings.fuel);
        self.up.retain(|up| !up.ends.is_some_and(|ends| ends.ended(&readings, refuelled)));

        // Watched even while the summary is off, so turning it on mid-session has a lap to compare.
        let summary = self.laps.observe(frame, self.now, targets);
        if let (Some(summary), Some(spec)) = (summary, enabled().find(|spec| spec.alert_type == DashAlertType::LapSummary)) {
            let until = self.until(&spec, &config);
            self.raise(UpAlert { alert_type: DashAlertType::LapSummary, banner: DashAlertBanner::LapSummary(Box::new(summary)), until, ends: None });
        }

        // Anything raised on the summary's frame goes on top of it: it is the driver's own input.
        // Of several raised on one frame, the last configured ends up on top.
        for spec in enabled() {
            if let Some(raised) = detect(&spec, &readings, self.prev.as_ref(), &mut self.fuel, &config, palette, units) {
                let until = self.until(&spec, &config);
                let ends = raised.ends;
                self.raise(UpAlert { alert_type: spec.alert_type, banner: DashAlertBanner::Alert(raised.popup(&spec, &config)), until, ends });
            }
        }

        for alert_type in DashAlertType::LIVE {
            let spec = enabled().find(|spec| spec.alert_type == alert_type);
            let shown = spec.as_ref().and_then(|spec| Some(live(spec, frame, palette, &limits)?.popup(spec, &config)));
            match (shown, spec) {
                (Some(popup), Some(spec)) => self.follow_live(&spec, popup, &config),
                _ => {
                    self.holding.retain(|held| *held != alert_type);
                    self.up.retain(|up| up.alert_type != alert_type);
                }
            }
        }

        // A changed flag (another one, or none) brings a bar Ack hid back.
        let flag = FLAGS.into_iter().find(|flag| readings.flag(*flag)).filter(|_| enabled().any(|spec| spec.alert_type == DashAlertType::Flag));
        if flag != self.flag {
            self.flag_bar_hidden = false;
        }
        (self.flag, self.flag_bar) = (flag, flag.map(|flag| flag.bar(palette)));

        self.prev = Some(readings);
        self.current()
    }

    /// A live alert whose condition holds: raised when it has just started, otherwise its popup
    /// follows the frame where it is in the stack (if it has not run out or been acknowledged).
    fn follow_live(&mut self, spec: &AlertSpec, popup: DashAlertPopup, config: &ResolvedAlertConfig) {
        if self.holding.contains(&spec.alert_type) {
            if let Some(up) = self.up.iter_mut().find(|up| up.alert_type == spec.alert_type) {
                up.banner = DashAlertBanner::Alert(popup);
            }
            return;
        }
        self.holding.push(spec.alert_type);
        let until = self.until(spec, config);
        self.raise(UpAlert { alert_type: spec.alert_type, banner: DashAlertBanner::Alert(popup), until, ends: None });
    }

    fn until(&self, spec: &AlertSpec, config: &ResolvedAlertConfig) -> Option<f64> {
        spec.seconds(config, self.fallback_duration_seconds).map(|seconds| self.now + seconds * 1000.0)
    }

    fn raise(&mut self, alert: UpAlert) {
        self.up.retain(|up| up.alert_type != alert.alert_type);
        self.up.push(alert);
    }

    /// The bar of the flag out, unless Ack hid it: under the flag's own popup while that is up
    /// (the dash leaves it out then), across the top after.
    pub fn flag_bar(&self) -> Option<FlagBar> {
        self.flag_bar.filter(|_| !self.flag_bar_hidden)
    }

    /// The popup up at the tracker's clock, without feeding a frame: what `evaluate` would
    /// return for a repeat of the last frame. Drops what has run out.
    pub fn current(&mut self) -> Option<&DashAlertBanner> {
        let now = self.now;
        self.up.retain(|up| up.until.is_none_or(|until| now < until));
        self.up.last().map(|up| &up.banner)
    }

    /// True while the popup up now runs out by itself (false when none is up or it waits to be
    /// acknowledged).
    pub fn expires(&mut self) -> bool {
        self.current();
        self.up.last().is_some_and(|up| up.until.is_some())
    }

    /// The driver acknowledged: the popup up now goes at once (what was beneath it shows again);
    /// with none up, the flag bar goes until the flag changes.
    pub fn acknowledge(&mut self) {
        self.current();
        if self.up.pop().is_none() && self.flag_bar.is_some() {
            self.flag_bar_hidden = true;
        }
    }

    /// Clears change-tracking state (call when the link goes offline so a stale diff doesn't
    /// fire on reconnect). Fuel stays watched: a stint does not restart because the link did.
    pub fn reset(&mut self) {
        self.prev = None;
        self.up.clear();
        self.holding.clear();
        self.flag = None;
        self.flag_bar = None;
        self.flag_bar_hidden = false;
        self.laps.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lap_summary::tests::at;
    use crate::model::{Damage, FieldCar};
    use crate::palette::{DEFAULT_DASH_PALETTE, DashThemePreset, dash_setting_colors};
    use serde_json::json;

    const P: DashPaletteColors = DEFAULT_DASH_PALETTE;

    /// The alerts.test.ts frame: TC/ABS/map maxima of 9, the given electronics changes applied.
    fn frame(edit: impl FnOnce(&mut crate::model::Electronics)) -> TelemetryFrame {
        let mut frame = TelemetryFrame::default();
        let e = &mut frame.electronics;
        (e.tc_max, e.abs_max, e.motor_map_max) = (9.0, 9.0, 9.0);
        (e.abs_available, e.tc_available, e.motor_map_available) = (true, true, true);
        edit(e);
        frame
    }

    fn tc(value: f64) -> TelemetryFrame {
        frame(|e| e.tc = value)
    }

    /// A frame of a driver in the car on track, with `edit` applied.
    fn driving(edit: impl FnOnce(&mut TelemetryFrame)) -> TelemetryFrame {
        let mut frame = TelemetryFrame::default();
        frame.session.in_car = true;
        frame.car.in_garage = Some(false);
        frame.field = vec![FieldCar { is_player: true, ..FieldCar::default() }];
        frame.damage = Some(Damage::default());
        edit(&mut frame);
        frame
    }

    fn alert(overrides: serde_json::Value) -> serde_json::Value {
        let mut alert = json!({ "id": "a1", "type": "tc_change", "enabled": true, "col": 6, "row": 3, "colSpan": 8, "rowSpan": 6 });
        for (key, value) in overrides.as_object().cloned().unwrap_or_default() {
            alert[key] = value;
        }
        alert
    }

    fn layout(alerts: serde_json::Value, alert_config: Option<serde_json::Value>) -> DashLayout {
        let mut raw = json!({ "id": "l1", "name": "Layout", "mode": "basic", "gridCols": 20, "gridRows": 12, "pages": [], "alerts": alerts });
        if let Some(config) = alert_config {
            raw["alertConfig"] = config;
        }
        crate::model::parse_scene(json!({ "layout": raw, "width": 800, "height": 480 }).to_string().as_bytes()).expect("layout").layout
    }

    fn one(overrides: serde_json::Value) -> DashLayout {
        layout(json!([alert(overrides)]), None)
    }

    fn popup(banner: Option<&DashAlertBanner>) -> DashAlertPopup {
        match banner {
            Some(DashAlertBanner::Alert(popup)) => popup.clone(),
            other => panic!("expected an alert popup, got {other:?}"),
        }
    }

    /// (title, value, detail) of the popup up.
    fn shown(banner: Option<&DashAlertBanner>) -> (String, String, Option<String>) {
        let p = popup(banner);
        (p.title, p.value, p.detail)
    }

    fn preset(token: &str) -> &'static DashThemePreset {
        find_preset_by_alert_color_token(Some(token)).expect("a preset")
    }

    #[test]
    fn no_banner_on_the_first_frame_there_is_nothing_to_diff_against_yet() {
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&one(json!({})), &tc(5.0), &P, None, Units::Metric), None);
    }

    #[test]
    fn a_tc_change_fires_once_the_value_differs_from_the_previous_frame() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({}));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        let banner = popup(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric));
        assert_eq!(
            (banner.title.as_str(), banner.value.as_str(), banner.detail.as_deref()),
            ("TC", "5", Some("WAS OFF")),
            "TC at 0 is off, and never the maximum"
        );
        assert_eq!(banner.alert_type, DashAlertType::TcChange);
        assert_eq!(banner.color, dash_setting_colors::TC);
        assert_eq!(banner.placement, AlertPlacement::Full, "full screen unless the alert or the layout says otherwise");

        // A theme's own TC colour paints the popup.
        let themed = DashPaletteColors { setting_tc: Rgba::hex("#123456"), ..P };
        assert_eq!(popup(tracker.evaluate(&l, &tc(6.0), &themed, None, Units::Metric)).color, Rgba::hex("#123456"));
    }

    #[test]
    fn the_tc_alert_also_fires_on_tc_slip_and_tc_cut_naming_which_one_moved() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({}));
        let knobs = |slip: f64, cut: f64| {
            frame(|e| {
                (e.tc_slip, e.tc_slip_max, e.tc_cut, e.tc_cut_max) = (slip, 9.0, cut, 9.0);
            })
        };
        tracker.evaluate(&l, &knobs(2.0, 3.0), &P, None, Units::Metric);
        assert_eq!(shown(tracker.evaluate(&l, &knobs(4.0, 3.0), &P, None, Units::Metric)), ("TC SLIP".into(), "4".into(), Some("WAS 2".into())));
        assert_eq!(shown(tracker.evaluate(&l, &knobs(4.0, 1.0), &P, None, Units::Metric)), ("TC 2".into(), "1".into(), Some("WAS 3".into())));
        assert_eq!(popup(tracker.current()).color, dash_setting_colors::TC);
    }

    #[test]
    fn a_brake_bias_change_fires_on_the_shown_value_so_noise_below_one_decimal_stays_quiet() {
        let bias = |rear: f64| {
            let mut f = frame(|_| {});
            f.car.brake_bias_rear = rear;
            f
        };
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "type": "bias_change" }));
        tracker.evaluate(&l, &bias(0.462), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &bias(0.46201), &P, None, Units::Metric), None);
        let banner = popup(tracker.evaluate(&l, &bias(0.465), &P, None, Units::Metric));
        assert_eq!(banner.title, "BIAS");
        assert_eq!(banner.value, "53.5", "the front share");
        assert_eq!(banner.detail.as_deref(), Some("WAS 53.8"), "no maximum");
        assert_eq!(banner.color, dash_setting_colors::BRAKE_BIAS);
    }

    #[test]
    fn migration_and_anti_roll_bar_changes_alert_only_while_driving() {
        let l = layout(json!([alert(json!({ "id": "m", "type": "migration_change" })), alert(json!({ "id": "a", "type": "arb_change" }))]), None);
        let car = |migration: f64, rear_arb: f64, in_car: bool| {
            driving(|f| {
                (f.electronics.migration, f.electronics.migration_max, f.electronics.rear_anti_roll_bar, f.electronics.rear_anti_roll_bar_max) =
                    (migration, 5.0, rear_arb, 6.0);
                f.session.in_car = in_car;
            })
        };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &car(0.0, 0.0, false), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &car(2.0, 3.0, true), &P, None, Units::Metric), None, "getting into the car is no change");
        assert_eq!(shown(tracker.evaluate(&l, &car(3.0, 3.0, true), &P, None, Units::Metric)), ("MIGRATION".into(), "3".into(), Some("WAS 2".into())));
        assert_eq!(popup(tracker.current()).color, dash_setting_colors::MIGRATION);
        assert_eq!(shown(tracker.evaluate(&l, &car(3.0, 4.0, true), &P, None, Units::Metric)), ("ARB R".into(), "4".into(), Some("WAS 3".into())));
        assert_eq!(popup(tracker.current()).color, dash_setting_colors::ARB);
        let mut garage = car(4.0, 5.0, true);
        garage.car.in_garage = Some(true);
        tracker.acknowledge();
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &garage, &P, None, Units::Metric), None, "set in the garage");
    }

    #[test]
    fn the_pit_limiter_raises_no_popup_its_setting_only_turns_the_overlay_on() {
        let l = one(json!({ "type": "pit_limiter" }));
        let limiter = |on: bool| driving(|f| f.car.pit_limiter = Some(on));
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &limiter(false), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &limiter(true), &P, None, Units::Metric), None);
        assert!(pit_limiter_alert_on(&l));
        assert!(!pit_limiter_alert_on(&one(json!({ "type": "pit_limiter", "enabled": false }))));
        assert!(!pit_limiter_alert_on(&one(json!({ "type": "flag" }))), "a layout without the alert shows none");
        assert_eq!(preview_alert_banner(&l, &l.alerts[0], &P, Units::Metric), None);
    }

    #[test]
    fn a_new_flag_names_the_highest_one_that_just_came_out_in_its_signal_colour() {
        let l = one(json!({ "type": "flag" }));
        let flags = |yellow: bool, double: bool, sc: bool, blue: bool| {
            driving(|f| {
                (f.flags.yellow, f.flags.double_yellow, f.flags.safety_car) = (yellow, double, sc);
                f.field[0].blue_flag = blue;
            })
        };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &flags(false, false, false, false), &P, None, Units::Metric);
        let yellow = popup(tracker.evaluate(&l, &flags(true, false, false, false), &P, None, Units::Metric));
        assert_eq!((yellow.title.as_str(), yellow.value.as_str(), yellow.color), ("FLAG", "YELLOW", P.race_control_yellow));
        assert_eq!(shown(tracker.evaluate(&l, &flags(true, true, true, false), &P, None, Units::Metric)).1, "SAFETY CAR", "safety car over double yellow");
        // It replaced the yellow's alert; going in, it takes its own down, and the yellows still
        // out are no new flag.
        assert_eq!(tracker.evaluate(&l, &flags(true, true, false, false), &P, None, Units::Metric), None);
        let blue = popup(tracker.evaluate(&l, &flags(true, true, false, true), &P, None, Units::Metric));
        assert_eq!((blue.value.as_str(), blue.color), ("BLUE", Rgba::hex(dash_color::BLUE)));
    }

    #[test]
    fn a_penalty_fires_when_the_players_count_goes_up_never_on_the_field_appearing() {
        let l = one(json!({ "type": "penalty", "untilAck": true }));
        let penalties = |count: f64| driving(|f| f.field[0].penalties = count);
        let mut tracker = DashAlertTracker::default();
        let mut no_field = penalties(0.0);
        no_field.field.clear();
        tracker.evaluate(&l, &no_field, &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &penalties(1.0), &P, None, Units::Metric), None, "the player's car appearing is no new penalty");
        let banner = popup(tracker.evaluate(&l, &penalties(2.0), &P, None, Units::Metric));
        assert_eq!((banner.title.as_str(), banner.value.as_str(), banner.detail.as_deref(), banner.color), ("PENALTY", "2", Some("TO SERVE"), P.critical));
        assert!(tracker.evaluate(&l, &penalties(1.0), &P, None, Units::Metric).is_some(), "serving one does not take it down");
    }

    #[test]
    fn damage_names_the_worst_new_dent_and_a_part_coming_off() {
        let l = one(json!({ "type": "damage" }));
        let hit = |dents: [f64; 8], detached: bool| {
            driving(|f| {
                f.damage = Some(Damage { dents, overheating: false, detached_parts: detached });
            })
        };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &hit([0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], false), &P, None, Units::Metric);
        let light = popup(tracker.evaluate(&l, &hit([1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], false), &P, None, Units::Metric));
        assert_eq!((light.value.as_str(), light.detail.as_deref(), light.color), ("FRONT LEFT", Some("LIGHT"), P.warning));
        let heavy = popup(tracker.evaluate(&l, &hit([1.0, 1.0, 0.0, 1.0, 0.0, 2.0, 0.0, 0.0], true), &P, None, Units::Metric));
        assert_eq!((heavy.value.as_str(), heavy.detail.as_deref(), heavy.color), ("REAR", Some("HEAVY · PART OFF"), P.critical));
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &hit([0.0; 8], false), &P, None, Units::Metric), None, "a repaired car is no damage");
    }

    #[test]
    fn the_engine_warning_fires_when_the_engine_starts_overheating() {
        let l = one(json!({ "type": "engine_warning", "untilAck": true, "waterLimitCelsius": 120 }));
        let engine = |hot: bool| {
            driving(|f| {
                f.damage = Some(Damage { overheating: hot, ..Damage::default() });
                (f.car.water_temp, f.car.oil_temp) = (Some(117.6), None);
            })
        };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &engine(false), &P, None, Units::Metric);
        let banner = popup(tracker.evaluate(&l, &engine(true), &P, None, Units::Metric));
        assert_eq!((banner.title.as_str(), banner.value.as_str(), banner.detail.as_deref()), ("ENGINE", "OVERHEAT", Some("WATER 118°")));
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &engine(true), &P, None, Units::Metric), None, "still hot is not a new warning");

        let mut imperial = DashAlertTracker::default();
        imperial.evaluate(&l, &engine(false), &P, None, Units::Imperial);
        assert_eq!(popup(imperial.evaluate(&l, &engine(true), &P, None, Units::Imperial)).detail.as_deref(), Some("WATER 244°"), "117.6 °C is 243.7 °F");
    }

    #[test]
    fn the_engine_warning_also_fires_at_the_drivers_water_or_oil_limit_and_rearms_once_it_cools() {
        let l = one(json!({ "type": "engine_warning", "untilAck": true, "waterLimitCelsius": 105, "oilLimitCelsius": 130 }));
        let temps = |water: f64, oil: f64| driving(|f| (f.car.water_temp, f.car.oil_temp) = (Some(water), Some(oil)));
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &temps(100.0, 120.0), &P, None, Units::Metric);
        assert_eq!(
            shown(tracker.evaluate(&l, &temps(105.0, 120.0), &P, None, Units::Metric)),
            ("ENGINE".into(), "OVERHEAT".into(), Some("WATER 105° · OIL 120°".into()))
        );
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &temps(104.0, 120.0), &P, None, Units::Metric), None);
        assert_eq!(tracker.evaluate(&l, &temps(105.5, 120.0), &P, None, Units::Metric), None, "hovering at the limit warns once");
        tracker.evaluate(&l, &temps(102.9, 120.0), &P, None, Units::Metric);
        assert!(tracker.evaluate(&l, &temps(105.0, 120.0), &P, None, Units::Metric).is_some(), "cooled 2° under the limit, it warns again");
        tracker.acknowledge();
        tracker.evaluate(&l, &temps(100.0, 120.0), &P, None, Units::Metric);
        assert!(tracker.evaluate(&l, &temps(100.0, 131.0), &P, None, Units::Metric).is_some(), "the oil at its limit");
    }

    #[test]
    fn the_limits_the_widgets_warn_from_are_the_alerts_whether_or_not_they_are_on() {
        assert_eq!(alert_limits(&layout(json!([]), None)), AlertLimits::default());
        assert_eq!(AlertLimits::default().fuel, FuelWarning { amber: 4.0, red: 2.0 });
        let fuel = |fields: serde_json::Value| alert_limits(&one(fields)).fuel;
        assert_eq!(fuel(json!({ "type": "fuel_low", "enabled": false, "lapsLeft": 3, "warningLapsLeft": 6 })), FuelWarning { amber: 6.0, red: 3.0 });
        assert_eq!(
            fuel(json!({ "type": "fuel_low", "lapsLeft": 40, "warningLapsLeft": 2 })),
            FuelWarning { amber: FUEL_LAPS_LEFT_MAX, red: FUEL_LAPS_LEFT_MAX },
            "amber never under red"
        );
        let engine = one(json!({ "type": "engine_warning", "enabled": false, "waterLimitCelsius": 105, "oilLimitCelsius": 400 }));
        assert_eq!(alert_limits(&engine).engine, EngineLimits { water: 105.0, oil: ENGINE_LIMIT_MAX });
        assert_eq!(alert_limits(&one(json!({ "type": "lift_now", "enabled": false, "liftPoint": 200 }))).lift_point, 200.0);
        assert_eq!(alert_limits(&one(json!({ "type": "lift_now", "liftPoint": 300 }))).lift_point, LIFT_POINT_MAX);
    }

    /// A car standing on the grid, driven: clutch and throttle (0–1), revs, and its speed in km/h.
    fn launching(clutch: f64, throttle: f64, rpm: f64, kmh: f64) -> TelemetryFrame {
        driving(|f| {
            (f.car.clutch, f.car.throttle, f.car.rpm, f.car.speed_ms) = (clutch, throttle, rpm, kmh / 3.6);
        })
    }

    #[test]
    fn launch_shows_the_revs_while_the_clutch_is_in_and_the_car_slow_green_inside_the_window() {
        let l = one(json!({ "type": "launch", "untilAck": true, "rpmFrom": 5000, "rpmTo": 6000 }));
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&l, &launching(0.4, 0.0, 1200.0, 0.0), &P, None, Units::Metric), None, "clutch at 40 % is not past 50 %");
        let idle = popup(tracker.evaluate(&l, &launching(1.0, 0.0, 1200.0, 0.0), &P, None, Units::Metric));
        assert_eq!((idle.title.as_str(), idle.value.as_str(), idle.detail.as_deref(), idle.color), ("LAUNCH", "1200", Some("THROTTLE 0%"), P.warning));
        let ready = popup(tracker.evaluate(&l, &launching(1.0, 0.25, 5420.4, 0.0), &P, None, Units::Metric));
        assert_eq!((ready.value.as_str(), ready.detail.as_deref(), ready.color), ("5420", Some("THROTTLE 25%"), P.success), "it follows the frame");
        assert_eq!(popup(tracker.evaluate(&l, &launching(1.0, 0.4, 5420.0, 0.0), &P, None, Units::Metric)).color, P.warning, "too much throttle");
        assert_eq!(tracker.evaluate(&l, &launching(1.0, 0.25, 5420.0, 12.0), &P, None, Units::Metric), None, "moving off takes it down");

        // Acknowledged, it stays down until the clutch goes in again.
        tracker.evaluate(&l, &launching(1.0, 0.25, 5420.0, 0.0), &P, None, Units::Metric);
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &launching(1.0, 0.25, 5500.0, 0.0), &P, None, Units::Metric), None);
        tracker.evaluate(&l, &launching(0.0, 0.25, 5500.0, 0.0), &P, None, Units::Metric);
        assert!(tracker.evaluate(&l, &launching(1.0, 0.25, 5500.0, 0.0), &P, None, Units::Metric).is_some());

        let mut pits = launching(1.0, 0.25, 5500.0, 0.0);
        pits.car.in_pit_lane = Some(true);
        assert_eq!(DashAlertTracker::default().evaluate(&l, &pits, &P, None, Units::Metric), None, "never in the pit lane");
        let off = one(json!({ "type": "launch", "enabled": false }));
        assert_eq!(DashAlertTracker::default().evaluate(&off, &launching(1.0, 0.25, 5500.0, 0.0), &P, None, Units::Metric), None);
    }

    #[test]
    fn a_live_alert_runs_its_duration_unless_held_until_ack() {
        let l = one(json!({ "type": "launch", "durationSeconds": 2 }));
        let mut tracker = DashAlertTracker::default();
        tracker.advance_to(0.0);
        assert!(tracker.evaluate(&l, &launching(1.0, 0.0, 3000.0, 0.0), &P, None, Units::Metric).is_some());
        tracker.advance_to(2000.0);
        assert_eq!(tracker.evaluate(&l, &launching(1.0, 0.0, 3100.0, 0.0), &P, None, Units::Metric), None, "run out while the clutch is still in");
    }

    #[test]
    fn pit_now_shows_on_the_last_quarter_of_a_lap_the_fuel_or_energy_will_not_outlast_by_another() {
        let l = one(json!({ "type": "pit_now", "untilAck": true }));
        // At 4 L a lap; plenty of virtual energy.
        let lap = |into_lap: f64, fuel: f64| {
            driving(|f| {
                (f.car.fuel, f.car.fuel_per_lap, f.lap.track_position) = (fuel, 4.0, into_lap);
                (f.energy.virtual_energy, f.energy.virtual_energy_per_lap) = (80.0, 4.0);
            })
        };
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&l, &lap(0.7, 2.0), &P, None, Units::Metric), None, "not the last quarter yet");
        assert_eq!(tracker.evaluate(&l, &lap(0.8, 6.0), &P, None, Units::Metric), None, "1.5 laps: a whole lap left after this one");
        let pit = popup(tracker.evaluate(&l, &lap(0.8, 4.4), &P, None, Units::Metric));
        assert_eq!((pit.title.as_str(), pit.value.as_str(), pit.detail.as_deref(), pit.color), ("FUEL", "PIT NOW", Some("1.1 LAPS LEFT"), P.critical));
        assert_eq!(tracker.evaluate(&l, &lap(0.01, 5.0), &P, None, Units::Metric), None, "over the line it goes");

        let energy = driving(|f| {
            (f.car.fuel, f.car.fuel_per_lap, f.lap.track_position) = (40.0, 4.0, 0.9);
            (f.energy.virtual_energy, f.energy.virtual_energy_per_lap) = (4.0, 4.0);
        });
        assert_eq!(shown(DashAlertTracker::default().evaluate(&l, &energy, &P, None, Units::Metric)).0, "ENERGY", "the energy runs out first");

        let mut last_lap = lap(0.8, 4.4);
        (last_lap.session.max_laps, last_lap.lap.current_lap) = (10.0, 10.0);
        assert_eq!(DashAlertTracker::default().evaluate(&l, &last_lap, &P, None, Units::Metric), None, "it reaches the flag");
        let mut pitting = lap(0.8, 4.4);
        pitting.car.in_pit_lane = Some(true);
        assert_eq!(DashAlertTracker::default().evaluate(&l, &pitting, &P, None, Units::Metric), None, "already in");
    }

    #[test]
    fn lift_now_shows_while_the_cue_is_above_the_lift_point() {
        let cue = |value: f64| driving(|f| f.energy.lift_and_coast = value);
        let l = one(json!({ "type": "lift_now", "untilAck": true }));
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&l, &cue(220.0), &P, None, Units::Metric), None, "at the point, not above it");
        assert_eq!(shown(tracker.evaluate(&l, &cue(221.0), &P, None, Units::Metric)), ("LIFT & COAST".into(), "LIFT NOW".into(), None));
        assert_eq!(tracker.evaluate(&l, &cue(0.0), &P, None, Units::Metric), None);
        let early = one(json!({ "type": "lift_now", "untilAck": true, "liftPoint": 150 }));
        assert!(DashAlertTracker::default().evaluate(&early, &cue(160.0), &P, None, Units::Metric).is_some(), "the driver's own lift point");
    }

    #[test]
    fn a_new_flag_pops_up_then_stays_as_a_bar_that_ack_hides_until_the_flag_changes() {
        let l = one(json!({ "type": "flag", "durationSeconds": 3 }));
        let flags = |yellow: bool, sc: bool| driving(|f| (f.flags.yellow, f.flags.safety_car) = (yellow, sc));
        let yellow = FlagBar { color: P.race_control_yellow };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &flags(false, false), &P, None, Units::Metric);
        assert_eq!(tracker.flag_bar(), None);
        tracker.advance_to(100.0);
        assert_eq!(popup(tracker.evaluate(&l, &flags(true, false), &P, None, Units::Metric)).value, "YELLOW");
        assert_eq!(tracker.flag_bar(), Some(yellow), "the dash leaves it out under the popup");
        tracker.advance_to(3100.0);
        assert_eq!(tracker.evaluate(&l, &flags(true, false), &P, None, Units::Metric), None, "the popup is down after 3 s");
        assert_eq!(tracker.flag_bar(), Some(yellow), "the bar stays while it is out");

        tracker.acknowledge();
        tracker.evaluate(&l, &flags(true, false), &P, None, Units::Metric);
        assert_eq!(tracker.flag_bar(), None, "Ack hides it");
        tracker.evaluate(&l, &flags(true, true), &P, None, Units::Metric);
        assert_eq!(tracker.flag_bar(), Some(yellow), "a new flag (the safety car) brings it back");
        tracker.evaluate(&l, &flags(false, false), &P, None, Units::Metric);
        assert_eq!(tracker.flag_bar(), None, "the flags are in");

        let off = one(json!({ "type": "flag", "enabled": false }));
        let mut quiet = DashAlertTracker::default();
        quiet.evaluate(&off, &flags(true, false), &P, None, Units::Metric);
        assert_eq!(quiet.flag_bar(), None, "the flag alert off shows no bar");
        assert_eq!(flag_bar(&off, &flags(true, false), &P), None);
        assert_eq!(flag_bar(&layout(json!([]), None), &flags(true, false), &P), Some(yellow), "a still of a dash without the alert shows it");
    }

    #[test]
    fn fuel_low_fires_once_per_stint_and_rearms_after_refuelling() {
        let l = one(json!({ "type": "fuel_low", "untilAck": true, "lapsLeft": 3 }));
        let fuel = |liters: f64| {
            driving(|f| {
                (f.car.fuel, f.car.fuel_per_lap) = (liters, 4.0);
            })
        };
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&l, &fuel(2.0), &P, None, Units::Metric), None, "a level it starts at is no drop");
        assert_eq!(tracker.evaluate(&l, &fuel(12.4), &P, None, Units::Metric), None, "3.1 laps left");
        assert_eq!(shown(tracker.evaluate(&l, &fuel(11.6), &P, None, Units::Metric)), ("FUEL".into(), "2.9".into(), Some("LAPS LEFT".into())));
        tracker.acknowledge();
        tracker.evaluate(&l, &fuel(12.4), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &fuel(11.6), &P, None, Units::Metric), None, "once per stint, however the estimate wobbles");

        // Refuelling takes it down and re-arms it, and filling up through the threshold never fires.
        let mut refuel = DashAlertTracker::default();
        refuel.evaluate(&l, &fuel(12.4), &P, None, Units::Metric);
        refuel.evaluate(&l, &fuel(11.6), &P, None, Units::Metric);
        assert!(refuel.evaluate(&l, &fuel(12.0), &P, None, Units::Metric).is_some(), "0.4 l is no refuel");
        assert_eq!(refuel.evaluate(&l, &fuel(12.8), &P, None, Units::Metric), None, "the refuel took it down");
        assert_eq!(refuel.evaluate(&l, &fuel(13.0), &P, None, Units::Metric), None);
        assert!(refuel.evaluate(&l, &fuel(11.6), &P, None, Units::Metric).is_some(), "re-armed: the next stint fires again");

        let mut parked = DashAlertTracker::default();
        parked.evaluate(&l, &fuel(12.4), &P, None, Units::Metric);
        let mut out_of_car = fuel(11.6);
        out_of_car.session.in_car = false;
        assert_eq!(parked.evaluate(&l, &out_of_car, &P, None, Units::Metric), None, "only while driving");
    }

    #[test]
    fn an_alert_held_until_acknowledged_shows_again_when_a_passing_one_runs_out() {
        let l = layout(json!([alert(json!({ "id": "p", "type": "penalty", "untilAck": true })), alert(json!({ "durationSeconds": 2 }))]), None);
        let car = |tc: f64, penalties: f64| {
            driving(|f| {
                (f.electronics.tc, f.electronics.tc_max) = (tc, 9.0);
                f.field[0].penalties = penalties;
            })
        };
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &car(1.0, 0.0), &P, None, Units::Metric);
        tracker.evaluate(&l, &car(1.0, 1.0), &P, None, Units::Metric);
        tracker.advance_to(100.0);
        assert_eq!(popup(tracker.evaluate(&l, &car(2.0, 1.0), &P, None, Units::Metric)).title, "TC");
        assert!(tracker.expires());
        tracker.advance_to(2100.0);
        assert_eq!(popup(tracker.current()).title, "PENALTY", "back once the TC change has run out");
        tracker.acknowledge();
        assert_eq!(tracker.current(), None);
    }

    #[test]
    fn acknowledging_takes_the_top_alert_down_at_once() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "durationSeconds": 30 }));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric);
        tracker.acknowledge();
        assert_eq!(tracker.current(), None);
        tracker.acknowledge();
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric), None, "the same value is no new change");
    }

    #[test]
    fn display_mode_center_keeps_the_popup_in_the_alert_rect_and_strip_is_a_band() {
        let mut tracker = DashAlertTracker::default();
        let centered = layout(json!([alert(json!({}))]), Some(json!({ "displayMode": "center" })));
        tracker.evaluate(&centered, &tc(0.0), &P, None, Units::Metric);
        let span = AlertSpan { col: 6.0, row: 3.0, col_span: 8.0, row_span: 6.0, grid_cols: 20.0, grid_rows: 12.0 };
        assert_eq!(popup(tracker.evaluate(&centered, &tc(5.0), &P, None, Units::Metric)).placement, AlertPlacement::Center(span));
        let strip = one(json!({ "displayMode": "strip" }));
        assert_eq!(popup(tracker.evaluate(&strip, &tc(6.0), &P, None, Units::Metric)).placement, AlertPlacement::Strip);
    }

    #[test]
    fn a_disabled_alert_never_fires() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "enabled": false }));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric), None);
        // `enabled` is read for its truthiness, as the TypeScript `if (!alert.enabled)` does.
        let absent = layout(json!([{ "id": "a", "type": "tc_change", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }]), None);
        tracker.evaluate(&absent, &tc(0.0), &P, None, Units::Metric);
        assert_eq!(tracker.evaluate(&absent, &tc(5.0), &P, None, Units::Metric), None);
        let truthy = one(json!({ "enabled": 1 }));
        assert!(tracker.evaluate(&truthy, &tc(6.0), &P, None, Units::Metric).is_some());
    }

    #[test]
    fn the_banner_expires_after_its_duration_and_advance_to_drives_that_clock() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "durationSeconds": 1 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        tracker.advance_to(100.0);
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric).is_some());

        tracker.advance_to(900.0); // still within the 1s duration counted from the firing frame (t=100)
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric).is_some());

        tracker.advance_to(1200.0); // now past 100 + 1000ms
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric), None);
    }

    #[test]
    fn the_last_configured_alert_that_fires_this_frame_wins() {
        let mut tracker = DashAlertTracker::default();
        let l = layout(json!([alert(json!({ "id": "tc", "type": "tc_change" })), alert(json!({ "id": "abs", "type": "abs_change" }))]), None);
        tracker.evaluate(&l, &frame(|e| (e.tc, e.abs) = (0.0, 0.0)), &P, None, Units::Metric);
        assert_eq!(popup(tracker.evaluate(&l, &frame(|e| (e.tc, e.abs) = (5.0, 5.0)), &P, None, Units::Metric)).title, "ABS");
    }

    #[test]
    fn reset_clears_the_diff_baseline_so_the_next_frame_cannot_fire_on_a_stale_comparison() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({}));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        tracker.reset();
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric), None); // this frame becomes the new baseline instead of a diff target
    }

    #[test]
    fn an_alert_duration_is_clamped_to_one_to_thirty_seconds() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "durationSeconds": 60 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric);
        tracker.advance_to(29_999.0);
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric).is_some());
        tracker.advance_to(30_001.0);
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric), None);

        let short = one(json!({ "durationSeconds": 0.1 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&short, &tc(1.0), &P, None, Units::Metric);
        tracker.advance_to(999.0);
        assert!(tracker.evaluate(&short, &tc(1.0), &P, None, Units::Metric).is_some(), "at least 1 s");
    }

    #[test]
    fn the_layout_duration_applies_and_a_non_positive_one_falls_back() {
        for (config, expires) in [(json!({ "durationSeconds": 3 }), 3000.0), (json!({ "durationSeconds": 0 }), 1500.0)] {
            let mut tracker = DashAlertTracker::default();
            let l = layout(json!([alert(json!({}))]), Some(config));
            tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
            tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric);
            tracker.advance_to(expires - 1.0);
            assert!(tracker.current().is_some());
            tracker.advance_to(expires);
            assert!(tracker.current().is_none());
        }
    }

    #[test]
    fn a_named_color_token_resolves_to_that_theme_presets_swatch_overriding_the_fallback_color() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "colorToken": "green" }));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        let banner = popup(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric));
        // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
        // not TC's own blue, which is what tc_change would otherwise use.
        assert_eq!(banner.color, preset_swatch_color(preset("green")));
        assert_ne!(banner.color, dash_setting_colors::TC);
        // A signal keeps its own colour whatever the token.
        let flag = one(json!({ "type": "flag", "colorToken": "green" }));
        assert_eq!(popup(preview_alert_banner(&flag, &flag.alerts[0], &P, Units::Metric).as_ref()).color, P.race_control_yellow);
    }

    #[test]
    fn the_yellow_token_paints_the_palettes_warning_color() {
        let mut tracker = DashAlertTracker::default();
        let l = layout(json!([alert(json!({}))]), Some(json!({ "colorToken": "yellow", "invertColors": true })));
        tracker.evaluate(&l, &tc(0.0), &P, None, Units::Metric);
        let banner = popup(tracker.evaluate(&l, &tc(5.0), &P, None, Units::Metric));
        assert_eq!(banner.color, P.warning);
        assert!(banner.invert_colors, "the layout's look when the alert has none");
    }

    #[test]
    fn an_alerts_own_display_mode_wins_over_the_layouts() {
        let mut tracker = DashAlertTracker::default();
        let boxed = layout(json!([alert(json!({ "displayMode": "center" }))]), Some(json!({ "displayMode": "full" })));
        tracker.evaluate(&boxed, &tc(0.0), &P, None, Units::Metric);
        assert!(matches!(popup(tracker.evaluate(&boxed, &tc(5.0), &P, None, Units::Metric)).placement, AlertPlacement::Center(_)));

        let full = layout(json!([alert(json!({ "displayMode": "full" }))]), Some(json!({ "displayMode": "strip" })));
        assert_eq!(popup(preview_alert_banner(&full, &full.alerts[0], &P, Units::Metric).as_ref()).placement, AlertPlacement::Full);
    }

    #[test]
    fn the_designer_preview_plays_every_type_in_the_look_a_real_one_would_wear() {
        let own = layout(json!([alert(json!({ "colorToken": "ember", "invertColors": true }))]), Some(json!({ "displayMode": "strip" })));
        let banner = popup(preview_alert_banner(&own, &own.alerts[0], &P, Units::Metric).as_ref());
        assert_eq!(banner.title, "TC");
        assert_eq!(banner.placement, AlertPlacement::Strip, "the layout's display mode when the alert has none");
        assert!(banner.invert_colors);
        assert_eq!(banner.color, preset_swatch_color(preset("ember")));

        let empty = layout(json!([]), None);
        // The pit limiter is an overlay, not a popup (`the_pit_limiter_raises_no_popup_...`).
        for alert_type in DashAlertType::ALL.into_iter().filter(|t| *t != DashAlertType::PitLimiter) {
            let l = one(json!({ "type": alert_type.id(), "displayMode": "strip", "invertColors": true }));
            let preview = preview_alert_banner(&empty, &l.alerts[0], &P, Units::Metric).unwrap_or_else(|| panic!("{alert_type:?} has a preview"));
            match (alert_type, preview) {
                (DashAlertType::LapSummary, DashAlertBanner::LapSummary(_)) => {}
                (DashAlertType::DialChange, DashAlertBanner::MultiDial(dial)) => assert!(dial.inverted && dial.size == AlertSize::Strip),
                (_, DashAlertBanner::Alert(p)) => assert!(p.alert_type == alert_type && p.placement == AlertPlacement::Strip && p.invert_colors),
                (_, other) => panic!("{alert_type:?} previews as {other:?}"),
            }
        }
        assert_eq!(preview_alert_banner(&empty, &one(json!({ "type": "unknown" })).alerts[0], &P, Units::Metric), None);
    }

    #[test]
    fn alert_colour_swatches_presets_paint_their_swatch_yellow_the_warning_colour_auto_nothing() {
        assert_eq!(alert_color_swatch("auto", &P), None);
        assert_eq!(alert_color_swatch("yellow", &P), Some(P.warning));
        assert_eq!(alert_color_swatch("blue", &P), Some(preset_swatch_color(preset("ice"))), "old spellings resolve too");
    }

    #[test]
    fn the_tracker_shows_the_lap_summary_for_five_seconds_when_the_layout_enables_it() {
        for enabled in [true, false] {
            let l = layout(json!([{ "id": "sum", "type": "lap_summary", "enabled": enabled, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }]), None);
            let mut tracker = DashAlertTracker::default();
            tracker.advance_to(0.0);
            tracker.evaluate(&l, &at(4.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), &P, None, Units::Metric);
            tracker.advance_to(100.0);
            let targets = DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(4.4) };
            let popup = tracker.evaluate(&l, &at(5.0, 209.0, 56.0, |_| {}), &P, Some(&targets), Units::Metric).cloned();
            assert_eq!(matches!(popup, Some(DashAlertBanner::LapSummary(_))), enabled);
            tracker.advance_to(5200.0);
            assert_eq!(tracker.evaluate(&l, &at(5.0, 209.0, 55.0, |_| {}), &P, None, Units::Metric), None);
        }
    }

    #[test]
    fn a_lap_summary_may_stay_up_for_up_to_fifteen_seconds() {
        for (duration, expires) in [(json!(12), 12_100.0), (json!(40), 15_100.0), (json!(0.1), 1100.0)] {
            let l = layout(
                json!([{ "id": "sum", "type": "lap_summary", "enabled": true, "durationSeconds": duration, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }]),
                None,
            );
            let mut tracker = DashAlertTracker::default();
            tracker.evaluate(&l, &at(4.0, 0.0, 60.0, |_| {}), &P, None, Units::Metric);
            tracker.advance_to(100.0);
            assert!(tracker.evaluate(&l, &at(5.0, 209.0, 56.0, |_| {}), &P, None, Units::Metric).is_some());
            tracker.advance_to(expires - 1.0);
            assert!(tracker.current().is_some(), "{duration} s is still up at {} ms", expires - 1.0);
            tracker.advance_to(expires);
            assert_eq!(tracker.current(), None, "{duration} s is gone at {expires} ms");
        }
    }

    #[test]
    fn a_setting_change_on_the_lap_summary_frame_goes_on_top_and_the_summary_shows_after_it() {
        let l = layout(
            json!([{ "id": "sum", "type": "lap_summary", "enabled": true, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }, alert(json!({ "durationSeconds": 1 }))]),
            None,
        );
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &at(4.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), &P, None, Units::Metric);
        tracker.advance_to(100.0);
        let both = at(5.0, 209.0, 56.0, |f| f.electronics.tc = 3.0);
        assert!(matches!(tracker.evaluate(&l, &both, &P, None, Units::Metric), Some(DashAlertBanner::Alert(_))));
        tracker.advance_to(1100.0);
        assert!(matches!(tracker.current(), Some(DashAlertBanner::LapSummary(_))), "the setting's 1 s is over, the summary's 5 s is not");
        tracker.advance_to(5100.0);
        assert_eq!(tracker.current(), None);
    }

    #[test]
    fn banner_json_parses_exactly_what_the_typescript_union_serializes() {
        let alert_json = r##"{"kind":"alert","alertType":"abs_change","title":"ABS","value":"3","detail":"WAS 4","color":"#E0A30C","invertColors":false,"displayMode":"center","col":6,"row":3,"colSpan":8,"rowSpan":6,"gridCols":20,"gridRows":12}"##;
        let parsed = popup(Some(&parse_banner(alert_json.as_bytes()).expect("alert")));
        assert_eq!((parsed.title.as_str(), parsed.detail.as_deref(), parsed.color), ("ABS", Some("WAS 4"), dash_setting_colors::ABS));
        assert_eq!(parsed.placement, AlertPlacement::Center(AlertSpan { col: 6.0, row: 3.0, col_span: 8.0, row_span: 6.0, grid_cols: 20.0, grid_rows: 12.0 }));
        let strip = br##"{"kind":"alert","alertType":"fuel_low","title":"FUEL","value":"1.8","detail":null,"color":"#FF6A00","invertColors":true,"displayMode":"strip"}"##;
        let parsed = popup(Some(&parse_banner(strip).expect("strip")));
        assert_eq!((parsed.alert_type, parsed.placement, parsed.detail), (DashAlertType::FuelLow, AlertPlacement::Strip, None));

        let lap = br#"{"kind":"lapSummary","lap":12,"totalLaps":null,"position":4,"totalPositions":22,"lapTime":124.912,"lapDelta":null,"bestLap":null,
            "targetDelta":0.4,"valid":false,"sectors":[{"seconds":38.4,"rating":"personalBest","delta":-0.2},null,{"seconds":42.3,"rating":"unrated","delta":null}],
            "fuelUsed":2.9,"fuelDelta":null,"fuelLeftLaps":12.4,"energyUsed":null,"energyLeftLaps":null,"tyreWearLeft":81,"gapAhead":1.384,"topSpeed":86.4}"#;
        let summary = LapSummary {
            lap: 12.0,
            total_laps: None,
            position: Some(4.0),
            total_positions: Some(22.0),
            lap_time: 124.912,
            valid: false,
            lap_delta: None,
            best_lap: None,
            target_delta: Some(0.4),
            sectors: [
                Some(LapSector { seconds: 38.4, rating: SectorState::PersonalBest, delta: Some(-0.2) }),
                None,
                Some(LapSector { seconds: 42.3, rating: SectorState::Unrated, delta: None }),
            ],
            fuel_used: Some(2.9),
            fuel_delta: None,
            fuel_left_laps: Some(12.4),
            energy_used: None,
            energy_left_laps: None,
            tyre_wear_left: Some(81.0),
            gap_ahead: Some(1.384),
            top_speed: Some(86.4),
        };
        assert_eq!(parse_banner(lap), Ok(DashAlertBanner::LapSummary(Box::new(summary))));
        assert!(parse_banner(&String::from_utf8_lossy(lap).replace("unrated", "blue").into_bytes()).is_err(), "only the known ratings");

        let dial = br##"{"kind":"multiDial","caption":"MULTI","label":"TC2","color":"#E0A30C","inverted":false,"displayMode":"strip"}"##;
        assert_eq!(
            parse_banner(dial),
            Ok(DashAlertBanner::MultiDial(DashMultiDialPopup {
                caption: "MULTI".to_owned(),
                label: "TC2".to_owned(),
                color: Rgba::hex("#E0A30C"),
                inverted: false,
                size: AlertSize::Strip,
            }))
        );

        assert!(parse_banner(br#"{"kind":"toast"}"#).is_err());
        assert!(parse_banner(br#"{"kind":"alert","title":"TC"}"#).is_err(), "a popup needs all its fields");
        assert!(parse_banner(&String::from_utf8_lossy(strip).replace("strip", "corner").into_bytes()).is_err(), "only the known placements");
        let named_color = alert_json.replace("#E0A30C", "yellow");
        assert!(parse_banner(named_color.as_bytes()).is_err(), "the TypeScript only ever writes hex colors there");
    }

    #[test]
    fn every_wire_id_parses_both_ways_and_the_editor_lists_exactly_these_types() {
        for alert_type in DashAlertType::ALL {
            assert_eq!(DashAlertType::parse(alert_type.id()), Some(alert_type));
            assert_eq!(serde_json::from_value::<DashAlertType>(json!(alert_type.id())).ok(), Some(alert_type));
        }
        let source = include_str!("../../src/alerts.ts");
        let start = "export const dashAlertTypes: readonly DashAlertType[] = [";
        let from = source.find(start).expect("dashAlertTypes in alerts.ts") + start.len();
        let listed: Vec<&str> = source[from..from + source[from..].find(']').expect("its end")].split('\'').skip(1).step_by(2).collect();
        assert_eq!(listed, DashAlertType::ALL.map(DashAlertType::id));
    }
}
