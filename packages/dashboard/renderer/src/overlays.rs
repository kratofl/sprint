// What draws over the widgets, each over the whole canvas and independent of the grid: the
// RaceLogic lap timer island, the alert banners (an alert popup full screen, as a strip across
// the middle or centered in its alert rect, the lap review and the multi-dial popup) and the flag
// bar. Ported from `AlertBanner`, `FullScreenSettingPopup` and
// `RaceLogicLapTimerOverlay` in the retired React renderer's `DashRenderer.tsx`, and
// `MultiDialPopup` in its `multiDial.tsx` (the lap review is the renderer's own); `dash.rs`
// decides which of them draw, in what order.
//
// The DOM positions an absolutely positioned child against its parent's padding box, so inside a
// box with a border every child sits the border width further in. The TypeScript lays children
// out from the box's full width anyway; that offset is reproduced, not corrected.

use crate::alerts::{AlertPlacement, AlertSize, DashAlertBanner, DashAlertPopup, DashRadioBanner, FlagBar};
use crate::chrome::{ChromeContext, WidgetFrame, widget_frame};
use crate::draw::{Builder, Radii};
use crate::format::{Units, format_delta, format_lap, format_speed, js_number_string, to_fixed};
use crate::grid::{AlertSpan, PixelRect, alert_panel_rect, race_logic_panel_bounds};
use crate::lap_summary::{LapReview, LapReviewField, LapSummary};
use crate::model::TelemetryFrame;
use crate::multi_dial::DashMultiDialPopup;
use crate::palette::{CssForm, DashPaletteColors, Rgba};
use crate::primitives::{TextAlign, TextLine, TextSizing, ValueWithUnit, dot, text_line, value_size, value_with_unit};
use crate::racelogic::RaceLogicLapTimerView;
use crate::text::TextWeight;
use crate::widgets::{sector_color, value_unit_size};

/// A CSS border width as Blink lays it out: a visible border is at least 1px, and anything wider
/// is floored to whole px (`1.888px` paints and offsets the children as 1px).
fn border_width(width: f64) -> f64 {
    if width <= 0.0 {
        0.0
    } else if width < 1.0 {
        1.0
    } else {
        width.floor()
    }
}

/// The flag bar: a thin band in the flag's colour across the very top of the dash, no lettering
/// (its popup named the flag). Thin enough to sit above a zoned dash's top bar, so the shift
/// lights stay in view for as long as the flag is out.
pub fn flag_bar(b: &mut Builder, bar: FlagBar, width: f64, height: f64) {
    let bar_height = (FLAG_BAR_PX * (width / 800.0).min(height / 480.0)).max(3.0);
    b.rect(PixelRect::new(0.0, 0.0, width, bar_height), Radii::ZERO, bar.color);
}

/// The flag bar's height at the 800x480 the dash is authored at; it scales with the screen.
const FLAG_BAR_PX: f64 = 8.0;

/// A strip is a band this share of the dash tall, across its middle.
const STRIP_SHARE: f64 = 1.0 / 3.0;

/// The shortest strip that still reads on a wheel: its smallest line (the detail, 15% of the
/// band) stays at least 15 px and its title 34 px. A strip on a dash under 300 px tall would be
/// shorter, so there the alert shows full screen instead. Logical px: an editor preview drawn
/// smaller than its panel can fall back where the panel itself shows the strip.
pub const STRIP_MIN_HEIGHT: f64 = 100.0;

/// Whether a strip reads on a dash `height` tall (else the alert is drawn full screen).
pub fn strip_fits(height: f64) -> bool {
    height * STRIP_SHARE >= STRIP_MIN_HEIGHT
}

/// `AlertBanner`: the lap review (laid out by the layout's `review`), an alert popup (full
/// screen, a strip, or centered in its alert rect), the multi-dial popup (full screen or a strip)
/// or the engineer's message. The lap review prints its fuel in `units`.
#[allow(clippy::too_many_arguments)]
pub fn alert_banner(
    b: &mut Builder,
    banner: &DashAlertBanner,
    review: &LapReview,
    palette: &DashPaletteColors,
    chrome: ChromeContext,
    units: Units,
    width: f64,
    height: f64,
) {
    match banner {
        DashAlertBanner::LapSummary(summary) => lap_review_screen(b, summary, review, palette, chrome, units, width, height),
        DashAlertBanner::Alert(popup) => {
            let text = PopupText { title: &popup.title, value: &popup.value, detail: popup.detail.as_deref() };
            // The alert's colour lettered in the background colour; inverted, dark lettered and
            // edged in its colour.
            let look = if popup.invert_colors {
                PopupLook { fill: palette.background, ink: popup.color, edge: Some(popup.color) }
            } else {
                PopupLook { fill: popup.color, ink: palette.background, edge: None }
            };
            match popup.placement {
                AlertPlacement::Center(span) => centered_alert_popup(b, popup, span, palette, width, height),
                AlertPlacement::Strip if strip_fits(height) => strip_popup(b, &text, look, palette.background, width, height),
                _ => full_screen_popup(b, &text, look, width, height),
            }
        }
        // The dial's own sense of inverted: plain is lettered and edged in the position's colour.
        DashAlertBanner::MultiDial(popup) if popup.size == AlertSize::Strip && strip_fits(height) => {
            let look = if popup.inverted {
                PopupLook { fill: popup.color, ink: palette.background, edge: None }
            } else {
                PopupLook { fill: palette.background, ink: popup.color, edge: Some(popup.color) }
            };
            strip_popup(b, &PopupText { title: &popup.caption, value: &popup.label, detail: None }, look, palette.background, width, height);
        }
        DashAlertBanner::MultiDial(popup) => multi_dial_popup(b, popup, palette.background, width, height),
        DashAlertBanner::Radio(radio) => radio_banner(b, radio, palette, width, height),
    }
}

/// A popup's lines: a small title and detail on the left, the value big on the right.
struct PopupText<'a> {
    title: &'a str,
    value: &'a str,
    detail: Option<&'a str>,
}

/// A popup's colours: its fill, its lettering, and the edge an inverted one wears.
#[derive(Clone, Copy)]
struct PopupLook {
    fill: Rgba,
    ink: Rgba,
    edge: Option<Rgba>,
}

/// The type scale of a popup's lines, as shares of its box's height.
struct PopupType {
    title_size: f64,
    /// The title's centre line over a detail, and alone.
    title_top: f64,
    title_top_alone: f64,
    detail_size: f64,
    detail_top: f64,
    value_size: f64,
}

const FULL_TYPE: PopupType = PopupType { title_size: 0.27, title_top: 0.46, title_top_alone: 0.5, detail_size: 0.05, detail_top: 0.66, value_size: 0.78 };

/// The strip's box is short, so its title and detail take a bigger share of it to stay readable.
const STRIP_TYPE: PopupType = PopupType { title_size: 0.34, title_top: 0.36, title_top_alone: 0.5, detail_size: 0.15, detail_top: 0.74, value_size: 0.8 };

