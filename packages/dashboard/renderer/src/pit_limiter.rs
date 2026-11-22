// The pit limiter overlay: what a dash draws over its page while the pit limiter is on and the
// app-wide `pit_limiter` alert is on (the host stamps it onto every dash it shows). Each layout
// picks how it looks (its `pitLimiter`): the page's gear widget lit yellow (`Gear`), a yellow
// frame over the first and last columns and the top row (`Box`), or the whole screen yellow with
// the gear and the speed (`Full`). In the
// first two the driver also drops widgets of their own on an empty copy of the dash's grid; those
// draw lit yellow with dark ink, and every spot left empty shows the page underneath. `dash.rs`
// decides when it draws and draws the widgets; this module has the model and the yellow parts.
//
// It never animates: the overlay is a pure function of the frame, up while the limiter is on.

use crate::draw::{Builder, Radii};
use crate::format::{Units, format_gear, format_speed};
use crate::grid::{GridSpan, PixelRect, track_rect};
use crate::model::{CarState, DashLayout, DashPage, DashWidget, Tracks};
use crate::palette::{Rgba, dash_color, with_alpha};
use crate::primitives::{TextAlign, TextLine, TextSizing, text_line};
use crate::text::TextWeight;

/// The pit limiter's yellow: the dash palette's yellow, whatever the theme.
pub const PIT_YELLOW: Rgba = Rgba::hex(dash_color::YELLOW);
/// The dark ink everything on the yellow is lettered in.
pub const PIT_INK: Rgba = Rgba::hex(dash_color::BACKGROUND);

const LABEL: &str = "PIT LIMITER";

/// How the overlay looks, by its wire id (`DashPitLimiterStyle` in pitLimiter.ts).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PitLimiterStyle {
    /// The page's gear widget lit, PIT LIMITER under the digit; the driver's widgets around it.
    /// A page without a gear shows `Full` instead.
    #[default]
    Gear,
    /// A frame over the first and last columns and the top row, PIT LIMITER across the top; the
    /// driver's widgets inside it.
    Box,
    /// The whole screen: the gear, the speed and PIT LIMITER stacked in the centre. No widgets.
    Full,
}

impl PitLimiterStyle {
    pub fn parse(value: Option<&str>) -> PitLimiterStyle {
        match value {
            Some("box") => PitLimiterStyle::Box,
            Some("full") => PitLimiterStyle::Full,
            _ => PitLimiterStyle::Gear,
        }
    }
}

/// A layout's pit limiter (its `pitLimiter`; absent: the default style with no widgets). Its
/// widgets and groups are kept as a page, so they draw by the page rules (`drawn_widgets`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PitLimiter {
    pub style: PitLimiterStyle,
    pub page: DashPage,
}

impl PitLimiter {
    /// The style `layout` draws in: the frame needs the dash's own tracks, so an even-grid dash
    /// (an older one) always shows the full screen.
    pub fn style_on(layout: &DashLayout) -> PitLimiterStyle {
        if layout.tracks.is_some() { layout.pit_limiter.style } else { PitLimiterStyle::Full }
    }

    /// Whether one of the overlay's widgets draws in `style`, on a grid of `tracks` over a page
    /// whose gear sits at `gear`: never over the gear, never in the box's frame, and none at all
    /// on the full screen. The designer keeps them out; a stored layout is not trusted to.
    pub fn draws(style: PitLimiterStyle, widget: &DashWidget, tracks: &Tracks, gear: Option<GridSpan>) -> bool {
        let span = GridSpan::from(widget);
        let on_gear = gear.is_some_and(|gear| overlaps(span, gear));
        match style {
            PitLimiterStyle::Full => false,
            PitLimiterStyle::Gear => !on_gear,
            PitLimiterStyle::Box => !on_gear && !box_spots(tracks).iter().any(|spot| overlaps(span, *spot)),
        }
    }
}

/// The box's frame on a grid of `tracks`: the first column, the last, the top row between them.
fn box_spots(tracks: &Tracks) -> [GridSpan; 3] {
    let (cols, rows) = (tracks.cols.len() as f64, tracks.rows.len() as f64);
    [
        GridSpan { col: 0.0, row: 0.0, col_span: 1.0, row_span: rows },
        GridSpan { col: cols - 1.0, row: 0.0, col_span: 1.0, row_span: rows },
        GridSpan { col: 1.0, row: 0.0, col_span: (cols - 2.0).max(0.0), row_span: 1.0 },
    ]
}

