// Dash widgets: `widget_chrome`, which says how each type is framed, and one content function
// per widget type. Ported from the retired React renderer's `widgets.tsx`. A widget's content
// receives only its content box (`width` x `height`, origin at its top-left) and draws values
// laid out from fractions of that box.
//
// Static labels that must shrink to fit rather than clip use `TextSizing::Fit`; everything else
// stays stable (authored size, clipped). Values size from a template of the widest text they
// can show (`value_size`), so they never clip and never resize.

use crate::bindings::{BindingContext, flag_summary, resolve_binding};
use crate::chrome::{ChromeContext, WidgetFrame, widget_frame};
use crate::draw::{Builder, Radii};
use crate::format::{
    format_delta, format_front_brake_bias, format_fuel, format_fuel_per_lap_target, format_gap, format_gear, format_int, format_lap, format_pressure,
    format_speed_kph, format_temp, js_number_string, to_fixed,
};
use crate::grid::PixelRect;
use crate::model::{DashSettings, DashTargets, DashWidget, TelemetryFrame, TireState};
use crate::palette::{DashPaletteColors, Rgba, dash_setting_colors, resolve_tyre_color};
use crate::primitives::{
    TextAlign, TextLine, TextSizing, VALUE_SHARE, ValueWithUnit, big_value, dot, h_bar, text_line, value_size, value_with_unit, vertical_seg_bar,
};
use crate::text::TextWeight;

/// Everything a widget's content reads (`WidgetContentProps`).
pub struct WidgetContext<'a> {
    pub widget: &'a DashWidget,
    pub frame: &'a TelemetryFrame,
    pub palette: &'a DashPaletteColors,
    pub width: f64,
    pub height: f64,
    pub targets: Option<&'a DashTargets>,
    pub settings: Option<&'a DashSettings>,
    /// The dash style, for `split` widgets that draw their own frames.
    pub chrome: ChromeContext,
}