/// The title and detail from the left pad, the value up to 55% of the width ending at the right
/// pad, its size from its length (at least 2 characters), so the driver reads which alert it is
/// before the number. A long value (a word: "OVERHEAT") comes out smaller, so the title stays
/// under 70% of the value's size and ends a pad short of where the value is estimated to start:
/// the title never outgrows or runs into the value. Laid out in a `width` x `height` box.
fn popup_lines(b: &mut Builder, text: &PopupText, ink: Rgba, width: f64, height: f64, pad: f64, scale: &PopupType) {
    let value_width = width * 0.55;
    let value_chars = text.value.encode_utf16().count().max(2) as f64;
    let value_size = (height * scale.value_size).min(value_width / (value_chars * 0.56));
    let title_width = (width - value_chars * value_size * 0.56 - pad * 3.0).min(width - value_width - pad * 2.0);
    let title_top = if text.detail.is_some() { scale.title_top } else { scale.title_top_alone };
    let line = TextLine {
        text: text.title,
        left: pad,
        top: height * title_top,
        size: (height * scale.title_size).min(value_size * 0.7),
        color: ink,
        align: TextAlign::Start,
        max_width: Some(title_width),
        weight: TextWeight::Value,
        sizing: TextSizing::Fit,
    };
    text_line(b, line);
    if let Some(detail) = text.detail {
        text_line(b, TextLine { text: detail, top: height * scale.detail_top, size: height * scale.detail_size, weight: TextWeight::LabelBold, ..line });
    }
    text_line(
        b,
        TextLine {
            text: text.value,
            left: width - pad,
            top: height / 2.0,
            size: value_size,
            align: TextAlign::End,
            max_width: Some(value_width),
            sizing: TextSizing::Stable,
            ..line
        },
    );
}

/// A popup as a band a third of the dash tall across its middle (`STRIP_SHARE`), the dash still
/// showing above and below. A plain band is set off from the widgets by a background-coloured
/// rule on each side, so it never merges with a fill of its own colour; an inverted one is
/// dark between two rules in its colour.
fn strip_popup(b: &mut Builder, text: &PopupText, look: PopupLook, background: Rgba, width: f64, height: f64) {
    let band_height = height * STRIP_SHARE;
    let top = (height - band_height) / 2.0;
    let rule = border_width((band_height * 0.03).max(2.0));
    let band = PixelRect::new(0.0, top, width, band_height);
    match look.edge {
        Some(edge) => {
            b.rect(band, Radii::ZERO, look.fill);
            b.rect(PixelRect::new(0.0, top, width, rule), Radii::ZERO, edge);
            b.rect(PixelRect::new(0.0, top + band_height - rule, width, rule), Radii::ZERO, edge);
        }
        None => {
            b.rect(PixelRect::new(0.0, top - rule, width, band_height + rule * 2.0), Radii::ZERO, background);
            b.rect(band, Radii::ZERO, look.fill);
        }
    }
    let pad = width.min(height) * 0.055;
    b.translated(0.0, top, |b| popup_lines(b, text, look.ink, width, band_height, pad, &STRIP_TYPE));
}

/// The engineer's message: the whole dash in the accent colour, "ENGINEER" small and the message
/// big in the background colour, both centered, so it reads at a glance and never looks like a flag.
fn radio_banner(b: &mut Builder, radio: &DashRadioBanner, palette: &DashPaletteColors, width: f64, height: f64) {
    b.rect(PixelRect::new(0.0, 0.0, width, height), Radii::ZERO, palette.accent);
    let caption = TextLine {
        text: "ENGINEER",
        left: width / 2.0,
        top: height * 0.28,
        size: height * 0.1,
        color: palette.background,
        align: TextAlign::Center,
        max_width: Some(width * 0.9),
        weight: TextWeight::LabelBold,
        sizing: TextSizing::Fit,
    };
    text_line(b, caption);
    let message = radio.text.to_uppercase();
    text_line(b, TextLine { text: &message, top: height * 0.56, size: height * 0.26, max_width: Some(width * 0.92), ..caption });
}

/// `MultiDialPopup`: the whole dash in the dash's background with the dial's caption small and
/// the position's name big in the position's colour, both centered; inverted, a colour fill
/// lettered in the background colour.
fn multi_dial_popup(b: &mut Builder, popup: &DashMultiDialPopup, background: Rgba, width: f64, height: f64) {
    let (fill, ink) = if popup.inverted { (popup.color, background) } else { (background, popup.color) };
    b.rect(PixelRect::new(0.0, 0.0, width, height), Radii::ZERO, fill);
    let caption = TextLine {
        text: &popup.caption,
        left: width / 2.0,
        top: height * 0.3,
        size: height * 0.1,
        color: ink,
        align: TextAlign::Center,
        max_width: Some(width * 0.9),
        weight: TextWeight::LabelBold,
        sizing: TextSizing::Fit,
    };
    text_line(b, caption);
    text_line(b, TextLine { text: &popup.label, top: height * 0.58, size: height * 0.4, max_width: Some(width * 0.92), ..caption });
}

/// The centered popup's fill when it is not inverted: `rgba(8, 8, 10, 0.965)`.
const POPUP_FILL: Rgba = Rgba { r: 8, g: 8, b: 10, a: 246, form: CssForm::Function };

/// An alert in its own grid rect (older per-dash layouts): its title over its value, on a
/// near-black panel edged in its color (or on the color, inverted). No detail line: the panel
/// is too small for one.
fn centered_alert_popup(b: &mut Builder, banner: &DashAlertPopup, span: AlertSpan, palette: &DashPaletteColors, width: f64, height: f64) {
    let panel = alert_panel_rect(width, height, span);
    if panel.width < 4.0 || panel.height < 4.0 {
        return;
    }
    let radius = (panel.width.min(panel.height) * 0.06).max(8.0);
    let inverted = banner.invert_colors;
    let fill = if inverted { banner.color } else { POPUP_FILL };
    let edge = if inverted { palette.background } else { banner.color };
    let value_color = if inverted { palette.background } else { palette.foreground };
    let border = border_width((panel.height * 0.008).max(1.5));
    b.rect(panel, Radii::all(radius), fill);
    b.border(panel, border, radius, edge);
    b.translated(panel.left + border, panel.top + border, |b| {
        text_line(
            b,
            TextLine {
                text: &banner.title,
                left: panel.width / 2.0,
                top: panel.height * 0.25,
                size: panel.height * 0.13,
                color: edge,
                align: TextAlign::Center,
                max_width: Some(panel.width * 0.86),
                weight: TextWeight::LabelBold,
                sizing: TextSizing::Fit,
            },
        );
        text_line(
            b,
            TextLine {
                text: &banner.value,
                left: panel.width / 2.0,
                top: panel.height * 0.64,
                size: panel.height * 0.52,
                color: value_color,
                align: TextAlign::Center,
                max_width: Some(panel.width * 0.84),
                weight: TextWeight::Value,
                sizing: TextSizing::Stable,
            },
        );
    });
}

/// A popup filling the whole dash with the alert's color: its title and detail on the left, the
/// value huge on the right. Inverted, it turns dark with the color on the text and an edge in
/// the color, which moves the lines in by its width.
fn full_screen_popup(b: &mut Builder, text: &PopupText, look: PopupLook, width: f64, height: f64) {
    let canvas = PixelRect::new(0.0, 0.0, width, height);
    b.rect(canvas, Radii::ZERO, look.fill);
    let border = match look.edge {
        Some(edge) => {
            let border = border_width((height * 0.01).max(2.0));
            b.border(canvas, border, 0.0, edge);
            border
        }
        None => 0.0,
    };
    let pad = width.min(height) * 0.055;
    b.translated(border, border, |b| popup_lines(b, text, look.ink, width, height, pad, &FULL_TYPE));
}

/// The share of the screen's height the lap review's top row takes (the lap time and the delta to
/// the best); the six cells share the rest in two rows of three. The designer lays its boxes over
/// the cells by `LAP_REVIEW_TOP_SHARE` in lapReview.ts; a test checks the two match.
const REVIEW_TOP_SHARE: f64 = 0.56;