fn overlaps(a: GridSpan, b: GridSpan) -> bool {
    a.col < b.col + b.col_span && b.col < a.col + a.col_span && a.row < b.row + b.row_span && b.row < a.row + a.row_span
}

fn label(b: &mut Builder, left: f64, top: f64, size: f64, max_width: f64) {
    let line = TextLine {
        text: LABEL,
        left,
        top,
        size,
        color: PIT_INK,
        align: TextAlign::Center,
        max_width: Some(max_width),
        weight: TextWeight::LabelBold,
        sizing: TextSizing::Fit,
    };
    text_line(b, line);
}

/// `Gear`: the gear widget's box (`rect`, inset like a widget frame, `radius` its corners) lit
/// yellow, the digit in ink where the widget draws it in `spot` and PIT LIMITER under it.
pub fn draw_gear_box(b: &mut Builder, car: &CarState, spot: PixelRect, rect: PixelRect, radius: f64, scale: f64) {
    b.rect(rect, Radii::all(radius), PIT_YELLOW);
    // The digit as the gear widget places it, so it does not jump when the limiter goes on.
    let digit = TextLine {
        text: &format_gear(car.gear),
        left: spot.left + spot.width / 2.0,
        top: spot.top + spot.height * 0.5,
        size: spot.height * 0.92,
        color: PIT_INK,
        align: TextAlign::Center,
        max_width: Some(spot.width),
        weight: TextWeight::ValueRegular,
        sizing: TextSizing::Stable,
    };
    text_line(b, digit);
    label(b, rect.left + rect.width / 2.0, rect.top + rect.height - 13.0 * scale, 20.0 * scale, (rect.width - 12.0 * scale).max(0.0));
}

/// `Box`: the first and last columns and the top row of `tracks` yellow, PIT LIMITER across the
/// top. Never along the bottom.
pub fn draw_box_frame(b: &mut Builder, tracks: &Tracks, width: f64, height: f64, scale: f64) {
    let spots = box_spots(tracks);
    for spot in spots {
        b.rect(track_rect(width, height, tracks, spot), Radii::ZERO, PIT_YELLOW);
    }
    let top = track_rect(width, height, tracks, spots[2]);
    label(b, width / 2.0, top.height / 2.0, (26.0 * scale).min(top.height * 0.8), top.width);
}

/// `Full`: the whole canvas yellow, the gear big, the speed in the driver's units under it, and
/// PIT LIMITER below.
pub fn draw_full_screen(b: &mut Builder, car: &CarState, units: Units, width: f64, height: f64) {
    b.fill(PIT_YELLOW);
    let mut line = |text: &str, top: f64, size: f64, color: Rgba, weight: TextWeight| {
        let line = TextLine {
            text,
            left: width / 2.0,
            top: height * top,
            size: height * size,
            color,
            align: TextAlign::Center,
            max_width: Some(width * 0.9),
            weight,
            sizing: TextSizing::Fit,
        };
        text_line(b, line);
    };
    let unit = match units {
        Units::Metric => "KM/H",
        Units::Imperial => "MPH",
    };
    line(&format_gear(car.gear), 0.3, 0.46, PIT_INK, TextWeight::ValueRegular);
    line(&format_speed(car.speed_ms, units), 0.585, 0.135, PIT_INK, TextWeight::Value);
    line(unit, 0.68, 0.045, with_alpha(PIT_INK, 0.6), TextWeight::LabelBold);
    line(LABEL, 0.83, 0.06, PIT_INK, TextWeight::LabelBold);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_editor_offers_exactly_these_styles_and_the_same_default() {
        let source = include_str!("../../src/pitLimiter.ts");
        let list = "dashPitLimiterStyles: readonly DashPitLimiterStyle[] = [";
        let from = source.find(list).expect("the style list in pitLimiter.ts") + list.len();
        let ids: Vec<&str> = source[from..from + source[from..].find(']').expect("its end")].split('\'').skip(1).step_by(2).collect();
        assert_eq!(ids, ["gear", "box", "full"]);
        assert_eq!(
            ids.iter().map(|id| PitLimiterStyle::parse(Some(id))).collect::<Vec<_>>(),
            [PitLimiterStyle::Gear, PitLimiterStyle::Box, PitLimiterStyle::Full]
        );
        assert!(source.contains("DEFAULT_PIT_LIMITER_STYLE: DashPitLimiterStyle = 'gear'"));
        assert_eq!(PitLimiterStyle::parse(None), PitLimiterStyle::Gear);
    }
}
