// Stateful parameter-change alert detection. Port of `packages/dashboard/src/alerts.ts` (itself
// ported from the desktop client's `DashAlertTracker.cs` and `DashAttention.cs`). Compares each
// frame to the previous one for the alert types configured on the layout (tc/abs/brake
// bias/engine map) and produces a transient popup that expires after a fixed duration; a lap
// summary when a lap finishes. There is no internal clock: callers drive time explicitly via
// `advance_to`, which is what makes expiry deterministic to test.
//
// The banner types deserialize from exactly the JSON the TypeScript `DashAlertBanner` union
// serializes to, so a banner built by the TypeScript (the editor's preview) can be drawn here.

use serde::{Deserialize, Deserializer};
use serde_json::{Map, Value};

use crate::format::{format_front_brake_bias, js_number_string};
use crate::lap_summary::{LapSummary, LapSummaryWatcher};
use crate::model::{DashAlert, DashLayout, DashTargets, TelemetryFrame};
use crate::multi_dial::DashMultiDialPopup;
use crate::palette::{
    DashPaletteColors, Rgba, canonical_alert_color_token, dash_setting_colors, find_preset_by_alert_color_token, parse_css_hex, preset_swatch_color,
};

/// The condition a value is shown in (`DashCondition`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DashCondition {
    Neutral,
    GoodOnTarget,
    ColdLow,
    AssistActive,
    Warning,
    Critical,
    Fault,
    RaceControl,
}

/// A transient setting-change popup. `full_screen` popups cover the whole dash in the setting's
/// color; otherwise the popup sits in the alert's own grid rect.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashSettingPopup {
    pub title: String,
    pub value: String,
    /// The value before the change, shown small beside the new one.
    pub previous: String,
    /// The setting's highest step when the game reports one, for "of 9".
    pub max: Option<f64>,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
    pub full_screen: bool,
    pub col: f64,
    pub row: f64,
    pub col_span: f64,
    pub row_span: f64,
    pub grid_cols: f64,
    pub grid_rows: f64,
    pub invert_colors: bool,
}