/// The widest value a review cell shows ("2:04.912", a best lap): every cell's value is sized from
/// it, so the six read as one table.
const REVIEW_CELL_TEMPLATE: &str = "0:00.000";

/// One lap review cell: its title, its value with a unit after it, the value's colour (`None`:
/// the frame's foreground, ink on a fill), a condition fill and a second value that shares the
/// cell with the first, side by side (fuel and virtual energy used).
#[derive(Clone, Debug, PartialEq)]
struct ReviewCell {
    title: &'static str,
    value: String,
    unit: String,
    color: Option<Rgba>,
    fill: Option<Rgba>,
    beside: Option<(String, String, Option<Rgba>)>,
}

impl ReviewCell {
    fn new(title: &'static str, value: String, unit: String, color: Option<Rgba>) -> ReviewCell {
        ReviewCell { title, value, unit, color, fill: None, beside: None }
    }

    /// A value the lap did not report: "--", quiet.
    fn missing(title: &'static str, palette: &DashPaletteColors) -> ReviewCell {
        ReviewCell::new(title, "--".to_owned(), String::new(), Some(palette.muted))
    }
}

/// What `field` shows for `summary`, or `None` for an empty cell. Sectors fill in their timing
/// colour like a timing screen (yellow for slower); elsewhere only the value is coloured: the plan
/// met (green), fuel over its target (warning), a new best lap or sector (green), a tyre wearing
/// out (warning, then critical), an invalid lap (the quiet grey the timing widgets give it). A
/// time is never coloured just for being slower.
fn review_cell(field: LapReviewField, summary: &LapSummary, palette: &DashPaletteColors, units: Units) -> Option<ReviewCell> {
    use LapReviewField as F;
    let of = |total: Option<f64>| total.map_or_else(String::new, |total| format!("/{}", js_number_string(total)));
    let cell = match field {
        F::Empty => return None,
        F::Sector1 | F::Sector2 | F::Sector3 => {
            let (index, title) = match field {
                F::Sector1 => (0, "SECTOR 1"),
                F::Sector2 => (1, "SECTOR 2"),
                _ => (2, "SECTOR 3"),
            };
            match summary.sectors[index] {
                Some(sector) => {
                    ReviewCell { fill: sector_color(sector.rating, palette), ..ReviewCell::new(title, to_fixed(sector.seconds, 3), String::new(), None) }
                }
                None => ReviewCell::missing(title, palette),
            }
        }
        F::Sector1Delta | F::Sector2Delta | F::Sector3Delta => {
            let (index, title) = match field {
                F::Sector1Delta => (0, "SECTOR 1 Δ"),
                F::Sector2Delta => (1, "SECTOR 2 Δ"),
                _ => (2, "SECTOR 3 Δ"),
            };
            match summary.sectors[index].and_then(|sector| sector.delta) {
                Some(delta) => ReviewCell::new(title, format_delta(delta, 3), String::new(), (delta < 0.0).then_some(palette.timing_personal_best)),
                None => ReviewCell::missing(title, palette),
            }
        }
        F::Validity if summary.valid => ReviewCell::new("VALIDITY", "VALID".to_owned(), String::new(), None),
        F::Validity => ReviewCell::new("VALIDITY", "INVALID".to_owned(), String::new(), Some(palette.muted)),
        F::TopSpeed => match summary.top_speed {
            Some(speed) => ReviewCell::new("TOP SPEED", format_speed(speed, units), units.speed_unit().to_owned(), None),
            None => ReviewCell::missing("TOP SPEED", palette),
        },
        F::Target => match summary.target_delta {
            Some(delta) => {
                let met = summary.valid && delta <= 0.0;
                ReviewCell::new("TARGET Δ", format_delta(delta, 3), String::new(), met.then_some(palette.good_on_target))
            }
            None => ReviewCell::missing("TARGET Δ", palette),
        },
        F::BestLap => match summary.best_lap {
            Some(best) => {
                let this_lap = summary.valid && best == summary.lap_time;
                ReviewCell::new("BEST LAP", format_lap(best), String::new(), this_lap.then_some(palette.timing_personal_best))
            }
            None => ReviewCell::missing("BEST LAP", palette),
        },
        F::Position => match summary.position {
            Some(position) => ReviewCell::new("POSITION", format!("P{}", js_number_string(position)), of(summary.total_positions), None),
            None => ReviewCell::missing("POSITION", palette),
        },
        F::GapAhead => match summary.gap_ahead {
            Some(gap) => ReviewCell::new("GAP AHEAD", to_fixed(gap, 3), String::new(), None),
            None => ReviewCell::missing("GAP AHEAD", palette),
        },
        F::Lap => ReviewCell::new("LAP", js_number_string(summary.lap), of(summary.total_laps), None),
        F::FuelUsed => match summary.fuel_used {
            Some(used) => ReviewCell::new("FUEL USED", to_fixed(units.fuel(used), 2), units.fuel_unit().to_owned(), fuel_color(summary, palette)),
            None => ReviewCell::missing("FUEL USED", palette),
        },
        F::FuelLeft => match summary.fuel_left_laps {
            Some(laps) => ReviewCell::new("FUEL LEFT", to_fixed(laps, 1), "LAPS".to_owned(), None),
            None => ReviewCell::missing("FUEL LEFT", palette),
        },
        F::EnergyUsed => match summary.energy_used {
            Some(used) => ReviewCell::new("VE USED", to_fixed(used, 1), "%".to_owned(), None),
            None => ReviewCell::missing("VE USED", palette),
        },
        F::EnergyLeft => match summary.energy_left_laps {
            Some(laps) => ReviewCell::new("VE LEFT", to_fixed(laps, 1), "LAPS".to_owned(), None),
            None => ReviewCell::missing("VE LEFT", palette),
        },
        // A car without virtual energy shows its fuel beside a quiet "--".
        F::FuelEnergyUsed => match (summary.fuel_used, summary.energy_used) {
            (None, None) => ReviewCell::missing("FUEL · VE USED", palette),
            (fuel, energy) => {
                let fuel = fuel.map_or_else(
                    || ("--".to_owned(), String::new(), Some(palette.muted)),
                    |used| (to_fixed(units.fuel(used), 2), units.fuel_unit().to_owned(), fuel_color(summary, palette)),
                );
                let energy = energy.map_or_else(|| ("--".to_owned(), String::new(), Some(palette.muted)), |used| (to_fixed(used, 1), "%".to_owned(), None));
                ReviewCell { beside: Some(energy), ..ReviewCell::new("FUEL · VE USED", fuel.0, fuel.1, fuel.2) }
            }
        },
        F::TyreWear => match summary.tyre_wear_left {
            // The tyre widgets' ladder: plain while healthy, then amber, then red.
            Some(left) => {
                let color = if left < 30.0 {
                    Some(palette.critical)
                } else if left < 60.0 {
                    Some(palette.warning)
                } else {
                    None
                };
                ReviewCell::new("TYRE WEAR", js_number_string(left.round()), "%".to_owned(), color)
            }
            None => ReviewCell::missing("TYRE WEAR", palette),
        },
    };
    Some(cell)
}

/// The fuel a lap used against the plan's target: over it warns, on it is green, no target is plain.
fn fuel_color(summary: &LapSummary, palette: &DashPaletteColors) -> Option<Rgba> {
    summary.fuel_delta.map(|delta| if delta > 0.0 { palette.warning } else { palette.good_on_target })
}

