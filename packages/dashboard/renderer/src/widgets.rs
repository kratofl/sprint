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
use crate::model::{CarState, DashSettings, DashTargets, DashWidget, FieldCar, LapState, TelemetryFrame, TireState};
use crate::palette::{DashPaletteColors, Rgba, dash_setting_colors, dim_color, resolve_tyre_color};
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
        "tc" if frame.electronics.tc_active => WidgetChrome::Framed { title: "TC", accent: Some(dash_setting_colors::TC), fill: Some(dash_setting_colors::TC) },
        "tc" => knob("TC", dash_setting_colors::TC),
        "abs" if frame.electronics.abs_active => {
            WidgetChrome::Framed { title: "ABS", accent: Some(dash_setting_colors::ABS), fill: Some(dash_setting_colors::ABS) }
        }
        "abs" => knob("ABS", dash_setting_colors::ABS),
        "engine_map" => knob("MAP", dash_setting_colors::ENGINE_MAP),
        "brake_bias" => knob("BIAS", dash_setting_colors::BRAKE_BIAS),
        "fuel_target" => framed("FUEL TARGET"),
        "position" => framed("POS"),
        "gaps" => framed(gap_side(widget).title()),
        "predictive_lap" => framed("PREDICTED"),
        "virtual_energy" | "ers" => filled("VIRTUAL ENERGY", energy_fill(virtual_energy_percent(frame), palette)),
        "tyre_temp" | "tyre_pressure" => WidgetChrome::Split,
        "battery" => filled("BATTERY", energy_fill(battery_percent(frame), palette)),
        "relative" => framed("RELATIVE"),
        "damage" => framed("DAMAGE"),
        // Mockup v2.
        "tyre" => framed(match widget.config_string("corner") {
            Some("fr") => "FR",
            Some("rl") => "RL",
            Some("rr") => "RR",
            _ => "FL",
        }),
        "sectors" => framed("SECTORS"),
        "speed" => framed("SPEED"),
        "laps" => framed("LAP"),
        "fuel_laps" => framed("FUEL LAPS"),
        "ve_laps" => framed("VE LAPS"),
        "time_left" => framed("TIME LEFT"),
        "soc" => framed("SOC"),
        "slip" => knob("SLIP", dash_setting_colors::TC),
        "cut" => knob("CUT", dash_setting_colors::TC),
        "fuel_avg" => framed("FUEL AVG"),
        "fuel_time" => framed("FUEL TIME"),
        "laps_left" => framed("LAPS LEFT"),
        "refuel" => framed("REFUEL"),
        "clock" => framed("CLOCK"),
        "weather" => framed(if is_raining(frame) { "RAIN · TRACK" } else { "AIR · TRACK" }),
        "oil_temp" => framed("OIL"),
        "water_temp" => framed("WATER"),
        "migration" => knob("MIGRATION", dash_setting_colors::BRAKE_BIAS),
        "arb" => framed("ARB F · R"),
        "penalty" => filled("PENALTY", (penalties_to_serve(frame) > 0.0).then_some(palette.critical)),
        "tyre_wear" => framed("WEAR"),
        "sector_time" => framed("SECTOR"),
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
pub(crate) fn virtual_energy_percent(frame: &TelemetryFrame) -> f64 {
    let raw = frame.energy.virtual_energy;
    if raw > 0.0 && raw <= 1.0 { raw * 100.0 } else { raw }
}

/// The hybrid battery's charge as a percentage (the frame's 0-1 fraction).
fn battery_percent(frame: &TelemetryFrame) -> f64 {
    frame.energy.soc * 100.0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LapTimeShow {
    All,
    Current,
    Last,
    Best,
    SessionBest,
    ClassBest,
}

impl LapTimeShow {
    fn title(self) -> &'static str {
        match self {
            LapTimeShow::All => "LAP TIMES",
            LapTimeShow::Current => "CURRENT",
            LapTimeShow::Last => "LAST",
            LapTimeShow::Best => "BEST",
            LapTimeShow::SessionBest => "SESSION BEST",
            LapTimeShow::ClassBest => "CLASS BEST",
        }
    }
}

