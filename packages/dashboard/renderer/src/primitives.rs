// Low-level pieces shared by every widget: text, a horizontal bar, a vertical segment bar, a
// dot, and sized values. Ported from the retired React renderer's `primitives.tsx`. Each takes
// explicit pixel geometry (local to the builder's origin); no telemetry knowledge lives here.
//
// The TypeScript draws text as DOM spans (and SVG for the "fit" squeeze); the comments on each
// function say which CSS box model the numbers below reproduce.

use std::borrow::Cow;

use crate::draw::{Builder, Radii, TextRun};
use crate::grid::PixelRect;
use crate::palette::{Rgba, dim_color};
use crate::text::TextWeight;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum TextAlign {
    Start,
    #[default]
    Center,
    End,
}

impl TextAlign {
    /// The anchor's fraction of the run width (CSS `translateX(0 | -50% | -100%)`).
    fn fraction(self) -> f64 {
        match self {
            TextAlign::Start => 0.0,
            TextAlign::Center => 0.5,
            TextAlign::End => 1.0,
        }
    }
}

/// "stable" keeps the authored size and clips overflow (dynamic values, so a changing readout
/// never pulses); "fit" squeezes static text to `max_width` so labels never truncate.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum TextSizing {
    #[default]
    Stable,
    Fit,
}

/// `TextLine`'s props. Defaults as in the TypeScript: centered, value weight, stable.
#[derive(Clone, Copy, Debug)]
pub struct TextLine<'t> {
    pub text: &'t str,
    pub left: f64,
    pub top: f64,
    pub size: f64,
    pub color: Rgba,
    pub align: TextAlign,
    pub max_width: Option<f64>,
    pub weight: TextWeight,
    pub sizing: TextSizing,
}

/// The deterministic width estimate that decides whether "fit" engages. JavaScript's
/// `text.length` counts UTF-16 code units, so this does too.
fn estimate_text_width(text: &str, weight: TextWeight, size: f64) -> f64 {
    text.encode_utf16().count() as f64 * size * weight.avg_advance_ratio()
}

/// CSS white-space collapsing, which both the `white-space: nowrap` span and the SVG `<text>`
/// apply: each run of spaces, tabs and line breaks shows as one space, none at either end.
fn collapse_white_space(text: &str) -> Cow<'_, str> {
    let is_space = |c: char| matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0c');
    let trimmed = text.trim_matches(is_space);
    let collapsed = !trimmed.contains("  ") && !trimmed.contains(|c: char| c != ' ' && is_space(c));
    if collapsed {
        return Cow::Borrowed(trimmed);
    }
    Cow::Owned(trimmed.split(is_space).filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" "))
}

/// A single line of text, vertically centered on `top` and anchored at `left` per `align`.
///
/// - Stable: a `line-height: 1` span, so its line box is `size` tall and centered on `top`;
///   the baseline sits where Chromium puts it in that box. With a positive `max_width` it is
///   clipped to `[left - fraction * max_width, top - 0.7 * size, max_width, 1.4 * size]`, so
///   overflow is cut on the side away from the anchor.
/// - Fit: only when the estimate overflows `max_width`; an SVG `<text>` with `textLength` and
///   `lengthAdjust="spacingAndGlyphs"`, squeezing (or stretching) the run to span exactly
///   `max_width`, with `dominant-baseline: central` on `top`. The `<svg>` box's left edge snaps
///   to a whole canvas px, as Blink paints replaced boxes.
pub fn text_line(b: &mut Builder, line: TextLine) {
    if line.text.is_empty() || line.size <= 0.0 {
        return;
    }
    let fonts = b.fonts;
    let shown = collapse_white_space(line.text);
    let shaped = fonts.shape(line.weight, &shown);
    let advance = f64::from(shaped.advance) * fonts.units_to_px(line.weight, line.size);
    let fraction = line.align.fraction();
    let max_width = line.max_width.filter(|w| *w > 0.0);

    if let Some(max_width) = max_width
        && line.sizing == TextSizing::Fit
        && estimate_text_width(line.text, line.weight, line.size) > max_width
    {
        b.text(TextRun {
            text: shown.clone().into_owned(),
            weight: line.weight,
            size: line.size,
            // The `<svg>` box sits at `left` snapped to a whole px; its `translateX` then moves it
            // by a fraction of `max_width`, unsnapped. Vertically the run lands where Chromium
            // puts it without that snap (checked against Chromium-painted fit runs).
            x: b.pixel_snapped_x(line.left) - fraction * max_width,
            baseline: line.top + fonts.central_baseline_offset(line.weight, line.size),
            scale_x: if advance > 0.0 { max_width / advance } else { 1.0 },
            color: line.color,
            clip: None,
            shaped,
        });
        return;
    }

    let line_top = line.top - line.size / 2.0;
    b.text(TextRun {
        text: shown.clone().into_owned(),
        weight: line.weight,
        size: line.size,
        x: line.left - fraction * advance,
        baseline: line_top + fonts.line_box_baseline(line.weight, line.size, line.size),
        scale_x: 1.0,
        color: line.color,
        clip: max_width.map(|w| clip_box(line.left, line.top, line.size, w, line.align)),
        shaped,
    });
}