/// The lap review, shown for a few seconds after each timed lap. The top row is fixed: the lap
/// time big, and under it the delta to the best valid lap before it (green when it is a new
/// best); an invalid lap's time and the "INVALID" standing in for its delta go the quiet grey the
/// timing widgets give invalid laps, since it never counts as a best. Below, two rows of three cells show the
/// layout's `review` fields, framed in the dash's own style so the review looks like the dash; an
/// empty cell draws nothing, and a cell with two values splits in halves.
#[allow(clippy::too_many_arguments)]
fn lap_review_screen(
    b: &mut Builder,
    summary: &LapSummary,
    review: &LapReview,
    palette: &DashPaletteColors,
    chrome: ChromeContext,
    units: Units,
    width: f64,
    height: f64,
) {
    b.rect(PixelRect::new(0.0, 0.0, width, height), Radii::ZERO, palette.background);
    let top_height = height * REVIEW_TOP_SHARE;
    let frame =
        |rect: PixelRect, title: Option<&'static str>, fill: Option<Rgba>| WidgetFrame { ctx: chrome, rect, title, accent: None, fill, palette: *palette };

    widget_frame(b, frame(PixelRect::new(0.0, 0.0, width, top_height), None, None), |b, w, h, p| {
        let time = format_lap(summary.lap_time);
        let size = value_size(REVIEW_CELL_TEMPLATE, w, h, 0.56);
        let time_top = h * 0.38;
        let line = TextLine {
            text: &time,
            left: w / 2.0,
            top: time_top,
            size,
            color: if summary.valid { p.foreground } else { p.muted },
            align: TextAlign::Center,
            max_width: Some(w),
            weight: TextWeight::Value,
            sizing: TextSizing::Stable,
        };
        text_line(b, line);
        let (value, unit, color) = match summary.lap_delta {
            _ if !summary.valid => ("INVALID".to_owned(), "", p.muted),
            Some(delta) if delta < 0.0 => (format_delta(delta, 3), "NEW BEST", p.timing_personal_best),
            Some(delta) => (format_delta(delta, 3), "VS BEST", p.foreground),
            None => ("--".to_owned(), "VS BEST", p.muted),
        };
        value_with_unit(
            b,
            ValueWithUnit {
                value: &value,
                unit,
                left: w / 2.0,
                top: h * 0.82,
                size: value_size("+0.000 VS", w, h, 0.24),
                color,
                unit_color: p.secondary,
                align: TextAlign::Center,
                max_width: w,
            },
        );
    });

    let (cell_width, cell_height) = (width / 3.0, (height - top_height) / 2.0);
    for (i, field) in review.cells.iter().enumerate() {
        let Some(cell) = review_cell(*field, summary, palette, units) else { continue };
        let rect = PixelRect::new((i % 3) as f64 * cell_width, top_height + (i / 3) as f64 * cell_height, cell_width, cell_height);
        widget_frame(b, frame(rect, Some(cell.title), cell.fill), |b, w, h, p| {
            let size = value_size(REVIEW_CELL_TEMPLATE, w, h, 0.62);
            // One value with its unit, centred at `centre` in a box `max_width` wide.
            let draw = |b: &mut Builder, (value, unit, color): (&str, &str, Option<Rgba>), centre: f64, size: f64, max_width: f64| {
                let color = color.unwrap_or(p.foreground);
                let line = ValueWithUnit { value, unit, left: centre, top: h / 2.0, size, color, unit_color: p.secondary, align: TextAlign::Center, max_width };
                value_with_unit(b, line);
            };
            let first = (cell.value.as_str(), cell.unit.as_str(), cell.color);
            match &cell.beside {
                None => draw(b, first, w / 2.0, size, w),
                // Two halves, each sized for "0.00 gal".
                Some((value, unit, color)) => {
                    let half = w / 2.0;
                    let size = value_unit_size(size, half - 6.0, 4.0, 3.0);
                    draw(b, first, half / 2.0, size, half - 6.0);
                    draw(b, (value, unit, *color), half * 1.5, size, half - 6.0);
                }
            }
        });
    }
}

/// The delta bar's track color, `rgb(60, 64, 68)`.
const DELTA_TRACK: Rgba = Rgba { r: 60, g: 64, b: 68, a: 255, form: CssForm::Function };