/// What the renderer draws over the dash (`DashAlertBanner`): a popup the tracker raised, or the
/// multi-dial popup. The JSON's `kind` is `"setting"`, `"lapSummary"` or `"multiDial"`.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "kind")]
pub enum DashAlertBanner {
    #[serde(rename = "setting")]
    Setting(DashSettingPopup),
    /// The full-screen summary of a finished lap (`DashLapSummaryPopup`).
    #[serde(rename = "lapSummary")]
    LapSummary(LapSummary),
    /// A turn of the wheel's multi-position dial (`DashMultiDialPopup`). Never raised by the
    /// tracker: `multi_dial::MultiDialPopupWatcher` decides when it is up.
    #[serde(rename = "multiDial")]
    MultiDial(DashMultiDialPopup),
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
/// setting popup, there are two numbers to read.
pub const LAP_SUMMARY_SECONDS: f64 = 5.0;

#[derive(Clone, Debug, PartialEq)]
struct ResolvedAlertConfig {
    full_screen: bool,
    duration_seconds: f64,
    invert_colors: bool,
    color_token: String,
}

const DEFAULT_DURATION_SECONDS: f64 = 1.5;

/// Narrows the layout's untyped `alertConfig` bag to the fields the tracker reads.
fn read_alert_config(raw: Option<&Map<String, Value>>) -> ResolvedAlertConfig {
    let get = |key: &str| raw.and_then(|r| r.get(key));
    ResolvedAlertConfig {
        full_screen: get("displayMode").and_then(Value::as_str) != Some("center"),
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

/// The setting alert types (`DashAlertType` without `lap_summary`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SettingAlertType {
    Tc,
    Abs,
    Bias,
    EngineMap,
}

impl SettingAlertType {
    fn parse(alert_type: &str) -> Option<SettingAlertType> {
        match alert_type {
            "tc_change" => Some(SettingAlertType::Tc),
            "abs_change" => Some(SettingAlertType::Abs),
            "bias_change" => Some(SettingAlertType::Bias),
            "enginemap_change" => Some(SettingAlertType::EngineMap),
            _ => None,
        }
    }

    fn title(self) -> &'static str {
        match self {
            SettingAlertType::Tc => "TC",
            SettingAlertType::Abs => "ABS",
            SettingAlertType::Bias => "BIAS",
            SettingAlertType::EngineMap => "MAP",
        }
    }

    fn color(self) -> Rgba {
        match self {
            SettingAlertType::Tc => dash_setting_colors::TC,
            SettingAlertType::Abs => dash_setting_colors::ABS,
            SettingAlertType::Bias => dash_setting_colors::BRAKE_BIAS,
            SettingAlertType::EngineMap => dash_setting_colors::ENGINE_MAP,
        }
    }

    /// The value as the popup prints it. Changes are detected on the printed value, so sensor
    /// noise below the display precision never fires.
    fn value(self, s: &SettingReadings) -> String {
        match self {
            SettingAlertType::Tc => js_number_string(s.tc.trunc()),
            SettingAlertType::Abs => js_number_string(s.abs.trunc()),
            SettingAlertType::Bias => format_front_brake_bias(s.brake_bias_rear),
            SettingAlertType::EngineMap => js_number_string(s.motor_map.trunc()),
        }
    }

    fn max(self, s: &SettingReadings) -> f64 {
        match self {
            SettingAlertType::Tc => s.tc_max,
            SettingAlertType::Abs => s.abs_max,
            SettingAlertType::Bias => 0.0,
            SettingAlertType::EngineMap => s.motor_map_max,
        }
    }

    /// The made-up change the designer plays an alert with.
    fn sample_change(self) -> SettingChange {
        let change = |value: &str, previous: &str, max: Option<f64>| SettingChange { value: value.to_owned(), previous: previous.to_owned(), max };
        match self {
            SettingAlertType::Tc => change("5", "4", Some(9.0)),
            SettingAlertType::Abs => change("3", "4", Some(9.0)),
            SettingAlertType::Bias => change("56.5", "56.0", None),
            SettingAlertType::EngineMap => change("3", "2", Some(9.0)),
        }
    }
}

/// The frame fields the setting alerts read, kept from the previous frame to diff against.
#[derive(Clone, Copy, Debug, PartialEq)]
struct SettingReadings {
    tc: f64,
    tc_max: f64,
    abs: f64,
    abs_max: f64,
    motor_map: f64,
    motor_map_max: f64,
    brake_bias_rear: f64,
}

impl SettingReadings {
    fn of(frame: &TelemetryFrame) -> SettingReadings {
        let e = &frame.electronics;
        SettingReadings {
            tc: e.tc,
            tc_max: e.tc_max,
            abs: e.abs,
            abs_max: e.abs_max,
            motor_map: e.motor_map,
            motor_map_max: e.motor_map_max,
            brake_bias_rear: frame.car.brake_bias_rear,
        }
    }
}

/// One layout alert's fields as the tracker reads them. The TypeScript reads them unchecked from
/// the stored JSON; here a field of the wrong type reads as absent (and the span as 0).
struct AlertSpec<'a> {
    alert_type: &'a str,
    enabled: bool,
    display_mode: Option<&'a str>,
    color_token: Option<&'a str>,
    duration_seconds: Option<f64>,
    invert_colors: Option<bool>,
    col: f64,
    row: f64,
    col_span: f64,
    row_span: f64,
}

