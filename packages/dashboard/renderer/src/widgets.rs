// Dash widgets: `widget_chrome`, which says how each type is framed, and one content function
// per widget type. Ported from the retired React renderer's `widgets.tsx`. A widget's content
// receives only its content box (`width` x `height`, origin at its top-left) and draws values
// laid out from fractions of that box.
//
// Static labels that must shrink to fit rather than clip use `TextSizing::Fit`; everything else
// stays stable (authored size, clipped). Values size from a template of the widest text they
// can show (`value_size`), so they never clip and never resize.

use crate::alerts::AlertLimits;
use crate::bindings::{BindingContext, flag_summary, resolve_binding};
use crate::chrome::{ChromeContext, WidgetFrame, widget_frame};
use crate::draw::{Builder, Radii};
use crate::format::{
    Units, format_degrees, format_delta, format_front_brake_bias, format_fuel, format_fuel_per_lap, format_fuel_per_lap_target, format_gap, format_gear,
    format_int, format_lap, format_pressure, format_setting, format_speed, js_number_string, to_fixed,
};
use crate::grid::PixelRect;
use crate::model::{CarState, DashSettings, DashTargets, DashWidget, FieldCar, LapState, TelemetryFrame, TireState};
use crate::palette::{DashPaletteColors, Rgba, class_color, dash_color, dim_color, resolve_tyre_color};
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
    /// The app-wide limits (`alerts::AlertLimits`): the fuel and energy warn from the fuel
    /// warning, oil and water from the engine limits, Lift & coast lights at the lift point.
    pub limits: AlertLimits,
}

impl WidgetContext<'_> {
    /// What this dash prints speeds, temperatures, pressures and fuel in.
    fn units(&self) -> Units {
        self.settings.map_or(Units::Metric, |s| s.units)
    }
}

/// How a widget type is framed:
/// - `Framed`: one frame with a title; `accent` is a knob's identity color and `fill` a
///   condition color covering the frame (values then draw in ink).
/// - `Bare`: no frame or title (gear, text, RPM, flag), just the same margin.
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

/// A driver-adjustable setting's frame: its identity colour on the label, and the whole frame lit
/// in it while the assist is working (`active`; the value then draws in ink).
fn knob(title: &'static str, accent: Rgba, active: bool) -> WidgetChrome {
    WidgetChrome::Framed { title, accent: Some(accent), fill: active.then_some(accent) }
}

fn filled(title: &'static str, fill: Option<Rgba>) -> WidgetChrome {
    WidgetChrome::Framed { title, accent: None, fill }
}