/// The `overflow: hidden` box a stable text or a value-with-unit sits in.
fn clip_box(left: f64, top: f64, size: f64, max_width: f64, align: TextAlign) -> PixelRect {
    PixelRect::new(left - align.fraction() * max_width, top - size * 0.7, max_width, size * 1.4)
}

/// A filled circle, centered on (`cx`, `cy`).
pub fn dot(b: &mut Builder, cx: f64, cy: f64, r: f64, color: Rgba) {
    b.oval(PixelRect::new(cx - r, cy - r, r * 2.0, r * 2.0), color);
}

/// `dimColor`, which throws on a color it cannot parse: the failure is recorded on the builder
/// (the whole picture is an error, as the TypeScript render is) and the piece draws transparent.
fn dimmed(b: &mut Builder, color: Rgba, factor: f64) -> Rgba {
    dim_color(color, factor).unwrap_or_else(|| {
        b.fail(format!("dimColor: not a hex color: {color:?}"));
        Rgba::TRANSPARENT
    })
}

/// A horizontal value bar: a dimmed track with a solid fill. `centered` bars (steering) fill
/// outward from the midpoint in either direction; others fill left to right from 0.
pub fn h_bar(b: &mut Builder, rect: PixelRect, pct: f64, color: Rgba, centered: bool) {
    let PixelRect { left: x, top: y, width: w, height: h } = rect;
    let clamped = pct.min(1.0).max(if centered { -1.0 } else { 0.0 });
    let radius = Radii::all(3f64.min(h / 2.0));
    let track = dimmed(b, color, 0.15);
    b.rect(PixelRect::new(x, y, w.max(0.0), h.max(0.0)), radius, track);
    if centered {
        let mid = dimmed(b, color, 0.4);
        b.rect(PixelRect::new(x + w / 2.0 - 0.5, y, 1.0, h), Radii::ZERO, mid);
        let frac = clamped / 2.0;
        if frac > 0.0 {
            b.rect(PixelRect::new(x + w / 2.0, y, frac * w, h), radius, color);
        } else if frac < 0.0 {
            b.rect(PixelRect::new(x + w / 2.0 + frac * w, y, -frac * w, h), radius, color);
        }
    } else if clamped > 0.0 {
        b.rect(PixelRect::new(x, y, clamped * w, h), radius, color);
    }
}

/// A 20-segment vertical ladder filled bottom-up: lit segments in `stage_color`'s phase color,
/// unlit ones a dimmed version of the same color.
pub fn vertical_seg_bar(b: &mut Builder, rect: PixelRect, pct: f64, stage_color: impl Fn(f64) -> Rgba) {
    let clamped = pct.clamp(0.0, 1.0);
    const SEGMENTS: usize = 20;
    let inner_x = rect.left + 3.0;
    let inner_w = rect.width - 6.0;
    let top = rect.top + 6.0;
    let usable_h = rect.height - 12.0;
    if inner_w <= 0.0 || usable_h <= 0.0 {
        return;
    }
    let seg_h = usable_h / SEGMENTS as f64;
    let filled = (SEGMENTS as f64 * clamped).floor() as usize;
    for i in 0..SEGMENTS {
        let base = stage_color(i as f64 / SEGMENTS as f64);
        let color = if i < filled { base } else { dimmed(b, base, 0.15) };
        let sy = top + usable_h - (i + 1) as f64 * seg_h;
        b.rect(PixelRect::new(inner_x, sy + 1.0, inner_w, (seg_h - 2.0).max(0.0)), Radii::all(2.0), color);
    }
}