impl<'a> AlertSpec<'a> {
    fn of(alert: &'a DashAlert) -> AlertSpec<'a> {
        let f = &alert.fields;
        let num = |key: &str| f.get(key).and_then(Value::as_f64);
        AlertSpec {
            alert_type: &alert.alert_type,
            enabled: js_truthy(f.get("enabled")),
            display_mode: f.get("displayMode").and_then(Value::as_str),
            color_token: f.get("colorToken").and_then(Value::as_str),
            duration_seconds: num("durationSeconds"),
            invert_colors: f.get("invertColors").and_then(Value::as_bool),
            col: num("col").unwrap_or(0.0),
            row: num("row").unwrap_or(0.0),
            col_span: num("colSpan").unwrap_or(0.0),
            row_span: num("rowSpan").unwrap_or(0.0),
        }
    }

    /// Whether the alert shows full screen: its own choice when it has one, otherwise the layout's.
    fn full_screen(&self, config: &ResolvedAlertConfig) -> bool {
        match self.display_mode {
            Some("center") => false,
            Some("full") => true,
            _ => config.full_screen,
        }
    }
}

/// A setting's change as the popup shows it.
struct SettingChange {
    value: String,
    previous: String,
    max: Option<f64>,
}

/// The popup for one setting change, in the alert's look (its own, or the layout's).
fn setting_popup(
    alert: &AlertSpec,
    setting: SettingAlertType,
    change: SettingChange,
    config: &ResolvedAlertConfig,
    layout: &DashLayout,
    palette: &DashPaletteColors,
) -> DashSettingPopup {
    DashSettingPopup {
        title: setting.title().to_owned(),
        value: change.value,
        previous: change.previous,
        max: change.max,
        color: resolve_alert_color(Some(alert.color_token.unwrap_or(&config.color_token)), setting.color(), palette),
        full_screen: alert.full_screen(config),
        col: alert.col,
        row: alert.row,
        col_span: alert.col_span,
        row_span: alert.row_span,
        grid_cols: layout.grid_cols,
        grid_rows: layout.grid_rows,
        invert_colors: alert.invert_colors.unwrap_or(config.invert_colors),
    }
}

fn detect_candidate(
    alert: &AlertSpec,
    frame: &SettingReadings,
    prev: &SettingReadings,
    config: &ResolvedAlertConfig,
    layout: &DashLayout,
    palette: &DashPaletteColors,
) -> Option<DashSettingPopup> {
    let setting = SettingAlertType::parse(alert.alert_type)?;
    let value = setting.value(frame);
    let previous = setting.value(prev);
    if value == previous {
        return None;
    }
    let max = setting.max(frame);
    Some(setting_popup(alert, setting, SettingChange { value, previous, max: (max > 0.0).then_some(max) }, config, layout, palette))
}

const SAMPLE_LAP: LapSummary =
    LapSummary { lap: 12.0, lap_time: 124.912, valid: true, lap_delta: Some(-0.214), fuel_used: Some(2.41), fuel_delta: Some(-0.09) };

/// The popup `alert` would show, with made-up values, for the designer to play on the dash so its
/// look can be set without turning a knob in the car. Built exactly as a real change builds it,
/// so it honours the alert's own look and the layout's. `None` for a type the tracker does not know.
pub fn preview_alert_banner(layout: &DashLayout, alert: &DashAlert, palette: &DashPaletteColors) -> Option<DashAlertBanner> {
    if alert.alert_type == "lap_summary" {
        return Some(DashAlertBanner::LapSummary(SAMPLE_LAP));
    }
    let setting = SettingAlertType::parse(&alert.alert_type)?;
    let config = read_alert_config(layout.alert_config.as_ref());
    Some(DashAlertBanner::Setting(setting_popup(&AlertSpec::of(alert), setting, setting.sample_change(), &config, layout, palette)))
}

/// Feeds frames through the setting change detectors and the lap watcher, and holds the
/// resulting popup for its configured duration. Time is supplied explicitly via `advance_to`
/// (epoch milliseconds) rather than read from a clock.
#[derive(Clone, Debug)]
pub struct DashAlertTracker {
    fallback_duration_seconds: f64,
    laps: LapSummaryWatcher,
    now: f64,
    prev: Option<SettingReadings>,
    active: Option<DashAlertBanner>,
    expires_at: f64,
}

impl Default for DashAlertTracker {
    fn default() -> Self {
        DashAlertTracker::new(DEFAULT_DURATION_SECONDS)
    }
}

impl DashAlertTracker {
    pub fn new(fallback_duration_seconds: f64) -> DashAlertTracker {
        DashAlertTracker { fallback_duration_seconds, laps: LapSummaryWatcher::default(), now: 0.0, prev: None, active: None, expires_at: 0.0 }
    }