/// The frame a widget wears this frame: its title, knob color and any condition fill. `units`
/// names the speed widget's unit, its title; Lift & coast lights above `lift_point`.
pub fn widget_chrome(widget: &DashWidget, frame: &TelemetryFrame, palette: &DashPaletteColors, units: Units, lift_point: f64) -> WidgetChrome {
    let e = &frame.electronics;
    match widget.widget_type.as_str() {
        "input_trace" => framed("INPUTS"),
        "current_lap" => framed("CURRENT"),
        "last_lap" => framed("LAST"),
        "best_lap" => framed("BEST"),
        "session_best" => framed("SESSION BEST"),
        "class_best" => framed("CLASS BEST"),
        "predictive_lap" => framed("PREDICTED"),
        "optimal_lap" => framed("OPTIMAL"),
        "lap_avg_5" => framed("5 LAP AVG"),
        "lap_avg_10" => framed("10 LAP AVG"),
        "all_time_best" => framed("ALL-TIME BEST"),
        "session_name" => framed("SESSION"),
        "session_time" => framed("SESSION TIME"),
        "pit_loss" => framed("PIT LOSS"),
        "delta" => framed("DELTA"),
        "tc" => knob("TC", palette.setting_tc, e.tc_active),
        "tc2" => knob("TC 2", palette.setting_tc, false),
        "tc_slip" => knob("TC SLIP", palette.setting_tc, false),
        "abs" => knob("ABS", palette.setting_abs, e.abs_active),
        "engine_map" => knob("MAP", palette.setting_engine_map, false),
        "brake_bias" => knob("BIAS", palette.setting_brake_bias, false),
        "migration" => knob("MIGRATION", palette.setting_migration, false),
        "arb_front" => knob("ARB F", palette.setting_arb, false),
        "arb_rear" => knob("ARB R", palette.setting_arb, false),
        "lights" => framed("LIGHTS"),
        "fuel_target" => framed("FUEL TARGET"),
        "position" => framed("POS"),
        "class_position" => framed("CLASS POS"),
        "gap_ahead" => framed("AHEAD"),
        "gap_behind" => framed("BEHIND"),
        "class_gap_ahead" => framed("CLASS AHEAD"),
        "class_gap_behind" => framed("CLASS BEHIND"),
        "position_gap_ahead" => framed("POS AHEAD"),
        "position_gap_behind" => framed("POS BEHIND"),
        "gap_to_leader" => framed("LEADER"),
        "gap_to_class_leader" => framed("CLASS LEADER"),
        "track_limits" => framed("TRACK LIMITS"),
        "incidents" => framed("INCIDENTS"),
        "pit_stops" => framed("PIT STOPS"),
        "air_temp" => framed("AIR"),
        "track_temp" => framed("TRACK"),
        "rain" => framed("RAIN"),
        "tyre_temp" | "tyre_core_temp" | "tyre_avg" | "brake_temp" | "tyre_pressure" | "tyre_wear_lap" => WidgetChrome::Split,
        "tyre_laps_left" => framed("TYRE LAPS"),
        "fuel" => framed("FUEL"),
        "fuel_percent" => framed("FUEL %"),
        "fuel_last_lap" => framed("FUEL LAST LAP"),
        "fuel_this_lap" => framed("FUEL THIS LAP"),
        "fuel_stint_avg" => framed("FUEL STINT AVG"),
        "ve_percent" => framed("VE"),
        "ve_per_lap" => framed("VE AVG"),
        "ve_last_lap" => framed("VE LAST LAP"),
        "ve_stint_avg" => framed("VE STINT AVG"),
        "ve_refuel" => framed("VE REFUEL"),
        "range" => framed(match range(frame) {
            Some(Range::Fuel(_)) => "RANGE FUEL",
            Some(Range::Energy(_)) => "RANGE VE",
            None => "RANGE",
        }),
        "fuel_ve" => framed("FUEL · VE"),
        "pit_window" => framed("PIT WINDOW"),
        "battery" => filled("BATTERY", energy_fill(battery_percent(frame), palette)),
        "deploy" => framed("DEPLOY"),
        "regen" => framed("REGEN"),
        "motor_state" => filled("MOTOR", motor_fill(frame, palette)),
        "lift_coast" => filled("LIFT & COAST", lifting(frame, lift_point).then_some(palette.warning)),
        "relative" => framed("RELATIVE"),
        "damage" => framed("DAMAGE"),
        "tyre" => framed(TIRE_CORNERS[corner_index(widget)]),
        "sectors" => framed("SECTORS"),
        "speed" => framed(match units {
            Units::Metric => "KM/H",
            Units::Imperial => "MPH",
        }),
        "laps" => framed("LAP"),
        "fuel_laps" => framed("FUEL LAPS"),
        "ve_laps" => framed("VE LAPS"),
        "time_left" => framed("TIME LEFT"),
        "fuel_avg" => framed("FUEL AVG"),
        "fuel_time" => framed("FUEL TIME"),
        "laps_left" => framed("LAPS LEFT"),
        "refuel" => framed("REFUEL"),
        "clock" => framed("CLOCK"),
        "oil_temp" => framed("OIL"),
        "water_temp" => framed("WATER"),
        "boost" => framed("BOOST"),
        "torque" => framed("TORQUE"),
        "rpm" => framed("RPM"),
        "motor_temp" => framed("MOTOR TEMP"),
        "motor_water_temp" => framed("MOTOR WATER"),
        "penalty" => filled("PENALTY", (penalties_to_serve(frame) > 0.0).then_some(palette.critical)),
        "tyre_wear" => framed("WEAR"),
        "sector_time" => framed("SECTOR"),
        _ => WidgetChrome::Bare,
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

/// What puts the frame's virtual-energy figures (level, per lap, last lap, stint) in percent:
/// they come on a 0..1 or a 0..100 scale, told apart by the level.
fn ve_scale(frame: &TelemetryFrame) -> f64 {
    let raw = frame.energy.virtual_energy;
    if raw > 0.0 && raw <= 1.0 { 100.0 } else { 1.0 }
}

/// The virtual-energy level as a percentage, tolerating a 0..1 or a 0..100 source scale.
pub(crate) fn virtual_energy_percent(frame: &TelemetryFrame) -> f64 {
    frame.energy.virtual_energy * ve_scale(frame)
}

/// The hybrid battery's charge as a percentage (the frame's 0-1 fraction).
fn battery_percent(frame: &TelemetryFrame) -> f64 {
    frame.energy.soc * 100.0
}

/// The laps `amount` lasts at `per_lap`; `None` without a per-lap figure. The ratio holds on any
/// scale both share (virtual energy comes as 0..1 or 0..100).
fn laps_of(amount: f64, per_lap: f64) -> Option<f64> {
    (per_lap > 0.0001).then(|| amount.max(0.0) / per_lap)
}

/// The laps of fuel left at the 5-lap average.
fn fuel_laps(f: &TelemetryFrame) -> Option<f64> {
    laps_of(f.car.fuel, f.car.fuel_per_lap)
}

/// The laps of virtual energy left at its per-lap figure.
pub(crate) fn ve_laps(f: &TelemetryFrame) -> Option<f64> {
    laps_of(f.energy.virtual_energy, f.energy.virtual_energy_per_lap)
}

/// What runs out first, and after how many laps: the fuel or the virtual energy (the one the car
/// counts, when it counts only one).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Range {
    Fuel(f64),
    Energy(f64),
}

pub(crate) fn range(f: &TelemetryFrame) -> Option<Range> {
    match (fuel_laps(f), ve_laps(f)) {
        (Some(fuel), Some(ve)) if ve < fuel => Some(Range::Energy(ve)),
        (Some(fuel), _) => Some(Range::Fuel(fuel)),
        (None, Some(ve)) => Some(Range::Energy(ve)),
        (None, None) => None,
    }
}

/// Whether the game's lift-and-coast cue is above the app-wide lift point (`AlertLimits`), where
/// the driver should lift (and the LIFT NOW alert shows).
fn lifting(f: &TelemetryFrame, lift_point: f64) -> bool {
    f.energy.lift_and_coast > lift_point
}

/// The hybrid motor's state as the Motor widget lights it: green deploying, blue regenerating.
fn motor_fill(f: &TelemetryFrame, palette: &DashPaletteColors) -> Option<Rgba> {
    match f.energy.motor_state.as_str() {
        "propulsion" => Some(palette.success),
        "regeneration" => Some(palette.accent),
        _ => None,
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

/// The delta to the target lap: green while gaining, red while losing, white level; "NO TARGET"
/// without one. The flat styles draw it a little larger (mockup).
fn delta(b: &mut Builder, w: &WidgetContext) {
    let lap = &w.frame.lap;
    let p = w.palette;
    if lap.target_lap_time <= 0.0 {
        let size = (w.height * 0.4).min(20.0);
        text_line(b, fit(line("NO TARGET", (w.width / 2.0, w.height / 2.0), size, p.muted, TextAlign::Center, w.width * 0.9, TextWeight::Label)));
        return;
    }
    let color = if lap.delta < -0.0005 {
        p.timing_personal_best
    } else if lap.delta > 0.0005 {
        p.danger
    } else {
        p.neutral
    };
    let share = if w.chrome.style.is_flat() { 0.82 } else { VALUE_SHARE };
    big_value(b, &format_delta(lap.delta), "-00.000", w.width, w.height, color, share);
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
/// and fuel_ve fill from the bottom (the left, lying down) in their level's colour; throttle, brake
/// and clutch in their own; delta, gap (on the road) and class_gap grow from the middle; inputs are
/// two tracks; sectors three segments; rpm the shift strip; spotter a car's place; linear_map the
/// lap as a line with the cars on it.
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
        "gap" => gap_bar(b, w, track, vertical, (Some(f.race.gap_ahead), Some(f.race.gap_behind))),
        "class_gap" => gap_bar(b, w, track, vertical, (f.race.class_gap_ahead, f.race.class_gap_behind)),
        "sectors" => sector_bar(b, w, track, vertical),
        "linear_map" => linear_map(b, w, vertical),
        "throttle" => level_segments(b, w, track, vertical, f.car.throttle, Some(p.success)),
        "brake" => level_segments(b, w, track, vertical, f.car.brake, Some(p.danger)),
        "clutch" => level_segments(b, w, track, vertical, f.car.clutch, Some(p.accent)),
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

fn closeness(gap: Option<f64>) -> f64 {
    match gap {
        Some(gap) if gap > 0.0 => ((GAP_BAR_SECONDS - gap) / GAP_BAR_SECONDS).clamp(0.0, 1.0),
        _ => 0.0,
    }
}

/// Two gaps (ahead, behind; on the road or in the class) as one segmented bar from the middle: the
/// car ahead lights green segments up (right, lying down) as the driver closes in, the car behind
/// amber ones down (left) as it closes in.
fn gap_bar(b: &mut Builder, w: &WidgetContext, track: PixelRect, vertical: bool, (ahead, behind): (Option<f64>, Option<f64>)) {
    centre_segments(b, w, track, vertical, (closeness(ahead), w.palette.success), (closeness(behind), w.palette.warning));
}

/// The three sectors as three segments, the first at the bottom (the left, lying down), each done
/// one in its comparison colour like the Sectors widget (white with nothing to compare), one not
/// done yet a dim tint.
fn sector_bar(b: &mut Builder, w: &WidgetContext, track: PixelRect, vertical: bool) {
    let (lap, p) = (&w.frame.lap, w.palette);
    for (i, time) in shown_sectors(lap).into_iter().enumerate() {
        let color = match time {
            Some(time) => sector_color(sector_state(lap, i, time), p).unwrap_or(p.neutral),
            None => unlit(p.neutral, p),
        };
        b.rect(segment_rect(track, vertical, 3, 4.0 * w.chrome.scale, i), Radii::ZERO, color);
    }
}

/// The lap as a line, the start at the bottom (the left, lying down), with every car where it is on
/// the lap as a dot in its class's colour (grey for a class the dash does not know); ours is larger,
/// white and ringed, drawn over the rest. Without the track's length, the line alone.
fn linear_map(b: &mut Builder, w: &WidgetContext, vertical: bool) {
    let (f, p, s) = (w.frame, w.palette, w.chrome.scale);
    let (length, across) = if vertical { (w.height, w.width) } else { (w.width, w.height) };
    let ours_r = (across * 0.32).min(9.0 * s);
    let car_r = ours_r * 0.62;
    let thickness = (across * 0.12).clamp(1.0, 3.0 * s);
    let mid = across / 2.0;
    let line = if vertical {
        PixelRect::new(mid - thickness / 2.0, ours_r, thickness, length - ours_r * 2.0)
    } else {
        PixelRect::new(ours_r, mid - thickness / 2.0, length - ours_r * 2.0, thickness)
    };
    b.rect(line, Radii::all(thickness / 2.0), p.border);
    let Some(track) = f.session.track_length_meters.filter(|m| *m > 0.0) else {
        return;
    };
    // A car's centre: as far along the line as it is round the lap.
    let at = |car: &FieldCar| {
        let along = ours_r + (car.lap_distance_meters / track).rem_euclid(1.0) * (length - ours_r * 2.0);
        if vertical { (mid, length - along) } else { (along, mid) }
    };
    for car in f.field.iter().filter(|car| !car.is_player) {
        let (x, y) = at(car);
        dot(b, x, y, car_r, class_color(&car.car_class).unwrap_or(p.secondary));
    }
    if let Some(ours) = f.field.iter().find(|car| car.is_player) {
        let (x, y) = at(ours);
        dot(b, x, y, ours_r, p.background);
        dot(b, x, y, ours_r - 1.5 * s, p.foreground);
    }
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

/// Which of the four tyres a one-tyre widget shows (`corner`), by `TirePosition`.
fn corner_index(widget: &DashWidget) -> usize {
    match widget.config_string("corner") {
        Some("fr") => 1,
        Some("rl") => 2,
        Some("rr") => 3,
        _ => 0,
    }
}

/// What every tyre widget shows, in red, for a tyre that no longer works: `OFF` once the wheel has
/// come off the car, `FLAT` while it is punctured.
fn broken_tyre(tire: &TireState) -> Option<&'static str> {
    if tire.detached {
        Some("OFF")
    } else if tire.flat {
        Some("FLAT")
    } else {
        None
    }
}

/// The tread temperature: the surface reading, or the average of the inner, middle and outer
/// sensors when an adapter fills only those; 0 when unknown.
fn tyre_temperature(tire: &TireState) -> f64 {
    if tire.temp_surface > 0.0 {
        return tire.temp_surface;
    }
    let readings: Vec<f64> = [tire.temp_inner, tire.temp_middle, tire.temp_outer].into_iter().filter(|v| *v > 0.0).collect();
    if readings.is_empty() { 0.0 } else { readings.iter().sum::<f64>() / readings.len() as f64 }
}

/// A temperature as "91°" in the driver's unit; "--" while it reads 0 (unknown).
fn tyre_degrees(celsius: f64, units: Units) -> String {
    if celsius > 0.0 { format_degrees(celsius, units) } else { "--".to_owned() }
}

/// The wear left's colour: plain while healthy, amber under 60 %, red under 30 %.
fn wear_color(left: f64, p: &DashPaletteColors) -> Rgba {
    if left < 30.0 {
        p.critical
    } else if left < 60.0 {
        p.warning
    } else {
        p.foreground
    }
}

/// A hot brake's colour (°C): amber over 650°, red over 800°; `None` below.
fn brake_heat(celsius: f64, p: &DashPaletteColors) -> Option<Rgba> {
    if celsius > 800.0 {
        Some(p.critical)
    } else if celsius > 650.0 {
        Some(p.warning)
    } else {
        None
    }
}

/// The small line icons the Tyre widget draws beside its readings.
#[derive(Clone, Copy)]
enum Icon {
    Thermometer,
    Brake,
}

/// An icon `size` tall centred on (`cx`, `cy`): a thermometer (stem and bulb) or a brake disc
/// (a ring round its hub).
fn icon(b: &mut Builder, kind: Icon, (cx, cy): (f64, f64), size: f64, color: Rgba, s: f64) {
    match kind {
        Icon::Thermometer => {
            let stem_w = size * 0.26;
            let bulb = size * 0.24;
            b.rect(PixelRect::new(cx - stem_w / 2.0, cy - size / 2.0, stem_w, size * 0.7), Radii::all(stem_w / 2.0), color);
            dot(b, cx, cy + size / 2.0 - bulb, bulb, color);
        }
        Icon::Brake => {
            let d = size * 0.9;
            b.border(PixelRect::new(cx - d / 2.0, cy - d / 2.0, d, d), 1.8 * s, d / 2.0, color);
            dot(b, cx, cy, size * 0.14, color);
        }
    }
}

/// One reading of the Tyre widget's column: its value at `anchor` (the column's edge on the tyre's
/// side), with an icon before it when it has one.
#[allow(clippy::too_many_arguments)]
fn icon_line(b: &mut Builder, kind: Option<Icon>, text: &str, (anchor, cy): (f64, f64), size: f64, color: Rgba, align: TextAlign, max_w: f64, s: f64) {
    let Some(kind) = kind else {
        return text_line(b, fit(line(text, (anchor, cy), size, color, align, max_w, TextWeight::Value)));
    };
    let icon_w = size * 0.8;
    let gap = 5.0 * s;
    let text_w = b.text_width(text, size, TextWeight::Value).min(max_w - icon_w - gap);
    let (icon_x, text_x) = match align {
        TextAlign::End => (anchor - text_w - gap - icon_w / 2.0, anchor),
        _ => (anchor + icon_w / 2.0, anchor + icon_w + gap),
    };
    icon(b, kind, (icon_x, cy), size * 0.82, color, s);
    text_line(b, fit(line(text, (text_x, cy), size, color, align, max_w - icon_w - gap, TextWeight::Value)));
}

/// The tread as three stripes side by side in `rect` (outer, middle, inner from the car's
/// outside), each in its temperature's colour; all red while the tyre is flat or off.
fn stripes(b: &mut Builder, tire: &TireState, rect: PixelRect, left_side: bool, radius: f64, w: &WidgetContext) {
    let (p, gap) = (w.palette, 2.0 * w.chrome.scale);
    let stripe_w = (rect.width - gap * 2.0) / 3.0;
    let radius = radius.min(stripe_w / 2.0).min(rect.height / 2.0);
    let broken = broken_tyre(tire).is_some();
    for (i, temp) in [tire.temp_outer, tire.temp_middle, tire.temp_inner].into_iter().enumerate() {
        let slot = if left_side { i } else { 2 - i };
        let r = PixelRect::new(rect.left + slot as f64 * (stripe_w + gap), rect.top, stripe_w, rect.height);
        let radii = match slot {
            0 => Radii { top_left: radius, bottom_left: radius, ..Radii::ZERO },
            2 => Radii { top_right: radius, bottom_right: radius, ..Radii::ZERO },
            _ => Radii::ZERO,
        };
        let color = if broken {
            p.critical
        } else if temp > 0.0 {
            resolve_tyre_color(temp, tire.optimal_temp, p)
        } else {
            p.surface
        };
        b.rect(r, radii, color);
    }
}

/// One tyre (the Tyre widget, framed and titled with its corner): its tread as stripes on the
/// car's outside, so four read as a car from above, with the wear left on a dark pill across them;
/// beside it the pressure large, then the tread temperature by a thermometer in its colour and the
/// brake's by a disc (amber, then red, when hot). A flat or detached tyre's stripes are red and its
/// pill says `FLAT` or `OFF`.
fn tyre(b: &mut Builder, w: &WidgetContext) {
    let index = corner_index(w.widget);
    let left_side = index.is_multiple_of(2);
    let tire = &w.frame.tires[index];
    let (p, s, units) = (w.palette, w.chrome.scale, w.units());
    let (width, height) = (w.width, w.height);
    let square_w = (height * 0.62).min(width * 0.36);
    let square_left = if left_side { 0.0 } else { width - square_w };
    stripes(b, tire, PixelRect::new(square_left, 0.0, square_w, height), left_side, w.chrome.flat.radius * s, w);

    let pill_h = (height * 0.24).min(20.0 * s);
    let pill_w = square_w * 0.84;
    let pill = PixelRect::new(square_left + (square_w - pill_w) / 2.0, (height - pill_h) / 2.0, pill_w, pill_h);
    b.rect(pill, Radii::all(pill_h / 2.0), p.background);
    let (wear, wear_ink) = match broken_tyre(tire) {
        Some(state) => (state.to_owned(), p.critical),
        None if tire.wear_percent > 0.0 => (format!("{}%", js_number_string(tire.wear_percent.round())), wear_color(tire.wear_percent, p)),
        None => ("--".to_owned(), p.muted),
    };
    // On a lit box (the pit limiter's) the text is the dark ink, like the pill: letter it light.
    let wear_ink = if wear_ink == p.background { Rgba::hex(dash_color::TEXT) } else { wear_ink };
    let pill_text =
        line(&wear, (pill.left + pill_w / 2.0, pill.top + pill_h / 2.0), pill_h * 0.72, wear_ink, TextAlign::Center, pill_w - 4.0 * s, TextWeight::Value);
    text_line(b, fit(pill_text));

    let gap = 10.0 * s;
    let text_w = width - square_w - gap;
    let anchor = if left_side { square_w + gap } else { text_w };
    let align = if left_side { TextAlign::Start } else { TextAlign::End };
    let temp = tyre_temperature(tire);
    let temp_color = if temp > 0.0 { resolve_tyre_color(temp, tire.optimal_temp, p) } else { p.muted };
    let brake_color = brake_heat(tire.brake_temp, p).unwrap_or(p.secondary);
    // (text, colour, icon); the pressure first, large, two lines tall.
    let lines = [
        (format_pressure(tire.pressure_kpa, units), p.foreground, None),
        (tyre_degrees(temp, units), temp_color, Some(Icon::Thermometer)),
        (tyre_degrees(tire.brake_temp, units), brake_color, Some(Icon::Brake)),
    ];
    let unit = height / (lines.len() as f64 + 1.0);
    let mut top = 0.0;
    for (k, (text, color, kind)) in lines.iter().enumerate() {
        let h = if k == 0 { unit * 2.0 } else { unit };
        let size = if k == 0 { value_size("000.0", text_w, h, 0.8) } else { h * 0.74 };
        icon_line(b, *kind, text, (anchor, top + h / 2.0), size, *color, align, text_w, s);
        top += h;
    }
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

/// Below this size (px at scale 1) three stacked sector rows stop reading at arm's length; the
/// sectors then sit side by side.
const SECTORS_READABLE_PX: f64 = 14.0;

/// The three sectors, each its time as coloured text: purple the fastest, green the driver's best,
/// yellow slower, white with nothing to compare; a sector not done yet "--". One under another,
/// names beside their times, while the box is tall enough for a readable size (a centred block in
/// a wide box); in a lower box the three times side by side in order, each as large as its third
/// allows, unless the rows still come out larger.
fn sectors(b: &mut Builder, w: &WidgetContext) {
    const ROW_TEMPLATE: &str = "S0 000.000";
    const TIME_TEMPLATE: &str = "00.000";
    let p = w.palette;
    let lap = &w.frame.lap;
    let shown: Vec<(String, Rgba)> = shown_sectors(lap)
        .into_iter()
        .enumerate()
        .map(|(i, time)| match time {
            Some(time) => (to_fixed(time, 3), sector_color(sector_state(lap, i, time), p).unwrap_or(p.foreground)),
            None => ("--".to_owned(), p.muted),
        })
        .collect();
    let row_h = w.height / 3.0;
    let size = value_size(ROW_TEMPLATE, w.width, row_h, 0.95);
    let gap = 4.0 * w.chrome.scale;
    let column = (w.width - gap * 2.0) / 3.0;
    let side_by_side = value_size(TIME_TEMPLATE, column, w.height, 0.8);
    if size >= SECTORS_READABLE_PX * w.chrome.scale || size >= side_by_side {
        // The block the template fills (`value_size` sizes 0.56 em a character), centred.
        let block = (ROW_TEMPLATE.len() as f64 * 0.56 * size).min(w.width);
        let left = (w.width - block) / 2.0;
        let label_w = block * 0.3;
        for (i, (text, color)) in shown.iter().enumerate() {
            let cy = row_h * (i as f64 + 0.5);
            text_line(b, fit(line(&format!("S{}", i + 1), (left, cy), size * 0.8, p.secondary, TextAlign::Start, label_w, TextWeight::Label)));
            text_line(b, line(text, (left + block, cy), size, *color, TextAlign::End, block - label_w, TextWeight::Value));
        }
        return;
    }
    for (i, (text, color)) in shown.iter().enumerate() {
        let center = i as f64 * (column + gap) + column / 2.0;
        text_line(b, fit(line(text, (center, w.height / 2.0), side_by_side, *color, TextAlign::Center, column, TextWeight::Value)));
    }
}

/// The pace to project with: the last lap, or the best while there is no last one.
fn reference_lap(f: &TelemetryFrame) -> Option<f64> {
    [f.lap.last_lap_time, f.lap.best_lap_time].into_iter().find(|time| *time > 0.0)
}

/// How many laps it is from here to the flag: what is left of a lap race, or in a timed one what
/// the time left buys at the reference pace, finishing the lap the clock runs out on. `None` when
/// the session has neither a lap limit nor a known end, or there is no pace yet.
pub(crate) fn race_laps_left(f: &TelemetryFrame) -> Option<f64> {
    let into_lap = f.lap.track_position.clamp(0.0, 1.0);
    if f.session.max_laps > 0.0 {
        return Some((f.session.max_laps - f.lap.current_lap.max(1.0) + 1.0 - into_lap).max(0.0));
    }
    let left = f.session.session_time_remaining?;
    let pace = reference_lap(f)?;
    Some(((left.max(0.0) / pace + into_lap).ceil() - into_lap).max(0.0))
}

/// How many laps the race runs, from the lap race's count or estimated from the time left at the
/// reference pace (`race_laps_left`); `None` with neither.
fn estimated_total_laps(f: &TelemetryFrame) -> Option<f64> {
    let left = race_laps_left(f)?;
    Some((f.lap.current_lap.max(1.0) - 1.0 + f.lap.track_position.clamp(0.0, 1.0) + left).round())
}

/// The lap being driven against the race's: `14/30` with a fixed count, `14/~42` estimated, else
/// the lap alone.
fn lap_of(f: &TelemetryFrame) -> String {
    let lap = js_number_string(f.lap.current_lap);
    if f.session.max_laps > 0.0 {
        return format!("{lap}/{}", js_number_string(f.session.max_laps));
    }
    match estimated_total_laps(f) {
        Some(total) => format!("{lap}/~{}", js_number_string(total)),
        None => lap,
    }
}

/// The session's kind as the driver calls it; `-` when the game does not say.
fn session_name(session_type: &str) -> &'static str {
    match session_type {
        "practice" => "PRACTICE",
        "qualify" => "QUALIFYING",
        "race" => "RACE",
        "warmup" => "WARMUP",
        _ => "-",
    }
}

/// Seconds as a clock: M:SS under an hour, H:MM:SS from one.
fn clock_time(seconds: f64) -> String {
    let seconds = seconds.max(0.0).floor();
    let (hours, minutes, secs) = ((seconds / 3600.0).floor(), ((seconds % 3600.0) / 60.0).floor(), seconds % 60.0);
    if hours > 0.0 { format!("{hours}:{minutes:02}:{secs:02}") } else { format!("{minutes}:{secs:02}") }
}

/// Penalties the driver still has to serve (the player's own row of the field).
fn penalties_to_serve(f: &TelemetryFrame) -> f64 {
    f.field.iter().find(|car| car.is_player).map_or(0.0, |car| car.penalties)
}

/// Seconds as H:MM:SS.
fn hours_minutes_seconds(seconds: f64) -> String {
    let seconds = seconds.max(0.0).floor();
    format!("{}:{:02}:{:02}", (seconds / 3600.0).floor(), ((seconds % 3600.0) / 60.0).floor(), seconds % 60.0)
}

/// A temperature as "104°" in the driver's unit, or "--" when the game does not say.
fn degrees(celsius: Option<f64>, units: Units) -> String {
    celsius.filter(|c| c.is_finite()).map_or_else(|| "--".to_owned(), |c| format_degrees(c, units))
}

/// The plain one-value widgets: speed, lap, time left, race laps left, the clock, penalties, the
/// session's name and time, and the pit loss.
fn metric(b: &mut Builder, w: &WidgetContext) {
    let f = w.frame;
    let units = w.units();
    let mut color = w.palette.foreground;
    let (value, template) = match w.widget.widget_type.as_str() {
        "speed" => (format_speed(f.car.speed_ms, units), "000"),
        "laps" => (lap_of(f), "000/~000"),
        "time_left" => (f.session.session_time_remaining.map_or_else(|| "--".to_owned(), clock_time), "0:00:00"),
        "laps_left" => {
            // A lap race's count is known; a timed race's is what the time left buys at the pace.
            let estimated = if f.session.max_laps > 0.0 { "" } else { "~" };
            (race_laps_left(f).map_or_else(|| "--".to_owned(), |laps| format!("{estimated}{}", to_fixed(laps, 1))), "~000.0")
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
        "session_name" => (session_name(&f.session.session_type).to_owned(), "QUALIFYING"),
        "session_time" => (clock_time(f.session.session_time), "0:00:00"),
        "pit_loss" => (f.lap.pit_loss.filter(|s| *s > 0.0).map_or_else(|| "--".to_owned(), |s| to_fixed(s, 1)), "00.0"),
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

/// How far under the driver's limit an engine fluid turns amber, °C.
const ENGINE_AMBER_BAND: f64 = 10.0;

/// An engine fluid's colour against the driver's limit (°C): amber from `ENGINE_AMBER_BAND` under
/// it, red at or over it, and red whatever it reads while the game reports the engine overheating.
fn engine_heat(celsius: Option<f64>, limit: f64, overheating: bool, p: &DashPaletteColors) -> Rgba {
    match celsius {
        _ if overheating => p.critical,
        Some(c) if c >= limit => p.critical,
        Some(c) if c >= limit - ENGINE_AMBER_BAND => p.warning,
        _ => p.foreground,
    }
}

/// The turbo's boost as the game reports it (LMU states no unit): as many decimals as fit three
/// figures.
fn boost_text(raw: f64) -> String {
    let decimals = if raw.abs() < 10.0 {
        2
    } else if raw.abs() < 100.0 {
        1
    } else {
        0
    };
    to_fixed(raw, decimals)
}

/// The car's engine and hybrid readings: oil and water (amber, then red, against the driver's
/// limits, and red while the engine overheats), the turbo's boost (`-` without a turbo), the
/// engine's torque and RPM, and the hybrid motor's and its cooling water's temperatures (`-`
/// without a hybrid).
fn car_value(b: &mut Builder, w: &WidgetContext) {
    let (f, p, units) = (w.frame, w.palette, w.units());
    let overheating = f.damage.as_ref().is_some_and(|d| d.overheating);
    let hybrid = |celsius: Option<f64>| if f.energy.motor_state == "unavailable" { "-".to_owned() } else { degrees(celsius, units) };
    let (value, template, color) = match w.widget.widget_type.as_str() {
        "oil_temp" => (degrees(f.car.oil_temp, units), "000°", engine_heat(f.car.oil_temp, w.limits.engine.oil, overheating, p)),
        "water_temp" => (degrees(f.car.water_temp, units), "000°", engine_heat(f.car.water_temp, w.limits.engine.water, overheating, p)),
        "boost" => (f.car.turbo_boost.filter(|v| v.is_finite()).map_or_else(|| "-".to_owned(), boost_text), "0.00", p.foreground),
        "torque" => {
            let torque = f.car.engine_torque.filter(|v| v.is_finite());
            return unit_value(b, w, &torque.map_or_else(|| "--".to_owned(), format_int), if torque.is_some() { "Nm" } else { "" }, 4.0, p.foreground);
        }
        "rpm" => (format_int(f.car.rpm.max(0.0)), "00000", p.foreground),
        "motor_temp" => (hybrid(f.energy.motor_temp), "000°", p.foreground),
        "motor_water_temp" => (hybrid(f.energy.motor_water_temp), "000°", p.foreground),
        _ => return,
    };
    big_value(b, &value, template, w.width, w.height, color, 0.8);
}

/// The headlights and the wipers side by side, each under its name: on in white, off grey, `-`
/// when the game does not say.
fn lights(b: &mut Builder, w: &WidgetContext) {
    let (car, p) = (&w.frame.car, w.palette);
    let head = match car.headlights {
        Some(true) => ("ON".to_owned(), p.neutral),
        Some(false) => ("OFF".to_owned(), p.muted),
        None => ("-".to_owned(), p.muted),
    };
    let wipers = match car.wiper_state {
        Some(state) if state > 0.0 => (js_number_string(state), p.neutral),
        Some(_) => ("OFF".to_owned(), p.muted),
        None => ("-".to_owned(), p.muted),
    };
    let half = w.width / 2.0;
    let label_size = (w.height * 0.26).min(12.0 * w.chrome.scale);
    let size = value_size("OFF", half - 6.0, w.height * 0.64, 0.9);
    for (i, (name, (value, color))) in [("HEAD", head), ("WIPERS", wipers)].into_iter().enumerate() {
        let center = half * (i as f64 + 0.5);
        text_line(b, fit(line(name, (center, w.height * 0.18), label_size, p.secondary, TextAlign::Center, half - 6.0, TextWeight::Label)));
        text_line(b, line(&value, (center, w.height * 0.64), size, color, TextAlign::Center, half - 6.0, TextWeight::Value));
    }
}

/// The air or the track temperature.
fn conditions(b: &mut Builder, w: &WidgetContext) {
    let c = &w.frame.conditions;
    let celsius = if w.widget.widget_type == "air_temp" { c.air_temp } else { c.track_temp };
    big_value(b, &degrees(celsius, w.units()), "000°", w.width, w.height, w.palette.foreground, 0.8);
}

/// How hard it rains, large, and under it how wet the racing line is.
fn rain(b: &mut Builder, w: &WidgetContext) {
    let (c, p) = (&w.frame.conditions, w.palette);
    let percent =
        |share: Option<f64>| share.filter(|v| v.is_finite()).map_or_else(|| "--".to_owned(), |v| format!("{}%", js_number_string((v * 100.0).round())));
    let top = w.height * 0.62;
    big_value(b, &percent(c.raining), "000%", w.width, top, p.foreground, 0.85);
    let size = (w.height * 0.26).min(14.0 * w.chrome.scale);
    let wet = format!("WET {}", percent(c.path_wetness));
    text_line(b, fit(line(&wet, (w.width / 2.0, (top + w.height) / 2.0), size, p.secondary, TextAlign::Center, w.width, TextWeight::Label)));
}

/// The four tyres' wear left, in a car's two-by-two: plain while healthy, then amber, then red.
fn tyre_wear(b: &mut Builder, w: &WidgetContext) {
    let p = w.palette;
    let (cell_w, cell_h) = (w.width / 2.0, w.height / 2.0);
    let size = value_size("000", cell_w - 4.0, cell_h, 0.78);
    for (i, tire) in w.frame.tires.iter().enumerate() {
        let left = tire.wear_percent;
        let (text, color) = match broken_tyre(tire) {
            Some(state) => (state.to_owned(), p.critical),
            None if left > 0.0 => (js_number_string(left.round()), wear_color(left, p)),
            None => ("--".to_owned(), p.muted),
        };
        let center = ((i % 2) as f64 * cell_w + cell_w / 2.0, (i / 2) as f64 * cell_h + cell_h / 2.0);
        text_line(b, fit(line(&text, center, size, color, TextAlign::Center, cell_w - 4.0, TextWeight::Value)));
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
    let units = w.units();
    let speed = format_speed(car.speed_ms, units);
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
        TextLine {
            text: units.speed_unit(),
            top: height * 0.92,
            size: height * 0.09,
            color: w.palette.muted,
            weight: TextWeight::Label,
            sizing: TextSizing::Fit,
            ..base
        },
    );
}

/// A lap time's value template: the widest text a lap time can show.
const LAP_TEMPLATE: &str = "0:00.000";

/// What a lap that does not count shows instead of its time, in the dark grey.
const INVALID_LAP: &str = "-:--.---";

/// Whether two lap times are the same to the thousandth (a best is the same lap's own time).
const SAME_LAP: f64 = 0.0005;

/// The last lap's colour: purple when it is the fastest (the class's best, or the session's when
/// the class is unknown), green when it is the driver's best, else white.
fn last_lap_color(lap: &LapState, p: &DashPaletteColors) -> Rgba {
    let last = lap.last_lap_time;
    let fastest = lap.class_best_lap.or(lap.session_best_lap).filter(|best| *best > 0.0);
    if last <= 0.0 {
        p.neutral
    } else if fastest.is_some_and(|best| last <= best + SAME_LAP) {
        p.timing_fastest_overall
    } else if lap.best_lap_time > 0.0 && last <= lap.best_lap_time + SAME_LAP {
        p.timing_personal_best
    } else {
        p.neutral
    }
}

/// The lap the driver is on course for: the target the delta runs against plus the delta.
fn predicted_lap(lap: &LapState) -> Option<f64> {
    (lap.target_lap_time > 0.0).then_some(lap.target_lap_time + lap.delta)
}

/// The driver's best three sectors added up; `None` until each has a time.
fn optimal_lap(lap: &LapState) -> Option<f64> {
    (0..3).map(|i| lap.personal_best_sectors.get(i).copied().flatten()).sum()
}

/// The one-lap-time widgets: the lap being driven, the last, the driver's best, the session's and
/// the class's, the predicted and optimal laps, the 5- and 10-lap averages and the all-time best.
/// A current or last lap that does not count shows `-:--.---` in the dark grey.
fn lap_value(b: &mut Builder, w: &WidgetContext) {
    let (lap, p) = (&w.frame.lap, w.palette);
    let time = |seconds: Option<f64>| format_lap(seconds.unwrap_or(0.0));
    let (text, color) = match w.widget.widget_type.as_str() {
        "current_lap" if !lap.is_valid => (INVALID_LAP.to_owned(), p.muted),
        "current_lap" => (format_lap(lap.current_lap_time), p.neutral),
        "last_lap" if lap.last_lap_time > 0.0 && !lap.last_lap_valid => (INVALID_LAP.to_owned(), p.muted),
        "last_lap" => (format_lap(lap.last_lap_time), last_lap_color(lap, p)),
        "best_lap" => (format_lap(lap.best_lap_time), p.timing_personal_best),
        "session_best" => (time(lap.session_best_lap), p.timing_fastest_overall),
        "class_best" => (time(lap.class_best_lap), p.timing_fastest_overall),
        "predictive_lap" => (time(predicted_lap(lap)), p.neutral),
        "optimal_lap" => (time(optimal_lap(lap)), p.neutral),
        "lap_avg_5" => (time(lap.last_five_laps_average), p.neutral),
        "lap_avg_10" => (time(lap.last_ten_laps_average), p.neutral),
        "all_time_best" => (time(lap.all_time_best_lap), p.neutral),
        _ => return,
    };
    big_value(b, &text, LAP_TEMPLATE, w.width, w.height, color, VALUE_SHARE);
}

/// The resolved flag priority text (RED > SC > VSC > YELLOW > CHECKERED > GREEN) and its color,
/// that the `flag` widget shows.
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

/// A `ValueWithUnit` size: `share` of the height, capped so `chars` value digits plus
/// `unit_chars` unit digits (at the unit's 0.36 scale) fit the width.
pub(crate) fn value_unit_size(height_cap: f64, width: f64, chars: f64, unit_chars: f64) -> f64 {
    height_cap.min(width * 0.96 / ((chars + unit_chars * 0.36) * 0.56))
}

/// A laps-left figure's colour against the app-wide fuel warning's two levels: red at or under
/// the second (where LOW FUEL pops), amber at or under the first, else white.
fn laps_warning(laps: Option<f64>, w: &WidgetContext) -> Rgba {
    let (warning, p) = (w.limits.fuel, w.palette);
    match laps {
        Some(laps) if laps <= warning.red => p.critical,
        Some(laps) if laps <= warning.amber => p.warning,
        _ => p.foreground,
    }
}

/// The stops the game's strategy still plans (planned less done); 0 without a plan.
fn stops_left(f: &TelemetryFrame) -> f64 {
    (f.penalties.scheduled_pit_stops - f.penalties.pit_stops).max(0.0)
}

/// What has to go in to reach the flag (`needed`, `None` when unknown) as a value and its unit:
/// `+12.3` per stop, split over the stops the game's strategy still plans (the unit then says
/// over how many, `L ×2`); nothing when there is already enough.
fn refuel_value(needed: Option<f64>, f: &TelemetryFrame, format: impl Fn(f64) -> String, unit: &str) -> (String, String) {
    let stops = stops_left(f);
    match needed {
        None => ("--".to_owned(), unit.to_owned()),
        Some(needed) if needed <= 0.0 => (format(0.0), unit.to_owned()),
        Some(needed) if stops > 1.0 => (format!("+{}", format(needed / stops)), format!("{unit} ×{}", js_number_string(stops))),
        Some(needed) => (format!("+{}", format(needed)), unit.to_owned()),
    }
}

/// A value with its unit, centred and sized so `chars` value digits plus the unit fit.
fn unit_value(b: &mut Builder, w: &WidgetContext, value: &str, unit: &str, chars: f64, color: Rgba) {
    let size = value_unit_size(w.height * 0.7, w.width, chars, unit.chars().count() as f64);
    value_with_unit(b, ValueWithUnit { color, ..value_unit(value, unit, w.width / 2.0, w.height / 2.0, size, w.palette, w.width) });
}

/// The fuel widgets: what is in the tank (in the driver's unit, and as a share of the tank), the
/// laps it lasts and the laps until the fuel or the virtual energy runs out, what the last lap,
/// this lap so far, the last five laps and the stint's clean laps used, how long it lasts, and
/// what has to go in to reach the flag. The amount and the laps warn amber, then red, as the laps
/// left near the app-wide fuel warning.
fn fuel(b: &mut Builder, w: &WidgetContext) {
    let (f, p, units) = (w.frame, w.palette, w.units());
    let car = &f.car;
    let unit = units.fuel_unit();
    let used = |liters: Option<f64>| liters.filter(|l| l.is_finite() && *l >= 0.0).map_or_else(|| "--".to_owned(), |l| format_fuel_per_lap(l, units));
    let laps = |laps: Option<f64>| laps.map_or_else(|| "--".to_owned(), |laps| to_fixed(laps, 1));
    let (value, template, color) = match w.widget.widget_type.as_str() {
        "fuel" => return unit_value(b, w, &format_fuel(car.fuel, units), unit, 5.0, laps_warning(fuel_laps(f), w)),
        "refuel" => {
            let needed = race_laps_left(f).filter(|_| car.fuel_per_lap > 0.0001).map(|left| left * car.fuel_per_lap - car.fuel);
            let (value, unit) = refuel_value(needed, f, |liters| format_fuel(liters, units), unit);
            return unit_value(b, w, &value, &unit, 6.0, p.foreground);
        }
        "fuel_percent" => {
            let share = car.fuel_capacity.filter(|capacity| *capacity > 0.0).map(|capacity| car.fuel / capacity * 100.0);
            (share.map_or_else(|| "--".to_owned(), |share| format!("{}%", js_number_string(share.round()))), "000%", p.foreground)
        }
        "fuel_laps" => (laps(fuel_laps(f)), "00.0", laps_warning(fuel_laps(f), w)),
        "range" => {
            let left = range(f).map(|range| match range {
                Range::Fuel(laps) | Range::Energy(laps) => laps,
            });
            (laps(left), "00.0", laps_warning(left, w))
        }
        "fuel_last_lap" => (used(car.fuel_last_lap.filter(|l| *l > 0.0)), "0.00", p.foreground),
        "fuel_this_lap" => (used(car.fuel_this_lap), "0.00", p.foreground),
        "fuel_avg" => (used(Some(car.fuel_per_lap).filter(|l| *l > 0.0)), "0.00", p.foreground),
        "fuel_stint_avg" => (used(car.fuel_stint_per_lap.filter(|l| *l > 0.0)), "0.00", p.foreground),
        "fuel_time" => {
            let value = match (reference_lap(f), fuel_laps(f)) {
                (Some(pace), Some(laps)) => hours_minutes_seconds(laps * pace),
                _ => "--".to_owned(),
            };
            (value, "0:00:00", p.foreground)
        }
        _ => return,
    };
    big_value(b, &value, template, w.width, w.height, color, 0.8);
}

/// The fuel in the tank and the virtual energy left side by side, each warning like its own widget.
fn fuel_ve(b: &mut Builder, w: &WidgetContext) {
    let (f, units) = (w.frame, w.units());
    let half = w.width / 2.0;
    let pct = virtual_energy_percent(f);
    let ve = if pct > 0.0 { js_number_string(pct.round()) } else { "--".to_owned() };
    let halves = [(format_fuel(f.car.fuel, units), units.fuel_unit(), laps_warning(fuel_laps(f), w)), (ve, "%", laps_warning(ve_laps(f), w))];
    let size = value_unit_size(w.height * 0.7, half - 6.0, 4.5, 1.5);
    for (i, (value, unit, color)) in halves.iter().enumerate() {
        let center = half * (i as f64 + 0.5);
        value_with_unit(b, ValueWithUnit { color: *color, ..value_unit(value, unit, center, w.height / 2.0, size, w.palette, half - 6.0) });
    }
}

/// When one stop reaches the flag: what a full tank (and full virtual energy, when the car counts
/// it) lasts against the laps left.
#[derive(Clone, Copy, Debug, PartialEq)]
enum PitWindow {
    /// The fuel and energy already reach the flag.
    NoStop,
    /// A stop now reaches the flag.
    Open,
    /// A stop at the end of this lap or a later one reaches the flag.
    FromLap(f64),
}

/// `None` without the laps left, a per-lap figure or the tank's size.
fn pit_window(f: &TelemetryFrame) -> Option<PitWindow> {
    let left = race_laps_left(f)?;
    // (level, full, per lap) of what the car runs on: the fuel, and the virtual energy (full is
    // 100 %, on its own scale) when the car counts it.
    let mut supplies = Vec::new();
    if f.car.fuel_per_lap > 0.0001 {
        supplies.push((f.car.fuel, f.car.fuel_capacity.filter(|c| *c > 0.0)?, f.car.fuel_per_lap));
    }
    if f.energy.virtual_energy_per_lap > 0.0001 {
        supplies.push((f.energy.virtual_energy, 100.0 / ve_scale(f), f.energy.virtual_energy_per_lap));
    }
    if supplies.is_empty() {
        return None;
    }
    if supplies.iter().all(|(level, _, per_lap)| level / per_lap >= left) {
        return Some(PitWindow::NoStop);
    }
    // The laps from here before a full refill lasts to the flag: the most any supply needs.
    let wait = supplies.iter().map(|(_, full, per_lap)| left - full / per_lap).fold(f64::MIN, f64::max);
    if wait <= 0.0 {
        return Some(PitWindow::Open);
    }
    let done = f.lap.current_lap.max(1.0) - 1.0 + f.lap.track_position.clamp(0.0, 1.0);
    Some(PitWindow::FromLap((done + wait).ceil()))
}

/// The pit window: the lap a stop reaches the flag from, `OPEN` once it does, `NO STOP` when the
/// car already reaches it.
fn pit_window_value(b: &mut Builder, w: &WidgetContext) {
    let p = w.palette;
    let (text, color) = match pit_window(w.frame) {
        None => ("--".to_owned(), p.foreground),
        Some(PitWindow::NoStop) => ("NO STOP".to_owned(), p.secondary),
        Some(PitWindow::Open) => ("OPEN".to_owned(), p.success),
        Some(PitWindow::FromLap(lap)) => (format!("LAP {}", js_number_string(lap)), p.foreground),
    };
    big_value(b, &text, "NO STOP", w.width, w.height, color, 0.8);
}

/// The four corners in car order, by `TirePosition`.
const TIRE_CORNERS: [&str; 4] = ["FL", "FR", "RL", "RR"];

/// One tyre corner's value, the widest text it can show, and its condition fill.
struct TyreCorner {
    value: String,
    template: &'static str,
    fill: Option<Rgba>,
}

/// Four tyre corners in car order, each its own frame in the dash style titled with its corner and
/// `title`, splitting the widget's cell 2x2 (`TyreCorners`). A flat or detached tyre's frame is
/// red and says so.
fn tyre_corners(b: &mut Builder, w: &WidgetContext, title: &str, corner: impl Fn(&TireState) -> TyreCorner) {
    let (cell_w, cell_h) = (w.width / 2.0, w.height / 2.0);
    for (i, (label, tire)) in TIRE_CORNERS.into_iter().zip(&w.frame.tires).enumerate() {
        let TyreCorner { value, template, fill } = match broken_tyre(tire) {
            Some(state) => TyreCorner { value: state.to_owned(), template: "FLAT", fill: Some(w.palette.critical) },
            None => corner(tire),
        };
        let title = format!("{label}{title}");
        let rect = PixelRect::new((i % 2) as f64 * cell_w, (i / 2) as f64 * cell_h, cell_w, cell_h);
        let frame = WidgetFrame { ctx: w.chrome, rect, title: Some(&title), accent: None, fill, title_color: None, palette: *w.palette };
        widget_frame(b, frame, |b, width, height, palette| big_value(b, &value, template, width, height, palette.foreground, VALUE_SHARE));
    }
}

/// The laps the most worn tyre lasts at last lap's wear; `FLAT` or `OFF` in red while a tyre is.
fn tyre_laps_left(b: &mut Builder, w: &WidgetContext) {
    let (tires, p) = (&w.frame.tires, w.palette);
    let (text, color) = match tires.iter().find_map(broken_tyre) {
        Some(state) => (state.to_owned(), p.critical),
        None => {
            let laps =
                tires.iter().filter_map(|t| t.wear_last_lap.filter(|wear| *wear > 0.0).map(|wear| t.wear_percent.max(0.0) / wear)).min_by(f64::total_cmp);
            (laps.map_or_else(|| "--".to_owned(), |laps| to_fixed(laps, 1)), p.foreground)
        }
    };
    big_value(b, &text, "000.0", w.width, w.height, color, 0.8);
}

/// The tyre widgets: one tyre (`tyre`), the four's wear left in a two-by-two, the laps the most
/// worn lasts, and the four corners in frames of their own: the tread temperature, the core's,
/// last lap's average (each in its colour against the compound's ideal), the brakes (lit amber,
/// then red, when hot), the pressures and the wear last lap took.
fn tyres(b: &mut Builder, w: &WidgetContext) {
    let (p, units) = (w.palette, w.units());
    let temp = |celsius: f64, tire: &TireState| TyreCorner {
        value: tyre_degrees(celsius, units),
        template: "000°",
        fill: (celsius > 0.0).then(|| resolve_tyre_color(celsius, tire.optimal_temp, p)),
    };
    match w.widget.widget_type.as_str() {
        "tyre" => tyre(b, w),
        "tyre_wear" => tyre_wear(b, w),
        "tyre_laps_left" => tyre_laps_left(b, w),
        "tyre_temp" => tyre_corners(b, w, "", |t| temp(tyre_temperature(t), t)),
        "tyre_core_temp" => tyre_corners(b, w, " CORE", |t| temp(t.temp_core, t)),
        "tyre_avg" => tyre_corners(b, w, " AVG", |t| temp(t.avg_temp_last_lap.unwrap_or(0.0), t)),
        "brake_temp" => tyre_corners(b, w, " BRAKE", |t| TyreCorner {
            value: tyre_degrees(t.brake_temp, units),
            template: if units == Units::Imperial { "0000°" } else { "000°" },
            fill: brake_heat(t.brake_temp, p),
        }),
        "tyre_pressure" => {
            let title = format!(" {}", units.pressure_unit().to_uppercase());
            tyre_corners(b, w, &title, |t| TyreCorner { value: format_pressure(t.pressure_kpa, units), template: "000.0", fill: None })
        }
        "tyre_wear_lap" => tyre_corners(b, w, " WEAR/LAP", |t| TyreCorner {
            value: t.wear_last_lap.filter(|wear| wear.is_finite() && *wear >= 0.0).map_or_else(|| "--".to_owned(), |wear| format!("{}%", to_fixed(wear, 2))),
            template: "0.00%",
            fill: None,
        }),
        _ => {}
    }
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

/// A driver-adjustable setting's step (`format_setting`): `-` when the car lacks it (no highest
/// step), `OFF` at 0 for TC, TC 2, TC slip and ABS. While TC or ABS works, its frame lights and
/// this draws in ink.
fn setting(b: &mut Builder, w: &WidgetContext) {
    let e = &w.frame.electronics;
    let (value, max, assist) = match w.widget.widget_type.as_str() {
        "tc" => (e.tc, e.tc_max, true),
        "tc2" => (e.tc_cut, e.tc_cut_max, true),
        "tc_slip" => (e.tc_slip, e.tc_slip_max, true),
        "abs" => (e.abs, e.abs_max, true),
        "engine_map" => (e.motor_map, e.motor_map_max, false),
        "migration" => (e.migration, e.migration_max, false),
        "arb_front" => (e.front_anti_roll_bar, e.front_anti_roll_bar_max, false),
        "arb_rear" => (e.rear_anti_roll_bar, e.rear_anti_roll_bar_max, false),
        _ => return,
    };
    let text = if max > 0.0 { format_setting(value, assist) } else { "-".to_owned() };
    big_value(b, &text, "OFF", w.width, w.height, w.palette.neutral, VALUE_SHARE);
}

fn brake_bias(b: &mut Builder, w: &WidgetContext) {
    big_value(b, &format_front_brake_bias(w.frame.car.brake_bias_rear), "00.0", w.width, w.height, w.palette.neutral, VALUE_SHARE);
}

/// The planned fuel per lap: green while the last lap used no more, red once it used more.
fn fuel_target(b: &mut Builder, w: &WidgetContext) {
    let (units, p) = (w.units(), w.palette);
    let target = w.targets.and_then(|t| t.fuel_per_lap_liters);
    let color = match (target, w.frame.car.fuel_last_lap.filter(|l| *l > 0.0)) {
        (Some(target), Some(last)) if last <= target + 0.0005 => p.success,
        (Some(_), Some(_)) => p.critical,
        _ => p.foreground,
    };
    unit_value(b, w, &format_fuel_per_lap_target(target, units), &format!("{}/lap", units.fuel_unit()), 4.0, color);
}

/// The player's place in its class and the cars in it, from the field.
fn class_place(f: &TelemetryFrame) -> (f64, f64) {
    let Some(me) = f.field.iter().find(|car| car.is_player) else {
        return (0.0, 0.0);
    };
    (me.class_place, f.field.iter().filter(|car| car.car_class == me.car_class).count() as f64)
}

/// The place overall or in the class, `P4` with the cars it is of beside it.
fn position(b: &mut Builder, w: &WidgetContext) {
    let race = &w.frame.race;
    let (place, of) = if w.widget.widget_type == "class_position" { class_place(w.frame) } else { (race.position, race.total_positions) };
    let value = if place > 0.0 { format!("P{}", js_number_string(place)) } else { "P--".to_owned() };
    let unit = if of > 0.0 { format!("/{}", js_number_string(of)) } else { String::new() };
    let size = value_unit_size(w.height * 0.7, w.width, 3.0, 3.0);
    value_with_unit(b, value_unit(&value, &unit, w.width / 2.0, w.height / 2.0, size, w.palette, w.width));
}

/// A gap in seconds to the thousandth, as M:SS.S from a minute; "--" when unknown.
fn gap_text(seconds: Option<f64>) -> String {
    match seconds.filter(|s| s.is_finite() && *s > 0.0) {
        Some(seconds) if seconds >= 60.0 => {
            let tenths = (seconds * 10.0).round();
            let minutes = (tenths / 600.0).floor();
            let rest = (tenths - minutes * 600.0) / 10.0;
            format!("{minutes}:{}{}", if rest < 10.0 { "0" } else { "" }, to_fixed(rest, 1))
        }
        Some(seconds) => format_gap(seconds),
        None => "--".to_owned(),
    }
}

/// One gap, unsigned (the title says to which car): the car ahead or behind on the road, in the
/// class or by place, or the overall or class leader. The host times each from where the cars
/// were when.
fn gap(b: &mut Builder, w: &WidgetContext) {
    let race = &w.frame.race;
    let seconds = match w.widget.widget_type.as_str() {
        "gap_ahead" => Some(race.gap_ahead),
        "gap_behind" => Some(race.gap_behind),
        "class_gap_ahead" => race.class_gap_ahead,
        "class_gap_behind" => race.class_gap_behind,
        "position_gap_ahead" => race.position_gap_ahead,
        "position_gap_behind" => race.position_gap_behind,
        "gap_to_leader" => race.gap_to_leader,
        "gap_to_class_leader" => race.gap_to_class_leader,
        _ => return,
    };
    big_value(b, &gap_text(seconds), "00.000", w.width, w.height, w.palette.foreground, VALUE_SHARE);
}

/// What the race counts against the driver: track-limit steps towards the next penalty (`2/4`,
/// yellow from half way, red a step short), incidents, and pit stops against the stops the game's
/// strategy plans (`1/2`).
fn race_count(b: &mut Builder, w: &WidgetContext) {
    let (pen, p) = (&w.frame.penalties, w.palette);
    let of = |count: f64, total: f64| {
        if total > 0.0 { format!("{}/{}", js_number_string(count), js_number_string(total)) } else { js_number_string(count) }
    };
    let (text, color) = match w.widget.widget_type.as_str() {
        "track_limits" => {
            let per = pen.track_limit_steps_per_penalty;
            let steps = if per > 0.0 { pen.track_limit_steps.rem_euclid(per) } else { pen.track_limit_steps };
            let color = if per <= 0.0 || steps <= 0.0 {
                p.foreground
            } else if per - steps <= 1.0 {
                p.critical
            } else if steps * 2.0 >= per {
                p.race_control_yellow
            } else {
                p.foreground
            };
            (of(steps, per), color)
        }
        "incidents" => (js_number_string(pen.incidents), p.foreground),
        "pit_stops" => (of(pen.pit_stops, pen.scheduled_pit_stops), p.foreground),
        _ => return,
    };
    big_value(b, &text, "00/00", w.width, w.height, color, 0.8);
}

/// The virtual-energy and hybrid widgets: the VE level, what a lap uses (on average, the last lap,
/// the stint's clean laps), the laps it lasts, what has to go in to reach the flag, the battery's
/// charge and what the motor deploys and regenerates (`-` without a hybrid). The level and its
/// laps warn like the fuel's.
fn energy(b: &mut Builder, w: &WidgetContext) {
    let (f, p) = (w.frame, w.palette);
    let e = &f.energy;
    let scale = ve_scale(f);
    let percent = |raw: Option<f64>| raw.filter(|v| v.is_finite() && *v > 0.0).map_or_else(|| "--".to_owned(), |v| to_fixed(v * scale, 1));
    let hybrid = e.motor_state != "unavailable";
    let kw = |power: f64| if hybrid { format_int(power.max(0.0)) } else { "-".to_owned() };
    let (value, unit, chars, color) = match w.widget.widget_type.as_str() {
        "ve_laps" => {
            let laps = ve_laps(f);
            let text = laps.map_or_else(|| "--".to_owned(), |laps| to_fixed(laps, 1));
            return big_value(b, &text, "00.0", w.width, w.height, laps_warning(laps, w), 0.8);
        }
        "ve_percent" => (percent(Some(e.virtual_energy)), "%".to_owned(), 5.0, laps_warning(ve_laps(f), w)),
        "ve_per_lap" => (percent(Some(e.virtual_energy_per_lap)), "%".to_owned(), 4.0, p.foreground),
        "ve_last_lap" => (percent(e.ve_last_lap), "%".to_owned(), 4.0, p.foreground),
        "ve_stint_avg" => (percent(e.ve_stint_per_lap), "%".to_owned(), 4.0, p.foreground),
        "ve_refuel" => {
            let per_lap = e.virtual_energy_per_lap;
            let needed = race_laps_left(f).filter(|_| per_lap > 0.0001).map(|left| (left * per_lap - e.virtual_energy) * scale);
            let (value, unit) = refuel_value(needed, f, |pct| js_number_string(pct.round()), "%");
            (value, unit, 4.0, p.foreground)
        }
        "battery" => {
            let pct = battery_percent(f);
            (if pct > 0.0 { format_int(pct.round()) } else { "--".to_owned() }, "%".to_owned(), 3.0, p.neutral)
        }
        "deploy" => (kw(e.deploy_power), "kW".to_owned(), 3.0, p.foreground),
        "regen" => (kw(e.regen_power), "kW".to_owned(), 3.0, p.foreground),
        _ => return,
    };
    let unit = if value == "-" { "" } else { unit.as_str() };
    unit_value(b, w, &value, unit, chars, color);
}

/// What the hybrid motor is doing: `DEPLOY` and `REGEN` light the frame (`motor_fill`), `IDLE`
/// otherwise, `-` without a hybrid.
fn motor_state(b: &mut Builder, w: &WidgetContext) {
    let p = w.palette;
    let (text, color) = match w.frame.energy.motor_state.as_str() {
        "propulsion" => ("DEPLOY", p.neutral),
        "regeneration" => ("REGEN", p.neutral),
        "inactive" => ("IDLE", p.secondary),
        _ => ("-", p.secondary),
    };
    big_value(b, text, "DEPLOY", w.width, w.height, color, 0.8);
}

/// The game's lift-and-coast cue: a row of segments filling towards the lift point, then `LIFT`
/// on the lit frame (`lifting`).
fn lift_coast(b: &mut Builder, w: &WidgetContext) {
    const SEGMENTS: usize = 10;
    let (p, s) = (w.palette, w.chrome.scale);
    let lift_point = w.limits.lift_point;
    if lifting(w.frame, lift_point) {
        return big_value(b, "LIFT", "LIFT", w.width, w.height, p.neutral, 0.8);
    }
    let share = if lift_point > 0.0 { w.frame.energy.lift_and_coast / lift_point } else { 0.0 };
    let lit = (share.clamp(0.0, 1.0) * SEGMENTS as f64).floor() as usize;
    let height = (w.height * 0.5).min(24.0 * s);
    let track = PixelRect::new(0.0, (w.height - height) / 2.0, w.width, height);
    for i in 0..SEGMENTS {
        let color = if i < lit { p.warning } else { unlit(p.warning, p) };
        b.rect(segment_rect(track, false, SEGMENTS, BAR_SEGMENT_GAP * s, i), Radii::ZERO, color);
    }
}

/// One car on the relative: seconds on the road (negative ahead of ours) and whether it is a
/// lap ahead (1) or down (-1) on ours.
struct RelativeRow<'a> {
    car: &'a FieldCar,
    seconds: f64,
    laps: i8,
}

/// The cars round ours on the road, `count` rows of them with ours, top to bottom as on track:
/// ours in the middle, cars ahead above and behind below, a side short of cars leaving its rows to
/// the other so the rows fill.
/// Each car's seconds are the host's (`relative_gap`, timed from where the cars were when); while
/// the host has too little history, its lap fraction against the reference lap (our best, else
/// our last, else the session's best) stands in, as the pit wall's Relative tile
/// (`relativeRows` in the app's `pitwall/timing.ts`) works it out. Empty without our car, the
/// track length, or either way to time a car.
fn relative_rows(frame: &TelemetryFrame, count: usize) -> Vec<RelativeRow<'_>> {
    let Some(track) = frame.session.track_length_meters.filter(|m| *m > 0.0) else {
        return Vec::new();
    };
    let lap = [frame.lap.best_lap_time, frame.lap.last_lap_time, frame.session.best_lap_time].into_iter().find(|t| *t > 0.0);
    if lap.is_none() && frame.field.iter().all(|car| car.relative_gap.is_none()) {
        return Vec::new();
    }
    let Some(player) = frame.field.iter().find(|car| car.is_player) else {
        return Vec::new();
    };
    let fraction = |car: &FieldCar| (car.lap_distance_meters / track).rem_euclid(1.0);
    let progress = |car: &FieldCar| car.laps_completed + fraction(car);
    let mut ahead: Vec<RelativeRow> = frame
        .field
        .iter()
        .filter(|car| !car.is_player)
        .filter_map(|car| {
            let mut gap = fraction(car) - fraction(player);
            if gap > 0.5 {
                gap -= 1.0;
            } else if gap <= -0.5 {
                gap += 1.0;
            }
            let lead = progress(car) - progress(player);
            Some(RelativeRow {
                car,
                seconds: car.relative_gap.or_else(|| lap.map(|lap| -gap * lap))?,
                laps: if lead > 0.5 {
                    1
                } else if lead < -0.5 {
                    -1
                } else {
                    0
                },
            })
        })
        .collect();
    ahead.sort_by(|a, b| a.seconds.total_cmp(&b.seconds));
    let behind = ahead.split_off(ahead.partition_point(|row| row.seconds < 0.0));
    let others = count.saturating_sub(1);
    let take_behind = behind.len().min(others - (others / 2).min(ahead.len()));
    let take_ahead = ahead.len().min(others - take_behind);
    let mut rows = ahead.split_off(ahead.len() - take_ahead);
    rows.push(RelativeRow { car: player, seconds: 0.0, laps: 0 });
    rows.extend(behind.into_iter().take(take_behind));
    rows
}

/// The cars round ours, one row each (class stripe, place, driver, `PIT` while in the pit lane,
/// seconds on the road), ours highlighted in white; a car a lap ahead in danger, a lap down muted.
/// As many rows as fit at 28 px or more (readable at arm's length), filled from the top
/// (`relative_rows`).
fn relative(b: &mut Builder, w: &WidgetContext) {
    let (width, height, p, s) = (w.width, w.height, w.palette, w.chrome.scale);
    let count = (height / 28.0).floor().max(1.0) as usize;
    let rows = relative_rows(w.frame, count);
    if rows.is_empty() {
        let size = (height * 0.4).min(20.0);
        text_line(b, fit(line("NO TIMING", (width / 2.0, height / 2.0), size, p.muted, TextAlign::Center, width * 0.9, TextWeight::Label)));
        return;
    }
    let row_h = height / count as f64;
    let size = (row_h * 0.62).min(22.0);
    let stripe = (3.0 * s).max(2.0);
    let left = stripe + 5.0 * s;
    let (place_w, gap_w, tag_w) = (size * 2.0, size * 3.0, size * 1.9);
    for (i, row) in rows.iter().enumerate() {
        let mid = i as f64 * row_h + row_h / 2.0;
        let top = mid - row_h / 2.0;
        if row.car.is_player {
            b.rect(PixelRect::new(0.0, top, width, row_h), Radii::ZERO, p.border);
        }
        if let Some(class) = class_color(&row.car.car_class) {
            b.rect(PixelRect::new(0.0, top + row_h * 0.12, stripe, row_h * 0.76), Radii::ZERO, class);
        }
        let color = match (row.car.is_player, row.laps) {
            (false, 1) => p.danger,
            (false, -1) => p.muted,
            _ => p.foreground,
        };
        let place = if row.car.place > 0.0 { format!("P{}", js_number_string(row.car.place)) } else { "--".to_owned() };
        text_line(b, line(&place, (left, mid), size, color, TextAlign::Start, place_w, TextWeight::Value));
        // The name runs up to the gap, or to the PIT tag before it.
        let tag_left = width - gap_w - tag_w - 4.0 * s;
        let name_right = if row.car.in_pit_lane { tag_left - 4.0 * s } else { width - gap_w - 4.0 * s };
        let name_left = left + place_w + 4.0 * s;
        text_line(b, line(&row.car.driver, (name_left, mid), size, color, TextAlign::Start, name_right - name_left, TextWeight::Label));
        if row.car.in_pit_lane {
            let tag_h = size * 0.95;
            b.rect(PixelRect::new(tag_left, mid - tag_h / 2.0, tag_w, tag_h), Radii::all(2.0 * s), p.secondary);
            text_line(b, fit(line("PIT", (tag_left + tag_w / 2.0, mid), size * 0.7, p.background, TextAlign::Center, tag_w * 0.9, TextWeight::Label)));
        }
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

/// Draws a widget's content into its content box (`WidgetContent`); an unknown type draws the
/// muted placeholder.
///
/// `flag` and `racelogic_lap_timer` are no dash widgets: only the host's built-in screens for a
/// device's purpose (a flag display, a lap timer) place them. `racelogic_lap_timer` draws nothing
/// in its cell: it is a full-canvas overlay that ignores its grid cell (`dash.rs` draws it).
pub fn widget_content(b: &mut Builder, w: &WidgetContext) {
    match w.widget.widget_type.as_str() {
        "text" => text(b, w),
        "rpm_bar" => rpm_bar(b, w),
        "gear_speed" => gear_speed(b, w),
        "input_trace" => input_trace(b, w),
        "current_lap" | "last_lap" | "best_lap" | "session_best" | "class_best" | "predictive_lap" | "optimal_lap" | "lap_avg_5" | "lap_avg_10"
        | "all_time_best" => lap_value(b, w),
        "delta" => delta(b, w),
        "bar" => bar(b, w),
        "tyre" | "tyre_temp" | "tyre_core_temp" | "tyre_avg" | "brake_temp" | "tyre_pressure" | "tyre_wear" | "tyre_wear_lap" | "tyre_laps_left" => tyres(b, w),
        "sectors" => sectors(b, w),
        "speed" | "laps" | "time_left" | "laps_left" | "clock" | "penalty" | "session_name" | "session_time" | "pit_loss" => metric(b, w),
        "oil_temp" | "water_temp" | "boost" | "torque" | "rpm" | "motor_temp" | "motor_water_temp" => car_value(b, w),
        "tc" | "tc2" | "tc_slip" | "abs" | "engine_map" | "migration" | "arb_front" | "arb_rear" => setting(b, w),
        "brake_bias" => brake_bias(b, w),
        "lights" => lights(b, w),
        "air_temp" | "track_temp" => conditions(b, w),
        "rain" => rain(b, w),
        "sector_time" => sector_time(b, w),
        "fuel" | "fuel_percent" | "fuel_laps" | "range" | "fuel_last_lap" | "fuel_this_lap" | "fuel_avg" | "fuel_stint_avg" | "fuel_time" | "refuel" => {
            fuel(b, w)
        }
        "fuel_ve" => fuel_ve(b, w),
        "pit_window" => pit_window_value(b, w),
        "ve_percent" | "ve_per_lap" | "ve_laps" | "ve_last_lap" | "ve_stint_avg" | "ve_refuel" | "battery" | "deploy" | "regen" => energy(b, w),
        "motor_state" => motor_state(b, w),
        "lift_coast" => lift_coast(b, w),
        "flag" => flag(b, w),
        "fuel_target" => fuel_target(b, w),
        "position" | "class_position" => position(b, w),
        "gap_ahead"
        | "gap_behind"
        | "class_gap_ahead"
        | "class_gap_behind"
        | "position_gap_ahead"
        | "position_gap_behind"
        | "gap_to_leader"
        | "gap_to_class_leader" => gap(b, w),
        "track_limits" | "incidents" | "pit_stops" => race_count(b, w),
        "racelogic_lap_timer" => {}
        "relative" => relative(b, w),
        "damage" => damage(b, w),
        _ => placeholder(b, w),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alerts::{EngineLimits, LIFT_POINT};
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
            limits: AlertLimits::default(),
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
    fn text_prefers_its_binding_then_its_content_then_its_id() {
        let mut frame = TelemetryFrame::default();
        frame.car.rpm = 7450.4;
        let settings = DashSettings { driver_name: Some("A. Driver".to_owned()), ..DashSettings::default() };
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
    fn delta_shows_no_target_without_a_target_lap_else_the_signed_delta_green_faster_red_slower() {
        let mut frame = TelemetryFrame::default();
        frame.lap.delta = 0.35;
        let none = draw(&widget("delta", json!({})), &frame, 200.0, 80.0);
        assert_eq!((texts(&none)[0].text.as_str(), texts(&none)[0].color), ("NO TARGET", P.muted));
        frame.lap.target_lap_time = 209.0;
        let shown = |frame: &TelemetryFrame| {
            let run = texts(&draw(&widget("delta", json!({})), frame, 200.0, 80.0))[0].clone();
            (run.text, run.color)
        };
        assert_eq!(shown(&frame), ("+0.350".to_owned(), P.danger));
        frame.lap.delta = -0.2;
        assert_eq!(shown(&frame), ("-0.200".to_owned(), P.timing_personal_best));
        frame.lap.delta = 0.0;
        assert_eq!(shown(&frame).1, P.neutral);
    }

    #[test]
    fn the_fuel_widgets_show_the_tank_its_share_and_laps_and_what_laps_use() {
        let mut frame = TelemetryFrame::default();
        (frame.car.fuel, frame.car.fuel_per_lap, frame.car.fuel_capacity) = (62.4, 4.6, Some(90.0));
        (frame.car.fuel_last_lap, frame.car.fuel_this_lap, frame.car.fuel_stint_per_lap) = (Some(4.62), Some(0.0), None);
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 160.0, 60.0));
        assert_eq!(shown("fuel", &frame), ["62.4", "L"], "the amount alone, no laps");
        assert_eq!(shown("fuel_percent", &frame), ["69%"]);
        assert_eq!(shown("fuel_laps", &frame), ["13.6"]);
        assert_eq!((shown("fuel_last_lap", &frame), shown("fuel_this_lap", &frame)), (vec!["4.62".to_owned()], vec!["0.00".to_owned()]));
        assert_eq!((shown("fuel_avg", &frame), shown("fuel_stint_avg", &frame)), (vec!["4.60".to_owned()], vec!["--".to_owned()]));
        frame.car.fuel_capacity = None;
        assert_eq!(shown("fuel_percent", &frame), ["--"], "no tank size, no share");
    }

    #[test]
    fn the_laps_left_warn_amber_then_red_from_the_fuel_warning() {
        let mut frame = TelemetryFrame::default();
        frame.car.fuel_per_lap = 4.0;
        let color = |t: &str, frame: &TelemetryFrame| texts(&draw(&widget(t, json!({})), frame, 160.0, 60.0))[0].color;
        frame.car.fuel = 40.0;
        assert_eq!((color("fuel_laps", &frame), color("fuel", &frame)), (P.foreground, P.foreground));
        frame.car.fuel = 16.0;
        assert_eq!((color("fuel_laps", &frame), color("fuel", &frame)), (P.warning, P.warning), "within twice the 2-lap warning");
        frame.car.fuel = 8.0;
        assert_eq!(color("fuel_laps", &frame), P.critical);
        (frame.energy.virtual_energy, frame.energy.virtual_energy_per_lap) = (14.0, 4.0);
        assert_eq!((color("ve_laps", &frame), color("ve_percent", &frame)), (P.warning, P.warning));
    }

    #[test]
    fn range_counts_the_laps_until_the_fuel_or_the_energy_runs_out_and_says_which() {
        let mut frame = TelemetryFrame::default();
        let title = |frame: &TelemetryFrame| match widget_chrome(&widget("range", json!({})), frame, &P, Units::Metric, LIFT_POINT) {
            WidgetChrome::Framed { title, .. } => title,
            other => panic!("{other:?}"),
        };
        let shown = |frame: &TelemetryFrame| text_of(&draw(&widget("range", json!({})), frame, 160.0, 60.0))[0].clone();
        assert_eq!((title(&frame), shown(&frame).as_str()), ("RANGE", "--"));
        (frame.car.fuel, frame.car.fuel_per_lap) = (40.0, 4.0);
        assert_eq!((title(&frame), shown(&frame).as_str()), ("RANGE FUEL", "10.0"));
        (frame.energy.virtual_energy, frame.energy.virtual_energy_per_lap) = (0.3, 0.04);
        assert_eq!((title(&frame), shown(&frame).as_str()), ("RANGE VE", "7.5"), "the energy runs out first, on its 0-1 scale");
    }

    #[test]
    fn refuel_splits_over_the_stops_the_strategy_still_plans() {
        let mut frame = TelemetryFrame::default();
        frame.session.max_laps = 10.0;
        frame.lap.current_lap = 1.0;
        (frame.car.fuel, frame.car.fuel_per_lap) = (10.0, 4.0);
        (frame.energy.virtual_energy, frame.energy.virtual_energy_per_lap) = (50.0, 9.0);
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 200.0, 60.0));
        assert_eq!(shown("refuel", &frame), ["+30.0", "L"]);
        assert_eq!(shown("ve_refuel", &frame), ["+40", "%"]);
        (frame.penalties.scheduled_pit_stops, frame.penalties.pit_stops) = (3.0, 1.0);
        assert_eq!(shown("refuel", &frame), ["+15.0", "L ×2"], "two stops still planned");
        assert_eq!(shown("ve_refuel", &frame), ["+20", "% ×2"]);
        frame.car.fuel = 45.0;
        assert_eq!(shown("refuel", &frame), ["0.0", "L"], "the tank already reaches the flag");
    }

    #[test]
    fn the_pit_window_opens_when_one_full_refill_reaches_the_flag() {
        let mut frame = TelemetryFrame::default();
        assert_eq!(pit_window(&frame), None);
        // Lap 3 of 30, just started: 28 laps to go. A 90 L tank lasts 22.5 laps at 4 L.
        (frame.session.max_laps, frame.lap.current_lap) = (30.0, 3.0);
        (frame.car.fuel, frame.car.fuel_per_lap, frame.car.fuel_capacity) = (60.0, 4.0, Some(90.0));
        assert_eq!(pit_window(&frame), Some(PitWindow::FromLap(8.0)), "28 - 22.5 laps from the 2 done: end of lap 8");
        // Counting virtual energy too: 100 % lasts 20 laps at 5 %, so the window waits for it.
        (frame.energy.virtual_energy, frame.energy.virtual_energy_per_lap) = (70.0, 5.0);
        assert_eq!(pit_window(&frame), Some(PitWindow::FromLap(10.0)));
        frame.lap.current_lap = 12.0;
        assert_eq!(pit_window(&frame), Some(PitWindow::Open));
        assert_eq!(text_of(&draw(&widget("pit_window", json!({})), &frame, 160.0, 60.0)), ["OPEN"]);
        (frame.car.fuel, frame.energy.virtual_energy) = (90.0, 100.0);
        frame.lap.current_lap = 20.0;
        assert_eq!(pit_window(&frame), Some(PitWindow::NoStop));
    }

    #[test]
    fn the_energy_widgets_read_the_hosts_figures_and_the_motor() {
        let mut frame = TelemetryFrame::default();
        (frame.energy.virtual_energy, frame.energy.virtual_energy_per_lap) = (0.612, 0.044);
        (frame.energy.ve_last_lap, frame.energy.ve_stint_per_lap) = (Some(0.046), None);
        (frame.energy.soc, frame.energy.deploy_power, frame.energy.regen_power) = (0.625, 92.5, 0.0);
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 160.0, 60.0));
        assert_eq!(shown("ve_percent", &frame), ["61.2", "%"], "a 0-1 scale reads as percent");
        assert_eq!(
            (shown("ve_per_lap", &frame), shown("ve_last_lap", &frame)),
            (vec!["4.4".to_owned(), "%".to_owned()], vec!["4.6".to_owned(), "%".to_owned()])
        );
        assert_eq!(shown("ve_stint_avg", &frame), ["--", "%"]);
        assert_eq!(shown("ve_laps", &frame), ["13.9"]);
        assert_eq!(shown("battery", &frame), ["63", "%"], "the charge alone");
        assert_eq!(shown("deploy", &frame), ["-"], "no hybrid");
        frame.energy.motor_state = "propulsion".to_owned();
        assert_eq!((shown("deploy", &frame), shown("regen", &frame)), (vec!["92".to_owned(), "kW".to_owned()], vec!["0".to_owned(), "kW".to_owned()]));
        assert_eq!(shown("motor_state", &frame), ["DEPLOY"]);
        let fill = |frame: &TelemetryFrame| match widget_chrome(&widget("motor_state", json!({})), frame, &P, Units::Metric, LIFT_POINT) {
            WidgetChrome::Framed { fill, .. } => fill,
            other => panic!("{other:?}"),
        };
        assert_eq!(fill(&frame), Some(P.success), "deploying lights the motor");
        frame.energy.motor_state = "regeneration".to_owned();
        assert_eq!((shown("motor_state", &frame)[0].as_str(), fill(&frame)), ("REGEN", Some(P.accent)));
        frame.energy.motor_state = "inactive".to_owned();
        assert_eq!((shown("motor_state", &frame)[0].as_str(), fill(&frame)), ("IDLE", None));
    }

    #[test]
    fn lift_and_coast_fills_towards_the_lift_point_then_lights() {
        let mut frame = TelemetryFrame::default();
        frame.energy.lift_and_coast = 110.0;
        let ops = draw(&widget("lift_coast", json!({})), &frame, 160.0, 60.0);
        let lit = rects(&ops).iter().filter(|(_, color)| *color == P.warning).count();
        assert_eq!((rects(&ops).len(), lit), (10, 5), "half way to 220");
        let lit_at = |point: f64| widget_chrome(&widget("lift_coast", json!({})), &frame, &P, Units::Metric, point);
        assert!(matches!(lit_at(100.0), WidgetChrome::Framed { fill: Some(_), .. }), "above the driver's own lift point");
        assert!(matches!(lit_at(110.0), WidgetChrome::Framed { fill: None, .. }), "above it, not at it");
        frame.energy.lift_and_coast = 221.0;
        assert_eq!(text_of(&draw(&widget("lift_coast", json!({})), &frame, 160.0, 60.0)), ["LIFT"]);
        assert!(matches!(widget_chrome(&widget("lift_coast", json!({})), &frame, &P, Units::Metric, LIFT_POINT), WidgetChrome::Framed { fill: Some(_), .. }));
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

        let core = text_of(&draw(&widget("tyre_core_temp", json!({})), &frame, 300.0, 200.0));
        assert_eq!((core[0].as_str(), core[1].as_str()), ("FL CORE", "61°"));

        frame.tires[2].pressure_kpa = 168.04;
        let pressure = text_of(&draw(&widget("tyre_pressure", json!({})), &frame, 300.0, 200.0));
        assert_eq!(pressure, ["FL KPA", "--", "FR KPA", "--", "RL KPA", "168.0", "RR KPA", "--"]);
    }

    #[test]
    fn imperial_prints_every_speed_temperature_pressure_and_fuel_in_its_units() {
        let imperial = DashSettings { units: Units::Imperial, ..DashSettings::default() };
        let shown = |w: &str, frame: &TelemetryFrame, targets: Option<&DashTargets>| {
            text_of(&draw_with(&widget(w, json!({})), frame, 400.0, 200.0, targets, Some(&imperial)))
        };
        let mut frame = TelemetryFrame::default();
        frame.car.speed_ms = 50.0;
        (frame.car.fuel, frame.car.fuel_per_lap) = (62.4, 4.6);
        (frame.car.oil_temp, frame.conditions.air_temp, frame.conditions.track_temp) = (Some(106.2), Some(22.4), Some(31.8));
        frame.tires[0].temp_surface = 85.0;
        frame.tires[0].pressure_kpa = 172.0;

        assert_eq!(shown("speed", &frame, None), ["112"]);
        assert_eq!(widget_chrome(&widget("speed", json!({})), &frame, &P, Units::Imperial, LIFT_POINT), framed("MPH"));
        assert_eq!(widget_chrome(&widget("speed", json!({})), &frame, &P, Units::Metric, LIFT_POINT), framed("KM/H"));
        assert_eq!(shown("gear_speed", &frame, None)[1..], ["112", "mph"]);
        assert_eq!(shown("fuel", &frame, None), ["16.5", "gal"]);
        assert_eq!(shown("fuel_avg", &frame, None), ["1.22"]);
        let targets = DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(4.42) };
        assert_eq!(shown("fuel_target", &frame, Some(&targets)), ["1.17", "gal/lap"]);
        assert_eq!(shown("oil_temp", &frame, None), ["223°"]);
        assert_eq!((shown("air_temp", &frame, None), shown("track_temp", &frame, None)), (vec!["72°".to_owned()], vec!["89°".to_owned()]));
        assert_eq!(shown("tyre_temp", &frame, None)[..2], ["FL", "185°"]);
        assert_eq!(shown("tyre_pressure", &frame, None)[..2], ["FL PSI", "24.9"]);
    }

    #[test]
    fn tyre_temperature_falls_back_to_the_tread_sensors() {
        let tire = TireState { temp_inner: 90.0, temp_middle: 0.0, temp_outer: 80.0, ..TireState::default() };
        assert_eq!(tyre_temperature(&tire), 85.0);
        assert_eq!(tyre_temperature(&TireState { temp_surface: 92.0, ..tire }), 92.0);
    }

    #[test]
    fn the_tyre_shows_its_stripes_wear_pressure_temperature_and_brake_in_their_colours() {
        let mut frame = TelemetryFrame::default();
        frame.tires[1] = TireState {
            temp_outer: 70.0,
            temp_middle: 90.0,
            temp_inner: 112.0,
            temp_surface: 91.0,
            optimal_temp: 90.0,
            pressure_kpa: 176.04,
            wear_percent: 58.4,
            brake_temp: 702.0,
            ..TireState::default()
        };
        let tyre = widget("tyre", json!({ "corner": "fr" }));
        let ops = draw(&tyre, &frame, 200.0, 120.0);
        let runs = texts(&ops);
        let shown: Vec<(&str, Rgba)> = runs.iter().map(|r| (r.text.as_str(), r.color)).collect();
        assert_eq!(shown, [("58%", P.warning), ("176.0", P.foreground), ("91°", P.good_on_target), ("702°", P.warning)]);
        // A right tyre's stripes sit on the right, outer first from the car's outside.
        let stripes: Vec<(f64, Rgba)> = rects(&ops).iter().take(3).map(|(rect, color)| (rect.left, *color)).collect();
        assert!(stripes[0].0 > stripes[2].0, "outer stripe rightmost: {stripes:?}");
        assert_eq!(stripes.iter().map(|s| s.1).collect::<Vec<_>>(), [P.cold_low, P.good_on_target, P.critical]);
        assert_eq!(widget_chrome(&tyre, &frame, &P, Units::Metric, LIFT_POINT), framed("FR"));

        frame.tires[1].flat = true;
        let flat = draw(&tyre, &frame, 200.0, 120.0);
        assert_eq!((texts(&flat)[0].text.as_str(), texts(&flat)[0].color), ("FLAT", P.critical));
        assert!(rects(&flat).iter().take(3).all(|(_, color)| *color == P.critical), "a flat tyre's stripes are red");
    }

    #[test]
    fn every_tyre_widget_shows_a_flat_or_detached_tyre_in_red() {
        let mut frame = TelemetryFrame::default();
        for tire in &mut frame.tires {
            (tire.temp_surface, tire.wear_percent, tire.wear_last_lap) = (90.0, 80.0, Some(2.0));
        }
        frame.tires[0].flat = true;
        frame.tires[3].detached = true;
        for t in ["tyre_temp", "tyre_core_temp", "tyre_avg", "brake_temp", "tyre_pressure", "tyre_wear_lap"] {
            let ops = draw(&widget(t, json!({})), &frame, 300.0, 200.0);
            let values: Vec<String> = text_of(&ops).into_iter().skip(1).step_by(2).collect();
            assert_eq!((values[0].as_str(), values[3].as_str()), ("FLAT", "OFF"), "{t}");
            assert_eq!(rects(&ops).first().map(|r| r.1), Some(P.critical), "{t}: the corner is red");
        }
        let wear = texts(&draw(&widget("tyre_wear", json!({})), &frame, 200.0, 120.0)).iter().map(|r| (r.text.clone(), r.color)).collect::<Vec<_>>();
        assert_eq!((wear[0].clone(), wear[3].clone()), (("FLAT".to_owned(), P.critical), ("OFF".to_owned(), P.critical)));
        assert_eq!(text_of(&draw(&widget("tyre_laps_left", json!({})), &frame, 160.0, 60.0)), ["FLAT"]);
    }

    #[test]
    fn the_four_corner_tyre_widgets_read_the_core_last_laps_average_the_brakes_and_the_wear_per_lap() {
        let mut frame = TelemetryFrame::default();
        for (i, tire) in frame.tires.iter_mut().enumerate() {
            let n = i as f64;
            (tire.temp_core, tire.avg_temp_last_lap, tire.optimal_temp) = (80.0 + n, Some(95.0 + n * 5.0), 90.0);
            (tire.brake_temp, tire.wear_percent, tire.wear_last_lap) = (600.0 + n * 100.0, 90.0 - n * 10.0, Some(0.5 + n * 0.25));
        }
        let corners = |t: &str| text_of(&draw(&widget(t, json!({})), &frame, 300.0, 200.0));
        assert_eq!(corners("tyre_core_temp"), ["FL CORE", "80°", "FR CORE", "81°", "RL CORE", "82°", "RR CORE", "83°"]);
        assert_eq!(corners("tyre_avg")[1..4], ["95°", "FR AVG", "100°"]);
        assert_eq!(corners("tyre_wear_lap")[..2], ["FL WEAR/LAP", "0.50%"]);
        let brakes = draw(&widget("brake_temp", json!({})), &frame, 300.0, 200.0);
        assert_eq!(text_of(&brakes)[..4], ["FL BRAKE", "600°", "FR BRAKE", "700°"]);
        assert_eq!(rects(&brakes).iter().map(|r| r.1).collect::<Vec<_>>(), [P.warning, P.warning, P.critical], "lit over 650°, red over 800°");
        let avg = draw(&widget("tyre_avg", json!({})), &frame, 300.0, 200.0);
        assert_eq!(rects(&avg).iter().map(|r| r.1).collect::<Vec<_>>(), [P.good_on_target, P.good_on_target, P.warning, P.warning]);
        // Laps left: the rear right lasts 60 / 1.25 = 48 laps, the fewest.
        assert_eq!(text_of(&draw(&widget("tyre_laps_left", json!({})), &frame, 160.0, 60.0)), ["48.0"]);
        frame.tires.iter_mut().for_each(|t| t.wear_last_lap = None);
        assert_eq!(text_of(&draw(&widget("tyre_laps_left", json!({})), &frame, 160.0, 60.0)), ["--"]);
    }

    fn draw_limits(widget: &DashWidget, frame: &TelemetryFrame, limits: EngineLimits) -> Vec<DrawOp> {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let ctx = WidgetContext {
            widget,
            frame,
            palette: &DEFAULT_DASH_PALETTE,
            width: 160.0,
            height: 60.0,
            targets: None,
            settings: None,
            chrome: ChromeContext { style: DashStyle::Panels, scale: 1.0, flat: Default::default() },
            limits: AlertLimits { engine: limits, ..AlertLimits::default() },
        };
        widget_content(&mut Builder::new(&fonts, &mut ops), &ctx);
        ops
    }

    #[test]
    fn oil_and_water_warn_amber_then_red_against_the_drivers_limits_and_red_when_overheating() {
        let mut frame = TelemetryFrame::default();
        let limits = EngineLimits { water: 100.0, oil: 130.0 };
        let color = |t: &str, frame: &TelemetryFrame| texts(&draw_limits(&widget(t, json!({})), frame, limits))[0].color;
        (frame.car.water_temp, frame.car.oil_temp) = (Some(89.0), Some(119.0));
        assert_eq!((color("water_temp", &frame), color("oil_temp", &frame)), (P.foreground, P.foreground));
        (frame.car.water_temp, frame.car.oil_temp) = (Some(90.0), Some(130.0));
        assert_eq!((color("water_temp", &frame), color("oil_temp", &frame)), (P.warning, P.critical), "amber from 10° under, red at the limit");
        frame.car.water_temp = Some(70.0);
        frame.damage = Some(Damage { overheating: true, ..Damage::default() });
        assert_eq!(color("water_temp", &frame), P.critical, "the game says it overheats");
        frame.car.oil_temp = None;
        assert_eq!(text_of(&draw_limits(&widget("oil_temp", json!({})), &frame, limits)), ["--"]);
    }

    #[test]
    fn the_engine_and_hybrid_readings_show_a_dash_where_the_car_has_none() {
        let mut frame = TelemetryFrame::default();
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 160.0, 60.0));
        assert_eq!((shown("boost", &frame), shown("torque", &frame)), (vec!["-".to_owned()], vec!["--".to_owned()]));
        assert_eq!((shown("motor_temp", &frame), shown("motor_water_temp", &frame)), (vec!["-".to_owned()], vec!["-".to_owned()]), "no hybrid");
        (frame.car.turbo_boost, frame.car.engine_torque, frame.car.rpm) = (Some(1.375), Some(-42.7), 7450.4);
        (frame.energy.motor_state, frame.energy.motor_temp) = ("inactive".to_owned(), Some(64.2));
        assert_eq!(shown("boost", &frame), ["1.38"], "the game's raw number");
        assert_eq!(shown("torque", &frame), ["-42", "Nm"]);
        assert_eq!(shown("rpm", &frame), ["7450"]);
        assert_eq!((shown("motor_temp", &frame), shown("motor_water_temp", &frame)), (vec!["64°".to_owned()], vec!["--".to_owned()]));
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
    fn a_setting_shows_its_whole_step_dash_without_one_and_off_at_zero_for_the_assists() {
        let mut frame = TelemetryFrame::default();
        let e = &mut frame.electronics;
        (e.tc, e.tc_max, e.tc_cut, e.tc_cut_max, e.tc_slip, e.tc_slip_max) = (4.9, 9.0, 0.0, 9.0, 3.0, 0.0);
        (e.abs, e.abs_max, e.motor_map, e.motor_map_max, e.migration, e.migration_max) = (0.0, 9.0, 0.0, 9.0, 2.0, 5.0);
        (e.front_anti_roll_bar, e.front_anti_roll_bar_max, e.rear_anti_roll_bar, e.rear_anti_roll_bar_max) = (3.0, 6.0, 4.0, 0.0);
        frame.car.brake_bias_rear = 0.462;
        let value = |t: &str| text_of(&draw(&widget(t, json!({})), &frame, 100.0, 60.0))[0].clone();
        assert_eq!(value("tc"), "4");
        assert_eq!((value("tc2"), value("abs")), ("OFF".to_owned(), "OFF".to_owned()), "an assist at 0 is off");
        assert_eq!(value("tc_slip"), "-", "the car has no TC slip");
        assert_eq!(value("engine_map"), "0", "only the assists turn off");
        assert_eq!((value("migration"), value("arb_front"), value("arb_rear")), ("2".to_owned(), "3".to_owned(), "-".to_owned()));
        assert_eq!(value("brake_bias"), "53.8");
    }

    #[test]
    fn each_setting_wears_its_colour_and_tc_and_abs_light_up_while_working() {
        let mut frame = TelemetryFrame::default();
        let chrome = |t: &str, frame: &TelemetryFrame| match widget_chrome(&widget(t, json!({})), frame, &P, Units::Metric, LIFT_POINT) {
            WidgetChrome::Framed { title, accent, fill } => (title, accent, fill),
            other => panic!("{other:?}"),
        };
        assert_eq!(chrome("tc2", &frame), ("TC 2", Some(P.setting_tc), None));
        assert_eq!(chrome("tc_slip", &frame), ("TC SLIP", Some(P.setting_tc), None));
        assert_eq!(chrome("migration", &frame), ("MIGRATION", Some(P.setting_migration), None));
        assert_eq!(chrome("arb_rear", &frame).1, Some(P.setting_arb));
        assert_eq!(chrome("abs", &frame), ("ABS", Some(P.setting_abs), None));
        frame.electronics.abs_active = true;
        assert_eq!(chrome("abs", &frame).2, Some(P.setting_abs), "ABS working fills its frame");
        assert_eq!(chrome("tc", &frame).2, None);
        frame.electronics.tc_active = true;
        assert_eq!(chrome("tc", &frame).2, Some(P.setting_tc));
    }

    #[test]
    fn the_lights_show_the_headlights_and_the_wipers_or_a_dash_when_unknown() {
        let mut frame = TelemetryFrame::default();
        assert_eq!(text_of(&draw(&widget("lights", json!({})), &frame, 160.0, 60.0)), ["HEAD", "-", "WIPERS", "-"]);
        (frame.car.headlights, frame.car.wiper_state) = (Some(true), Some(0.0));
        let ops = draw(&widget("lights", json!({})), &frame, 160.0, 60.0);
        assert_eq!(text_of(&ops), ["HEAD", "ON", "WIPERS", "OFF"]);
        assert_eq!((texts(&ops)[1].color, texts(&ops)[3].color), (P.neutral, P.muted));
        frame.car.wiper_state = Some(2.0);
        assert_eq!(text_of(&draw(&widget("lights", json!({})), &frame, 160.0, 60.0))[3], "2");
    }

    #[test]
    fn position_fuel_target_and_gaps_print_their_race_values() {
        let mut frame = TelemetryFrame::default();
        frame.race.position = 4.0;
        frame.race.total_positions = 38.0;
        frame.race.gap_ahead = 2.41;
        frame.race.gap_to_leader = Some(83.46);
        assert_eq!(text_of(&draw(&widget("position", json!({})), &frame, 160.0, 80.0)), ["P4", "/38"]);
        assert_eq!(text_of(&draw(&widget("position", json!({})), &TelemetryFrame::default(), 160.0, 80.0)), ["P--"]);
        let entry = |class: &str, place: f64, is_player: bool| FieldCar { car_class: class.to_owned(), class_place: place, is_player, ..FieldCar::default() };
        frame.field = vec![entry("LMP2", 2.0, true), entry("Hyper", 1.0, false), entry("LMP2", 1.0, false), entry("LMP2", 3.0, false)];
        assert_eq!(text_of(&draw(&widget("class_position", json!({})), &frame, 160.0, 80.0)), ["P2", "/3"]);

        let targets = DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(4.42) };
        let fuel_target = |targets, frame: &TelemetryFrame| {
            texts(&draw_with(&widget("fuel_target", json!({})), frame, 160.0, 80.0, targets, None))
                .iter()
                .map(|r| (r.text.clone(), r.color))
                .collect::<Vec<_>>()
        };
        assert_eq!(fuel_target(Some(&targets), &frame), [("4.42".to_owned(), P.foreground), ("L/lap".to_owned(), P.secondary)]);
        assert_eq!(fuel_target(None, &frame)[0].0, "--");
        frame.car.fuel_last_lap = Some(4.40);
        assert_eq!(fuel_target(Some(&targets), &frame)[0].1, P.success, "the last lap kept to it");
        frame.car.fuel_last_lap = Some(4.5);
        assert_eq!(fuel_target(Some(&targets), &frame)[0].1, P.critical);

        let shown = |t: &str| text_of(&draw(&widget(t, json!({})), &frame, 240.0, 100.0));
        assert_eq!((shown("gap_ahead"), shown("gap_behind")), (vec!["2.410".to_owned()], vec!["--".to_owned()]));
        assert_eq!((shown("gap_to_leader"), shown("class_gap_ahead")), (vec!["1:23.5".to_owned()], vec!["--".to_owned()]));
    }

    #[test]
    fn track_limits_count_to_the_next_penalty_and_pit_stops_against_the_plan() {
        let mut frame = TelemetryFrame::default();
        let run = |t: &str, frame: &TelemetryFrame| {
            let run = texts(&draw(&widget(t, json!({})), frame, 160.0, 60.0))[0].clone();
            (run.text, run.color)
        };
        frame.penalties.track_limit_steps = 1.0;
        assert_eq!(run("track_limits", &frame), ("1".to_owned(), P.foreground), "no penalty step known");
        frame.penalties.track_limit_steps_per_penalty = 4.0;
        assert_eq!(run("track_limits", &frame), ("1/4".to_owned(), P.foreground));
        frame.penalties.track_limit_steps = 2.0;
        assert_eq!(run("track_limits", &frame), ("2/4".to_owned(), P.race_control_yellow));
        frame.penalties.track_limit_steps = 7.0;
        assert_eq!(run("track_limits", &frame), ("3/4".to_owned(), P.critical), "one step short of the second penalty");
        frame.penalties.pit_stops = 1.0;
        assert_eq!(run("pit_stops", &frame).0, "1");
        frame.penalties.scheduled_pit_stops = 2.0;
        assert_eq!(run("pit_stops", &frame).0, "1/2");
        frame.penalties.incidents = 3.0;
        assert_eq!(run("incidents", &frame).0, "3");
    }

    #[test]
    fn the_predicted_lap_is_the_target_plus_the_delta_and_the_optimal_lap_the_best_sectors() {
        let mut frame = TelemetryFrame::default();
        (frame.lap.target_lap_time, frame.lap.delta) = (209.0, -0.412);
        assert_eq!(text_of(&draw(&widget("predictive_lap", json!({})), &frame, 200.0, 80.0)), ["3:28.588"]);
        frame.lap.personal_best_sectors = vec![Some(67.9), Some(71.3), None];
        assert_eq!(text_of(&draw(&widget("optimal_lap", json!({})), &frame, 200.0, 80.0)), ["--:--.---"], "not until each sector has a best");
        frame.lap.personal_best_sectors[2] = Some(69.8);
        assert_eq!(text_of(&draw(&widget("optimal_lap", json!({})), &frame, 200.0, 80.0)), ["3:29.000"]);
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
    fn a_lap_that_does_not_count_shows_dashes_in_dark_grey() {
        let mut frame = TelemetryFrame::default();
        (frame.lap.current_lap_time, frame.lap.last_lap_time) = (92.345, 210.117);
        let run = |t: &str, frame: &TelemetryFrame| {
            let run = texts(&draw(&widget(t, json!({})), frame, 300.0, 100.0))[0].clone();
            (run.text, run.color)
        };
        assert_eq!(run("current_lap", &frame), ("1:32.345".to_owned(), P.neutral));
        frame.lap.is_valid = false;
        assert_eq!(run("current_lap", &frame), ("-:--.---".to_owned(), P.muted));
        frame.lap.last_lap_valid = false;
        assert_eq!(run("last_lap", &frame), ("-:--.---".to_owned(), P.muted));
    }

    #[test]
    fn the_last_lap_is_purple_at_the_fastest_green_at_the_drivers_best_and_bests_wear_their_colours() {
        let mut frame = TelemetryFrame::default();
        (frame.lap.last_lap_time, frame.lap.best_lap_time) = (208.44, 208.44);
        (frame.lap.session_best_lap, frame.lap.class_best_lap) = (Some(207.12), Some(208.44));
        let color = |t: &str, frame: &TelemetryFrame| texts(&draw(&widget(t, json!({})), frame, 300.0, 100.0))[0].color;
        assert_eq!(color("last_lap", &frame), P.timing_fastest_overall, "the class's best, not the faster class's");
        frame.lap.class_best_lap = Some(207.9);
        assert_eq!(color("last_lap", &frame), P.timing_personal_best);
        frame.lap.last_lap_time = 210.117;
        assert_eq!(color("last_lap", &frame), P.neutral);
        assert_eq!(color("best_lap", &frame), P.timing_personal_best);
        assert_eq!((color("session_best", &frame), color("class_best", &frame)), (P.timing_fastest_overall, P.timing_fastest_overall));
        assert_eq!(text_of(&draw(&widget("session_best", json!({})), &frame, 300.0, 100.0)), ["3:27.120"]);
    }

    #[test]
    fn the_sectors_sit_side_by_side_when_three_rows_would_be_too_small_to_read() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap_sectors_seconds = vec![67.9, 71.95];
        let ops = draw(&widget("sectors", json!({})), &frame, 160.0, 34.0);
        assert_eq!(text_of(&ops), ["67.900", "71.950", "--"], "no names, the order says which");
        let runs = texts(&ops);
        assert!(runs[0].baseline == runs[1].baseline && runs[0].x < runs[1].x && runs[1].x < runs[2].x, "one row, in order");
        assert!(runs[0].size > 12.0, "larger than three rows would allow (10.8): {}", runs[0].size);
    }

    #[test]
    fn the_sectors_list_their_times_one_under_another_in_their_colours() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap_sectors_seconds = vec![67.9, 71.95];
        frame.lap.personal_best_sectors = vec![Some(68.0), Some(71.3), Some(69.8)];
        frame.lap.class_best_sectors = vec![Some(67.9), Some(71.1), Some(69.6)];
        let ops = draw(&widget("sectors", json!({})), &frame, 160.0, 90.0);
        assert_eq!(text_of(&ops), ["S1", "67.900", "S2", "71.950", "S3", "--"]);
        let runs = texts(&ops);
        assert_eq!((runs[1].color, runs[3].color, runs[5].color), (P.timing_fastest_overall, P.race_control_yellow, P.muted));
        assert!(rects(&ops).is_empty(), "coloured text, no coloured background");
        assert!(runs[0].baseline < runs[2].baseline && runs[2].baseline < runs[4].baseline, "one under another");
    }

    #[test]
    fn time_left_drops_the_hour_under_one_and_race_laps_left_mark_an_estimate() {
        let mut frame = TelemetryFrame::default();
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 160.0, 60.0))[0].clone();
        assert_eq!(shown("time_left", &frame), "--");
        frame.session.session_time_remaining = Some(3480.0);
        assert_eq!(shown("time_left", &frame), "58:00");
        frame.session.session_time_remaining = Some(17_880.0);
        assert_eq!(shown("time_left", &frame), "4:58:00");
        frame.lap.last_lap_time = 100.0;
        assert_eq!(shown("laps_left", &frame), "~179.0");
        (frame.session.max_laps, frame.lap.current_lap) = (24.0, 7.0);
        assert_eq!(shown("laps_left", &frame), "18.0");
    }

    #[test]
    fn the_weather_widgets_show_air_track_and_how_wet_it_is() {
        let mut frame = TelemetryFrame::default();
        (frame.conditions.air_temp, frame.conditions.raining, frame.conditions.path_wetness) = (Some(21.6), Some(0.4), Some(0.62));
        let shown = |t: &str| text_of(&draw(&widget(t, json!({})), &frame, 160.0, 60.0));
        assert_eq!((shown("air_temp"), shown("track_temp")), (vec!["22°".to_owned()], vec!["--".to_owned()]));
        assert_eq!(shown("rain"), ["40%", "WET 62%"]);
    }

    #[test]
    fn the_lap_counts_against_a_fixed_race_or_an_estimated_one() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap = 14.0;
        let shown = |frame: &TelemetryFrame| text_of(&draw(&widget("laps", json!({})), frame, 160.0, 60.0))[0].clone();
        assert_eq!(shown(&frame), "14", "nothing to count against");
        frame.session.max_laps = 30.0;
        assert_eq!(shown(&frame), "14/30");
        (frame.session.max_laps, frame.session.session_time_remaining, frame.lap.last_lap_time, frame.lap.track_position) = (0.0, Some(2800.0), 100.0, 0.5);
        // 28 laps of time from half into lap 14: the clock runs out half into the 28th lap from
        // here, which is finished, so the race runs 14 - 1 + 0.5 + 28 = 41.5, about 42 laps.
        assert_eq!(shown(&frame), "14/~42");
    }

    #[test]
    fn the_session_widgets_name_it_count_its_time_and_say_what_a_stop_costs() {
        let mut frame = TelemetryFrame::default();
        let shown = |t: &str, frame: &TelemetryFrame| text_of(&draw(&widget(t, json!({})), frame, 160.0, 60.0))[0].clone();
        assert_eq!((shown("session_name", &frame), shown("pit_loss", &frame)), ("-".to_owned(), "--".to_owned()));
        frame.session.session_type = "qualify".to_owned();
        (frame.session.session_time, frame.lap.pit_loss) = (3480.0, Some(24.34));
        assert_eq!(
            (shown("session_name", &frame), shown("session_time", &frame), shown("pit_loss", &frame)),
            ("QUALIFYING".to_owned(), "58:00".to_owned(), "24.3".to_owned())
        );
        frame.session.session_time = 3725.0;
        assert_eq!(shown("session_time", &frame), "1:02:05");
        frame.lap.last_five_laps_average = Some(208.9);
        assert_eq!(shown("lap_avg_5", &frame), "3:28.900");
        assert_eq!(shown("lap_avg_10", &frame), "--:--.---");
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
    /// must draw exactly those (plus the `ers` alias and the two the host's purpose screens place),
    /// or the editor offers a widget the wheel shows as a placeholder, or the wheel draws one
    /// nobody can add.
    #[test]
    fn the_editor_offers_exactly_the_widget_types_this_renderer_draws() {
        let offered = quoted_between(include_str!("../../src/widgetTypes.ts"), '\'', "export const dashboardWidgetTypes = [", "] as const");
        let mut drawn = quoted_between(include_str!("widgets.rs"), '"', "pub fn widget_content(", "_ => placeholder(b, w)");
        assert!(drawn.remove("flag") && drawn.remove("racelogic_lap_timer"), "the flag display's and the lap timer's (DevicePurposeLayouts.cs)");
        assert_eq!(offered, drawn);
    }

    #[test]
    fn condition_fills_follow_the_frame() {
        let mut frame = TelemetryFrame::default();
        frame.energy.soc = 0.04;
        let fill = |w: &str, frame: &TelemetryFrame| match widget_chrome(&widget(w, json!({})), frame, &DEFAULT_DASH_PALETTE, Units::Metric, LIFT_POINT) {
            WidgetChrome::Framed { fill, .. } => fill,
            other => panic!("{other:?}"),
        };
        assert_eq!(fill("battery", &frame), Some(DEFAULT_DASH_PALETTE.critical));
        frame.lap.target_lap_time = 90.0;
        frame.lap.delta = -0.2;
        assert_eq!(fill("delta", &frame), None, "the delta colours its value, not its frame");
        assert_eq!(widget_chrome(&widget("tyre_temp", json!({})), &frame, &DEFAULT_DASH_PALETTE, Units::Metric, LIFT_POINT), WidgetChrome::Split);
        assert_eq!(widget_chrome(&widget("gear_speed", json!({})), &frame, &DEFAULT_DASH_PALETTE, Units::Metric, LIFT_POINT), WidgetChrome::Bare);
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
            relative_gap: None,
            car_class: "Hyper".to_owned(),
            class_place: place,
            in_pit_lane: false,
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
        assert_eq!(runs.iter().find(|r| r.text == "Me").map(|r| r.color), Some(P.foreground));
        assert_eq!(runs.iter().find(|r| r.text == "Lapped").map(|r| r.color), Some(P.muted));
        let bands: Vec<(PixelRect, Rgba)> = rects(&ops);
        assert!(bands.iter().any(|(rect, color)| *color == P.border && rect.width == 300.0), "our row is highlighted");
        let stripes = bands.iter().filter(|(_, color)| Some(*color) == class_color("Hyper")).count();
        assert_eq!(stripes, 5, "a class stripe on every row");

        frame.session.track_length_meters = None;
        assert_eq!(text_of(&draw(&widget("relative", json!({})), &frame, 300.0, 140.0)), ["NO TIMING"]);
    }

    #[test]
    fn the_relative_shows_the_hosts_time_gaps_where_it_has_them() {
        let mut frame = TelemetryFrame::default();
        frame.session.track_length_meters = Some(1000.0);
        // No reference lap: only a car the host has timed can be placed.
        frame.field = vec![car("Me", 3.0, 5.0, 50.0), FieldCar { relative_gap: Some(-1.4), ..car("Ahead", 2.0, 5.0, 120.0) }, car("Untimed", 4.0, 5.0, 10.0)];
        let ops = draw(&widget("relative", json!({})), &frame, 300.0, 140.0);
        let text = text_of(&ops);
        let gaps: Vec<&String> = text.iter().filter(|t| t.starts_with('+') || t.starts_with('-')).collect();
        assert_eq!(gaps, ["-1.4"]);
        assert!(!text.contains(&"Untimed".to_owned()));
    }

    #[test]
    fn the_relative_fills_its_rows_from_the_side_with_more_cars() {
        let mut frame = TelemetryFrame::default();
        frame.session.track_length_meters = Some(1000.0);
        frame.lap.best_lap_time = 100.0;
        // One car ahead, five behind.
        frame.field = vec![car("Me", 3.0, 5.0, 500.0), car("A1", 2.0, 5.0, 520.0)];
        for i in 1..=5 {
            frame.field.push(car(&format!("B{i}"), 3.0 + i as f64, 5.0, 500.0 - i as f64 * 10.0));
        }
        // 140 px holds five rows: the one ahead, ours, and three behind fill them.
        let runs = texts(&draw(&widget("relative", json!({})), &frame, 300.0, 140.0)).into_iter().cloned().collect::<Vec<_>>();
        let drivers: Vec<&str> = runs.iter().map(|r| r.text.as_str()).filter(|t| t.starts_with('A') || t.starts_with('B') || *t == "Me").collect();
        assert_eq!(drivers, ["A1", "Me", "B1", "B2", "B3"]);
        let first = runs.iter().find(|r| r.text == "A1").expect("the car ahead");
        assert!(first.baseline < 28.0, "the top row is the first: {}", first.baseline);
    }

    fn bar_colors(channel: &str, frame: &TelemetryFrame, width: f64, height: f64) -> Vec<Rgba> {
        rects(&draw(&widget("bar", json!({ "channel": channel })), frame, width, height)).into_iter().map(|(_, color)| color).collect()
    }

    #[test]
    fn the_sector_bar_is_three_segments_in_the_sectors_colours() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap_sectors_seconds = vec![67.9, 71.95];
        frame.lap.personal_best_sectors = vec![Some(68.0), Some(71.3), Some(69.8)];
        frame.lap.class_best_sectors = vec![Some(67.9), Some(71.1), Some(69.6)];
        let colors = bar_colors("sectors", &frame, 30.0, 400.0);
        assert_eq!(colors, [P.timing_fastest_overall, P.race_control_yellow, tint(P.neutral)]);
        let ops = draw(&widget("bar", json!({ "channel": "sectors" })), &frame, 30.0, 400.0);
        assert!(rects(&ops)[0].0.top > rects(&ops)[2].0.top, "the first sector at the bottom");
    }

    #[test]
    fn the_input_bars_fill_in_their_own_colours_and_the_class_gaps_grow_from_the_middle() {
        let mut frame = TelemetryFrame::default();
        (frame.car.throttle, frame.car.brake, frame.car.clutch) = (0.5, 0.25, 1.0);
        let lit = |channel: &str, color: Rgba| bar_colors(channel, &frame, 30.0, 400.0).iter().filter(|c| **c == color).count();
        assert_eq!((lit("throttle", P.success), lit("brake", P.danger), lit("clutch", P.accent)), (10, 5, 20));
        (frame.race.class_gap_ahead, frame.race.class_gap_behind) = (Some(1.0), None);
        let gaps = bar_colors("class_gap", &frame, 400.0, 30.0);
        assert_eq!(gaps[10..15], [P.success; 5], "a second ahead lights half the upper side");
        assert_eq!(gaps[..10], [tint(P.warning); 10], "no class car behind");
    }

    #[test]
    fn the_linear_map_puts_every_car_on_the_line_in_its_class_colour_with_ours_on_top() {
        let mut frame = TelemetryFrame {
            field: vec![car("Me", 3.0, 5.0, 250.0), FieldCar { car_class: "GT3".to_owned(), ..car("Other", 4.0, 5.0, 750.0) }],
            ..TelemetryFrame::default()
        };
        let line_only = draw(&widget("bar", json!({ "channel": "linear_map" })), &frame, 30.0, 400.0);
        assert!(ovals(&line_only).is_empty(), "no track length, no cars");
        frame.session.track_length_meters = Some(1000.0);
        let ops = draw(&widget("bar", json!({ "channel": "linear_map" })), &frame, 30.0, 400.0);
        let dots = ovals(&ops);
        let centre = |rect: PixelRect| rect.top + rect.height / 2.0;
        assert_eq!(dots[0].1, class_color("GT3").expect("GT3"));
        assert_eq!(dots.last().map(|d| d.1), Some(P.foreground), "ours drawn last");
        assert!(centre(dots[0].0) < centre(dots[2].0), "three quarters round is above a quarter round: the start is at the bottom");
        let lying = ovals(&draw(&widget("bar", json!({ "channel": "linear_map" })), &frame, 400.0, 30.0));
        assert!(lying[0].0.left > lying[2].0.left, "lying down it runs left to right");
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
    fn the_relative_tags_a_car_in_the_pit_lane() {
        let mut frame = TelemetryFrame::default();
        frame.session.track_length_meters = Some(1000.0);
        frame.lap.best_lap_time = 100.0;
        frame.field = vec![car("Me", 3.0, 5.0, 50.0), FieldCar { in_pit_lane: true, ..car("Pitting", 2.0, 5.0, 120.0) }];
        let text = text_of(&draw(&widget("relative", json!({})), &frame, 300.0, 140.0));
        assert!(text.contains(&"PIT".to_owned()), "{text:?}");
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