/// The lap_time widget's "show" config: the driver's three times stacked, or one time large
/// (one of those, or the session's or the class's best).
fn lap_time_show(widget: &DashWidget) -> LapTimeShow {
    match widget.config_string("show") {
        Some("current") => LapTimeShow::Current,
        Some("last") => LapTimeShow::Last,
        Some("best") => LapTimeShow::Best,
        Some("session") => LapTimeShow::SessionBest,
        Some("class") => LapTimeShow::ClassBest,
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

    if w.chrome.style.is_flat() {
        return flat_rpm_strip(b, w, pct);
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

/// The flat styles' RPM: a row of slim square segments, unlit ones a quiet track, with the shift
/// stages' colors as before (mockup).
fn flat_rpm_strip(b: &mut Builder, w: &WidgetContext, pct: f64) {
    const SEGMENTS: usize = 36;
    let s = w.chrome.scale;
    let gap = 4.0 * s;
    let height = (w.height * 0.55).min(28.0 * s);
    let top = (w.height - height) / 2.0;
    let segment_width = (w.width - gap * (SEGMENTS - 1) as f64) / SEGMENTS as f64;
    let active = (pct * SEGMENTS as f64).ceil() as usize;
    for i in 0..SEGMENTS {
        let color = if i < active { rpm_stage_color(i as f64 / (SEGMENTS - 1) as f64, w.palette) } else { w.palette.surface };
        b.rect(PixelRect::new(i as f64 * (segment_width + gap), top, segment_width.max(0.0), height), Radii::ZERO, color);
    }
}

/// The flat styles' delta: the value, green while gaining, over a centre-zero bar that grows
/// toward the side the lap is going (a second either way fills it). No fill behind it (mockup).
fn flat_delta(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    let p = w.palette;
    if lap.target_lap_time <= 0.0 {
        let size = (w.height * 0.4).min(20.0);
        text_line(b, fit(line("NO TARGET", (w.width / 2.0, w.height / 2.0), size, p.muted, TextAlign::Center, w.width * 0.9, TextWeight::Label)));
    } else {
        let gaining = lap.delta < -0.0005;
        let color = if gaining { p.timing_personal_best } else { p.foreground };
        big_value(b, &format_delta(lap.delta), "-00.000", w.width, w.height, color, 0.82);
    }
}

/// A zoned dash's gear, which every zoned page shows in the centre column's top: the digit
/// alone, in the shift stage's color, in a `width` x `height` box at the builder's origin.
pub fn zoned_gear(b: &mut Builder, car: &CarState, palette: &DashPaletteColors, width: f64, height: f64) {
    let ratio = if car.max_rpm > 0.0 { car.rpm / car.max_rpm } else { 0.0 };
    let color = if ratio >= 0.96 {
        palette.rpm_shift
    } else if ratio >= 0.88 {
        palette.rpm_near_limit
    } else {
        palette.foreground
    };
    text_line(
        b,
        TextLine {
            text: &format_gear(car.gear),
            left: width / 2.0,
            top: height * 0.5,
            size: height * 0.92,
            color,
            align: TextAlign::Center,
            max_width: Some(width),
            weight: TextWeight::ValueRegular,
            sizing: TextSizing::Stable,
        },
    );
}

/// How many segments a bar has (ten a side, centre-out).
const BAR_SEGMENTS: usize = 20;
/// The gap between a bar's segments at scale 1, px.
const BAR_SEGMENT_GAP: f64 = 2.0;

/// How bright an unlit segment shows its colour: a dim tint, so the scale stays readable.
const BAR_UNLIT: f64 = 0.22;

/// A segment's unlit tint of `color`.
fn unlit(color: Rgba, p: &DashPaletteColors) -> Rgba {
    dim_color(color, BAR_UNLIT).unwrap_or(p.surface)
}

/// An energy level's colour: fine from half up, warning below half, critical below a fifth.
fn level_color(share: f64, p: &DashPaletteColors) -> Rgba {
    if share >= 0.5 {
        p.success
    } else if share >= 0.2 {
        p.warning
    } else {
        p.critical
    }
}

/// How full the tank is, 0–1: against its size when the game says it, else `FUEL_BAR_LITERS`.
fn fuel_share(car: &CarState) -> f64 {
    car.fuel / car.fuel_capacity.unwrap_or(FUEL_BAR_LITERS)
}

/// One segment of a track `count` segments long: its rectangle, segment 0 at the bottom (vertical)
/// or the left.
fn segment_rect(track: PixelRect, vertical: bool, count: usize, gap: f64, i: usize) -> PixelRect {
    let n = count as f64;
    if vertical {
        let h = (track.height - gap * (n - 1.0)) / n;
        PixelRect::new(track.left, track.top + track.height - (i as f64 + 1.0) * h - i as f64 * gap, track.width, h.max(0.0))
    } else {
        let wd = (track.width - gap * (n - 1.0)) / n;
        PixelRect::new(track.left + i as f64 * (wd + gap), track.top, wd.max(0.0), track.height)
    }
}

/// A level bar in segments, no label or value: as many lit from the bottom (left) as the share
/// fills, rounded up so a drop left still shows. Each segment wears its zone's colour (`level_color`
/// of the share it stands for: red in the bottom fifth, then amber to half, green above), lit or as
/// a dim tint, so the scale reads even when full; a track with its own colour (`fixed`) wears
/// that instead.
fn level_segments(b: &mut Builder, w: &WidgetContext, track: PixelRect, vertical: bool, share: f64, fixed: Option<Rgba>) {
    let p = w.palette;
    let lit = (share.clamp(0.0, 1.0) * BAR_SEGMENTS as f64).ceil() as usize;
    for i in 0..BAR_SEGMENTS {
        let zone = fixed.unwrap_or_else(|| level_color((i as f64 + 0.5) / BAR_SEGMENTS as f64, p));
        let color = if i < lit { zone } else { unlit(zone, p) };
        b.rect(segment_rect(track, vertical, BAR_SEGMENTS, BAR_SEGMENT_GAP * w.chrome.scale, i), Radii::ZERO, color);
    }
}

/// A centre-out bar in segments: `up` lights segments from the middle up (right, lying down) and
/// `down` from the middle down (left), each a 0–1 share of its half in its colour; unlit ones show
/// their side's colour as a dim tint.
fn centre_segments(b: &mut Builder, w: &WidgetContext, track: PixelRect, vertical: bool, up: (f64, Rgba), down: (f64, Rgba)) {
    let p = w.palette;
    let half = BAR_SEGMENTS / 2;
    let lit = |share: f64| (share.clamp(0.0, 1.0) * half as f64).ceil() as usize;
    let (up_lit, down_lit) = (lit(up.0), lit(down.0));
    for i in 0..BAR_SEGMENTS {
        let color = if i >= half {
            if i - half < up_lit { up.1 } else { unlit(up.1, p) }
        } else if half - 1 - i < down_lit {
            down.1
        } else {
            unlit(down.1, p)
        };
        b.rect(segment_rect(track, vertical, BAR_SEGMENTS, BAR_SEGMENT_GAP * w.chrome.scale, i), Radii::ZERO, color);
    }
}

/// A bar: segments with no label or value, the shape and colour say it. `channel`: fuel, ve, soc
/// and fuel_ve fill from the bottom (the left, lying down) in their level's colour; delta and gap
/// grow from the middle; inputs are two tracks; rpm the shift strip; spotter a car's place.
fn bar(b: &mut Builder, w: &WidgetContext) {
    let f = w.frame;
    let p = w.palette;
    let s = w.chrome.scale;
    let channel = w.widget.config_string("channel").unwrap_or("fuel");
    if channel == "rpm" {
        let pct = (f.car.rpm / f.car.max_rpm.max(1.0)).clamp(0.0, 1.0);
        return flat_rpm_strip(b, w, pct);
    }
    let vertical = w.height > w.width;
    let radius = w.chrome.flat.radius * s * 0.5;
    let track =
        if vertical { PixelRect::new(w.width * 0.15, 0.0, w.width * 0.7, w.height) } else { PixelRect::new(0.0, w.height * 0.15, w.width, w.height * 0.7) };
    match channel {
        "spotter" => spotter_bar(b, w, vertical, radius),
        "gap" => gap_bar(b, w, track, vertical),
        "fuel_ve" => twin_bar(b, w, vertical, [(fuel_share(&f.car), None), (virtual_energy_percent(f) / 100.0, None)]),
        "inputs" => twin_bar(b, w, vertical, [(f.car.throttle, Some(p.success)), (f.car.brake, Some(p.danger))]),
        "delta" => {
            // Gaining grows up (right) in green, losing down (left); a second either way fills it.
            centre_segments(b, w, track, vertical, (-f.lap.delta, p.timing_personal_best), (f.lap.delta, p.secondary));
        }
        "ve" => level_segments(b, w, track, vertical, virtual_energy_percent(f) / 100.0, None),
        "soc" => level_segments(b, w, track, vertical, f.energy.soc, None),
        _ => level_segments(b, w, track, vertical, fuel_share(&f.car), None),
    }
}

/// What a full fuel bar holds, litres, when the game does not say the tank's size.
const FUEL_BAR_LITERS: f64 = 100.0;

/// Two segmented tracks side by side (stacked, lying down), each filled to its share: in its
/// level's colour, or in its own (the inputs: throttle green, brake red).
fn twin_bar(b: &mut Builder, w: &WidgetContext, vertical: bool, tracks: [(f64, Option<Rgba>); 2]) {
    let half_gap = 2.0 * w.chrome.scale;
    for (i, (share, color)) in tracks.into_iter().enumerate() {
        let track = if vertical {
            let width = w.width / 2.0 - half_gap;
            PixelRect::new(i as f64 * (w.width / 2.0 + half_gap), 0.0, width, w.height)
        } else {
            let height = w.height / 2.0 - half_gap;
            PixelRect::new(0.0, i as f64 * (w.height / 2.0 + half_gap), w.width, height)
        };
        level_segments(b, w, track, vertical, share, color);
    }
}

/// How close a gap is, 0 (at or beyond `GAP_BAR_SECONDS`, or no car) to 1 (touching).
const GAP_BAR_SECONDS: f64 = 2.0;

fn closeness(gap: f64) -> f64 {
    if gap > 0.0 { ((GAP_BAR_SECONDS - gap) / GAP_BAR_SECONDS).clamp(0.0, 1.0) } else { 0.0 }
}

/// The gaps as one segmented bar from the middle: the car ahead lights green segments up (right,
/// lying down) as the driver closes in, the car behind amber ones down (left) as it closes in.
fn gap_bar(b: &mut Builder, w: &WidgetContext, track: PixelRect, vertical: bool) {
    let race = &w.frame.race;
    let ahead = closeness(race.gap_ahead);
    let behind = closeness(race.gap_behind);
    centre_segments(b, w, track, vertical, (ahead, w.palette.success), (behind, w.palette.warning));
}

/// How far the spotter bar looks ahead and behind, metres: two car lengths each way.
const SPOTTER_RANGE_METERS: f64 = 10.0;
/// A car's length on the spotter bar, metres.
const SPOTTER_CAR_METERS: f64 = 5.0;

/// The spotter: a car alongside lights its side's track in amber. Standing up, the track is the
/// stretch from two car lengths behind (bottom) to two ahead (top) and the car is a block where it
/// is; the driver's own car is the mark in the middle. A bar in the left spot (column 0) watches
/// the left, any other standing bar the right; lying down (the top) it watches both, left half and
/// right half.
fn spotter_bar(b: &mut Builder, w: &WidgetContext, vertical: bool, radius: f64) {
    let (p, s, race) = (w.palette, w.chrome.scale, &w.frame.race);
    if vertical {
        let ahead = if w.widget.col <= 0.0 { race.car_left } else { race.car_right };
        let track = PixelRect::new(w.width * 0.2, 0.0, w.width * 0.6, w.height);
        b.rect(track, Radii::all(radius), p.surface);
        let mid = track.top + track.height / 2.0;
        b.rect(PixelRect::new(track.left - 3.0 * s, mid - s, track.width + 6.0 * s, 2.0 * s), Radii::ZERO, p.muted);
        if let Some(ahead) = ahead {
            let per_meter = track.height / (SPOTTER_RANGE_METERS * 2.0);
            let length = SPOTTER_CAR_METERS * per_meter;
            let center = mid - ahead.clamp(-SPOTTER_RANGE_METERS, SPOTTER_RANGE_METERS) * per_meter;
            let top = (center - length / 2.0).clamp(track.top, track.top + track.height - length);
            b.rect(PixelRect::new(track.left, top, track.width, length), Radii::all(radius), p.warning);
        }
    } else {
        let gap = 6.0 * s;
        let half = (w.width - gap) / 2.0;
        for (i, side) in [race.car_left, race.car_right].into_iter().enumerate() {
            let track = PixelRect::new(i as f64 * (half + gap), w.height * 0.2, half, w.height * 0.6);
            b.rect(track, Radii::all(radius), if side.is_some() { p.warning } else { p.surface });
        }
    }
}

/// One tyre (mockup v2): a rounded square split into outer, middle and inner stripes in their
/// temperature colors with the tyre left on it, and beside it the middle temperature and the
/// brake's. The square sits on the car's outside, so the four read as a car from above.
fn tyre(b: &mut Builder, w: &WidgetContext) {
    let corner = w.widget.config_string("corner").unwrap_or("fl");
    let index = match corner {
        "fr" => 1,
        "rl" => 2,
        "rr" => 3,
        _ => 0,
    };
    let left_side = index % 2 == 0;
    let tire = &w.frame.tires[index];
    let p = w.palette;
    let s = w.chrome.scale;
    let square_h = w.height;
    let square_w = (square_h * 0.8).min(w.width * 0.5);
    let square_left = if left_side { 0.0 } else { w.width - square_w };
    let stripe_gap = 2.0 * s;
    let stripe_w = (square_w - stripe_gap * 2.0) / 3.0;
    let radius = (w.chrome.flat.radius * s).max(5.0 * s).min(stripe_w);
    // Outer first, from the car's outside in.
    let temps = [tire.temp_outer, tire.temp_middle, tire.temp_inner];
    for (i, temp) in temps.into_iter().enumerate() {
        let slot = if left_side { i } else { 2 - i };
        let rect = PixelRect::new(square_left + slot as f64 * (stripe_w + stripe_gap), 0.0, stripe_w, square_h);
        let radii = match slot {
            0 => Radii { top_left: radius, bottom_left: radius, ..Radii::ZERO },
            2 => Radii { top_right: radius, bottom_right: radius, ..Radii::ZERO },
            _ => Radii::ZERO,
        };
        let color = if temp > 0.0 { resolve_tyre_color(temp, p) } else { p.surface };
        b.rect(rect, radii, color);
    }
    let wear = if tire.wear_percent > 0.0 { js_number_string(tire.wear_percent.round()) } else { "--".to_owned() };
    text_line(
        b,
        line(
            &wear,
            (square_left + square_w / 2.0, square_h / 2.0),
            (square_h * 0.3).min(square_w * 0.42),
            p.background,
            TextAlign::Center,
            square_w,
            TextWeight::Value,
        ),
    );
    let text_left = if left_side { square_w + 8.0 * s } else { 0.0 };
    let text_w = w.width - square_w - 8.0 * s;
    let anchor = if left_side { text_left } else { text_w };
    let align = if left_side { TextAlign::Start } else { TextAlign::End };
    let temp = if tire.temp_middle > 0.0 { format!("{}°", format_temp(tire.temp_middle)) } else { "--".to_owned() };
    let big = value_size("000°", text_w, square_h * 0.5, 0.9);
    text_line(b, line(&temp, (anchor, square_h * 0.34), big, p.foreground, align, text_w, TextWeight::Value));
    let brake = if tire.brake_temp > 0.0 { format!("BRK {}°", js_number_string(tire.brake_temp.round())) } else { "BRK --".to_owned() };
    let brake_color = if tire.brake_temp > 800.0 {
        p.critical
    } else if tire.brake_temp > 650.0 {
        p.warning
    } else {
        p.secondary
    };
    text_line(b, fit(line(&brake, (anchor, square_h * 0.76), big * 0.62, brake_color, align, text_w, TextWeight::Value)));
}

/// How one sector time compares: the fastest (the class's best, or the session's when the class
/// is unknown), the driver's own best, slower than that, or not comparable (no bests known yet).
/// The lap review banner carries it as `fastest`, `personalBest`, `slower` or `unrated`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SectorState {
    Fastest,
    PersonalBest,
    Slower,
    Unrated,
}

pub(crate) fn sector_state(lap: &LapState, index: usize, time: f64) -> SectorState {
    // A best is the same lap's own time once it is set, so "as fast" counts.
    const SAME: f64 = 0.0005;
    let best = |bests: &[Option<f64>]| bests.get(index).copied().flatten();
    let fastest = best(&lap.class_best_sectors).or_else(|| best(&lap.session_best_sectors));
    if fastest.is_some_and(|fastest| time <= fastest + SAME) {
        return SectorState::Fastest;
    }
    match best(&lap.personal_best_sectors) {
        Some(own) if time <= own + SAME => SectorState::PersonalBest,
        Some(_) => SectorState::Slower,
        None => SectorState::Unrated,
    }
}

/// The sector times to show: the lap being driven's, once its first sector is done; until then
/// the last lap's three. `None` for a sector without a time.
fn shown_sectors(lap: &LapState) -> [Option<f64>; 3] {
    let times = if lap.current_lap_sectors_seconds.is_empty() { &lap.last_lap_sectors_seconds } else { &lap.current_lap_sectors_seconds };
    std::array::from_fn(|i| times.get(i).copied().filter(|time| *time > 0.0))
}

pub(crate) fn sector_color(state: SectorState, palette: &DashPaletteColors) -> Option<Rgba> {
    match state {
        SectorState::Fastest => Some(palette.timing_fastest_overall),
        SectorState::PersonalBest => Some(palette.timing_personal_best),
        SectorState::Slower => Some(palette.race_control_yellow),
        SectorState::Unrated => None,
    }
}

/// The three sectors as segments: purple the fastest, green the driver's best, yellow slower,
/// each with its time; a sector not done yet is a quiet segment with its name.
fn sectors(b: &mut Builder, w: &WidgetContext) {
    let p = w.palette;
    let s = w.chrome.scale;
    let lap = &w.frame.lap;
    let gap = 4.0 * s;
    let seg_w = (w.width - gap * 2.0) / 3.0;
    let radius = (w.chrome.flat.radius * s * 0.6).min(w.height / 2.0);
    for (i, time) in shown_sectors(lap).into_iter().enumerate() {
        let rect = PixelRect::new(i as f64 * (seg_w + gap), 0.0, seg_w, w.height);
        let fill = time.and_then(|time| sector_color(sector_state(lap, i, time), p));
        b.rect(rect, Radii::all(radius), fill.unwrap_or(p.surface));
        let text = time.map_or_else(|| format!("S{}", i + 1), |time| to_fixed(time, 1));
        let ink = match (time, fill) {
            (None, _) => p.muted,
            (Some(_), Some(_)) => p.background,
            (Some(_), None) => p.foreground,
        };
        text_line(
            b,
            fit(line(
                &text,
                (rect.left + seg_w / 2.0, w.height / 2.0),
                value_size("00.0", seg_w, w.height, 0.62),
                ink,
                TextAlign::Center,
                seg_w * 0.92,
                TextWeight::Value,
            )),
        );
    }
}

/// The pace to project with: the last lap, or the best while there is no last one.
fn reference_lap(f: &TelemetryFrame) -> Option<f64> {
    [f.lap.last_lap_time, f.lap.best_lap_time].into_iter().find(|time| *time > 0.0)
}

/// How many laps it is from here to the flag: what is left of a lap race, or in a timed one what
/// the time left buys at the reference pace, finishing the lap the clock runs out on. `None` when
/// the session has neither a lap limit nor a known end, or there is no pace yet.
fn race_laps_left(f: &TelemetryFrame) -> Option<f64> {
    let into_lap = f.lap.track_position.clamp(0.0, 1.0);
    if f.session.max_laps > 0.0 {
        return Some((f.session.max_laps - f.lap.current_lap.max(1.0) + 1.0 - into_lap).max(0.0));
    }
    let left = f.session.session_time_remaining?;
    let pace = reference_lap(f)?;
    Some(((left.max(0.0) / pace + into_lap).ceil() - into_lap).max(0.0))
}

/// Penalties the driver still has to serve (the player's own row of the field).
fn penalties_to_serve(f: &TelemetryFrame) -> f64 {
    f.field.iter().find(|car| car.is_player).map_or(0.0, |car| car.penalties)
}

fn is_raining(f: &TelemetryFrame) -> bool {
    f.conditions.raining.is_some_and(|rain| rain >= 0.05)
}

/// Seconds as H:MM:SS.
fn hours_minutes_seconds(seconds: f64) -> String {
    let seconds = seconds.max(0.0).floor();
    format!("{}:{:02}:{:02}", (seconds / 3600.0).floor(), ((seconds % 3600.0) / 60.0).floor(), seconds % 60.0)
}

/// A temperature as "104°", or "--" when the game does not say.
fn degrees(celsius: Option<f64>) -> String {
    celsius.filter(|c| c.is_finite()).map_or_else(|| "--".to_owned(), |c| format!("{}°", js_number_string(c.round())))
}

/// The plain one-value widgets: speed, lap, fuel and VE laps left, time left, SoC, slip, cut, fuel
/// per lap, fuel time, race laps left, fuel to add, the clock, oil and water, penalties.
fn metric(b: &mut Builder, w: &WidgetContext) {
    let f = w.frame;
    let laps_left = |amount: f64, per_lap: f64| if per_lap > 0.0 { to_fixed(amount / per_lap, 1) } else { "--".to_owned() };
    let mut color = w.palette.foreground;
    let (value, template) = match w.widget.widget_type.as_str() {
        "speed" => (format_speed_kph(f.car.speed_ms), "000"),
        "laps" => (js_number_string(f.lap.current_lap), "000"),
        "fuel_laps" => (laps_left(f.car.fuel, f.car.fuel_per_lap), "00.0"),
        "ve_laps" => (laps_left(f.energy.virtual_energy, f.energy.virtual_energy_per_lap), "00.0"),
        "time_left" => {
            let left = f.session.session_time_remaining.unwrap_or(0.0).max(0.0);
            (format!("{}:{:02}:{:02}", (left / 3600.0).floor(), ((left % 3600.0) / 60.0).floor(), (left % 60.0).floor()), "0:00:00")
        }
        "soc" => (format!("{}%", js_number_string(battery_percent(f).round())), "000%"),
        "slip" => (js_number_string(f.electronics.tc_slip.trunc()), "00"),
        "cut" => (js_number_string(f.electronics.tc_cut.trunc()), "00"),
        "fuel_avg" => (if f.car.fuel_per_lap > 0.0 { to_fixed(f.car.fuel_per_lap, 2) } else { "--".to_owned() }, "0.00"),
        "fuel_time" => {
            let value = match reference_lap(f) {
                Some(pace) if f.car.fuel_per_lap > 0.0 => hours_minutes_seconds(f.car.fuel / f.car.fuel_per_lap * pace),
                _ => "--".to_owned(),
            };
            (value, "0:00:00")
        }
        "laps_left" => (race_laps_left(f).map_or_else(|| "--".to_owned(), |laps| to_fixed(laps, 1)), "000.0"),
        "refuel" => {
            // What has to go in to reach the flag; nothing when the tank already does.
            let value = match race_laps_left(f) {
                Some(laps) if f.car.fuel_per_lap > 0.0 => {
                    let needed = laps * f.car.fuel_per_lap - f.car.fuel;
                    if needed > 0.0 { format!("+{}", to_fixed(needed, 1)) } else { "0.0".to_owned() }
                }
                _ => "--".to_owned(),
            };
            (value, "+000.0")
        }
        "clock" => {
            let offset = w.settings.and_then(|s| s.utc_offset_minutes).unwrap_or(0.0) * 60.0;
            let value = f.utc_time_of_day.map_or_else(
                || "--:--".to_owned(),
                |utc| {
                    let local = (utc + offset).rem_euclid(86_400.0);
                    format!("{:02}:{:02}", (local / 3600.0).floor(), ((local % 3600.0) / 60.0).floor())
                },
            );
            (value, "00:00")
        }
        "oil_temp" => (degrees(f.car.oil_temp), "000°"),
        "water_temp" => (degrees(f.car.water_temp), "000°"),
        "penalty" => {
            let count = penalties_to_serve(f);
            if count > 0.0 {
                color = w.palette.background;
            }
            (js_number_string(count), "0")
        }
        _ => (String::new(), "0"),
    };
    big_value(b, &value, template, w.width, w.height, color, 0.8);
}

/// The anti-roll bars as "front · rear" (the title says which is which).
fn arb(b: &mut Builder, w: &WidgetContext) {
    let e = &w.frame.electronics;
    let setting = |value: f64, max: f64| if max > 0.0 { js_number_string(value.trunc()) } else { "-".to_owned() };
    let value = format!("{} · {}", setting(e.front_anti_roll_bar, e.front_anti_roll_bar_max), setting(e.rear_anti_roll_bar, e.rear_anti_roll_bar_max));
    big_value(b, &value, "00 · 00", w.width, w.height, w.palette.foreground, 0.8);
}

/// Air and track temperature as "air · track"; in the rain, how hard it rains instead of the air
/// (the title says which).
fn weather(b: &mut Builder, w: &WidgetContext) {
    let c = &w.frame.conditions;
    let first = if is_raining(w.frame) { format!("{}%", js_number_string((c.raining.unwrap_or(0.0) * 100.0).round())) } else { degrees(c.air_temp) };
    let value = format!("{first} · {}", degrees(c.track_temp));
    big_value(b, &value, "000% · 00°", w.width, w.height, w.palette.foreground, 0.8);
}

/// The four tyres' wear left, in a car's two-by-two: plain while healthy, then amber, then red.
fn tyre_wear(b: &mut Builder, w: &WidgetContext) {
    let p = w.palette;
    let (cell_w, cell_h) = (w.width / 2.0, w.height / 2.0);
    let size = value_size("000", cell_w - 4.0, cell_h, 0.78);
    for (i, tire) in w.frame.tires.iter().enumerate() {
        let left = tire.wear_percent;
        let (text, color) = if left > 0.0 {
            let color = if left < 30.0 {
                p.critical
            } else if left < 60.0 {
                p.warning
            } else {
                p.foreground
            };
            (js_number_string(left.round()), color)
        } else {
            ("--".to_owned(), p.muted)
        };
        let center = ((i % 2) as f64 * cell_w + cell_w / 2.0, (i / 2) as f64 * cell_h + cell_h / 2.0);
        text_line(b, line(&text, center, size, color, TextAlign::Center, cell_w - 4.0, TextWeight::Value));
    }
}

/// The latest sector done, with its time in its comparison colour.
fn sector_time(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    let latest = shown_sectors(lap).into_iter().enumerate().rev().find_map(|(i, time)| time.map(|time| (i, time)));
    let (text, color) = match latest {
        Some((i, time)) => (format!("S{} {}", i + 1, to_fixed(time, 3)), sector_color(sector_state(lap, i, time), w.palette).unwrap_or(w.palette.foreground)),
        None => ("S- --".to_owned(), w.palette.muted),
    };
    big_value(b, &text, "S0 000.000", w.width, w.height, color, 0.8);
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
    let field_best = match show {
        LapTimeShow::SessionBest => Some(lap.session_best_lap),
        LapTimeShow::ClassBest => Some(lap.class_best_lap),
        _ => None,
    };
    if let Some(best) = field_best {
        let value = format_lap(best.unwrap_or(0.0));
        big_value(b, &value, LAP_TEMPLATE, w.width, w.height, w.palette.timing_fastest_overall, VALUE_SHARE);
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

/// The hybrid battery: its charge large, and beside it what the motor deploys and the brakes
/// regenerate. A car without a battery reads "--".
fn battery(b: &mut Builder, w: &WidgetContext) {
    let energy = &w.frame.energy;
    let pct = battery_percent(w.frame);
    let level = if pct > 0.0 { format_int(pct.round()) } else { "--".to_owned() };
    let (width, height, p) = (w.width, w.height, w.palette);
    let left = width * 0.5;
    let size = value_unit_size(height * 0.7, left, 3.0, 1.0);
    let side = (height * 0.24).min(16.0);
    let power = |name: &str, kw: f64| if kw > 0.0 { format!("{name} {} kW", format_int(kw)) } else { format!("{name} -- kW") };
    let value = ValueWithUnit { color: p.neutral, align: TextAlign::Start, ..value_unit(&level, "%", 0.0, height / 2.0, size, p, left) };
    value_with_unit(b, value);
    text_line(b, line(&power("DEP", energy.deploy_power), (width, height * 0.3), side, p.secondary, TextAlign::End, width - left, TextWeight::Value));
    text_line(b, line(&power("REGEN", energy.regen_power), (width, height * 0.72), side, p.secondary, TextAlign::End, width - left, TextWeight::Value));
}

/// One car on the relative: seconds on the road (negative ahead of ours) and whether it is a
/// lap ahead (1) or down (-1) on ours.
struct RelativeRow<'a> {
    car: &'a FieldCar,
    seconds: f64,
    laps: i8,
}

/// The cars round ours on the road, up to `each` ahead and behind, top to bottom as on track:
/// by lap fraction, timed against the reference lap (our best, else our last, else the session's
/// best). Empty without our car, the track length or a reference lap. The pit wall's Relative
/// tile (`relativeRows` in the app's `pitwall/timing.ts`) works the same way.
fn relative_rows(frame: &TelemetryFrame, each: usize) -> Vec<RelativeRow<'_>> {
    let Some(track) = frame.session.track_length_meters.filter(|m| *m > 0.0) else {
        return Vec::new();
    };
    let Some(lap) = [frame.lap.best_lap_time, frame.lap.last_lap_time, frame.session.best_lap_time].into_iter().find(|t| *t > 0.0) else {
        return Vec::new();
    };
    let Some(player) = frame.field.iter().find(|car| car.is_player) else {
        return Vec::new();
    };
    let fraction = |car: &FieldCar| (car.lap_distance_meters / track).rem_euclid(1.0);
    let progress = |car: &FieldCar| car.laps_completed + fraction(car);
    let mut ahead: Vec<RelativeRow> = frame
        .field
        .iter()
        .filter(|car| !car.is_player)
        .map(|car| {
            let mut gap = fraction(car) - fraction(player);
            if gap > 0.5 {
                gap -= 1.0;
            } else if gap <= -0.5 {
                gap += 1.0;
            }
            let lead = progress(car) - progress(player);
            RelativeRow {
                car,
                seconds: -gap * lap,
                laps: if lead > 0.5 {
                    1
                } else if lead < -0.5 {
                    -1
                } else {
                    0
                },
            }
        })
        .collect();
    ahead.sort_by(|a, b| a.seconds.total_cmp(&b.seconds));
    let behind = ahead.split_off(ahead.partition_point(|row| row.seconds < 0.0));
    let mut rows = ahead.split_off(ahead.len().saturating_sub(each));
    rows.push(RelativeRow { car: player, seconds: 0.0, laps: 0 });
    rows.extend(behind.into_iter().take(each));
    rows
}

/// The cars round ours, one row each (place, driver, seconds on the road), ours in the middle row
/// in the primary color; a car a lap ahead in danger, a lap down muted. As many rows as fit at
/// 28 px or more (readable at arm's length), always an odd count.
fn relative(b: &mut Builder, w: &WidgetContext) {
    let (width, height, p) = (w.width, w.height, w.palette);
    let each = ((height / 28.0).floor().max(1.0) as usize - 1) / 2;
    let rows = relative_rows(w.frame, each);
    if rows.is_empty() {
        let size = (height * 0.4).min(20.0);
        text_line(b, fit(line("NO TIMING", (width / 2.0, height / 2.0), size, p.muted, TextAlign::Center, width * 0.9, TextWeight::Label)));
        return;
    }
    let row_h = height / (each * 2 + 1) as f64;
    let ours = rows.iter().position(|row| row.car.is_player).unwrap_or(0);
    let size = (row_h * 0.62).min(22.0);
    let (place_w, gap_w) = (size * 2.0, size * 3.0);
    for (i, row) in rows.iter().enumerate() {
        let mid = ((each + i) as f64 - ours as f64) * row_h + row_h / 2.0;
        let color = match (row.car.is_player, row.laps) {
            (true, _) => p.primary,
            (false, 1) => p.danger,
            (false, -1) => p.muted,
            _ => p.foreground,
        };
        let place = if row.car.place > 0.0 { format!("P{}", js_number_string(row.car.place)) } else { "--".to_owned() };
        text_line(b, line(&place, (0.0, mid), size, color, TextAlign::Start, place_w, TextWeight::Value));
        text_line(b, line(&row.car.driver, (place_w + 4.0, mid), size, color, TextAlign::Start, width - place_w - gap_w - 8.0, TextWeight::Label));
        if !row.car.is_player {
            let sign = if row.seconds < 0.0 { "-" } else { "+" };
            text_line(b, line(&format!("{sign}{}", to_fixed(row.seconds.abs(), 1)), (width, mid), size, color, TextAlign::End, gap_w, TextWeight::Value));
        }
    }
}

/// LMU's eight dent places (`Damage::dents`) as cells of a 3x3 grid over the car, front up:
/// (column, row), clockwise from front left. The middle cell is the cockpit.
const DENT_CELLS: [(usize, usize); 8] = [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (0, 2), (0, 1)];

/// The car from above, front up, each of its eight dent places in warning (some) or critical
/// (more), and beside it the verdict: the body's worst dent, then a part off or the engine
/// overheating when either is so. No damage report draws the car muted, with no verdict.
fn damage(b: &mut Builder, w: &WidgetContext) {
    let (width, height, p) = (w.width, w.height, w.palette);
    let car_w = (width * 0.4).min(height / 2.0);
    let car_h = car_w * 2.0;
    let (x, y) = ((width * 0.4 - car_w) / 2.0, (height - car_h) / 2.0);
    let edge = car_w * 0.3;
    let gap = 2.0;
    let spans = |extent: f64| [(0.0, edge), (edge, extent - edge * 2.0), (extent - edge, edge)];
    let (cols, rows) = (spans(car_w), spans(car_h));
    let cell = |(col, row): (usize, usize)| PixelRect::new(x + cols[col].0 + gap / 2.0, y + rows[row].0 + gap / 2.0, cols[col].1 - gap, rows[row].1 - gap);
    let report = w.frame.damage.as_ref();
    let severity_color = |level: f64| {
        if level >= 2.0 {
            p.critical
        } else if level >= 1.0 {
            p.warning
        } else {
            p.muted
        }
    };
    b.rect(cell((1, 1)), Radii::all(2.0), p.border);
    for (place, at) in DENT_CELLS.into_iter().enumerate() {
        let color = report.map_or(p.border, |d| severity_color(d.dents[place]));
        b.rect(cell(at), Radii::all(2.0), color);
    }

    let Some(report) = report else {
        return;
    };
    let worst = report.dents.iter().copied().fold(0.0, f64::max);
    let body = if worst >= 2.0 {
        ("BODY HEAVY", p.critical)
    } else if worst >= 1.0 {
        ("BODY LIGHT", p.warning)
    } else {
        ("BODY OK", p.foreground)
    };
    let mut verdict = vec![body];
    if report.detached_parts {
        verdict.push(("PARTS OFF", p.critical));
    }
    if report.overheating {
        verdict.push(("OVERHEAT", p.critical));
    }
    let left = width * 0.44;
    let line_h = height / verdict.len() as f64;
    let size = (line_h * 0.5).min(height * 0.22).min(20.0);
    for (i, (text, color)) in verdict.into_iter().enumerate() {
        text_line(b, fit(line(text, (left, line_h * (i as f64 + 0.5)), size, color, TextAlign::Start, width - left, TextWeight::Value)));
    }
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
        "delta" if w.chrome.style.is_flat() => flat_delta(b, w),
        "bar" => bar(b, w),
        "tyre" => tyre(b, w),
        "sectors" => sectors(b, w),
        "speed" | "laps" | "fuel_laps" | "ve_laps" | "time_left" | "soc" | "slip" | "cut" | "fuel_avg" | "fuel_time" | "laps_left" | "refuel" | "clock"
        | "oil_temp" | "water_temp" | "penalty" => metric(b, w),
        "migration" => knob_value(b, w, e.migration, w.palette.neutral),
        "arb" => arb(b, w),
        "weather" => weather(b, w),
        "tyre_wear" => tyre_wear(b, w),
        "sector_time" => sector_time(b, w),
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
        "battery" => battery(b, w),
        "relative" => relative(b, w),
        "damage" => damage(b, w),
        _ => placeholder(b, w),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chrome::ChromeContext;
    use crate::draw::{DrawOp, TextRun};
    use crate::model::{Damage, DashStyle};
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
            chrome: ChromeContext { style: DashStyle::Panels, scale: 1.0, flat: Default::default() },
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
        let settings = DashSettings { driver_name: Some("A. Driver".to_owned()), driver_number: None, utc_offset_minutes: None };
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

    fn tint(color: Rgba) -> Rgba {
        dim_color(color, BAR_UNLIT).expect("a palette colour dims")
    }

    #[test]
    fn a_level_bar_is_twenty_segments_in_their_zones_colours_with_no_label_or_value() {
        let mut frame = TelemetryFrame::default();
        frame.car.fuel = 31.5;
        frame.car.fuel_capacity = Some(90.0);
        let ops = draw(&widget("bar", json!({ "channel": "fuel" })), &frame, 30.0, 400.0);
        assert!(texts(&ops).is_empty(), "no label or value");
        let colors: Vec<Rgba> = rects(&ops).into_iter().map(|(_, color)| color).collect();
        // 35% of the tank lights seven of twenty from the bottom: four in the red fifth, three amber.
        let (red, amber, green) = (P.critical, P.warning, P.success);
        let mut expected = vec![red; 4];
        expected.extend([amber; 3]);
        expected.extend([tint(amber); 3]);
        expected.extend([tint(green); 10]);
        assert_eq!(colors, expected);

        // The bottom segment sits at the bottom: segment 0 is drawn first.
        let first = rects(&ops)[0].0;
        assert!((first.top + first.height - 400.0).abs() < 0.05, "{first:?}");

        // Without the tank's size, 100 L is a full tank.
        frame.car.fuel_capacity = None;
        frame.car.fuel = 35.0;
        assert_eq!(rects(&draw(&widget("bar", json!({ "channel": "fuel" })), &frame, 30.0, 400.0)).len(), 20);
        assert_eq!(rects(&draw(&widget("bar", json!({ "channel": "fuel" })), &frame, 30.0, 400.0))[6].1, amber);
    }

    #[test]
    fn the_delta_bar_grows_up_from_the_middle_while_gaining_and_down_while_losing() {
        let mut frame = TelemetryFrame::default();
        frame.lap.delta = -0.42;
        let colors = |frame: &TelemetryFrame| -> Vec<Rgba> {
            rects(&draw(&widget("bar", json!({ "channel": "delta" })), frame, 30.0, 400.0)).into_iter().map(|(_, c)| c).collect()
        };
        let (gain, lose) = (P.timing_personal_best, P.secondary);
        let gaining = colors(&frame);
        assert_eq!(gaining[..10], [tint(lose); 10], "nothing below the middle");
        assert_eq!(gaining[10..15], [gain, gain, gain, gain, gain], "0.42 s of a second's ten segments rounds up to five");
        assert_eq!(gaining[15..], [tint(gain); 5]);
        frame.lap.delta = 0.05;
        let losing = colors(&frame);
        assert_eq!(losing[9], lose, "the segment next to the middle");
        assert_eq!(losing[..9], [tint(lose); 9]);
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

    fn car(driver: &str, place: f64, laps: f64, meters: f64) -> FieldCar {
        FieldCar {
            driver: driver.to_owned(),
            is_player: driver == "Me",
            place,
            laps_completed: laps,
            lap_distance_meters: meters,
            penalties: 0.0,
            blue_flag: false,
        }
    }

    #[test]
    fn the_relative_lists_the_cars_round_ours_on_the_road_with_ours_in_the_middle() {
        let mut frame = TelemetryFrame::default();
        frame.session.track_length_meters = Some(1000.0);
        frame.lap.best_lap_time = 100.0;
        // Ours 50 m into lap 5. "Behind" is still finishing lap 4 (the road wraps at the line); "Lapped" is a lap down.
        frame.field = vec![
            car("Me", 3.0, 5.0, 50.0),
            car("Ahead", 2.0, 5.0, 120.0),
            car("Behind", 4.0, 4.0, 990.0),
            car("Lapped", 9.0, 4.0, 20.0),
            car("Next", 1.0, 5.0, 300.0),
            car("Far", 6.0, 5.0, 500.0),
        ];

        // 140 px holds five rows: two ahead, ours, two behind.
        let ops = draw(&widget("relative", json!({})), &frame, 300.0, 140.0);
        let runs = texts(&ops);
        let row = |driver: &str| runs.iter().position(|r| r.text == driver).map(|i| runs[i].baseline);
        let (ahead, me, behind, lapped) = (row("Ahead").unwrap(), row("Me").unwrap(), row("Behind").unwrap(), row("Lapped").unwrap());
        assert!(ahead < me && me < lapped && lapped < behind, "top to bottom as on the road");
        assert_eq!(row("Far"), None, "the third car ahead is past the rows that fit");
        let gaps: Vec<&str> = runs.iter().map(|r| r.text.as_str()).filter(|t| t.starts_with('+') || t.starts_with('-')).collect();
        assert_eq!(gaps, ["-25.0", "-7.0", "+3.0", "+6.0"]);
        assert_eq!(runs.iter().find(|r| r.text == "Me").map(|r| r.color), Some(P.primary));
        assert_eq!(runs.iter().find(|r| r.text == "Lapped").map(|r| r.color), Some(P.muted));

        frame.session.track_length_meters = None;
        assert_eq!(text_of(&draw(&widget("relative", json!({})), &frame, 300.0, 140.0)), ["NO TIMING"]);
    }

    #[test]
    fn damage_colours_each_dent_place_and_names_what_is_wrong() {
        let mut frame = TelemetryFrame::default();
        let blank = draw(&widget("damage", json!({})), &frame, 300.0, 120.0);
        assert!(text_of(&blank).is_empty(), "no report, no verdict");
        assert!(rects(&blank).iter().all(|(_, color)| *color == P.border));

        frame.damage = Some(Damage { dents: [0.0, 2.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0], overheating: true, detached_parts: false });
        let ops = draw(&widget("damage", json!({})), &frame, 300.0, 120.0);
        assert_eq!(text_of(&ops), ["BODY HEAVY", "OVERHEAT"]);
        let colors: Vec<Rgba> = rects(&ops).into_iter().map(|(_, color)| color).collect();
        // The cockpit, then the eight places clockwise from front left.
        assert_eq!(colors, [P.border, P.muted, P.critical, P.muted, P.warning, P.muted, P.muted, P.muted, P.muted]);
    }

    #[test]
    fn the_battery_shows_its_charge_and_the_power_both_ways() {
        let mut frame = TelemetryFrame::default();
        frame.energy.soc = 0.625;
        frame.energy.deploy_power = 92.5;
        let ops = draw(&widget("battery", json!({})), &frame, 300.0, 100.0);
        let text = text_of(&ops);
        assert!(text.contains(&"63".to_owned()) && text.contains(&"DEP 92 kW".to_owned()) && text.contains(&"REGEN -- kW".to_owned()), "{text:?}");

        frame.energy.soc = 0.04;
        let fill = |frame: &TelemetryFrame| match widget_chrome(&widget("battery", json!({})), frame, &DEFAULT_DASH_PALETTE) {
            WidgetChrome::Framed { fill, .. } => fill,
            _ => None,
        };
        assert_eq!(fill(&frame), Some(P.critical));
    }

    #[test]
    fn a_sector_is_purple_at_the_class_best_green_at_the_drivers_own_and_yellow_slower() {
        let lap = LapState {
            personal_best_sectors: vec![Some(31.0), Some(35.0), None],
            session_best_sectors: vec![Some(30.0), Some(34.0), Some(36.0)],
            class_best_sectors: vec![Some(31.0), Some(34.5), Some(36.5)],
            ..LapState::default()
        };
        assert_eq!(sector_state(&lap, 0, 31.0), SectorState::Fastest, "the class's best, not the faster class's");
        assert_eq!(sector_state(&lap, 1, 35.0), SectorState::PersonalBest);
        assert_eq!(sector_state(&lap, 1, 35.2), SectorState::Slower);
        assert_eq!(sector_state(&lap, 2, 37.0), SectorState::Unrated, "no own best to compare with");
        assert_eq!(sector_state(&LapState::default(), 0, 30.0), SectorState::Unrated);
    }

    #[test]
    fn the_sectors_show_the_last_lap_until_the_first_sector_of_this_one_is_done() {
        let mut lap = LapState { last_lap_sectors_seconds: vec![31.0, 35.0, 37.0], ..LapState::default() };
        assert_eq!(shown_sectors(&lap), [Some(31.0), Some(35.0), Some(37.0)]);
        lap.current_lap_sectors_seconds = vec![30.5];
        assert_eq!(shown_sectors(&lap), [Some(30.5), None, None]);
    }

    #[test]
    fn laps_to_the_flag_count_what_is_left_of_a_lap_race_or_what_a_timed_one_buys() {
        let mut frame = TelemetryFrame::default();
        frame.session.max_laps = 24.0;
        frame.lap.current_lap = 7.0;
        frame.lap.track_position = 0.25;
        assert_eq!(race_laps_left(&frame), Some(17.75));

        frame.session.max_laps = 0.0;
        frame.session.session_time_remaining = Some(600.0);
        assert_eq!(race_laps_left(&frame), None, "no pace yet");
        frame.lap.last_lap_time = 100.0;
        // Six laps of time from a quarter into this one: the clock runs out three quarters into the
        // sixth lap from here, and that lap is finished.
        assert_eq!(race_laps_left(&frame), Some(6.75));
    }

    #[test]
    fn refuel_says_what_has_to_go_in_to_reach_the_flag() {
        let mut frame = TelemetryFrame::default();
        frame.session.max_laps = 10.0;
        frame.lap.current_lap = 1.0;
        frame.car.fuel_per_lap = 4.0;
        frame.car.fuel = 30.0;
        let shown = |frame: &TelemetryFrame| text_of(&draw(&widget("refuel", json!({})), frame, 160.0, 60.0))[0].clone();
        assert_eq!(shown(&frame), "+10.0");
        frame.car.fuel = 45.0;
        assert_eq!(shown(&frame), "0.0");
    }

    #[test]
    fn the_clock_shows_the_frames_moment_in_the_viewers_time_zone() {
        let mut frame = TelemetryFrame { utc_time_of_day: Some(23.0 * 3600.0 + 30.0 * 60.0), ..TelemetryFrame::default() };
        let clock = widget("clock", json!({}));
        let settings = DashSettings { utc_offset_minutes: Some(90.0), ..DashSettings::default() };
        assert_eq!(text_of(&draw_with(&clock, &frame, 160.0, 60.0, None, Some(&settings))), ["01:00"], "past midnight wraps");
        assert_eq!(text_of(&draw(&clock, &frame, 160.0, 60.0)), ["23:30"], "no settings: UTC");
        frame.utc_time_of_day = None;
        assert_eq!(text_of(&draw(&clock, &frame, 160.0, 60.0)), ["--:--"]);
    }
}