/// How a widget type is framed:
/// - `Framed`: one frame with a title; `accent` is a knob's identity color and `fill` a
///   condition color covering the frame (values then draw in ink).
/// - `Bare`: no frame or title (gear, header, text, RPM, flag), just the same margin.
/// - `Split`: the widget fills its whole cell with several frames of its own (the four tyres).
#[derive(Clone, Debug, PartialEq)]
pub enum WidgetChrome {
    Framed { title: &'static str, accent: Option<Rgba>, fill: Option<Rgba> },
    Bare,
    Split,
}

fn framed(title: &'static str) -> WidgetChrome {
    WidgetChrome::Framed { title, accent: None, fill: None }
}

fn knob(title: &'static str, accent: Rgba) -> WidgetChrome {
    WidgetChrome::Framed { title, accent: Some(accent), fill: None }
}

fn filled(title: &'static str, fill: Option<Rgba>) -> WidgetChrome {
    WidgetChrome::Framed { title, accent: None, fill }
}

/// The frame a widget wears this frame: its title, knob color and any condition fill.
pub fn widget_chrome(widget: &DashWidget, frame: &TelemetryFrame, palette: &DashPaletteColors) -> WidgetChrome {
    match widget.widget_type.as_str() {
        "input_trace" => framed("INPUTS"),
        "sector" => framed("SECTORS"),
        "lap_time" => framed(lap_time_show(widget).title()),
        "delta" => filled("DELTA", delta_fill(frame, palette)),
        "fuel" => filled("FUEL", fuel_fill(frame.car.fuel, palette)),
        "tc" => knob("TC", dash_setting_colors::TC),
        "abs" => knob("ABS", dash_setting_colors::ABS),
        "engine_map" => knob("MAP", dash_setting_colors::ENGINE_MAP),
        "brake_bias" => knob("BIAS", dash_setting_colors::BRAKE_BIAS),
        "fuel_target" => framed("FUEL TARGET"),
        "position" => framed("POS"),
        "gaps" => framed(gap_side(widget).title()),
        "predictive_lap" => framed("PREDICTED"),
        "virtual_energy" | "ers" => filled("VIRTUAL ENERGY", energy_fill(virtual_energy_percent(frame), palette)),
        "tyre_temp" | "tyre_pressure" => WidgetChrome::Split,
        _ => WidgetChrome::Bare,
    }
}

/// Green while the lap is gaining on the target; no fill otherwise. A slower lap is never
/// colored just for being slower.
fn delta_fill(frame: &TelemetryFrame, palette: &DashPaletteColors) -> Option<Rgba> {
    (frame.lap.target_lap_time > 0.0 && frame.lap.delta < -0.0005).then_some(palette.timing_personal_best)
}

fn fuel_fill(liters: f64, palette: &DashPaletteColors) -> Option<Rgba> {
    if liters <= 0.0 || liters >= 5.0 {
        None
    } else if liters < 2.0 {
        Some(palette.critical)
    } else {
        Some(palette.warning)
    }
}

fn energy_fill(pct: f64, palette: &DashPaletteColors) -> Option<Rgba> {
    if pct <= 0.0 || pct >= 15.0 {
        None
    } else if pct < 5.0 {
        Some(palette.critical)
    } else {
        Some(palette.warning)
    }
}

/// The virtual-energy level as a percentage, tolerating a 0..1 or a 0..100 source scale.
fn virtual_energy_percent(frame: &TelemetryFrame) -> f64 {
    let raw = frame.energy.virtual_energy;
    if raw > 0.0 && raw <= 1.0 { raw * 100.0 } else { raw }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LapTimeShow {
    All,
    Current,
    Last,
    Best,
}

impl LapTimeShow {
    fn title(self) -> &'static str {
        match self {
            LapTimeShow::All => "LAP TIMES",
            LapTimeShow::Current => "LAP",
            LapTimeShow::Last => "LAST",
            LapTimeShow::Best => "BEST",
        }
    }
}

/// The lap_time widget's "show" config: all three times stacked, or one of them large.
fn lap_time_show(widget: &DashWidget) -> LapTimeShow {
    match widget.config_string("show") {
        Some("current") => LapTimeShow::Current,
        Some("last") => LapTimeShow::Last,
        Some("best") => LapTimeShow::Best,
        _ => LapTimeShow::All,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GapSide {
    Both,
    Ahead,
    Behind,
}

impl GapSide {
    fn title(self) -> &'static str {
        match self {
            GapSide::Both => "GAPS",
            GapSide::Ahead => "AHEAD",
            GapSide::Behind => "BEHIND",
        }
    }
}

/// The gaps widget's "side" config: both gaps, or one of them large.
fn gap_side(widget: &DashWidget) -> GapSide {
    match widget.config_string("side") {
        Some("ahead") => GapSide::Ahead,
        Some("behind") => GapSide::Behind,
        _ => GapSide::Both,
    }
}

fn rpm_stage_color(phase: f64, palette: &DashPaletteColors) -> Rgba {
    if phase < 0.78 {
        palette.rpm_normal
    } else if phase < 0.93 {
        palette.rpm_near_limit
    } else {
        palette.rpm_shift
    }
}

fn rpm_bar(b: &mut Builder, w: &WidgetContext) {
    let max = w.frame.car.max_rpm.max(1.0);
    let pct = (w.frame.car.rpm / max).clamp(0.0, 1.0);
    if w.width <= w.height * 2.0 {
        vertical_seg_bar(b, PixelRect::new(0.0, 0.0, w.width, w.height), pct, |phase| rpm_stage_color(phase, w.palette));
        return;
    }

    const SEGMENTS: usize = 24;
    let gap = (w.width * 0.0025).max(1.0);
    let segment_width = (w.width - gap * (SEGMENTS - 1) as f64) / SEGMENTS as f64;
    let active = (pct * SEGMENTS as f64).ceil() as usize;
    for i in 0..SEGMENTS {
        let color = if i < active { rpm_stage_color(i as f64 / (SEGMENTS - 1) as f64, w.palette) } else { w.palette.surface };
        b.rect(PixelRect::new(i as f64 * (segment_width + gap), 0.0, segment_width.max(0.0), w.height), Radii::all(2.0), color);
    }
}

/// The `align` config: where a widget anchors its text horizontally.
fn horizontal_anchor(widget: &DashWidget, width: f64) -> (f64, TextAlign) {
    match widget.config_string("align") {
        Some("left") => (width * 0.06, TextAlign::Start),
        Some("right") => (width * 0.94, TextAlign::End),
        _ => (width / 2.0, TextAlign::Center),
    }
}

fn gear_speed(b: &mut Builder, w: &WidgetContext) {
    let car = &w.frame.car;
    let rpm_ratio = if car.max_rpm > 0.0 { car.rpm / car.max_rpm } else { 0.0 };
    let gear_color = if rpm_ratio >= 0.96 {
        w.palette.rpm_shift
    } else if rpm_ratio >= 0.88 {
        w.palette.rpm_near_limit
    } else {
        w.palette.neutral
    };
    let (anchor_x, align) = horizontal_anchor(w.widget, w.width);
    let height = w.height;
    let gear = format_gear(car.gear);
    let speed = format_speed_kph(car.speed_ms);
    let base = TextLine {
        text: &gear,
        left: anchor_x,
        top: height * 0.4,
        size: height * 0.6,
        color: gear_color,
        align,
        max_width: Some(w.width * 0.9),
        weight: TextWeight::ValueRegular,
        sizing: TextSizing::Stable,
    };
    text_line(b, base);
    text_line(b, TextLine { text: &speed, top: height * 0.78, size: height * 0.19, color: w.palette.neutral, weight: TextWeight::Value, ..base });
    text_line(
        b,
        TextLine { text: "km/h", top: height * 0.92, size: height * 0.09, color: w.palette.muted, weight: TextWeight::Label, sizing: TextSizing::Fit, ..base },
    );
}

/// The lap_time widget's value templates: the widest text a lap time can show.
const LAP_TEMPLATE: &str = "0:00.000";

fn lap_time(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    let rows = [
        (LapTimeShow::Current, "NOW", format_lap(lap.current_lap_time), w.palette.neutral),
        (LapTimeShow::Last, "LAST", format_lap(lap.last_lap_time), w.palette.neutral),
        (LapTimeShow::Best, "BEST", format_lap(lap.best_lap_time), w.palette.timing_fastest_overall),
    ];
    let show = lap_time_show(w.widget);
    if let Some((_, _, value, color)) = rows.iter().find(|row| row.0 == show) {
        big_value(b, value, LAP_TEMPLATE, w.width, w.height, *color, VALUE_SHARE);
        return;
    }

    let row_height = w.height / rows.len() as f64;
    let label_width = w.width * 0.26;
    let size = value_size(LAP_TEMPLATE, w.width - label_width, row_height, 0.78);
    for (i, (_, label, value, color)) in rows.iter().enumerate() {
        let cy = row_height * (i as f64 + 0.5);
        text_line(
            b,
            TextLine {
                text: label,
                left: 0.0,
                top: cy,
                size: (size * 0.42).min(14.0),
                color: w.palette.secondary,
                align: TextAlign::Start,
                max_width: Some(label_width),
                weight: TextWeight::Label,
                sizing: TextSizing::Fit,
            },
        );
        text_line(
            b,
            TextLine {
                text: value,
                left: w.width,
                top: cy,
                size,
                color: *color,
                align: TextAlign::End,
                max_width: Some(w.width - label_width),
                weight: TextWeight::Value,
                sizing: TextSizing::Stable,
            },
        );
    }
}

/// The resolved flag priority text (RED > SC > VSC > YELLOW > CHECKERED > GREEN) and its color,
/// shared by the header chip and the `flag` widget.
fn flag_info(frame: &TelemetryFrame, palette: &DashPaletteColors) -> (&'static str, Rgba) {
    let text = flag_summary(&frame.flags);
    let color = match text {
        "RED" => palette.critical,
        "SC" | "VSC" | "YELLOW" => palette.race_control_yellow,
        "CHECKERED" => palette.neutral,
        _ => palette.good_on_target,
    };
    (text, color)
}

/// A `TextLine` with the props every widget passes; the rest are set per call.
fn line(text: &str, (left, top): (f64, f64), size: f64, color: Rgba, align: TextAlign, max_width: f64, weight: TextWeight) -> TextLine<'_> {
    TextLine { text, left, top, size, color, align, max_width: Some(max_width), weight, sizing: TextSizing::Stable }
}

fn fit(line: TextLine) -> TextLine {
    TextLine { sizing: TextSizing::Fit, ..line }
}

/// `ValueWithUnit` centered at `left`, the way most widgets place it.
fn value_unit<'t>(value: &'t str, unit: &'t str, left: f64, top: f64, size: f64, palette: &DashPaletteColors, max_width: f64) -> ValueWithUnit<'t> {
    ValueWithUnit { value, unit, left, top, size, color: palette.foreground, unit_color: palette.secondary, align: TextAlign::Center, max_width }
}

fn header(b: &mut Builder, w: &WidgetContext) {
    let session = &w.frame.session;
    let mut mid: Vec<String> = Vec::new();
    if !session.track.is_empty() {
        mid.push(session.track.clone());
    }
    if !session.car.is_empty() {
        mid.push(session.car.clone());
    }
    if session.session_type != "unknown" {
        mid.push(session.session_type.to_uppercase());
    }
    let center_text = if mid.is_empty() { "NO SESSION".to_owned() } else { mid.join("   ") };
    let (flag_text, color) = flag_info(w.frame, w.palette);
    let (width, height, p) = (w.width, w.height, w.palette);

    if width < height * 5.0 {
        let (top_y, bottom_y) = (height * 0.32, height * 0.72);
        text_line(b, fit(line("SPRINT", (4.0, top_y), height * 0.23, p.muted, TextAlign::Start, width * 0.42, TextWeight::LabelBold)));
        text_line(b, fit(line(flag_text, (width - height * 0.26, top_y), height * 0.22, color, TextAlign::End, width * 0.34, TextWeight::LabelBold)));
        dot(b, width - height * 0.1, top_y, height * 0.06, color);
        text_line(b, line(&center_text, (width / 2.0, bottom_y), height * 0.2, p.secondary, TextAlign::Center, width * 0.92, TextWeight::Label));
        return;
    }

    let cy = height / 2.0;
    let size = height * 0.42;
    text_line(b, fit(line("SPRINT", (8.0, cy), size, p.muted, TextAlign::Start, width * 0.18, TextWeight::LabelBold)));
    text_line(b, line(&center_text, (width * 0.2, cy), size, p.secondary, TextAlign::Start, width * 0.55, TextWeight::Label));
    text_line(b, fit(line(flag_text, (width - height * 0.9 - 6.0, cy), height * 0.36, color, TextAlign::End, width * 0.2, TextWeight::LabelBold)));
    dot(b, width - height * 0.4, cy, height * 0.14, color);
}

fn input_trace(b: &mut Builder, w: &WidgetContext) {
    let (car, p) = (&w.frame.car, w.palette);
    let rows = [
        ("THR", car.throttle, p.good_on_target, false),
        ("BRK", car.brake, p.critical, false),
        ("CLU", car.clutch, p.secondary, false),
        ("STR", (car.steering + 1.0) / 2.0, p.secondary, true),
    ];
    let row_height = w.height / rows.len() as f64;
    let bar_left = w.width * 0.24;
    for (i, (label, value, color, centered)) in rows.into_iter().enumerate() {
        let cy = row_height * (i as f64 + 0.5);
        let bar_h = (row_height * 0.55).min(14.0);
        let pct = if centered { value * 2.0 - 1.0 } else { value };
        text_line(b, fit(line(label, (0.0, cy), (row_height * 0.6).min(12.0), p.muted, TextAlign::Start, bar_left - 4.0, TextWeight::Label)));
        h_bar(b, PixelRect::new(bar_left, cy - bar_h / 2.0, w.width - bar_left, bar_h), pct, color, centered);
    }
}

fn sector(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    let current = lap.sector.clamp(1.0, 3.0);
    let gap = 6.0;
    let pip_w = ((w.width - gap * 2.0) / 3.0).max(0.0);
    let pip_h = w.height * 0.36;
    for (s, label) in [(1.0, "S1"), (2.0, "S2"), (3.0, "S3")] {
        let px = (s - 1.0) * (pip_w + gap);
        let active = s == current && lap.sector > 0.0;
        let color = if active { w.palette.primary } else { w.palette.muted };
        text_line(b, fit(line(label, (px + pip_w / 2.0, pip_h * 0.45), pip_h * 0.62, color, TextAlign::Center, pip_w, TextWeight::LabelBold)));
        if active {
            b.rect(PixelRect::new(px + pip_w * 0.2, pip_h * 0.92, pip_w * 0.6, 3.0), Radii::all(1.5), w.palette.primary);
        }
    }
    let lap_time = format_lap(lap.current_lap_time);
    let size = value_size(LAP_TEMPLATE, w.width, w.height - pip_h, VALUE_SHARE);
    let top = pip_h + (w.height - pip_h) / 2.0;
    text_line(b, line(&lap_time, (w.width / 2.0, top), size, w.palette.neutral, TextAlign::Center, w.width, TextWeight::Value));
}

fn delta(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    if lap.target_lap_time <= 0.0 {
        let size = (w.height * 0.4).min(20.0);
        text_line(b, fit(line("NO TARGET", (w.width / 2.0, w.height / 2.0), size, w.palette.muted, TextAlign::Center, w.width * 0.9, TextWeight::Label)));
        return;
    }
    big_value(b, &format_delta(lap.delta), "-00.000", w.width, w.height, w.palette.neutral, VALUE_SHARE);
}

/// A `ValueWithUnit` size: `share` of the height, capped so `chars` value digits plus
/// `unit_chars` unit digits (at the unit's 0.36 scale) fit the width.
fn value_unit_size(height_cap: f64, width: f64, chars: f64, unit_chars: f64) -> f64 {
    height_cap.min(width * 0.96 / ((chars + unit_chars * 0.36) * 0.56))
}

fn fuel(b: &mut Builder, w: &WidgetContext) {
    let (fuel, per_lap) = (w.frame.car.fuel, w.frame.car.fuel_per_lap);
    let laps = (per_lap > 0.01).then(|| to_fixed(fuel / per_lap, 1));
    // A narrow box keeps the laps large and drops the liters rather than shrinking both.
    let with_liters = laps.is_some() && w.width >= 200.0;
    let (value, unit, unit_chars) = match laps {
        Some(laps) if with_liters => (laps, format!("laps · {} L", format_fuel(fuel)), 14.0),
        Some(laps) => (laps, "laps".to_owned(), 4.0),
        None => (format_fuel(fuel), "L".to_owned(), 1.0),
    };
    // The value plus its unit, measured in value-sized digits: "00.0" and the unit's template at 0.36.
    let size = value_unit_size(w.height * 0.7, w.width, 4.0, unit_chars);
    value_with_unit(b, value_unit(&value, &unit, w.width / 2.0, w.height / 2.0, size, w.palette, w.width));
}

/// The four corners in car order, by `TirePosition`.
const TIRE_CORNERS: [&str; 4] = ["FL", "FR", "RL", "RR"];

/// One tyre corner: its title suffix, value, value template and condition fill.
struct TyreCorner {
    title: &'static str,
    value: String,
    template: &'static str,
    fill: Option<Rgba>,
}

/// The requested tyre channel, falling back to the tread sensors when an adapter fills only
/// inner/middle/outer.
fn tyre_temperature(tire: &TireState, use_core: bool) -> f64 {
    if use_core {
        return tire.temp_core;
    }
    if tire.temp_surface > 0.0 {
        return tire.temp_surface;
    }
    let readings: Vec<f64> = [tire.temp_inner, tire.temp_middle, tire.temp_outer].into_iter().filter(|v| *v > 0.0).collect();
    if readings.is_empty() { 0.0 } else { readings.iter().sum::<f64>() / readings.len() as f64 }
}

/// Four tyre corners in car order, each its own frame in the dash style, splitting the widget's
/// cell 2x2 (`TyreCorners`).
fn tyre_corners(b: &mut Builder, w: &WidgetContext, corner: impl Fn(usize) -> TyreCorner) {
    let (cell_w, cell_h) = (w.width / 2.0, w.height / 2.0);
    for (i, label) in TIRE_CORNERS.into_iter().enumerate() {
        let TyreCorner { title, value, template, fill } = corner(i);
        let title = format!("{label}{title}");
        let rect = PixelRect::new((i % 2) as f64 * cell_w, (i / 2) as f64 * cell_h, cell_w, cell_h);
        let frame = WidgetFrame { ctx: w.chrome, rect, title: Some(&title), accent: None, fill, title_color: None, palette: *w.palette };
        widget_frame(b, frame, |b, width, height, palette| big_value(b, &value, template, width, height, palette.foreground, VALUE_SHARE));
    }
}

fn tyre_temp(b: &mut Builder, w: &WidgetContext) {
    let use_core = w.widget.config_string("channel") == Some("core");
    tyre_corners(b, w, |i| {
        let temp = tyre_temperature(&w.frame.tires[i], use_core);
        TyreCorner {
            title: if use_core { " CORE" } else { "" },
            value: if temp > 0.0 { format!("{}°", format_temp(temp)) } else { "--".to_owned() },
            template: "000°",
            fill: (temp > 0.0).then(|| resolve_tyre_color(temp, w.palette)),
        }
    });
}

fn tyre_pressure(b: &mut Builder, w: &WidgetContext) {
    tyre_corners(b, w, |i| TyreCorner { title: " KPA", value: format_pressure(w.frame.tires[i].pressure_kpa), template: "000.0", fill: None });
}

fn flag(b: &mut Builder, w: &WidgetContext) {
    let (text, color) = flag_info(w.frame, w.palette);
    let (width, height) = (w.width, w.height);
    if width < height * 0.9 {
        let radius = (width * 0.18).min(height * 0.12);
        dot(b, width / 2.0, height * 0.31, radius, color);
        let size = (height * 0.18).min(width * 0.2);
        text_line(b, fit(line(text, (width / 2.0, height * 0.68), size, color, TextAlign::Center, width * 0.88, TextWeight::ValueRegular)));
        return;
    }
    dot(b, width * 0.12, height / 2.0, (height * 0.18).min(width * 0.09), color);
    let size = (height * 0.32).min(width * 0.12);
    text_line(b, fit(line(text, (width * 0.62, height / 2.0), size, color, TextAlign::Center, width * 0.6, TextWeight::ValueRegular)));
}

/// A knob's setting as its widget shows it: the whole step, `String(Math.trunc(value))`.
fn knob_value(b: &mut Builder, w: &WidgetContext, value: f64, color: Rgba) {
    big_value(b, &js_number_string(value.trunc()), "00", w.width, w.height, color, VALUE_SHARE);
}

fn tc(b: &mut Builder, w: &WidgetContext) {
    let e = &w.frame.electronics;
    knob_value(b, w, e.tc, if e.tc_active { w.palette.assist_active } else { w.palette.neutral });
}

fn brake_bias(b: &mut Builder, w: &WidgetContext) {
    big_value(b, &format_front_brake_bias(w.frame.car.brake_bias_rear), "00.0", w.width, w.height, w.palette.neutral, VALUE_SHARE);
}

fn fuel_target(b: &mut Builder, w: &WidgetContext) {
    let size = value_unit_size(w.height * 0.7, w.width, 4.0, 5.0);
    let value = format_fuel_per_lap_target(w.targets.and_then(|t| t.fuel_per_lap_liters));
    value_with_unit(b, value_unit(&value, "L/lap", w.width / 2.0, w.height / 2.0, size, w.palette, w.width));
}

fn position(b: &mut Builder, w: &WidgetContext) {
    let race = &w.frame.race;
    let value = if race.position > 0.0 { format!("P{}", js_number_string(race.position)) } else { "P--".to_owned() };
    let unit = if race.total_positions > 0.0 { format!("/{}", js_number_string(race.total_positions)) } else { String::new() };
    let size = value_unit_size(w.height * 0.7, w.width, 3.0, 3.0);
    value_with_unit(b, value_unit(&value, &unit, w.width / 2.0, w.height / 2.0, size, w.palette, w.width));
}

fn gaps(b: &mut Builder, w: &WidgetContext) {
    let ahead = format_gap(w.frame.race.gap_ahead);
    let behind = format_gap(w.frame.race.gap_behind);
    let (width, height, p) = (w.width, w.height, w.palette);
    match gap_side(w.widget) {
        // One side alone: its title already says which, so the value goes unsigned.
        GapSide::Ahead => return big_value(b, &ahead, "00.000", width, height, p.foreground, VALUE_SHARE),
        GapSide::Behind => return big_value(b, &behind, "00.000", width, height, p.foreground, VALUE_SHARE),
        GapSide::Both => {}
    }
    let half = width / 2.0;
    let label_top = height * 0.18;
    let label_size = (height * 0.26).min(12.0);
    let size = value_size("+00.000", half - 6.0, height * 0.64, 0.9);
    let signed = |sign: &str, gap: &str| if gap == "--" { "--".to_owned() } else { format!("{sign}{gap}") };
    let (ahead, behind) = (signed("-", &ahead), signed("+", &behind));
    text_line(b, fit(line("AHEAD", (0.0, label_top), label_size, p.secondary, TextAlign::Start, half - 6.0, TextWeight::Label)));
    text_line(b, line(&ahead, (0.0, height * 0.66), size, p.foreground, TextAlign::Start, half - 6.0, TextWeight::Value));
    text_line(b, fit(line("BEHIND", (width, label_top), label_size, p.secondary, TextAlign::End, half - 6.0, TextWeight::Label)));
    text_line(b, line(&behind, (width, height * 0.66), size, p.foreground, TextAlign::End, half - 6.0, TextWeight::Value));
}

/// The LMU virtual-energy budget. The "mode" config picks the readout; all three tolerate 0..1
/// or 0..100 source scales by normalising off the current level and applying the same factor to
/// the per-lap delta, so "laps remaining" stays scale-independent.
fn virtual_energy(b: &mut Builder, w: &WidgetContext) {
    let energy = &w.frame.energy;
    let raw = energy.virtual_energy;
    let scale = if raw > 0.0 && raw <= 1.0 { 100.0 } else { 1.0 };
    let pct = raw * scale;
    let level = if pct > 0.0 { to_fixed(pct, 1) } else { "--".to_owned() };
    let (width, height, p) = (w.width, w.height, w.palette);
    let mode = w.widget.config_string("mode");

    if mode == Some("percent") {
        let bar_h = (height * 0.14).min(10.0);
        let bar_color = if pct < 5.0 {
            p.critical
        } else if pct < 15.0 {
            p.warning
        } else {
            p.neutral
        };
        let size = value_unit_size((height - bar_h - 6.0) * 0.8, width, 4.0, 1.0);
        let value = ValueWithUnit { color: p.neutral, ..value_unit(&level, "%", width / 2.0, (height - bar_h - 6.0) / 2.0, size, p, width) };
        value_with_unit(b, value);
        h_bar(b, PixelRect::new(0.0, height - bar_h, width, bar_h), pct / 100.0, bar_color, false);
        return;
    }

    let left = width * 0.55;
    let size = value_unit_size(height * 0.7, left, 4.0, 1.0);
    let side = (height * 0.24).min(16.0);
    let per_lap = energy.virtual_energy_per_lap;
    let lines = if mode == Some("power") {
        let power = |name: &str, kw: f64| if kw > 0.0 { format!("{name} {} kW", format_int(kw)) } else { format!("{name} -- kW") };
        [power("DEP", energy.deploy_power), power("REGEN", energy.regen_power)]
    } else {
        [
            if per_lap * scale > 0.0001 { format!("{} %/lap", to_fixed(per_lap * scale, 1)) } else { "-- %/lap".to_owned() },
            if per_lap > 0.0001 { format!("~{} laps", format_int(raw / per_lap)) } else { "~-- laps".to_owned() },
        ]
    };
    let value = ValueWithUnit { color: p.neutral, align: TextAlign::Start, ..value_unit(&level, "%", 0.0, height / 2.0, size, p, left) };
    value_with_unit(b, value);
    text_line(b, line(&lines[0], (width, height * 0.3), side, p.secondary, TextAlign::End, width - left, TextWeight::Value));
    text_line(b, line(&lines[1], (width, height * 0.72), side, p.muted, TextAlign::End, width - left, TextWeight::Label));
}

/// Free text: the bound value when it prints as something, else the configured content, else
/// the widget's id. A bound value is printed as `String(value)`, with no per-type formatting.
fn text(b: &mut Builder, w: &WidgetContext) {
    let content = w.widget.config_string("content").unwrap_or("");
    let resolved = match w.widget.config_string("binding").filter(|binding| !binding.is_empty()) {
        Some(binding) => resolve_binding(BindingContext { frame: w.frame, settings: w.settings, targets: w.targets }, binding).to_display(),
        None => String::new(),
    };
    let display = [resolved.as_str(), content, &w.widget.id].into_iter().find(|s| !s.is_empty()).unwrap_or("");
    text_line(b, line(display, (w.width / 2.0, w.height / 2.0), w.height * 0.45, w.palette.foreground, TextAlign::Center, w.width * 0.94, TextWeight::Value));
}

/// The muted type name an unknown widget shows (`UnknownWidget`).
fn placeholder(b: &mut Builder, w: &WidgetContext) {
    let text = w.widget.widget_type.to_uppercase();
    text_line(
        b,
        TextLine {
            text: &text,
            left: w.width / 2.0,
            top: w.height / 2.0,
            size: w.height * 0.2,
            color: w.palette.muted,
            align: TextAlign::Center,
            max_width: Some(w.width * 0.9),
            weight: TextWeight::Label,
            sizing: TextSizing::Fit,
        },
    );
}

/// Draws a widget's content into its content box (`WidgetContent`). `ers` is the pre-migration
/// alias of `virtual_energy`; any other unknown type draws the muted placeholder.
///
/// `racelogic_lap_timer` draws nothing in its cell: it is a full-canvas overlay that ignores its
/// grid cell (`dash.rs` draws it).
pub fn widget_content(b: &mut Builder, w: &WidgetContext) {
    let e = &w.frame.electronics;
    match w.widget.widget_type.as_str() {
        "header" => header(b, w),
        "text" => text(b, w),
        "rpm_bar" => rpm_bar(b, w),
        "gear_speed" => gear_speed(b, w),
        "input_trace" => input_trace(b, w),
        "sector" => sector(b, w),
        "lap_time" => lap_time(b, w),
        "delta" => delta(b, w),
        "fuel" => fuel(b, w),
        "tyre_temp" => tyre_temp(b, w),
        "flag" => flag(b, w),
        "tc" => tc(b, w),
        "abs" => knob_value(b, w, e.abs, w.palette.neutral),
        "engine_map" => knob_value(b, w, e.motor_map, w.palette.neutral),
        "brake_bias" => brake_bias(b, w),
        "fuel_target" => fuel_target(b, w),
        "position" => position(b, w),
        "gaps" => gaps(b, w),
        "predictive_lap" => big_value(b, &format_lap(w.frame.lap.target_lap_time), LAP_TEMPLATE, w.width, w.height, w.palette.foreground, VALUE_SHARE),
        "racelogic_lap_timer" => {}
        "tyre_pressure" => tyre_pressure(b, w),
        "virtual_energy" | "ers" => virtual_energy(b, w),
        _ => placeholder(b, w),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chrome::ChromeContext;
    use crate::draw::{DrawOp, TextRun};
    use crate::model::DashStyle;
    use crate::palette::DEFAULT_DASH_PALETTE;
    use crate::text::Fonts;
    use serde_json::json;

    fn widget(widget_type: &str, config: serde_json::Value) -> DashWidget {
        DashWidget {
            id: "w".to_owned(),
            widget_type: widget_type.to_owned(),
            col_span: 1.0,
            row_span: 1.0,
            config: config.as_object().cloned().unwrap_or_default(),
            ..DashWidget::default()
        }
    }

    fn draw(widget: &DashWidget, frame: &TelemetryFrame, width: f64, height: f64) -> Vec<DrawOp> {
        draw_with(widget, frame, width, height, None, None)
    }

    fn draw_with(
        widget: &DashWidget,
        frame: &TelemetryFrame,
        width: f64,
        height: f64,
        targets: Option<&DashTargets>,
        settings: Option<&DashSettings>,
    ) -> Vec<DrawOp> {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let ctx = WidgetContext {
            widget,
            frame,
            palette: &DEFAULT_DASH_PALETTE,
            width,
            height,
            targets,
            settings,
            chrome: ChromeContext { style: DashStyle::Panels, scale: 1.0 },
        };
        widget_content(&mut Builder::new(&fonts, &mut ops), &ctx);
        ops
    }

    fn text_of(ops: &[DrawOp]) -> Vec<String> {
        texts(ops).iter().map(|r| r.text.clone()).collect()
    }

    fn ovals(ops: &[DrawOp]) -> Vec<(PixelRect, Rgba)> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Oval { rect, color } => Some((*rect, *color)),
                _ => None,
            })
            .collect()
    }

    const P: DashPaletteColors = DEFAULT_DASH_PALETTE;

    #[test]
    fn the_header_shows_the_session_and_the_flag_chip_in_its_narrow_and_wide_forms() {
        let mut frame = TelemetryFrame::default();
        frame.session.track = "Le Mans".to_owned();
        frame.session.session_type = "race".to_owned();
        frame.flags.yellow = true;
        let header = widget("header", json!({}));
        let narrow = draw(&header, &frame, 200.0, 80.0);
        assert_eq!(text_of(&narrow), ["SPRINT", "YELLOW", "Le Mans RACE"], "joined by three spaces, collapsed like CSS");
        let runs = texts(&narrow);
        assert_eq!((runs[1].color, runs[2].color), (P.race_control_yellow, P.secondary));
        assert_eq!(ovals(&narrow)[0].1, P.race_control_yellow);

        let wide = draw(&header, &TelemetryFrame::default(), 760.0, 32.0);
        assert_eq!(text_of(&wide), ["SPRINT", "NO SESSION", "GREEN"]);
        let flag = texts(&wide)[2];
        assert_eq!(flag.color, P.good_on_target);
        let fonts = Fonts::new();
        assert!((flag.x + flag.width(&fonts) - (760.0 - 32.0 * 0.9 - 6.0)).abs() < 1e-9, "end-anchored before the dot");
    }

    #[test]
    fn text_prefers_its_binding_then_its_content_then_its_id() {
        let mut frame = TelemetryFrame::default();
        frame.car.rpm = 7450.4;
        let settings = DashSettings { driver_name: Some("A. Driver".to_owned()), driver_number: None };
        let shown = |config| text_of(&draw_with(&widget("text", config), &frame, 200.0, 80.0, None, Some(&settings)))[0].clone();
        assert_eq!(shown(json!({ "binding": "car.rpm", "content": "unused" })), "7450");
        assert_eq!(shown(json!({ "binding": "profile.driverName" })), "A. Driver");
        assert_eq!(shown(json!({ "binding": "profile.driverNumber", "content": "HELLO" })), "HELLO");
        assert_eq!(shown(json!({ "content": "" })), "w");
    }

    #[test]
    fn input_trace_draws_four_labelled_bars_with_steering_filled_from_the_middle() {
        let mut frame = TelemetryFrame::default();
        frame.car.throttle = 0.5;
        frame.car.steering = -0.5;
        let ops = draw(&widget("input_trace", json!({})), &frame, 200.0, 100.0);
        assert_eq!(text_of(&ops), ["THR", "BRK", "CLU", "STR"]);
        let bars = rects(&ops);
        // Track + fill for throttle, bare tracks for brake and clutch, track + midline + fill for steering.
        assert_eq!(bars.len(), 7);
        assert_eq!(bars[1].1, P.good_on_target);
        assert_eq!(bars[1].0.width, 76.0, "half of the 152px bar right of the 24% label column");
        let steer = bars[6].0;
        assert!((steer.left + steer.width - 124.0).abs() < 1.0 / 64.0, "a left turn fills leftward from the middle");
    }

    #[test]
    fn sector_marks_the_current_sector_and_shows_the_running_lap() {
        let mut frame = TelemetryFrame::default();
        frame.lap.sector = 2.0;
        frame.lap.current_lap_time = 92.345;
        let ops = draw(&widget("sector", json!({})), &frame, 300.0, 100.0);
        let runs = texts(&ops);
        assert_eq!(text_of(&ops), ["S1", "S2", "S3", "1:32.345"]);
        assert_eq!((runs[0].color, runs[1].color), (P.muted, P.primary));
        assert_eq!(rects(&ops).len(), 1, "one underline, under S2");
        frame.lap.sector = 0.0;
        assert!(rects(&draw(&widget("sector", json!({})), &frame, 300.0, 100.0)).is_empty());
    }

    #[test]
    fn delta_shows_no_target_without_a_target_lap_else_the_signed_delta() {
        let mut frame = TelemetryFrame::default();
        frame.lap.delta = 0.35;
        let none = draw(&widget("delta", json!({})), &frame, 200.0, 80.0);
        assert_eq!((texts(&none)[0].text.as_str(), texts(&none)[0].color), ("NO TARGET", P.muted));
        frame.lap.target_lap_time = 209.0;
        let run = texts(&draw(&widget("delta", json!({})), &frame, 200.0, 80.0))[0].clone();
        assert_eq!((run.text.as_str(), run.color), ("+0.350", P.neutral));
    }

    #[test]
    fn fuel_shows_laps_with_liters_when_wide_laps_alone_when_narrow_and_liters_without_a_per_lap_figure() {
        let mut frame = TelemetryFrame::default();
        frame.car.fuel = 62.4;
        frame.car.fuel_per_lap = 4.6;
        let fuel = widget("fuel", json!({}));
        assert_eq!(text_of(&draw(&fuel, &frame, 400.0, 100.0)), ["13.6", "laps · 62.4 L"]);
        assert_eq!(text_of(&draw(&fuel, &frame, 150.0, 60.0)), ["13.6", "laps"]);
        frame.car.fuel_per_lap = 0.0;
        let liters = draw(&fuel, &frame, 400.0, 100.0);
        assert_eq!(text_of(&liters), ["62.4", "L"]);
        assert_eq!((texts(&liters)[0].color, texts(&liters)[1].color), (P.foreground, P.secondary));
    }

    #[test]
    fn tyres_split_into_four_frames_colored_by_temperature_with_ink_values() {
        let mut frame = TelemetryFrame::default();
        for (tire, temp) in frame.tires.iter_mut().zip([60.0, 85.0, 105.0, 0.0]) {
            tire.temp_surface = temp;
            tire.temp_core = temp + 1.0;
        }
        let ops = draw(&widget("tyre_temp", json!({})), &frame, 300.0, 200.0);
        assert_eq!(text_of(&ops), ["FL", "60°", "FR", "85°", "RL", "105°", "RR", "--"]);
        let fills: Vec<Rgba> = rects(&ops).iter().map(|r| r.1).collect();
        assert_eq!(fills, [P.cold_low, P.good_on_target, P.warning], "a corner without a reading has no fill");
        assert_eq!(texts(&ops)[1].color, P.background, "values on a fill draw in ink");
        assert_eq!(texts(&ops)[7].color, P.foreground);

        let core = text_of(&draw(&widget("tyre_temp", json!({ "channel": "core" })), &frame, 300.0, 200.0));
        assert_eq!((core[0].as_str(), core[1].as_str()), ("FL CORE", "61°"));

        frame.tires[2].pressure_kpa = 168.04;
        let pressure = text_of(&draw(&widget("tyre_pressure", json!({})), &frame, 300.0, 200.0));
        assert_eq!(pressure, ["FL KPA", "--", "FR KPA", "--", "RL KPA", "168.0", "RR KPA", "--"]);
    }

    #[test]
    fn tyre_temperature_falls_back_to_the_tread_sensors() {
        let tire = TireState { temp_inner: 90.0, temp_middle: 0.0, temp_outer: 80.0, ..TireState::default() };
        assert_eq!(tyre_temperature(&tire, false), 85.0);
        assert_eq!(tyre_temperature(&tire, true), 0.0);
    }

    #[test]
    fn the_flag_widget_stacks_when_tall_and_sits_side_by_side_when_wide() {
        let mut frame = TelemetryFrame::default();
        frame.flags.red = true;
        let tall = draw(&widget("flag", json!({})), &frame, 60.0, 200.0);
        let (dot_rect, color) = ovals(&tall)[0];
        assert_eq!(color, P.critical);
        assert!((dot_rect.top + dot_rect.height / 2.0 - 62.0).abs() < 2.0 / 64.0, "dot above the text");
        assert_eq!(texts(&tall)[0].weight, TextWeight::ValueRegular);
        let wide = draw(&widget("flag", json!({})), &frame, 300.0, 80.0);
        let wide_dot = ovals(&wide)[0].0;
        assert!((wide_dot.left + wide_dot.width / 2.0 - 36.0).abs() < 2.0 / 64.0, "dot at 12% of the width");
        assert_eq!(texts(&wide)[0].text, "RED");
    }

    #[test]
    fn knobs_show_the_whole_step_and_tc_turns_blue_while_active() {
        let mut frame = TelemetryFrame::default();
        frame.electronics.tc = 4.9;
        frame.electronics.abs = 3.0;
        frame.electronics.motor_map = 5.2;
        frame.car.brake_bias_rear = 0.462;
        let value = |t: &str, frame: &TelemetryFrame| texts(&draw(&widget(t, json!({})), frame, 100.0, 60.0))[0].clone();
        assert_eq!((value("tc", &frame).text, value("tc", &frame).color), ("4".to_owned(), P.neutral));
        assert_eq!((value("abs", &frame).text, value("engine_map", &frame).text), ("3".to_owned(), "5".to_owned()));
        assert_eq!(value("brake_bias", &frame).text, "53.8");
        frame.electronics.tc_active = true;
        assert_eq!(value("tc", &frame).color, P.assist_active);
    }

    #[test]
    fn position_fuel_target_and_gaps_print_their_race_values() {
        let mut frame = TelemetryFrame::default();
        frame.race.position = 4.0;
        frame.race.total_positions = 38.0;
        frame.race.gap_ahead = 2.41;
        assert_eq!(text_of(&draw(&widget("position", json!({})), &frame, 160.0, 80.0)), ["P4", "/38"]);
        assert_eq!(text_of(&draw(&widget("position", json!({})), &TelemetryFrame::default(), 160.0, 80.0)), ["P--"]);

        let targets = DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(4.42) };
        let fuel_target = |targets| text_of(&draw_with(&widget("fuel_target", json!({})), &frame, 160.0, 80.0, targets, None));
        assert_eq!(fuel_target(Some(&targets)), ["4.42", "L/lap"]);
        assert_eq!(fuel_target(None), ["--", "L/lap"]);

        let both = draw(&widget("gaps", json!({})), &frame, 240.0, 100.0);
        assert_eq!(text_of(&both), ["AHEAD", "-2.410", "BEHIND", "--"]);
        let fonts = Fonts::new();
        let behind = texts(&both)[3];
        assert!((behind.x + behind.width(&fonts) - 240.0).abs() < 1e-9, "behind is end-anchored on the right edge");
        assert_eq!(text_of(&draw(&widget("gaps", json!({ "side": "ahead" })), &frame, 240.0, 100.0)), ["2.410"]);
    }

    #[test]
    fn predictive_lap_shows_the_target_lap_time() {
        let mut frame = TelemetryFrame::default();
        frame.lap.target_lap_time = 209.0;
        assert_eq!(text_of(&draw(&widget("predictive_lap", json!({})), &frame, 200.0, 80.0)), ["3:29.000"]);
    }

    #[test]
    fn virtual_energy_reads_budget_percent_and_power_and_takes_a_0_to_1_scale() {
        let mut frame = TelemetryFrame::default();
        frame.energy.virtual_energy = 0.42;
        frame.energy.virtual_energy_per_lap = 0.035;
        frame.energy.deploy_power = 340.0;
        let ve = |config| draw(&widget("virtual_energy", config), &frame, 300.0, 100.0);
        assert_eq!(text_of(&ve(json!({}))), ["42.0", "%", "3.5 %/lap", "~11 laps"], "0.42 / 0.035 is 11.999..., truncated as in JavaScript");
        assert_eq!(text_of(&ve(json!({ "mode": "power" }))), ["42.0", "%", "DEP 340 kW", "REGEN -- kW"]);
        let percent = ve(json!({ "mode": "percent" }));
        assert_eq!(text_of(&percent), ["42.0", "%"]);
        assert_eq!(rects(&percent)[1].1, P.neutral, "the level bar is neutral above 15%");
        assert_eq!(text_of(&draw(&widget("ers", json!({})), &frame, 300.0, 100.0))[0], "42.0", "ers is the old name");
        let empty = draw(&widget("virtual_energy", json!({})), &TelemetryFrame::default(), 300.0, 100.0);
        assert_eq!(text_of(&empty), ["--", "%", "-- %/lap", "~-- laps"]);
    }

    #[test]
    fn the_racelogic_lap_timer_draws_nothing_in_its_cell() {
        assert!(draw(&widget("racelogic_lap_timer", json!({})), &TelemetryFrame::default(), 200.0, 100.0).is_empty());
    }

    fn texts(ops: &[DrawOp]) -> Vec<&TextRun> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) => Some(run),
                _ => None,
            })
            .collect()
    }

    fn rects(ops: &[DrawOp]) -> Vec<(PixelRect, Rgba)> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Rect { rect, color, .. } => Some((*rect, *color)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn gear_speed_shows_the_gear_speed_and_unit_colored_by_the_rpm_stage() {
        let mut frame = TelemetryFrame::default();
        frame.car.gear = 4.0;
        frame.car.speed_ms = 50.0;
        frame.car.rpm = 9000.0;
        frame.car.max_rpm = 10000.0;
        let ops = draw(&widget("gear_speed", json!({})), &frame, 200.0, 300.0);
        let runs = texts(&ops);
        let text: Vec<&str> = runs.iter().map(|r| r.text.as_str()).collect();
        assert_eq!(text, ["4", "180", "km/h"]);
        assert_eq!(runs[0].color, DEFAULT_DASH_PALETTE.rpm_near_limit);
        assert_eq!(runs[0].weight, TextWeight::ValueRegular);
        assert_eq!(runs[0].size, 180.0);
        assert_eq!(runs[2].color, DEFAULT_DASH_PALETTE.muted);

        frame.car.rpm = 9700.0;
        assert_eq!(texts(&draw(&widget("gear_speed", json!({})), &frame, 200.0, 300.0))[0].color, DEFAULT_DASH_PALETTE.rpm_shift);
    }

    #[test]
    fn gear_speed_anchors_left_or_right_from_its_align_config() {
        let fonts = Fonts::new();
        let frame = TelemetryFrame::default();
        let left = draw(&widget("gear_speed", json!({ "align": "left" })), &frame, 200.0, 300.0);
        assert!(texts(&left).iter().all(|r| r.x == 12.0), "start-anchored at 6%");
        let right = draw(&widget("gear_speed", json!({ "align": "right" })), &frame, 200.0, 300.0);
        let gear = texts(&right)[0];
        assert!((gear.x + gear.width(&fonts) - 188.0).abs() < 1e-9, "end-anchored at 94%");
        assert_eq!(gear.text, "N");
    }

    #[test]
    fn horizontal_rpm_bar_lights_segments_up_to_the_rpm_in_stage_colors() {
        let mut frame = TelemetryFrame::default();
        frame.car.rpm = 9500.0;
        frame.car.max_rpm = 10000.0;
        let ops = draw(&widget("rpm_bar", json!({})), &frame, 760.0, 40.0);
        let segments = rects(&ops);
        assert_eq!(segments.len(), 24);
        let p = DEFAULT_DASH_PALETTE;
        // ceil(0.95 * 24) = 23 lit; phase i/23: green below 0.78, red below 0.93, blue after.
        assert_eq!(segments[0].1, p.rpm_normal);
        assert_eq!(segments[18].1, p.rpm_near_limit);
        assert_eq!(segments[22].1, p.rpm_shift);
        assert_eq!(segments[23].1, p.surface);
        let gap = 760.0 * 0.0025;
        // Box numbers are in layout units (1/64 px), so allow one unit per term.
        assert!((segments[1].0.left - (segments[0].0.width + gap)).abs() < 2.0 / 64.0);
    }

    #[test]
    fn vertical_rpm_bar_fills_twenty_segments_bottom_up() {
        let mut frame = TelemetryFrame::default();
        frame.car.rpm = 5000.0;
        frame.car.max_rpm = 10000.0;
        let segments = rects(&draw(&widget("rpm_bar", json!({})), &frame, 40.0, 300.0));
        assert_eq!(segments.len(), 20);
        assert!(segments[0].0.top > segments[19].0.top, "segment 0 is the bottom one");
        assert_eq!(segments[9].1, DEFAULT_DASH_PALETTE.rpm_normal);
        assert_eq!(segments[10].1, crate::palette::dim_color(DEFAULT_DASH_PALETTE.rpm_normal, 0.15).unwrap());
    }

    #[test]
    fn lap_time_all_stacks_now_last_best_with_best_in_session_purple() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap_time = 92.345;
        frame.lap.best_lap_time = 90.0;
        let ops = draw(&widget("lap_time", json!({})), &frame, 300.0, 150.0);
        let runs = texts(&ops);
        let text: Vec<&str> = runs.iter().map(|r| r.text.as_str()).collect();
        assert_eq!(text, ["NOW", "1:32.345", "LAST", "--:--.---", "BEST", "1:30.000"]);
        assert_eq!(runs[5].color, DEFAULT_DASH_PALETTE.timing_fastest_overall);
        assert_eq!(runs[0].color, DEFAULT_DASH_PALETTE.secondary);
        assert_eq!(runs[1].clip.map(|c| c.left + c.width), Some(300.0), "values end-anchored on the right edge");
    }

    #[test]
    fn lap_time_single_shows_one_big_centered_value() {
        let mut frame = TelemetryFrame::default();
        frame.lap.last_lap_time = 101.5;
        let ops = draw(&widget("lap_time", json!({ "show": "last" })), &frame, 300.0, 100.0);
        let runs = texts(&ops);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].text, "1:41.500");
        assert_eq!(runs[0].size, value_size(LAP_TEMPLATE, 300.0, 100.0, VALUE_SHARE));
    }

    #[test]
    fn lap_time_titles_follow_its_show_config() {
        let frame = TelemetryFrame::default();
        let title = |config| match widget_chrome(&widget("lap_time", config), &frame, &DEFAULT_DASH_PALETTE) {
            WidgetChrome::Framed { title, .. } => title,
            other => panic!("{other:?}"),
        };
        assert_eq!(title(json!({})), "LAP TIMES");
        assert_eq!(title(json!({ "show": "best" })), "BEST");
        assert_eq!(title(json!({ "show": "nonsense" })), "LAP TIMES");
    }

    #[test]
    fn an_unknown_widget_draws_its_type_name_as_a_muted_placeholder() {
        let ops = draw(&widget("not-a-real-widget", json!({})), &TelemetryFrame::default(), 200.0, 100.0);
        let runs = texts(&ops);
        assert_eq!(runs[0].text, "NOT-A-REAL-WIDGET");
        assert_eq!(runs[0].color, DEFAULT_DASH_PALETTE.muted);
    }

    /// The strings quoted with `quote` in `source` between `start` and the next `end`.
    fn quoted_between<'a>(source: &'a str, quote: char, start: &str, end: &str) -> std::collections::BTreeSet<&'a str> {
        let from = source.find(start).unwrap_or_else(|| panic!("{start:?} not found")) + start.len();
        let body = &source[from..from + source[from..].find(end).unwrap_or_else(|| panic!("{end:?} not found"))];
        body.split(quote).skip(1).step_by(2).collect()
    }

    /// The editor offers the widget types in `packages/dashboard/src/widgetTypes.ts`; this renderer
    /// must draw exactly those (plus the `ers` alias), or the editor offers a widget the wheel
    /// shows as a placeholder, or the wheel draws one nobody can add.
    #[test]
    fn the_editor_offers_exactly_the_widget_types_this_renderer_draws() {
        let offered = quoted_between(include_str!("../../src/widgetTypes.ts"), '\'', "export const dashboardWidgetTypes = [", "] as const");
        let mut drawn = quoted_between(include_str!("widgets.rs"), '"', "pub fn widget_content(", "_ => placeholder(b, w)");
        assert!(drawn.remove("ers"), "the pre-migration alias of virtual_energy");
        assert_eq!(offered, drawn);
    }

    #[test]
    fn condition_fills_follow_the_frame() {
        let mut frame = TelemetryFrame::default();
        frame.car.fuel = 1.5;
        let fill = |w: &str, frame: &TelemetryFrame| match widget_chrome(&widget(w, json!({})), frame, &DEFAULT_DASH_PALETTE) {
            WidgetChrome::Framed { fill, .. } => fill,
            other => panic!("{other:?}"),
        };
        assert_eq!(fill("fuel", &frame), Some(DEFAULT_DASH_PALETTE.critical));
        frame.lap.target_lap_time = 90.0;
        frame.lap.delta = -0.2;
        assert_eq!(fill("delta", &frame), Some(DEFAULT_DASH_PALETTE.timing_personal_best));
        assert_eq!(widget_chrome(&widget("tyre_temp", json!({})), &frame, &DEFAULT_DASH_PALETTE), WidgetChrome::Split);
        assert_eq!(widget_chrome(&widget("gear_speed", json!({})), &frame, &DEFAULT_DASH_PALETTE), WidgetChrome::Bare);
    }
}