    /// Advances the tracker's clock to `now_ms` (milliseconds; only differences are read). Call before `evaluate`.
    pub fn advance_to(&mut self, now_ms: f64) {
        self.now = now_ms;
    }

    /// Feeds a frame in and returns the popup to draw this tick, or `None` when none is active.
    /// `targets` is the driver's plan; its fuel target is what the lap summary compares against.
    pub fn evaluate(
        &mut self,
        layout: &DashLayout,
        frame: &TelemetryFrame,
        palette: &DashPaletteColors,
        targets: Option<&DashTargets>,
    ) -> Option<&DashAlertBanner> {
        let config = read_alert_config(layout.alert_config.as_ref());

        // Watched even while the summary is off, so turning it on mid-session has a lap to compare.
        let summary = self.laps.observe(frame, self.now, targets.and_then(|t| t.fuel_per_lap_liters));
        let summary_alert = layout.alerts.iter().map(AlertSpec::of).find(|alert| alert.enabled && alert.alert_type == "lap_summary");
        if let (Some(summary), Some(summary_alert)) = (summary, summary_alert) {
            self.active = Some(DashAlertBanner::LapSummary(summary));
            self.expires_at = self.now + clamp(summary_alert.duration_seconds.unwrap_or(LAP_SUMMARY_SECONDS), 0.5, LAP_SUMMARY_SECONDS) * 1000.0;
        }

        // A setting turned on the same frame still wins: it is the driver's own input.
        let readings = SettingReadings::of(frame);
        if let Some(prev) = self.prev {
            // Last configured alert that fired this frame wins (matches the desktop painter loop).
            for alert in layout.alerts.iter().map(AlertSpec::of) {
                if !alert.enabled {
                    continue;
                }
                if let Some(candidate) = detect_candidate(&alert, &readings, &prev, &config, layout, palette) {
                    self.active = Some(DashAlertBanner::Setting(candidate));
                    let configured = if config.duration_seconds <= 0.0 { self.fallback_duration_seconds } else { config.duration_seconds };
                    let duration = clamp(alert.duration_seconds.unwrap_or(configured), 0.5, 5.0);
                    self.expires_at = self.now + duration * 1000.0;
                }
            }
        }

        self.prev = Some(readings);
        self.current()
    }

    /// The popup still up at the tracker's clock, without feeding a frame: what `evaluate` would
    /// return for a repeat of the last frame. Drops it once it has expired.
    pub fn current(&mut self) -> Option<&DashAlertBanner> {
        if self.active.is_some() && self.now < self.expires_at {
            return self.active.as_ref();
        }
        self.active = None;
        None
    }

    /// Clears change-tracking state (call when the link goes offline so a stale diff doesn't
    /// fire on reconnect).
    pub fn reset(&mut self) {
        self.prev = None;
        self.active = None;
        self.laps.reset();
    }
}

const CRITICAL_INVERSION_PHASE_MS: f64 = 250.0;

/// Whether a value's colors should be shown inverted this instant, for the blinking effect on
/// out-of-bounds "critical" readings (two stable/inverted phases per second). Only the critical
/// condition supports animated inversion — everything else never blinks.
pub fn is_attention_inverted(condition: DashCondition, requested: bool, active_for_ms: f64) -> bool {
    if !requested || condition != DashCondition::Critical || active_for_ms < 0.0 {
        return false;
    }
    (active_for_ms / CRITICAL_INVERSION_PHASE_MS).floor() % 2.0 == 1.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lap_summary::tests::at;
    use crate::palette::{DEFAULT_DASH_PALETTE, DashThemePreset};
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

    fn setting(banner: Option<&DashAlertBanner>) -> DashSettingPopup {
        match banner {
            Some(DashAlertBanner::Setting(popup)) => popup.clone(),
            other => panic!("expected a setting popup, got {other:?}"),
        }
    }

    fn preset(token: &str) -> &'static DashThemePreset {
        find_preset_by_alert_color_token(Some(token)).expect("a preset")
    }

