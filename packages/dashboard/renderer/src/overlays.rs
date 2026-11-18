// What draws over the widgets, each over the whole canvas and independent of the grid: the
// RaceLogic lap timer island, the alert banners (an alert popup full screen, as a strip across
// the middle or centered in its alert rect, the lap summary screen and the multi-dial popup) and
// the flag overlay. Ported from `FlagOverlay`, `AlertBanner`, `FullScreenSettingPopup`,
// `LapSummaryScreen` and `RaceLogicLapTimerOverlay` in the retired React renderer's
// `DashRenderer.tsx`, and `MultiDialPopup` in its `multiDial.tsx`; `dash.rs` decides which of
// them draw, in what order.
//
// The DOM positions an absolutely positioned child against its parent's padding box, so inside a
// box with a border every child sits the border width further in. The TypeScript lays children
// out from the box's full width anyway; that offset is reproduced, not corrected.

use std::sync::LazyLock;

use crate::alerts::{AlertPlacement, AlertSize, DashAlertBanner, DashAlertPopup, DashRadioBanner};
use crate::chrome::{ChromeContext, WidgetFrame, widget_frame};
use crate::draw::{Builder, Radii};
use crate::format::{format_delta, format_lap, format_signed_liters, js_number_string, to_fixed};
use crate::grid::{AlertSpan, PixelRect, alert_panel_rect, race_logic_panel_bounds};
use crate::lap_summary::LapSummary;
use crate::model::{DashWidget, TelemetryFrame};
use crate::multi_dial::DashMultiDialPopup;
use crate::palette::{CssForm, DashPaletteColors, Rgba, with_alpha};
use crate::primitives::{TextAlign, TextLine, TextSizing, ValueWithUnit, dot, text_line, value_with_unit};
use crate::racelogic::RaceLogicLapTimerView;
use crate::text::TextWeight;
use crate::widgets::{WidgetContext, widget_content};

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

/// The full-screen flag-state tint and bottom banner. Only red/safety-car/yellow trigger it — a
/// narrower set than the header chip's full flag priority.
fn flag_overlay_info(frame: &TelemetryFrame, palette: &DashPaletteColors) -> Option<(&'static str, Rgba)> {
    let flags = &frame.flags;
    if flags.red {
        Some(("RED FLAG", palette.critical))
    } else if flags.safety_car {
        Some(("SAFETY CAR", palette.race_control_yellow))
    } else if flags.yellow {
        Some(("YELLOW FLAG", palette.race_control_yellow))
    } else {
        None
    }
}

/// `FlagOverlay`: the canvas tinted in the flag's color and a bar along the bottom naming it.
pub fn flag_overlay(b: &mut Builder, frame: &TelemetryFrame, palette: &DashPaletteColors, width: f64, height: f64) {
    let Some((text, color)) = flag_overlay_info(frame, palette) else {
        return;
    };
    let bar_height = (height * 0.06).max(20.0);
    b.rect(PixelRect::new(0.0, 0.0, width, height), Radii::ZERO, with_alpha(color, 25.0 / 255.0));
    let bar = PixelRect::new(0.0, height - bar_height, width, bar_height);
    b.rect(bar, Radii::ZERO, color);
    b.translated(bar.left, bar.top, |b| {
        text_line(
            b,
            TextLine {
                text,
                left: width / 2.0,
                top: bar_height / 2.0,
                size: bar_height * 0.6,
                color: palette.background,
                align: TextAlign::Center,
                max_width: Some(width),
                weight: TextWeight::LabelBold,
                sizing: TextSizing::Fit,
            },
        );
    });
}

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