/// Saira SemiCondensed Bold's widest digit advance as a fraction of size, rounded up, so a value
/// sized against it never clips (`VALUE_DIGIT_ADVANCE`).
const VALUE_DIGIT_ADVANCE: f64 = 0.56;

/// A value's font size: `share` of the box height, capped so `template` (the widest text the
/// value can show) still fits the width. Sized from the template, never the live text.
pub fn value_size(template: &str, width: f64, height: f64, share: f64) -> f64 {
    let chars = template.encode_utf16().count().max(1) as f64;
    (height * share).min(width * 0.96 / (chars * VALUE_DIGIT_ADVANCE)).max(0.0)
}

/// The default `share` of `value_size`.
pub const VALUE_SHARE: f64 = 0.7;

/// One large value centered in its `width` x `height` box, sized from `template`.
pub fn big_value(b: &mut Builder, text: &str, template: &str, width: f64, height: f64, color: Rgba, share: f64) {
    text_line(
        b,
        TextLine {
            text,
            left: width / 2.0,
            top: height / 2.0,
            size: value_size(template, width, height, share),
            color,
            align: TextAlign::Center,
            max_width: Some(width),
            weight: TextWeight::Value,
            sizing: TextSizing::Stable,
        },
    );
}

/// `ValueWithUnit`'s props.
#[derive(Clone, Copy, Debug)]
pub struct ValueWithUnit<'t> {
    pub value: &'t str,
    pub unit: &'t str,
    pub left: f64,
    pub top: f64,
    pub size: f64,
    pub color: Rgba,
    pub unit_color: Rgba,
    pub align: TextAlign,
    pub max_width: f64,
}

/// The unit's size as a fraction of the value's, and the gap between them.
const UNIT_SCALE: f64 = 0.36;
const UNIT_GAP: f64 = 0.12;