    #[test]
    fn no_banner_on_the_first_frame_there_is_nothing_to_diff_against_yet() {
        let mut tracker = DashAlertTracker::default();
        assert_eq!(tracker.evaluate(&one(json!({})), &tc(5.0), &P, None), None);
    }

    #[test]
    fn a_tc_change_fires_once_the_value_differs_from_the_previous_frame() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({}));
        tracker.evaluate(&l, &tc(0.0), &P, None);
        let banner = setting(tracker.evaluate(&l, &tc(5.0), &P, None));
        assert_eq!((banner.title.as_str(), banner.value.as_str(), banner.previous.as_str()), ("TC", "5", "0"));
        assert_eq!(banner.max, Some(9.0));
        assert_eq!(banner.color, dash_setting_colors::TC);
        assert!(banner.full_screen, "full screen unless the layout asks for a centered popup");
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
        tracker.evaluate(&l, &bias(0.462), &P, None);
        assert_eq!(tracker.evaluate(&l, &bias(0.46201), &P, None), None);
        let banner = setting(tracker.evaluate(&l, &bias(0.465), &P, None));
        assert_eq!(banner.title, "BIAS");
        assert_eq!(banner.value, "53.5", "the front share");
        assert_eq!(banner.max, None);
        assert_eq!(banner.color, dash_setting_colors::BRAKE_BIAS);
    }

    #[test]
    fn display_mode_center_keeps_the_popup_in_the_alert_rect() {
        let mut tracker = DashAlertTracker::default();
        let centered = layout(json!([alert(json!({}))]), Some(json!({ "displayMode": "center" })));
        tracker.evaluate(&centered, &tc(0.0), &P, None);
        assert!(!setting(tracker.evaluate(&centered, &tc(5.0), &P, None)).full_screen);
    }

    #[test]
    fn a_disabled_alert_never_fires() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "enabled": false }));
        tracker.evaluate(&l, &tc(0.0), &P, None);
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None), None);
        // `enabled` is read for its truthiness, as the TypeScript `if (!alert.enabled)` does.
        let absent = layout(json!([{ "id": "a", "type": "tc_change", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }]), None);
        tracker.evaluate(&absent, &tc(0.0), &P, None);
        assert_eq!(tracker.evaluate(&absent, &tc(5.0), &P, None), None);
        let truthy = one(json!({ "enabled": 1 }));
        assert!(tracker.evaluate(&truthy, &tc(6.0), &P, None).is_some());
    }

    #[test]
    fn the_banner_expires_after_its_duration_and_advance_to_drives_that_clock() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "durationSeconds": 1 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&l, &tc(0.0), &P, None);
        tracker.advance_to(100.0);
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None).is_some());

        tracker.advance_to(900.0); // still within the 1s duration counted from the firing frame (t=100)
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None).is_some());

        tracker.advance_to(1200.0); // now past 100 + 1000ms
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None), None);
    }

    #[test]
    fn the_last_configured_alert_that_fires_this_frame_wins() {
        let mut tracker = DashAlertTracker::default();
        let l = layout(json!([alert(json!({ "id": "tc", "type": "tc_change" })), alert(json!({ "id": "abs", "type": "abs_change" }))]), None);
        tracker.evaluate(&l, &frame(|e| (e.tc, e.abs) = (0.0, 0.0)), &P, None);
        assert_eq!(setting(tracker.evaluate(&l, &frame(|e| (e.tc, e.abs) = (5.0, 5.0)), &P, None)).title, "ABS");
    }

    #[test]
    fn reset_clears_the_diff_baseline_so_the_next_frame_cannot_fire_on_a_stale_comparison() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({}));
        tracker.evaluate(&l, &tc(0.0), &P, None);
        tracker.reset();
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None), None); // this frame becomes the new baseline instead of a diff target
    }

    #[test]
    fn an_alert_duration_is_clamped_to_half_a_second_to_five_seconds() {
        let mut tracker = DashAlertTracker::default();
        let l = one(json!({ "durationSeconds": 10 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&l, &tc(0.0), &P, None);
        tracker.evaluate(&l, &tc(5.0), &P, None);
        tracker.advance_to(4999.0);
        assert!(tracker.evaluate(&l, &tc(5.0), &P, None).is_some());
        tracker.advance_to(5001.0);
        assert_eq!(tracker.evaluate(&l, &tc(5.0), &P, None), None);

        let short = one(json!({ "durationSeconds": 0.1 }));
        tracker.advance_to(0.0);
        tracker.evaluate(&short, &tc(1.0), &P, None);
        tracker.advance_to(499.0);
        assert!(tracker.evaluate(&short, &tc(1.0), &P, None).is_some(), "at least 0.5 s");
    }

    #[test]
    fn the_layout_duration_applies_and_a_non_positive_one_falls_back() {
        for (config, expires) in [(json!({ "durationSeconds": 3 }), 3000.0), (json!({ "durationSeconds": 0 }), 1500.0)] {
            let mut tracker = DashAlertTracker::default();
            let l = layout(json!([alert(json!({}))]), Some(config));
            tracker.evaluate(&l, &tc(0.0), &P, None);
            tracker.evaluate(&l, &tc(5.0), &P, None);
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
        tracker.evaluate(&l, &tc(0.0), &P, None);
        let banner = setting(tracker.evaluate(&l, &tc(5.0), &P, None));
        // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
        // not TC's own blue, which is what tc_change would otherwise use.
        assert_eq!(banner.color, preset_swatch_color(preset("green")));
        assert_ne!(banner.color, dash_setting_colors::TC);
    }

    #[test]
    fn the_yellow_token_paints_the_palettes_warning_color() {
        let mut tracker = DashAlertTracker::default();
        let l = layout(json!([alert(json!({}))]), Some(json!({ "colorToken": "yellow", "invertColors": true })));
        tracker.evaluate(&l, &tc(0.0), &P, None);
        let banner = setting(tracker.evaluate(&l, &tc(5.0), &P, None));
        assert_eq!(banner.color, P.warning);
        assert!(banner.invert_colors, "the layout's look when the alert has none");
    }

    #[test]
    fn is_attention_inverted_only_blinks_for_the_critical_condition_and_only_when_requested() {
        assert!(!is_attention_inverted(DashCondition::Critical, false, 1000.0));
        assert!(!is_attention_inverted(DashCondition::Warning, true, 1000.0));
        assert!(!is_attention_inverted(DashCondition::Critical, true, -1.0));
    }

    #[test]
    fn is_attention_inverted_alternates_every_250ms() {
        let at = |ms| is_attention_inverted(DashCondition::Critical, true, ms);
        assert_eq!([at(0.0), at(249.0), at(250.0), at(499.0), at(500.0)], [false, false, true, true, false]);
    }

    #[test]
    fn an_alerts_own_display_mode_wins_over_the_layouts() {
        let mut tracker = DashAlertTracker::default();
        let boxed = layout(json!([alert(json!({ "displayMode": "center" }))]), Some(json!({ "displayMode": "full" })));
        tracker.evaluate(&boxed, &tc(0.0), &P, None);
        assert!(!setting(tracker.evaluate(&boxed, &tc(5.0), &P, None)).full_screen);

        let full = layout(json!([alert(json!({ "displayMode": "full" }))]), Some(json!({ "displayMode": "center" })));
        assert!(setting(preview_alert_banner(&full, &full.alerts[0], &P).as_ref()).full_screen);
    }

    #[test]
    fn the_designer_preview_wears_the_same_look_a_real_change_would() {
        let own = layout(json!([alert(json!({ "colorToken": "ember", "invertColors": true }))]), Some(json!({ "displayMode": "center" })));
        let banner = setting(preview_alert_banner(&own, &own.alerts[0], &P).as_ref());
        assert_eq!(banner.title, "TC");
        assert!(!banner.full_screen, "the layout's display mode when the alert has none");
        assert!(banner.invert_colors);
        assert_eq!(banner.color, preset_swatch_color(preset("ember")));
        let others = layout(json!([alert(json!({ "type": "lap_summary" })), alert(json!({ "type": "unknown" }))]), None);
        assert!(matches!(preview_alert_banner(&layout(json!([]), None), &others.alerts[0], &P), Some(DashAlertBanner::LapSummary(_))));
        assert_eq!(preview_alert_banner(&layout(json!([]), None), &others.alerts[1], &P), None);
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
            tracker.evaluate(&l, &at(4.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), &P, None);
            tracker.advance_to(100.0);
            let targets = DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(4.4) };
            let popup = tracker.evaluate(&l, &at(5.0, 209.0, 56.0, |_| {}), &P, Some(&targets)).cloned();
            assert_eq!(matches!(popup, Some(DashAlertBanner::LapSummary(_))), enabled);
            tracker.advance_to(5200.0);
            assert_eq!(tracker.evaluate(&l, &at(5.0, 209.0, 55.0, |_| {}), &P, None), None);
        }
    }

    #[test]
    fn a_setting_change_on_the_lap_summary_frame_wins_and_restarts_the_clock() {
        let l = layout(
            json!([{ "id": "sum", "type": "lap_summary", "enabled": true, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }, alert(json!({ "durationSeconds": 1 }))]),
            None,
        );
        let mut tracker = DashAlertTracker::default();
        tracker.evaluate(&l, &at(4.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), &P, None);
        tracker.advance_to(100.0);
        let both = at(5.0, 209.0, 56.0, |f| f.electronics.tc = 3.0);
        assert!(matches!(tracker.evaluate(&l, &both, &P, None), Some(DashAlertBanner::Setting(_))));
        tracker.advance_to(1100.0);
        assert_eq!(tracker.current(), None, "the setting's 1 s, not the summary's 5 s");
    }

    #[test]
    fn banner_json_parses_exactly_what_the_typescript_union_serializes() {
        let setting_json = br##"{"kind":"setting","title":"ABS","value":"3","previous":"4","max":9,"color":"#A06BFF","fullScreen":false,"col":6,"row":3,"colSpan":8,"rowSpan":6,"gridCols":20,"gridRows":12,"invertColors":false}"##;
        let parsed = setting(Some(&parse_banner(setting_json).expect("setting")));
        assert_eq!((parsed.title.as_str(), parsed.max, parsed.color), ("ABS", Some(9.0), dash_setting_colors::ABS));
        let no_max = br##"{"kind":"setting","title":"BIAS","value":"56.5","previous":"56.0","max":null,"color":"#F5F5F7","fullScreen":true,"col":6,"row":3,"colSpan":8,"rowSpan":6,"gridCols":20,"gridRows":12,"invertColors":true}"##;
        assert_eq!(setting(Some(&parse_banner(no_max).expect("bias"))).max, None);

        let lap = br#"{"kind":"lapSummary","lap":12,"lapTime":124.912,"lapDelta":null,"valid":false,"fuelUsed":2.9,"fuelDelta":null}"#;
        assert_eq!(
            parse_banner(lap),
            Ok(DashAlertBanner::LapSummary(LapSummary { lap: 12.0, lap_time: 124.912, valid: false, lap_delta: None, fuel_used: Some(2.9), fuel_delta: None }))
        );

        let dial = br##"{"kind":"multiDial","caption":"MULTI","label":"TC2","color":"#E0A30C","inverted":false}"##;
        assert_eq!(
            parse_banner(dial),
            Ok(DashAlertBanner::MultiDial(DashMultiDialPopup {
                caption: "MULTI".to_owned(),
                label: "TC2".to_owned(),
                color: Rgba::hex("#E0A30C"),
                inverted: false
            }))
        );

        assert!(parse_banner(br#"{"kind":"toast"}"#).is_err());
        assert!(parse_banner(br#"{"kind":"setting","title":"TC"}"#).is_err(), "a setting popup needs all its fields");
        let named_color = String::from_utf8_lossy(setting_json).replace("#A06BFF", "purple");
        assert!(parse_banner(named_color.as_bytes()).is_err(), "the TypeScript only ever writes hex colors there");
    }
}