/// `AlertBanner`: a lap summary, an alert popup (full screen, a strip, or centered in its alert
/// rect), the multi-dial popup (full screen or a strip) or the engineer's message.
pub fn alert_banner(
    b: &mut Builder,
    banner: &DashAlertBanner,
    frame: &TelemetryFrame,
    palette: &DashPaletteColors,
    chrome: ChromeContext,
    width: f64,
    height: f64,
) {
    match banner {
        DashAlertBanner::LapSummary(summary) => lap_summary_screen(b, summary, frame, palette, chrome, width, height),
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

/// One number of the lap summary: its value, unit and a short verdict, on a condition fill when
/// there is one.
struct SummaryBlock {
    title: &'static str,
    value: String,
    unit: &'static str,
    note: String,
    fill: Option<Rgba>,
}

/// The lap time against the plan's target the lap was driven with. Meeting it is OnTarget green;
/// missing it stays neutral, because a slower lap is never a warning just for being slower.
fn target_block(summary: &LapSummary, palette: &DashPaletteColors) -> SummaryBlock {
    let Some(delta) = summary.target_delta else {
        return SummaryBlock { title: "TARGET Δ", value: "--".to_owned(), unit: "", note: "NO TARGET SET".to_owned(), fill: None };
    };
    let on_target = summary.valid && delta <= 0.0;
    let note = if !summary.valid {
        "INVALID"
    } else if on_target {
        "ON TARGET"
    } else {
        "VS TARGET"
    };
    SummaryBlock { title: "TARGET Δ", value: format_delta(delta), unit: "", note: note.to_owned(), fill: on_target.then_some(palette.good_on_target) }
}

fn best_block(summary: &LapSummary, palette: &DashPaletteColors) -> SummaryBlock {
    let Some(delta) = summary.lap_delta else {
        let note = if summary.valid { "NO BEST YET" } else { "INVALID" };
        return SummaryBlock { title: "BEST Δ", value: "--".to_owned(), unit: "", note: note.to_owned(), fill: None };
    };
    let best = summary.valid && delta < 0.0;
    let note = if !summary.valid {
        "INVALID"
    } else if best {
        "NEW BEST"
    } else {
        "VS BEST"
    };
    SummaryBlock { title: "BEST Δ", value: format_delta(delta), unit: "", note: note.to_owned(), fill: best.then_some(palette.timing_personal_best) }
}

fn fuel_block(summary: &LapSummary, palette: &DashPaletteColors) -> SummaryBlock {
    if let Some(delta) = summary.fuel_delta {
        let over = delta > 0.0;
        let note = if over { format!("SAVE {} L", to_fixed(delta, 2)) } else { "ON TARGET".to_owned() };
        return SummaryBlock {
            title: "FUEL Δ",
            value: format_signed_liters(delta),
            unit: "L",
            note,
            fill: Some(if over { palette.warning } else { palette.good_on_target }),
        };
    }
    match summary.fuel_used {
        Some(used) => SummaryBlock { title: "FUEL USED", value: to_fixed(used, 2), unit: "L", note: "NO TARGET SET".to_owned(), fill: None },
        None => SummaryBlock { title: "FUEL USED", value: "--".to_owned(), unit: "", note: "NOT MEASURED".to_owned(), fill: None },
    }
}

/// The gear the lap summary keeps in its own column (`SUMMARY_GEAR`).
static SUMMARY_GEAR: LazyLock<DashWidget> = LazyLock::new(|| DashWidget {
    id: "lap-summary-gear".to_owned(),
    widget_type: "gear_speed".to_owned(),
    col_span: 1.0,
    row_span: 1.0,
    ..DashWidget::default()
});

/// The lap summary, shown for a few seconds after each lap: the lap (of the session's total when
/// it has one) and the position over the lap time, then the lap time against the plan's target
/// and the best before it, and the fuel the lap used against the plan's target. Every delta is
/// actual minus target, so negative is better throughout. The gear stays in its own column on
/// the right, because the driver is still at speed. The three numbers wear the layout's dash
/// style, so the summary looks like the rest of the dash.
fn lap_summary_screen(
    b: &mut Builder,
    summary: &LapSummary,
    frame: &TelemetryFrame,
    palette: &DashPaletteColors,
    chrome: ChromeContext,
    width: f64,
    height: f64,
) {
    let gear_width = width * 0.19;
    let gear_height = height.min(gear_width * 2.3);
    let main_width = width - gear_width;
    let head_height = height * 0.2;
    let pad = 12.0 * chrome.scale;

    let lap = match summary.total_laps {
        Some(total) => format!("LAP {} OF {}", js_number_string(summary.lap), js_number_string(total)),
        None => format!("LAP {}", js_number_string(summary.lap)),
    };
    let position = summary.position.map_or_else(|| "P--".to_owned(), |position| format!("P{}", js_number_string(position)));

    b.rect(PixelRect::new(0.0, 0.0, width, height), Radii::ZERO, palette.background);
    let lap_line = TextLine {
        text: &lap,
        left: pad,
        top: head_height * 0.3,
        size: 18.0 * chrome.scale,
        color: palette.secondary,
        align: TextAlign::Start,
        max_width: Some(main_width * 0.35),
        weight: TextWeight::LabelBold,
        sizing: TextSizing::Fit,
    };
    text_line(b, lap_line);
    text_line(
        b,
        TextLine {
            text: &position,
            top: head_height * 0.68,
            size: head_height * 0.4,
            color: palette.foreground,
            weight: TextWeight::Value,
            sizing: TextSizing::Stable,
            ..lap_line
        },
    );
    text_line(
        b,
        TextLine {
            text: &format_lap(summary.lap_time),
            left: main_width - pad,
            top: head_height / 2.0,
            size: (head_height * 0.72).min(main_width * 0.55 / (8.0 * 0.56)),
            color: palette.foreground,
            align: TextAlign::End,
            max_width: Some(main_width * 0.6),
            weight: TextWeight::Value,
            sizing: TextSizing::Stable,
        },
    );

    let blocks = [target_block(summary, palette), best_block(summary, palette), fuel_block(summary, palette)];
    let block_width = main_width / blocks.len() as f64;
    for (i, block) in blocks.iter().enumerate() {
        let frame_props = WidgetFrame {
            ctx: chrome,
            rect: PixelRect::new(i as f64 * block_width, head_height, block_width, height - head_height),
            title: Some(block.title),
            accent: None,
            fill: block.fill,
            title_color: None,
            palette: *palette,
        };
        widget_frame(b, frame_props, |b, content_width, content_height, block_palette| {
            value_with_unit(
                b,
                ValueWithUnit {
                    value: &block.value,
                    unit: block.unit,
                    left: content_width / 2.0,
                    top: content_height * 0.44,
                    size: (content_height * 0.5).min(content_width * 0.96 / ((6.0 + 0.36) * 0.56)),
                    color: block_palette.foreground,
                    unit_color: block_palette.secondary,
                    align: TextAlign::Center,
                    max_width: content_width,
                },
            );
            text_line(
                b,
                TextLine {
                    text: &block.note,
                    left: content_width / 2.0,
                    top: content_height * 0.86,
                    size: (content_height * 0.08).min(16.0 * chrome.scale),
                    color: block_palette.secondary,
                    align: TextAlign::Center,
                    max_width: Some(content_width),
                    weight: TextWeight::LabelBold,
                    sizing: TextSizing::Fit,
                },
            );
        });
    }

    // The gear column: a box with a 2px left border, its gear box laid out from the column's
    // full width but placed inside that border. The gear widget sizes its text from its height,
    // so a narrow column gets a box no taller than the speed can fit across.
    let rule = border_width(2.0);
    b.rect(PixelRect::new(main_width, 0.0, rule, height), Radii::ZERO, palette.border);
    b.translated(main_width + rule, (height - gear_height) / 2.0, |b| {
        let ctx = WidgetContext { widget: &SUMMARY_GEAR, frame, palette, width: gear_width, height: gear_height, targets: None, settings: None, chrome };
        widget_content(b, &ctx);
    });
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
    width: f64,
    height: f64,
) {
    let bounds = race_logic_panel_bounds(width, height);
    if bounds.width < 1.0 || bounds.height < 1.0 {
        return;
    }
    let inset = (bounds.height * 0.035).max(2.0);
    let (cw, ch) = ((bounds.width - inset * 2.0).max(0.0), (bounds.height - inset * 2.0).max(0.0));
    let speed = (frame.car.speed_ms * 3.6).max(0.0);
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
                    text: "km/h",
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

    fn scene(layout_id: &str, style: &str) -> Scene {
        let layout =
            json!({ "id": layout_id, "name": "L", "gridCols": 20, "gridRows": 12, "dashStyle": style, "pages": [{ "id": "p", "name": "P", "widgets": [] }] });
        parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene")
    }

    fn draw(scene: &Scene, frame: &TelemetryFrame, overlays: Overlays) -> Vec<DrawOp> {
        let mut ops = Vec::new();
        build_display_list(&Fonts::new(), scene, frame, overlays, &mut ops).expect("drawable");
        ops
    }

    fn banner_ops(banner: serde_json::Value, style: &str) -> Vec<DrawOp> {
        banner_ops_at(banner, style, 800.0, 480.0)
    }

    fn banner_ops_at(banner: serde_json::Value, style: &str, width: f64, height: f64) -> Vec<DrawOp> {
        let banner = parse_banner(banner.to_string().as_bytes()).expect("banner");
        let mut scene = scene("l", style);
        (scene.width, scene.height) = (width, height);
        draw(&scene, &TelemetryFrame::default(), Overlays { banner: Some(&banner), lap_timer: None })
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
        json!({ "kind": "alert", "alertType": "tc_change", "title": "TC", "value": "5", "detail": "WAS 4 · OF 9", "color": "#1F7FE6",
                "invertColors": invert, "displayMode": display_mode })
    }

    #[test]
    fn a_strip_is_a_band_a_third_of_the_dash_across_its_middle_set_off_by_background_rules() {
        let ops = banner_ops(alert("strip", false), "panels");
        // 480 / 3 = 160 tall at 160; a 4.8 -> 4px rule each side in the background colour.
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 156.0, 800.0, 168.0), radii: Radii::ZERO, color: P.background });
        assert_eq!(ops[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let (title, detail, value) = (run(&ops, "TC"), run(&ops, "WAS 4 · OF 9"), run(&ops, "5"));
        assert!([title.color, detail.color, value.color].iter().all(|c| *c == P.background));
        assert_eq!((title.weight, detail.weight, value.weight), (TextWeight::Value, TextWeight::LabelBold, TextWeight::Value));
        assert_eq!((title.size, detail.size, value.size), (160.0 * 0.34, 160.0 * 0.15, 160.0 * 0.8));
        assert!((title.x - 26.4).abs() < 1e-9, "from the dash's pad");
        assert!((value.x + value.width(&Fonts::new()) - (800.0 - 26.4)).abs() < 1e-6, "the value ends at the right pad");
        assert!(value.baseline > 160.0 && value.baseline < 320.0, "inside the band");
    }

    #[test]
    fn an_inverted_strip_is_dark_between_two_rules_in_the_alerts_colour() {
        let ops = banner_ops(alert("strip", true), "panels");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: P.background });
        assert_eq!(ops[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 4.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        assert_eq!(ops[3], DrawOp::Rect { rect: PixelRect::new(0.0, 316.0, 800.0, 4.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        assert_eq!((run(&ops, "TC").color, run(&ops, "5").color), (dash_setting_colors::TC, dash_setting_colors::TC));
    }

    #[test]
    fn a_strip_too_short_to_read_is_drawn_full_screen() {
        // 300 px tall makes a 100 px band, the least that reads; 299 px does not.
        let fits = banner_ops_at(alert("strip", false), "panels", 480.0, 300.0);
        assert_eq!(fits[2], DrawOp::Rect { rect: PixelRect::new(0.0, 100.0, 480.0, 100.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let small = banner_ops_at(alert("strip", false), "panels", 480.0, 272.0);
        assert_eq!(small, banner_ops_at(alert("full", false), "panels", 480.0, 272.0));
        assert_eq!(small[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 480.0, 272.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
    }

    #[test]
    fn a_popup_without_a_detail_centres_its_title() {
        let mut limiter = alert("full", false);
        (limiter["title"], limiter["value"], limiter["detail"]) = (json!("PIT LIMITER"), json!("ON"), json!(null));
        let ops = banner_ops(limiter, "panels");
        let title = run(&ops, "PIT LIMITER");
        let line_top = 240.0 - title.size / 2.0;
        assert!(title.baseline > line_top && title.baseline < line_top + title.size, "on the dash's centre line");
        assert_eq!(runs(&ops).len(), 2, "title and value only");
    }

    #[test]
    fn a_long_word_value_keeps_the_title_smaller_and_clear_of_it() {
        let mut engine = alert("full", false);
        (engine["title"], engine["value"]) = (json!("ENGINE"), json!("OVERHEAT"));
        let ops = banner_ops(engine, "panels");
        let (title, value) = (run(&ops, "ENGINE"), run(&ops, "OVERHEAT"));
        assert!(title.size < value.size, "{} vs {}", title.size, value.size);
        assert!(title.x + title.width(&Fonts::new()) + 20.0 < value.x, "a gap between them");
    }

    #[test]
    fn the_flag_alert_stands_in_for_the_flag_overlay_while_it_is_up() {
        let mut frame = TelemetryFrame::default();
        frame.flags.yellow = true;
        let mut flag = alert("strip", false);
        (flag["alertType"], flag["title"], flag["value"], flag["detail"], flag["color"]) =
            (json!("flag"), json!("FLAG"), json!("YELLOW"), json!(null), json!("#E0A30C"));
        let flag = parse_banner(flag.to_string().as_bytes()).expect("flag");
        let ops = draw(&scene("l", "panels"), &frame, Overlays { banner: Some(&flag), lap_timer: None });
        assert!(runs(&ops).iter().all(|r| r.text != "YELLOW FLAG"), "no second account of the flag");
        run(&ops, "YELLOW");
        let tc = parse_banner(alert("strip", false).to_string().as_bytes()).expect("tc");
        run(&draw(&scene("l", "panels"), &frame, Overlays { banner: Some(&tc), lap_timer: None }), "YELLOW FLAG");
    }

    #[test]
    fn a_dial_strip_is_lettered_in_the_positions_colour_unless_inverted() {
        let mut strip = dial(false);
        strip["displayMode"] = json!("strip");
        let ops = banner_ops(strip.clone(), "panels");
        let colour = Rgba::hex("#E0A30C");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: P.background });
        assert_eq!((run(&ops, "MULTI").color, run(&ops, "TC2").color), (colour, colour));
        strip["inverted"] = json!(true);
        let inverted = banner_ops(strip, "panels");
        assert_eq!(inverted[2], DrawOp::Rect { rect: PixelRect::new(0.0, 160.0, 800.0, 160.0), radii: Radii::ZERO, color: colour });
        assert_eq!(run(&inverted, "TC2").color, P.background);
    }

    #[test]
    fn the_flag_overlay_tints_the_canvas_and_names_the_flag_in_ink_on_a_bottom_bar() {
        let mut frame = TelemetryFrame::default();
        (frame.flags.yellow, frame.flags.safety_car) = (true, true);
        let ops = draw(&scene("l", "panels"), &frame, Overlays::default());
        let n = ops.len();
        let tint = with_alpha(P.race_control_yellow, 25.0 / 255.0);
        assert_eq!(ops[n - 3], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: tint });
        assert!(matches!(ops[n - 2], DrawOp::Rect { rect, color, .. } if color == P.race_control_yellow && rect.top == 451.1875 && rect.height == 28.796875));
        let text = run(&ops, "SAFETY CAR");
        assert_eq!((text.weight, text.color, text.size), (TextWeight::LabelBold, P.background, 480.0 * 0.06 * 0.6));
        assert!((text.x + text.width(&Fonts::new()) / 2.0 - 400.0).abs() < 1e-6, "centered on the canvas");

        frame.flags.red = true;
        assert_eq!(run(&draw(&scene("l", "panels"), &frame, Overlays::default()), "RED FLAG").color, P.background);
        assert_eq!(draw(&scene("purpose-lap-times", "panels"), &frame, Overlays::default()).len(), 1, "never on the focused lap timer screen");
        assert_eq!(draw(&scene("l", "panels"), &TelemetryFrame::default(), Overlays::default()).len(), 1, "no flag, no overlay");
    }

    #[test]
    fn a_full_screen_setting_fills_the_canvas_in_its_color_with_ink_text() {
        let ops = banner_ops(setting(true, false), "panels");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: dash_setting_colors::TC });
        let (title, was, value) = (run(&ops, "TC"), run(&ops, "WAS 4 · OF 9"), run(&ops, "5"));
        assert!([title.color, was.color, value.color].iter().all(|c| *c == P.background));
        assert_eq!((title.weight, was.weight), (TextWeight::Value, TextWeight::LabelBold));
        assert!((title.x - 26.4).abs() < 1e-9);
        assert!((value.x + value.width(&Fonts::new()) - (800.0 - 26.4)).abs() < 1e-6, "the value ends at the right pad");
        assert_eq!(value.size, (480.0f64 * 0.78).min(440.0 / (2.0 * 0.56)));
    }

    #[test]
    fn an_inverted_full_screen_setting_turns_dark_with_a_snapped_edge_that_moves_its_children_in() {
        let ops = banner_ops(setting(true, true), "panels");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        // max(2, 4.8) paints as a 4px border, and the children sit inside it.
        assert!(matches!(ops[2], DrawOp::Border { width: 4.0, radius: 0.0, color, .. } if color == dash_setting_colors::TC));
        let title = run(&ops, "TC");
        assert!((title.x - (26.4 + 4.0)).abs() < 0.02);
        assert_eq!(title.color, dash_setting_colors::TC);
    }

    #[test]
    fn a_centered_setting_sits_in_its_alert_rect_on_a_near_black_panel_edged_in_its_color() {
        let ops = banner_ops(setting(false, false), "panels");
        // Grid edges 240..560 x 120..360, inset 2px; the 1.888px border paints as 1px.
        let panel = PixelRect::new(242.0, 122.0, 316.0, 236.0);
        assert!(matches!(ops[1], DrawOp::Rect { rect, color, .. } if rect == panel && color == POPUP_FILL));
        assert!(matches!(ops[2], DrawOp::Border { rect, width: 1.0, color, .. } if rect == panel && color == dash_setting_colors::TC));
        let (title, value) = (run(&ops, "TC"), run(&ops, "5"));
        assert_eq!((title.color, value.color), (dash_setting_colors::TC, P.foreground));
        assert!((value.x + value.width(&Fonts::new()) / 2.0 - (243.0 + 158.0)).abs() < 1e-6, "centered on the panel's width, inside its border");

        let inverted = banner_ops(setting(false, true), "panels");
        assert!(matches!(inverted[1], DrawOp::Rect { color, .. } if color == dash_setting_colors::TC));
        assert_eq!((run(&inverted, "TC").color, run(&inverted, "5").color), (P.background, P.background));

        let mut tiny = setting(false, false);
        (tiny["colSpan"], tiny["rowSpan"]) = (json!(0), json!(0));
        assert_eq!(banner_ops(tiny, "panels").len(), 1, "a panel under 4px draws nothing");
    }

    fn dial(inverted: bool) -> serde_json::Value {
        json!({ "kind": "multiDial", "caption": "MULTI", "label": "TC2", "color": "#E0A30C", "inverted": inverted })
    }

    #[test]
    fn the_multi_dial_popup_names_the_position_big_under_its_caption_in_the_positions_colour() {
        let ops = banner_ops(dial(false), "panels");
        let colour = Rgba::hex("#E0A30C");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        let (caption, label) = (run(&ops, "MULTI"), run(&ops, "TC2"));
        assert_eq!((caption.color, label.color), (colour, colour));
        assert_eq!((caption.weight, label.weight), (TextWeight::LabelBold, TextWeight::LabelBold));
        assert_eq!((caption.size, label.size), (480.0 * 0.1, 480.0 * 0.4));
        for text in [caption, label] {
            assert!((text.x + text.width(&Fonts::new()) / 2.0 - 400.0).abs() < 1e-6, "centered on the canvas");
        }
        assert_eq!(ops.len(), 4, "nothing else: the popup covers the dash");

        let inverted = banner_ops(dial(true), "grid");
        assert!(inverted.contains(&DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: colour }));
        assert_eq!((run(&inverted, "MULTI").color, run(&inverted, "TC2").color), (P.background, P.background));
    }

    #[test]
    fn a_long_position_name_is_squeezed_to_fit_the_width() {
        let mut long = dial(false);
        long["label"] = json!("WWWWWWWW");
        let ops = banner_ops(long, "panels");
        let label = run(&ops, "WWWWWWWW");
        assert!(label.scale_x < 1.0 && (label.width(&Fonts::new()) - 800.0 * 0.92).abs() < 1e-6);
    }

    /// A lap 12 summary in 2:04.912, with the given deltas.
    fn lap(lap_delta: Option<f64>, valid: bool, fuel_used: Option<f64>, fuel_delta: Option<f64>) -> serde_json::Value {
        json!({ "kind": "lapSummary", "lap": 12, "lapTime": 124.912, "valid": valid, "lapDelta": lap_delta, "fuelUsed": fuel_used, "fuelDelta": fuel_delta })
    }

    /// `summary` with its fields replaced by `fields`.
    fn with(mut summary: serde_json::Value, fields: serde_json::Value) -> serde_json::Value {
        for (key, value) in fields.as_object().cloned().unwrap_or_default() {
            summary[key] = value;
        }
        summary
    }

    fn rounded_fills(ops: &[DrawOp]) -> Vec<Rgba> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Rect { color, radii, .. } if !radii.is_zero() => Some(*color),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_lap_summary_covers_the_dash_with_the_lap_its_position_three_framed_numbers_and_the_gear() {
        let full = with(lap(Some(-0.214), true, Some(2.41), Some(-0.09)), json!({ "totalLaps": 24, "position": 4, "targetDelta": -0.088 }));
        let ops = banner_ops(full, "panels");
        assert_eq!(ops[1], DrawOp::Rect { rect: PixelRect::new(0.0, 0.0, 800.0, 480.0), radii: Radii::ZERO, color: P.background });
        assert_eq!(run(&ops, "LAP 12 OF 24").color, P.secondary);
        assert_eq!((run(&ops, "P4").color, run(&ops, "P4").weight), (P.foreground, TextWeight::Value));
        assert_eq!(run(&ops, "2:04.912").color, P.foreground);
        // On target, a new best and fuel on target all fill their frames, so their values are ink.
        assert_eq!(rounded_fills(&ops), [P.good_on_target, P.timing_personal_best, P.good_on_target]);
        assert_eq!((run(&ops, "-0.088").color, run(&ops, "-0.214").color, run(&ops, "-0.09").color), (P.background, P.background, P.background));
        for text in ["TARGET Δ", "ON TARGET", "BEST Δ", "NEW BEST", "FUEL Δ"] {
            run(&ops, text);
        }
        assert_eq!(run(&ops, "L").weight, TextWeight::ValueRegular);
        // The gear column: a 2px rule at 648, and the gear laid out from x = 650.
        assert!(ops.contains(&DrawOp::Rect { rect: PixelRect::new(648.0, 0.0, 2.0, 480.0), radii: Radii::ZERO, color: P.border }));
        let gear = run(&ops, "N");
        assert!((gear.x + gear.width(&Fonts::new()) / 2.0 - (650.0 + 152.0 / 2.0)).abs() < 0.02, "{}", gear.x);
    }

    #[test]
    fn a_session_without_a_lap_limit_shows_the_lap_alone_and_an_unreported_position_as_dashes() {
        let ops = banner_ops(lap(None, true, None, None), "panels");
        run(&ops, "LAP 12");
        run(&ops, "P--");
        assert!(runs(&ops).iter().all(|r| !r.text.contains("OF")), "never \"of 0\"");
    }

    #[test]
    fn a_lap_slower_than_its_target_stays_neutral_and_an_invalid_one_is_never_on_target() {
        let slow = banner_ops(with(lap(Some(0.531), true, None, None), json!({ "targetDelta": 0.4 })), "panels");
        assert_eq!(run(&slow, "+0.400").color, P.foreground);
        run(&slow, "VS TARGET");
        assert!(rounded_fills(&slow).is_empty(), "slower is never a warning: {:?}", rounded_fills(&slow));
        let cut = banner_ops(with(lap(Some(0.531), false, None, None), json!({ "targetDelta": -1.2 })), "panels");
        assert_eq!(run(&cut, "-1.200").color, P.foreground);
        assert_eq!(runs(&cut).iter().filter(|r| r.text == "INVALID").count(), 2, "under both lap deltas");
    }

    #[test]
    fn the_lap_summary_says_what_it_could_not_compare() {
        let ops = banner_ops(lap(None, false, None, None), "grid");
        for text in ["TARGET Δ", "NO TARGET SET", "BEST Δ", "INVALID", "FUEL USED", "NOT MEASURED"] {
            run(&ops, text);
        }
        assert_eq!(runs(&ops).iter().filter(|r| r.text == "--").count(), 3, "no target, no best and no fuel claim a delta");
        let ops = banner_ops(lap(None, true, Some(2.9), Some(0.3)), "bars");
        for text in ["NO BEST YET", "FUEL Δ", "+0.30", "SAVE 0.30 L"] {
            run(&ops, text);
        }
        assert!(ops.iter().any(|op| matches!(op, DrawOp::Rect { color, .. } if *color == P.warning)), "over target fills in warning");
        let ops = banner_ops(lap(Some(0.531), true, Some(2.41), None), "panels");
        for text in ["+0.531", "VS BEST", "FUEL USED", "2.41", "NO TARGET SET"] {
            run(&ops, text);
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
        let ops = draw(&scene("purpose-lap-times", "panels"), &frame, Overlays { banner: None, lap_timer: Some(&v) });
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
        let ops = draw(&scene("purpose-lap-times", "panels"), &frame, Overlays { banner: None, lap_timer: Some(&no_bar) });
        assert!(!ops.iter().any(|op| matches!(op, DrawOp::Oval { .. })));
    }

    #[test]
    fn overlays_draw_in_the_typescript_order_lap_timer_banner_flag() {
        let mut frame = TelemetryFrame::default();
        frame.flags.red = true;
        let banner = parse_banner(setting(true, false).to_string().as_bytes()).expect("banner");
        let v = view(false, 0.0);
        let ops = draw(&scene("l", "grid"), &frame, Overlays { banner: Some(&banner), lap_timer: Some(&v) });
        let at = |text: &str| ops.iter().position(|op| matches!(op, DrawOp::Text(r) if r.text == text)).expect(text);
        assert!(at("PREDICTIVE") < at("WAS 4 · OF 9") && at("WAS 4 · OF 9") < at("RED FLAG"));
        let cut = ops.iter().position(|op| matches!(op, DrawOp::CornerCut { .. })).expect("grid corners");
        assert!(cut < at("PREDICTIVE"), "the overlays are not clipped by the grid's rounded canvas");
    }
}