/// A value with a smaller trailing unit on one baseline ("13.5 laps", "P4 /38"), anchored at
/// `left` per `align`, centered on `top`, and clipped to `max_width` like a stable text.
///
/// The DOM is a flex box `1.4 * size` tall (items centered) holding a baseline-aligned flex row:
/// the value (Saira Bold, `size`) and the unit (Saira Medium, `0.36 * size`), `0.12 * size`
/// apart, each its own `line-height: 1` box.
pub fn value_with_unit(b: &mut Builder, v: ValueWithUnit) {
    if v.size <= 0.0 || v.max_width <= 0.0 {
        return;
    }
    let fonts = b.fonts;
    let (value_text, unit_text) = (collapse_white_space(v.value), collapse_white_space(v.unit));
    let value_run = fonts.shape(TextWeight::Value, &value_text);
    let value_width = f64::from(value_run.advance) * fonts.units_to_px(TextWeight::Value, v.size);
    let value_baseline = fonts.line_box_baseline(TextWeight::Value, v.size, v.size);

    let unit_size = v.size * UNIT_SCALE;
    let unit = (!v.unit.is_empty()).then(|| {
        let run = fonts.shape(TextWeight::ValueRegular, &unit_text);
        let width = f64::from(run.advance) * fonts.units_to_px(TextWeight::ValueRegular, unit_size);
        (run, width, fonts.line_box_baseline(TextWeight::ValueRegular, unit_size, unit_size))
    });

    // Baseline alignment: every item's baseline lands on the row's deepest one.
    let row_baseline = unit.as_ref().map_or(value_baseline, |(_, _, ub)| value_baseline.max(*ub));
    let value_bottom = row_baseline - value_baseline + v.size;
    let row_height = unit.as_ref().map_or(value_bottom, |(_, _, ub)| value_bottom.max(row_baseline - ub + unit_size));
    let row_width = value_width + unit.as_ref().map_or(0.0, |(_, uw, _)| v.size * UNIT_GAP + uw);

    let clip = clip_box(v.left, v.top, v.size, v.max_width, v.align);
    let row_left = clip.left + v.align.fraction() * (v.max_width - row_width);
    let baseline = clip.top + (clip.height - row_height) / 2.0 + row_baseline;

    b.text(TextRun {
        text: value_text.into_owned(),
        weight: TextWeight::Value,
        size: v.size,
        x: row_left,
        baseline,
        scale_x: 1.0,
        color: v.color,
        clip: Some(clip),
        shaped: value_run,
    });
    if let Some((run, _, _)) = unit {
        b.text(TextRun {
            text: unit_text.into_owned(),
            weight: TextWeight::ValueRegular,
            size: unit_size,
            x: row_left + value_width + v.size * UNIT_GAP,
            baseline,
            scale_x: 1.0,
            color: v.unit_color,
            clip: Some(clip),
            shaped: run,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::draw::DrawOp;
    use crate::text::Fonts;

    const WHITE: Rgba = Rgba::rgb(255, 255, 255);

    fn line(text: &str, size: f64, align: TextAlign, max_width: f64, weight: TextWeight, sizing: TextSizing) -> TextLine<'_> {
        TextLine { text, left: 100.0, top: 20.0, size, color: WHITE, align, max_width: Some(max_width), weight, sizing }
    }

    fn runs(fonts: &Fonts, draw: impl FnOnce(&mut Builder)) -> Vec<TextRun> {
        let mut ops = Vec::new();
        draw(&mut Builder::new(fonts, &mut ops));
        ops.into_iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) => Some(run),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn fit_squeezes_long_text_to_max_width_instead_of_truncating_it() {
        let fonts = Fonts::new();
        let run = runs(&fonts, |b| text_line(b, line("SECTORS", 26.0, TextAlign::Start, 40.0, TextWeight::Label, TextSizing::Fit))).remove(0);
        assert_eq!(run.text, "SECTORS");
        assert!((run.width(&fonts) - 40.0).abs() < 1e-9, "spans exactly maxWidth");
        assert_eq!(run.x, 100.0);
        assert!(run.scale_x < 1.0);
        assert_eq!(run.clip, None);
    }

    #[test]
    fn fit_does_not_stretch_text_that_already_fits() {
        let fonts = Fonts::new();
        let run = runs(&fonts, |b| text_line(b, line("OK", 12.0, TextAlign::Start, 200.0, TextWeight::Label, TextSizing::Fit))).remove(0);
        assert_eq!(run.scale_x, 1.0);
        assert!(run.clip.is_some());
    }

    #[test]
    fn stable_text_clips_away_from_its_anchor() {
        let fonts = Fonts::new();
        let at = |align| runs(&fonts, |b| text_line(b, line("1:32.456", 26.0, align, 40.0, TextWeight::Value, TextSizing::Stable))).remove(0);

        let end = at(TextAlign::End);
        assert_eq!(end.clip.map(|c| (c.left, c.width)), Some((60.0, 40.0)));
        assert!((end.x + end.width(&fonts) - 100.0).abs() < 1e-9, "right edge on the anchor");

        let start = at(TextAlign::Start);
        assert_eq!(start.clip.map(|c| c.left), Some(100.0));
        assert_eq!(start.x, 100.0);

        let center = at(TextAlign::Center);
        assert_eq!(center.clip.map(|c| c.left), Some(80.0));
        assert!((center.x + center.width(&fonts) / 2.0 - 100.0).abs() < 1e-9);
        // The clip is a CSS box, so its numbers are in layout units (1/64 px).
        let unit = crate::draw::layout_unit;
        assert_eq!(center.clip.map(|c| (c.top, c.height)), Some((unit(20.0 - 26.0 * 0.7), unit(26.0 * 1.4))));
    }

    #[test]
    fn a_stable_line_box_is_centered_on_top_with_chromium_baseline_rounding() {
        let fonts = Fonts::new();
        // Saira at 40px: ascent 45.4 -> 45, descent 17.56 -> 18; half-leading floor((40-63)/2) = -12.
        let run = runs(&fonts, |b| text_line(b, line("8", 40.0, TextAlign::Center, 100.0, TextWeight::Value, TextSizing::Stable))).remove(0);
        assert_eq!(run.baseline, 20.0 - 20.0 + 45.0 - 12.0);
    }

    #[test]
    fn fit_text_uses_the_label_or_value_face_by_weight() {
        let fonts = Fonts::new();
        let label =
            runs(&fonts, |b| text_line(b, line("VIRTUAL ENERGY BUDGET REMAINING", 20.0, TextAlign::Start, 30.0, TextWeight::LabelBold, TextSizing::Fit)));
        assert_eq!(label[0].weight, TextWeight::LabelBold);
        let flag = runs(&fonts, |b| text_line(b, line("SAFETY CAR DEPLOYED", 20.0, TextAlign::Center, 30.0, TextWeight::ValueRegular, TextSizing::Fit)));
        assert_eq!(flag[0].weight, TextWeight::ValueRegular);
        assert!((flag[0].x - 85.0).abs() < 1e-9, "a centered squeeze spans the box around the anchor");
    }

    #[test]
    fn white_space_collapses_like_css_and_the_fit_estimate_still_counts_the_raw_text() {
        let fonts = Fonts::new();
        let run =
            runs(&fonts, |b| text_line(b, line("  Le Mans   963\tRACE ", 12.0, TextAlign::Start, 400.0, TextWeight::Label, TextSizing::Stable))).remove(0);
        assert_eq!(run.text, "Le Mans 963 RACE");
        assert_eq!(collapse_white_space("A B"), Cow::Borrowed("A B"));
        // 9 UTF-16 units * 12 * 0.562 = 60.7 > 60: the squeeze engages on the raw length.
        let fit = runs(&fonts, |b| text_line(b, line("A       B", 12.0, TextAlign::Start, 60.0, TextWeight::Label, TextSizing::Fit))).remove(0);
        assert_eq!((fit.text.as_str(), fit.clip), ("A B", None));
    }

    #[test]
    fn empty_text_or_zero_size_draws_nothing() {
        let fonts = Fonts::new();
        assert!(runs(&fonts, |b| text_line(b, line("", 20.0, TextAlign::Start, 30.0, TextWeight::Label, TextSizing::Stable))).is_empty());
        assert!(runs(&fonts, |b| text_line(b, line("X", 0.0, TextAlign::Start, 30.0, TextWeight::Label, TextSizing::Stable))).is_empty());
    }

    #[test]
    fn value_with_unit_shares_one_baseline_and_anchors_the_pair_as_one_run() {
        let fonts = Fonts::new();
        let v = ValueWithUnit {
            value: "13.5",
            unit: "laps",
            left: 100.0,
            top: 50.0,
            size: 40.0,
            color: WHITE,
            unit_color: WHITE,
            align: TextAlign::End,
            max_width: 200.0,
        };
        let pair = runs(&fonts, |b| value_with_unit(b, v));
        assert_eq!(pair.len(), 2);
        assert_eq!(pair[0].baseline, pair[1].baseline);
        assert_eq!(pair[1].size, 40.0 * 0.36);
        assert!((pair[1].x - (pair[0].x + pair[0].width(&fonts) + 40.0 * 0.12)).abs() < 1e-9);
        assert!((pair[1].x + pair[1].width(&fonts) - 100.0).abs() < 1e-9, "the pair ends on the anchor");

        let no_unit = runs(&fonts, |b| value_with_unit(b, ValueWithUnit { unit: "", align: TextAlign::Center, ..v }));
        assert_eq!(no_unit.len(), 1);
        assert!((no_unit[0].x + no_unit[0].width(&fonts) / 2.0 - 100.0).abs() < 1e-9);
    }

    #[test]
    fn value_size_takes_the_height_share_capped_by_the_template_width() {
        assert_eq!(value_size("00", 1000.0, 100.0, 0.7), 70.0);
        assert!((value_size("0:00.000", 100.0, 1000.0, 0.7) - 96.0 / (8.0 * 0.56)).abs() < 1e-9);
    }

    #[test]
    fn h_bar_fills_from_the_left_or_outward_from_the_middle() {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        h_bar(&mut Builder::new(&fonts, &mut ops), PixelRect::new(0.0, 0.0, 100.0, 10.0), -0.5, WHITE, true);
        let fill = &ops[2];
        assert!(matches!(fill, DrawOp::Rect { rect, .. } if rect.left == 25.0 && rect.width == 25.0), "{fill:?}");
    }
}