/// The RaceLogic-style purpose display: a fixed 4:1 island centered on the whole canvas,
/// independent of any widget's grid cell, showing what the presenter says (`view`).
pub fn race_logic_lap_timer_overlay(
    b: &mut Builder,
    view: &RaceLogicLapTimerView,
    frame: &TelemetryFrame,
    palette: &DashPaletteColors,
    units: Units,
    width: f64,
    height: f64,
) {
    let bounds = race_logic_panel_bounds(width, height);
    if bounds.width < 1.0 || bounds.height < 1.0 {
        return;
    }
    let inset = (bounds.height * 0.035).max(2.0);
    let (cw, ch) = ((bounds.width - inset * 2.0).max(0.0), (bounds.height - inset * 2.0).max(0.0));
    let speed = units.speed(frame.car.speed_ms).max(0.0);
    let (bar_left, bar_right) = (cw * 0.2, cw * 0.66);

    b.translated(bounds.left, bounds.top, |b| {
        b.translated(inset, inset, |b| {
            let line = TextLine {
                text: &view.primary,
                left: cw * 0.43,
                top: ch * 0.48,
                size: ch * 0.42,
                color: palette.neutral,
                align: TextAlign::Center,
                max_width: Some(cw * 0.72),
                weight: TextWeight::Value,
                sizing: TextSizing::Stable,
            };
            text_line(b, line);
            if view.show_delta_bar {
                b.rect(PixelRect::new(bar_left, ch * 0.66, bar_right - bar_left, (ch * 0.012).max(1.0)), Radii::ZERO, DELTA_TRACK);
                let offset = (view.delta / 2.0).clamp(-1.0, 1.0) * (bar_right - bar_left) * 0.5;
                dot(b, cw * 0.5 + offset, ch * 0.66, (ch * 0.025).max(2.0), palette.neutral);
            }
            let right = cw - cw * 0.03;
            let speed_text = to_fixed(speed, 0);
            text_line(
                b,
                TextLine {
                    text: &speed_text,
                    left: right,
                    top: ch * 0.38,
                    size: ch * 0.18,
                    color: palette.foreground,
                    align: TextAlign::End,
                    max_width: Some(cw * 0.2),
                    ..line
                },
            );
            text_line(
                b,
                TextLine {
                    text: units.speed_unit(),
                    left: right,
                    top: ch * 0.54,
                    size: ch * 0.08,
                    color: palette.muted,
                    align: TextAlign::End,
                    max_width: Some(cw * 0.2),
                    weight: TextWeight::Label,
                    sizing: TextSizing::Fit,
                },
            );
            let footer = TextLine { top: ch * 0.82, size: ch * 0.1, ..line };
            let lap_text = format!("LAP {}", js_number_string(frame.lap.current_lap.max(1.0)));
            text_line(
                b,
                TextLine {
                    text: &lap_text,
                    left: 0.0,
                    color: palette.muted,
                    align: TextAlign::Start,
                    max_width: Some(cw * 0.23),
                    weight: TextWeight::LabelBold,
                    ..footer
                },
            );
            text_line(
                b,
                TextLine { text: &view.status, left: cw / 2.0, color: palette.secondary, max_width: Some(cw * 0.48), weight: TextWeight::Label, ..footer },
            );
            let best = format!("BEST {}", format_lap(frame.lap.best_lap_time));
            text_line(
                b,
                TextLine {
                    text: &best,
                    left: cw,
                    color: palette.muted,
                    align: TextAlign::End,
                    max_width: Some(cw * 0.29),
                    weight: TextWeight::Label,
                    ..footer
                },
            );
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alerts::parse_banner;
    use crate::dash::{Overlays, build_display_list};
    use crate::draw::{DrawOp, TextRun};
    use crate::model::{Scene, parse_scene};
    use crate::palette::{DEFAULT_DASH_PALETTE, dash_setting_colors};
    use crate::racelogic::RaceLogicLapTimerMode;
    use crate::text::Fonts;
    use serde_json::json;

    const P: DashPaletteColors = DEFAULT_DASH_PALETTE;

    #[test]
    fn the_designer_lays_its_lap_review_boxes_where_the_cells_are() {
        let source = include_str!("../../src/lapReview.ts");
        let start = "export const LAP_REVIEW_TOP_SHARE = ";
        let from = source.find(start).expect("LAP_REVIEW_TOP_SHARE in lapReview.ts") + start.len();
        let value: f64 = source[from..].lines().next().and_then(|line| line.trim().parse().ok()).expect("a number");
        assert_eq!(value, REVIEW_TOP_SHARE);
    }

    fn scene(layout_id: &str) -> Scene {
        let layout = json!({ "id": layout_id, "name": "L", "gridCols": 20, "gridRows": 12, "pages": [{ "id": "p", "name": "P", "widgets": [] }] });
        parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene")
    }

    fn draw(scene: &Scene, frame: &TelemetryFrame, overlays: Overlays) -> Vec<DrawOp> {
        let mut ops = Vec::new();
        build_display_list(&Fonts::new(), scene, frame, overlays, &mut ops).expect("drawable");
        ops
    }

    fn banner_ops(banner: serde_json::Value) -> Vec<DrawOp> {
        banner_ops_at(banner, 800.0, 480.0)
    }

    /// What a still draws: `banner`, and the flag bar of the flag out (`alerts::flag_bar`).
    fn draw_still(scene: &Scene, frame: &TelemetryFrame, banner: Option<&DashAlertBanner>) -> Vec<DrawOp> {
        let flag_bar = crate::alerts::flag_bar(&scene.layout, frame, &P);
        draw(scene, frame, Overlays { banner, flag_bar, ..Overlays::default() })
    }

    fn banner_ops_at(banner: serde_json::Value, width: f64, height: f64) -> Vec<DrawOp> {
        let banner = parse_banner(banner.to_string().as_bytes()).expect("banner");
        let mut scene = scene("l");
        (scene.width, scene.height) = (width, height);
        draw(&scene, &TelemetryFrame::default(), Overlays { banner: Some(&banner), ..Overlays::default() })
    }

    fn runs(ops: &[DrawOp]) -> Vec<&TextRun> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) => Some(run),
                _ => None,
            })
            .collect()
    }

    fn run<'o>(ops: &'o [DrawOp], text: &str) -> &'o TextRun {
        let all = runs(ops);
        let names: Vec<String> = all.iter().map(|r| r.text.clone()).collect();
        all.into_iter().find(|r| r.text == text).unwrap_or_else(|| panic!("no run {text:?} in {names:?}"))
    }

    fn setting(full_screen: bool, invert: bool) -> serde_json::Value {
        let mut popup = alert(if full_screen { "full" } else { "center" }, invert);
        (popup["col"], popup["row"], popup["colSpan"], popup["rowSpan"], popup["gridCols"], popup["gridRows"]) =
            (json!(6), json!(3), json!(8), json!(6), json!(20), json!(12));
        popup
    }

    /// A TC change popup in `display_mode`.
    fn alert(display_mode: &str, invert: bool) -> serde_json::Value {
        json!({ "kind": "alert", "alertType": "tc_change", "title": "TC", "value": "5", "detail": "WAS 4", "color": "#1A7CFF",
                "invertColors": invert, "displayMode": display_mode })
    }

    #[test]
    fn a_strip_is_a_band_a_third_of_the_dash_across_its_middle_set_off_by_background_rules() {
        let ops = banner_ops(alert("strip", false));
        // 480 / 3 = 160 tall at 160; a 4.8 -> 4px rule each side in the background colour.
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 156.0, 800.0, 168.0), radii: Radii::ZERO, color: P.background });
        assert_eq!(ops[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let (title, detail, value) = (run(&ops, "TC"), run(&ops, "WAS 4"), run(&ops, "5"));
        assert!([title.color, detail.color, value.color].iter().all(|c| *c == P.background));
        assert_eq!((title.weight, detail.weight, value.weight), (TextWeight::Value, TextWeight::LabelBold, TextWeight::Value));
        assert_eq!((title.size, detail.size, value.size), (160.0 * 0.34, 160.0 * 0.15, 160.0 * 0.8));
        assert!((title.x - 26.4).abs() < 1e-9, "from the dash's pad");
        assert!((value.x + value.width(&Fonts::new()) - (800.0 - 26.4)).abs() < 1e-6, "the value ends at the right pad");
        assert!(value.baseline > 160.0 && value.baseline < 320.0, "inside the band");
    }

    #[test]
    fn an_inverted_strip_is_dark_between_two_rules_in_the_alerts_colour() {
        let ops = banner_ops(alert("strip", true));
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: P.background });
        assert_eq!(ops[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 4.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        assert_eq!(ops[3], DrawOp::Rect { rect: PixelRect::new(0.0, 316.0, 800.0, 4.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        assert_eq!((run(&ops, "TC").color, run(&ops, "5").color), (dash_setting_colors::TC, dash_setting_colors::TC));
    }

    #[test]
    fn a_strip_too_short_to_read_is_drawn_full_screen() {
        // 300 px tall makes a 100 px band, the least that reads; 299 px does not.
        let fits = banner_ops_at(alert("strip", false), 480.0, 300.0);
        assert_eq!(fits[2], DrawOp::Rect { rect: PixelRect::new(0.0, 100.0, 480.0, 100.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let small = banner_ops_at(alert("strip", false), 480.0, 272.0);
        assert_eq!(small, banner_ops_at(alert("full", false), 480.0, 272.0));
        assert_eq!(small[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 480.0, 272.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
    }

    #[test]
    fn a_popup_without_a_detail_centres_its_title() {
        let mut limiter = alert("full", false);
        (limiter["title"], limiter["value"], limiter["detail"]) = (json!("PIT LIMITER"), json!("ON"), json!(null));
        let ops = banner_ops(limiter);
        let title = run(&ops, "PIT LIMITER");
        let line_top = 240.0 - title.size / 2.0;
        assert!(title.baseline > line_top && title.baseline < line_top + title.size, "on the dash's centre line");
        assert_eq!(runs(&ops).len(), 2, "title and value only");
    }

    #[test]
    fn a_long_word_value_keeps_the_title_smaller_and_clear_of_it() {
        let mut engine = alert("full", false);
        (engine["title"], engine["value"]) = (json!("ENGINE"), json!("OVERHEAT"));
        let ops = banner_ops(engine);
        let (title, value) = (run(&ops, "ENGINE"), run(&ops, "OVERHEAT"));
        assert!(title.size < value.size, "{} vs {}", title.size, value.size);
        assert!(title.x + title.width(&Fonts::new()) + 20.0 < value.x, "a gap between them");
    }

    #[test]
    fn the_flag_alert_stands_in_for_the_flag_bar_while_it_is_up() {
        let mut frame = TelemetryFrame::default();
        frame.flags.yellow = true;
        let mut flag = alert("strip", false);
        (flag["alertType"], flag["title"], flag["value"], flag["detail"], flag["color"]) =
            (json!("flag"), json!("FLAG"), json!("YELLOW"), json!(null), json!("#FFCC00"));
        let flag = parse_banner(flag.to_string().as_bytes()).expect("flag");
        let ops = draw_still(&scene("l"), &frame, Some(&flag));
        let bar = DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 8.0), radii: Radii::ZERO, color: P.race_control_yellow };
        assert!(!ops.contains(&bar), "no second account of the flag");
        run(&ops, "YELLOW");
        let tc = parse_banner(alert("strip", false).to_string().as_bytes()).expect("tc");
        assert_eq!(draw_still(&scene("l"), &frame, Some(&tc)).last(), Some(&bar), "over another popup");
    }

    #[test]
    fn a_dial_strip_is_lettered_in_the_positions_colour_unless_inverted() {
        let mut strip = dial(false);
        strip["displayMode"] = json!("strip");
        let ops = banner_ops(strip.clone());
        let colour = Rgba::hex("#FFCC00");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: P.background });
        assert_eq!((run(&ops, "MULTI").color, run(&ops, "TC2").color), (colour, colour));
        strip["inverted"] = json!(true);
        let inverted = banner_ops(strip);
        assert_eq!(inverted[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: colour });
        assert_eq!(run(&inverted, "TC2").color, P.background);
    }

    #[test]
    fn the_flag_bar_is_a_thin_band_across_the_top_in_the_highest_flags_colour() {
        let mut frame = TelemetryFrame::default();
        (frame.flags.yellow, frame.flags.safety_car) = (true, true);
        let band = |color: Rgba, width: f64, height: f64| DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, width, height), radii: Radii::ZERO, color };
        assert_eq!(draw_still(&scene("l"), &frame, None)[1..], [band(P.race_control_yellow, 800.0, 8.0)], "nothing else: no tint, no lettering");

        frame.flags.red = true;
        let mut big = scene("l");
        (big.width, big.height) = (1600.0, 960.0);
        assert_eq!(draw_still(&big, &frame, None)[1..], [band(P.critical, 1600.0, 16.0)], "it scales with the screen");
        assert_eq!(draw_still(&scene("purpose-lap-times"), &frame, None).len(), 1, "never on the focused lap timer screen");
        assert_eq!(draw_still(&scene("l"), &TelemetryFrame::default(), None).len(), 1, "no flag, no bar");
    }

    #[test]
    fn a_full_screen_setting_fills_the_canvas_in_its_color_with_ink_text() {
        let ops = banner_ops(setting(true, false));
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let (title, was, value) = (run(&ops, "TC"), run(&ops, "WAS 4"), run(&ops, "5"));
        assert!([title.color, was.color, value.color].iter().all(|c| *c == P.background));
        assert_eq!((title.weight, was.weight), (TextWeight::Value, TextWeight::LabelBold));
        assert!((title.x - 26.4).abs() < 1e-9);
        assert!((value.x + value.width(&Fonts::new()) - (800.0 - 26.4)).abs() < 1e-6, "the value ends at the right pad");
        assert_eq!(value.size, (480.0f64 * 0.78).min(440.0 / (2.0 * 0.56)));
    }

    #[test]
    fn an_inverted_full_screen_setting_turns_dark_with_a_snapped_edge_that_moves_its_children_in() {
        let ops = banner_ops(setting(true, true));
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        // max(2, 4.8) paints as a 4px border, and the children sit inside it.
        assert!(matches!(ops[2], DrawOp::Border { width: 4.0, radius: 0.0, color, .. } if color == dash_setting_colors::TC));
        let title = run(&ops, "TC");
        assert!((title.x - (26.4 + 4.0)).abs() < 0.02);
        assert_eq!(title.color, dash_setting_colors::TC);
    }

    #[test]
    fn a_centered_setting_sits_in_its_alert_rect_on_a_near_black_panel_edged_in_its_color() {
        let ops = banner_ops(setting(false, false));
        // Grid edges 240..560 x 120..360, inset 2px; the 1.888px border paints as 1px.
        let panel = PixelRect::new(242.0, 122.0, 316.0, 236.0);
        assert!(matches!(ops[1], DrawOp::Rect { rect, color, .. } if rect == panel && color == POPUP_FILL));
        assert!(matches!(ops[2], DrawOp::Border { rect, width: 1.0, color, .. } if rect == panel && color == dash_setting_colors::TC));
        let (title, value) = (run(&ops, "TC"), run(&ops, "5"));
        assert_eq!((title.color, value.color), (dash_setting_colors::TC, P.foreground));
        assert!((value.x + value.width(&Fonts::new()) / 2.0 - (243.0 + 158.0)).abs() < 1e-6, "centered on the panel's width, inside its border");

        let inverted = banner_ops(setting(false, true));
        assert!(matches!(inverted[1], DrawOp::Rect { color, .. } if color == dash_setting_colors::TC));
        assert_eq!((run(&inverted, "TC").color, run(&inverted, "5").color), (P.background, P.background));

        let mut tiny = setting(false, false);
        (tiny["colSpan"], tiny["rowSpan"]) = (json!(0), json!(0));
        assert_eq!(banner_ops(tiny).len(), 1, "a panel under 4px draws nothing");
    }

    fn dial(inverted: bool) -> serde_json::Value {
        json!({ "kind": "multiDial", "caption": "MULTI", "label": "TC2", "color": "#FFCC00", "inverted": inverted })
    }

    #[test]
    fn the_multi_dial_popup_names_the_position_big_under_its_caption_in_the_positions_colour() {
        let ops = banner_ops(dial(false));
        let colour = Rgba::hex("#FFCC00");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        let (caption, label) = (run(&ops, "MULTI"), run(&ops, "TC2"));
        assert_eq!((caption.color, label.color), (colour, colour));
        assert_eq!((caption.weight, label.weight), (TextWeight::LabelBold, TextWeight::LabelBold));
        assert_eq!((caption.size, label.size), (480.0 * 0.1, 480.0 * 0.4));
        for text in [caption, label] {
            assert!((text.x + text.width(&Fonts::new()) / 2.0 - 400.0).abs() < 1e-6, "centered on the canvas");
        }
        assert_eq!(ops.len(), 4, "nothing else: the popup covers the dash");

        let inverted = banner_ops(dial(true));
        assert!(inverted.contains(&DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: colour }));
        assert_eq!((run(&inverted, "MULTI").color, run(&inverted, "TC2").color), (P.background, P.background));
    }

    #[test]
    fn a_long_position_name_is_squeezed_to_fit_the_width() {
        let mut long = dial(false);
        long["label"] = json!("WWWWWWWW");
        let ops = banner_ops(long);
        let label = run(&ops, "WWWWWWWW");
        assert!(label.scale_x < 1.0 && (label.width(&Fonts::new()) - 800.0 * 0.92).abs() < 1e-6);
    }

    /// The designer's sample lap (`SAMPLE_LAP`) as banner JSON: lap 12 of 24 in 2:04.912, a new
    /// best, S1 a personal best, S2 the fastest and S3 slower.
    fn sample_lap() -> serde_json::Value {
        json!({ "kind": "lapSummary", "lap": 12, "totalLaps": 24, "position": 4, "totalPositions": 22, "lapTime": 124.912, "valid": true,
                "lapDelta": -0.214, "bestLap": 124.912, "targetDelta": -0.088,
                "sectors": [{ "seconds": 38.412, "rating": "personalBest", "delta": -0.104 }, { "seconds": 44.187, "rating": "fastest", "delta": -0.051 },
                            { "seconds": 42.313, "rating": "slower", "delta": 0.213 }],
                "fuelUsed": 2.41, "fuelDelta": -0.09, "fuelLeftLaps": 12.4, "energyUsed": 4.2, "energyLeftLaps": 13.8, "tyreWearLeft": 81, "gapAhead": 1.384,
                "topSpeed": 86.4 })
    }

    /// `summary` with its fields replaced by `fields`.
    fn with(mut summary: serde_json::Value, fields: serde_json::Value) -> serde_json::Value {
        for (key, value) in fields.as_object().cloned().unwrap_or_default() {
            summary[key] = value;
        }
        summary
    }

    /// The lap review of `banner` at 800x480, with the layout's `lapReview` cells.
    fn review_ops(banner: serde_json::Value, cells: Option<serde_json::Value>) -> Vec<DrawOp> {
        let banner = parse_banner(banner.to_string().as_bytes()).expect("banner");
        let mut layout = json!({ "id": "l", "name": "L", "gridCols": 20, "gridRows": 12, "pages": [{ "id": "p", "name": "P", "widgets": [] }] });
        if let Some(cells) = cells {
            layout["lapReview"] = json!({ "cells": cells });
        }
        let scene = parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene");
        draw(&scene, &TelemetryFrame::default(), Overlays { banner: Some(&banner), ..Overlays::default() })
    }

    fn rounded_fills(ops: &[DrawOp]) -> Vec<Rgba> {
        ops.iter()
            .filter_map(|op| match op {
                // Not the dark pills a label sits on over a lit cell.
                DrawOp::Rect { color, radii, .. } if !radii.is_zero() && *color != P.background => Some(*color),
                _ => None,
            })
            .collect()
    }

    /// The horizontal centre of a text run.
    fn centre(run: &TextRun) -> f64 {
        run.x + run.width(&Fonts::new()) / 2.0
    }

    #[test]
    fn the_lap_review_shows_the_lap_time_and_its_delta_over_two_rows_of_three_framed_cells() {
        let ops = review_ops(sample_lap(), None);
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        let (time, delta) = (run(&ops, "2:04.912"), run(&ops, "-0.214"));
        assert_eq!((time.color, delta.color, run(&ops, "NEW BEST").color), (P.foreground, P.timing_personal_best, P.secondary));
        assert!(time.size > delta.size * 2.0 && time.baseline < delta.baseline, "the lap time big, the delta under it");
        // The top row is 56% of the height; the cells split the rest, a third of the width each.
        let (row2, row3) = (480.0 * 0.56, 480.0 * 0.56 + 480.0 * 0.44 / 2.0);
        let cells = [
            ("SECTOR 1", "38.412", None),
            ("SECTOR 2", "44.187", None),
            ("SECTOR 3", "42.313", None),
            ("POSITION", "P4", Some("/22")),
            ("FUEL USED", "2.41", Some("L")),
            ("TARGET Δ", "-0.088", None),
        ];
        for (i, (title, value, unit)) in cells.into_iter().enumerate() {
            let (title, value) = (run(&ops, title), run(&ops, value));
            let end = unit.map_or(value.x + value.width(&Fonts::new()), |unit| run(&ops, unit).x + run(&ops, unit).width(&Fonts::new()));
            let (left, top) = ((i % 3) as f64 * 800.0 / 3.0, if i < 3 { row2 } else { row3 });
            assert!(((value.x + end) / 2.0 - (left + 800.0 / 6.0)).abs() < 1.0, "{} centred in its cell", value.text);
            assert!(title.baseline > top && title.baseline < value.baseline && value.baseline < top + 480.0 * 0.22, "{} in its row", value.text);
        }
        // The sectors fill like a timing screen and carry their times in ink.
        assert_eq!(rounded_fills(&ops), [P.timing_personal_best, P.timing_fastest_overall, P.race_control_yellow]);
        assert_eq!(run(&ops, "44.187").color, P.background);
        assert_eq!((run(&ops, "2.41").color, run(&ops, "-0.088").color), (P.good_on_target, P.good_on_target), "fuel and target met");
        assert_eq!((run(&ops, "/22").color, run(&ops, "L").color), (P.secondary, P.secondary));
        assert_eq!(ops.iter().filter(|op| matches!(op, DrawOp::Border { .. })).count(), 7, "the top row and six cells");
    }

    #[test]
    fn an_empty_cell_draws_nothing_and_a_custom_cell_shows_its_field() {
        let cells = json!(["none", "energy_used", "lap", "best_lap", "gap_ahead", "tyre_wear"]);
        let ops = review_ops(sample_lap(), Some(cells));
        assert_eq!(ops.iter().filter(|op| matches!(op, DrawOp::Border { .. })).count(), 6, "no frame for the empty cell");
        for text in ["VE USED", "4.2", "%", "LAP", "12", "/24", "BEST LAP", "GAP AHEAD", "1.384", "TYRE WEAR", "81"] {
            run(&ops, text);
        }
        assert_eq!(run(&ops, "BEST LAP").baseline, run(&ops, "TYRE WEAR").baseline, "row 3");
        assert!(runs(&ops).iter().all(|r| r.text != "SECTOR 1"), "the defaults are replaced");
        let no_energy = review_ops(with(sample_lap(), json!({ "energyUsed": null })), Some(json!(["energy_used", "none", "none", "none", "none", "none"])));
        assert_eq!(run(&no_energy, "--").color, P.muted, "a car without virtual energy");
    }

    #[test]
    fn fuel_and_energy_used_share_one_cell_side_by_side() {
        let ops = review_ops(sample_lap(), Some(json!(["fuel_energy_used", "none", "none", "none", "none", "none"])));
        let (fuel, energy) = (run(&ops, "2.41"), run(&ops, "4.2"));
        let cell = 800.0 / 3.0;
        assert!(centre(fuel) < cell / 2.0 && centre(energy) > cell / 2.0 && centre(energy) < cell, "fuel left of the middle, energy right");
        assert_eq!(fuel.baseline, energy.baseline);
        assert!(run(&ops, "%").x + run(&ops, "%").width(&Fonts::new()) < cell, "inside its cell");
    }

    #[test]
    fn an_invalid_lap_goes_grey_and_says_so_instead_of_a_delta() {
        let ops = review_ops(with(sample_lap(), json!({ "valid": false, "lapDelta": 0.531, "bestLap": 125.126 })), None);
        let time = run(&ops, "2:04.912");
        assert_eq!((time.color, run(&ops, "INVALID").color), (P.muted, P.muted));
        assert!(runs(&ops).iter().all(|r| r.text != "+0.531" && r.text != "NEW BEST"), "an invalid lap claims no delta");
        assert!(!ops.iter().any(|op| matches!(op, DrawOp::Rect { color, .. } if *color == P.critical)), "no red strike-through");
        assert_eq!(run(&ops, "-0.088").color, P.foreground, "an invalid lap never meets its target");
    }

    #[test]
    fn each_review_field_formats_its_value_and_colours_only_what_the_driver_should_act_on() {
        let summary = match parse_banner(sample_lap().to_string().as_bytes()) {
            Ok(DashAlertBanner::LapSummary(summary)) => *summary,
            other => panic!("{other:?}"),
        };
        let cell = |field: &str, summary: &LapSummary| {
            let cell = review_cell(LapReviewField::parse(field).expect(field), summary, &P, Units::Metric).expect("a cell");
            (cell.value, cell.unit, cell.color, cell.fill)
        };
        let shown = |value: &str, unit: &str, color: Option<Rgba>, fill: Option<Rgba>| (value.to_owned(), unit.to_owned(), color, fill);
        assert_eq!(cell("sector3", &summary), shown("42.313", "", None, Some(P.race_control_yellow)));
        assert_eq!(cell("target", &summary), shown("-0.088", "", Some(P.good_on_target), None));
        assert_eq!(cell("best_lap", &summary), shown("2:04.912", "", Some(P.timing_personal_best), None), "this lap is the best");
        assert_eq!(cell("position", &summary), shown("P4", "/22", None, None));
        assert_eq!(cell("lap", &summary), shown("12", "/24", None, None));
        assert_eq!(cell("gap_ahead", &summary), shown("1.384", "", None, None));
        assert_eq!(cell("fuel_used", &summary), shown("2.41", "L", Some(P.good_on_target), None));
        assert_eq!(cell("fuel_left", &summary), shown("12.4", "LAPS", None, None));
        assert_eq!(cell("energy_used", &summary), shown("4.2", "%", None, None));
        assert_eq!(cell("energy_left", &summary), shown("13.8", "LAPS", None, None));
        assert_eq!(cell("tyre_wear", &summary), shown("81", "%", None, None));
        assert_eq!(cell("sector1_delta", &summary), shown("-0.104", "", Some(P.timing_personal_best), None), "a new best sector");
        assert_eq!(cell("sector3_delta", &summary), shown("+0.213", "", None, None), "slower is never a warning");
        assert_eq!(cell("validity", &summary), shown("VALID", "", None, None));
        assert_eq!(cell("validity", &LapSummary { valid: false, ..summary }), shown("INVALID", "", Some(P.muted), None), "the invalid laps' grey");
        assert_eq!(cell("top_speed", &summary), shown("311", "km/h", None, None));
        let mph = review_cell(LapReviewField::TopSpeed, &summary, &P, Units::Imperial).expect("a cell");
        assert_eq!((mph.value.as_str(), mph.unit.as_str()), ("193", "mph"), "86.4 m/s");
        let both = review_cell(LapReviewField::FuelEnergyUsed, &summary, &P, Units::Metric).expect("a cell");
        assert_eq!((both.value.as_str(), both.unit.as_str(), both.color), ("2.41", "L", Some(P.good_on_target)), "the fuel like Fuel used");
        assert_eq!(both.beside, Some(("4.2".to_owned(), "%".to_owned(), None)), "the energy beside it");
        let no_energy = review_cell(LapReviewField::FuelEnergyUsed, &LapSummary { energy_used: None, ..summary }, &P, Units::Metric).expect("a cell");
        assert_eq!((no_energy.value.as_str(), no_energy.beside), ("2.41", Some(("--".to_owned(), String::new(), Some(P.muted)))), "a car without it");
        assert_eq!(review_cell(LapReviewField::Empty, &summary, &P, Units::Metric), None);
        let gallons = review_cell(LapReviewField::FuelUsed, &summary, &P, Units::Imperial).expect("a cell");
        assert_eq!((gallons.value.as_str(), gallons.unit.as_str()), ("0.64", "gal"), "2.41 L in US gallons");

        let slow =
            LapSummary { target_delta: Some(0.4), fuel_delta: Some(0.3), best_lap: Some(124.5), tyre_wear_left: Some(45.0), total_laps: None, ..summary };
        assert_eq!(cell("target", &slow), shown("+0.400", "", None, None), "a slower lap is never a warning");
        assert_eq!(cell("fuel_used", &slow), shown("2.41", "L", Some(P.warning), None), "over the fuel target");
        assert_eq!(cell("best_lap", &slow), shown("2:04.500", "", None, None), "an older best");
        assert_eq!(cell("tyre_wear", &slow), shown("45", "%", Some(P.warning), None));
        assert_eq!(cell("tyre_wear", &LapSummary { tyre_wear_left: Some(22.0), ..summary }).2, Some(P.critical));
        assert_eq!(cell("lap", &slow), shown("12", "", None, None), "no lap limit");

        let unreported = LapSummary { lap: 3.0, lap_time: 124.9, valid: true, ..LapSummary::default() };
        for field in LapReviewField::ALL.into_iter().filter(|field| !matches!(field, LapReviewField::Empty | LapReviewField::Lap | LapReviewField::Validity)) {
            assert_eq!(cell(field.id(), &unreported), shown("--", "", Some(P.muted), None), "{field:?}");
        }
    }

    fn view(show_delta_bar: bool, delta: f64) -> RaceLogicLapTimerView {
        RaceLogicLapTimerView { mode: RaceLogicLapTimerMode::Predictive, primary: "-0.41".to_owned(), status: "PREDICTIVE".to_owned(), delta, show_delta_bar }
    }

    #[test]
    fn the_lap_timer_island_is_a_centered_4_to_1_panel_with_its_delta_bar() {
        let mut frame = TelemetryFrame::default();
        (frame.lap.current_lap, frame.lap.best_lap_time, frame.car.speed_ms) = (14.0, 208.44, 78.4);
        let v = view(true, -0.41);
        let ops = draw(&scene("purpose-lap-times"), &frame, Overlays { lap_timer: Some(&v), ..Overlays::default() });
        // Bounds 0,140 800x200; inset 7 -> content 786x186 at (7, 147).
        let (cw, ch) = (786.0, 186.0);
        let primary = run(&ops, "-0.41");
        assert_eq!((primary.size, primary.color), (ch * 0.42, P.neutral));
        let DrawOp::Rect { rect: bar, color: track, .. } = ops[2] else { panic!("{:?}", ops[2]) };
        assert_eq!(track, DELTA_TRACK);
        assert!((bar.left - (7.0 + cw * 0.2)).abs() < 0.02 && (bar.top - (147.0 + ch * 0.66)).abs() < 0.02, "{bar:?}");
        let DrawOp::Oval { rect: dot_rect, color } = ops[3] else { panic!("{:?}", ops[3]) };
        let center = dot_rect.left + dot_rect.width / 2.0;
        assert!((center - (7.0 + cw * 0.5 - 0.205 * cw * 0.46 * 0.5)).abs() < 0.05 && color == P.neutral, "{center}");
        for text in ["282", "km/h", "LAP 14", "PREDICTIVE", "BEST 3:28.440"] {
            run(&ops, text);
        }

        let no_bar = view(false, 0.0);
        let ops = draw(&scene("purpose-lap-times"), &frame, Overlays { lap_timer: Some(&no_bar), ..Overlays::default() });
        assert!(!ops.iter().any(|op| matches!(op, DrawOp::Oval { .. })));
    }

    #[test]
    fn overlays_draw_in_the_typescript_order_lap_timer_banner_flag() {
        let mut frame = TelemetryFrame::default();
        frame.flags.red = true;
        let banner = parse_banner(setting(true, false).to_string().as_bytes()).expect("banner");
        let v = view(false, 0.0);
        let s = scene("l");
        let ops = draw(&s, &frame, Overlays { banner: Some(&banner), lap_timer: Some(&v), flag_bar: crate::alerts::flag_bar(&s.layout, &frame, &P) });
        let at = |text: &str| ops.iter().position(|op| matches!(op, DrawOp::Text(r) if r.text == text)).expect(text);
        assert!(at("PREDICTIVE") < at("WAS 4"));
        assert!(matches!(ops.last(), Some(DrawOp::Rect { color, .. }) if *color == P.critical), "the flag bar last");
    }
}
