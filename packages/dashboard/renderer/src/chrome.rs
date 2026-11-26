// Widget chrome: the frame and label a widget wears. Sprint draws one look on every dash: a 1-px
// edge with 6-px corners and the label centred in the top edge. A widget may only go without its
// frame or its label (`Look`). Widgets draw only their values; the frame, the label and the knob
// colour come from here.
//
// Geometry is cell-local (0,0 is the widget's cell top-left), authored at 800x480 and scaled by
// `ChromeContext::scale`.

use crate::draw::{Builder, Radii};
use crate::grid::PixelRect;
use crate::palette::{DashPaletteColors, Rgba, with_alpha};
use crate::primitives::{TextAlign, TextLine, TextSizing, text_line};
use crate::text::TextWeight;

/// Sprint's frame: its corner radius and edge weight, at 800x480.
pub const RADIUS: f64 = 6.0;
const EDGE: f64 = 1.0;

/// How one widget wears Sprint's look: with or without its frame, with or without its label.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Look {
    pub framed: bool,
    pub labelled: bool,
}

impl Look {
    /// Frame and label: what every widget wears unless it turned one off.
    pub const SPRINT: Look = Look { framed: true, labelled: true };

    /// The edge weight at 800x480: none without a frame.
    fn edge(self) -> f64 {
        if self.framed { EDGE } else { 0.0 }
    }
}

/// What a frame is drawn with: the screen's scale against 800x480 and the widget's look.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChromeContext {
    pub scale: f64,
    pub look: Look,
}

/// The box a frame fills in a `width` x `height` cell, and its corner radius: where an unframed
/// widget gets its fill when an overlay lights it (the pit limiter's own widgets).
pub fn frame_box(ctx: ChromeContext, width: f64, height: f64) -> (PixelRect, f64) {
    let inset = GAP * ctx.scale;
    let box_ = PixelRect::new(inset, inset, (width - inset * 2.0).max(0.0), (height - inset * 2.0).max(0.0));
    (box_, (RADIUS * ctx.scale).min(box_.width / 2.0).min(box_.height / 2.0))
}

/// Where an unframed widget's values go inside the box an overlay lights (`frame_box`): off its
/// edge and padded like a framed widget's.
pub fn lit_content(ctx: ChromeContext, width: f64, height: f64) -> PixelRect {
    let (box_, _) = frame_box(ctx, width, height);
    let edge = ctx.look.edge();
    let pad = 8.0 * ctx.scale;
    PixelRect::new(box_.left + edge + pad, box_.top + edge + pad / 2.0, (box_.width - (edge + pad) * 2.0).max(0.0), (box_.height - edge * 2.0 - pad).max(0.0))
}

/// Where an unframed widget's content goes: the same margin a frame keeps, so bare and framed
/// widgets line up.
pub fn bare_content(ctx: ChromeContext, width: f64, height: f64) -> PixelRect {
    let inset = GAP * ctx.scale + ctx.look.edge();
    PixelRect::new(inset, inset, (width - inset * 2.0).max(0.0), (height - inset * 2.0).max(0.0))
}

/// The palette for values drawn on a color fill: every text slot turns to the dark canvas
/// color, so a value on a green, blue or orange fill stays legible.
pub fn ink_palette(palette: &DashPaletteColors) -> DashPaletteColors {
    let ink = palette.background;
    DashPaletteColors {
        foreground: ink,
        neutral: ink,
        primary: ink,
        secondary: with_alpha(ink, 0.78),
        muted: with_alpha(ink, 0.7),
        assist_active: ink,
        ..*palette
    }
}

/// `WidgetFrame`'s props, minus the children (passed to `widget_frame` as a closure).
#[derive(Clone, Copy, Debug)]
pub struct WidgetFrame<'t> {
    pub ctx: ChromeContext,
    /// The cell this frame fills, local to the builder's origin.
    pub rect: PixelRect,
    pub title: Option<&'t str>,
    /// The knob identity color, or `None` for an ordinary widget.
    pub accent: Option<Rgba>,
    /// A condition color filling the frame, or `None` to keep it black.
    pub fill: Option<Rgba>,
    pub palette: DashPaletteColors,
}

/// A title's short form, for a box too narrow for the whole one (`fitted_title`). Titles are the
/// renderer's own (`widgets::widget_chrome`), so a driver never types one.
fn short_title(title: &str) -> Option<&'static str> {
    Some(match title {
        "SESSION BEST" => "SES BEST",
        "CLASS BEST" => "CL BEST",
        "PREDICTED" => "PRED",
        "5 LAP AVG" => "AVG 5",
        "10 LAP AVG" => "AVG 10",
        "ALL-TIME BEST" => "ATB",
        "SESSION TIME" => "SES TIME",
        "MIGRATION" => "MIG",
        "FUEL TARGET" => "FUEL TGT",
        "CLASS POS" => "CL POS",
        "CLASS AHEAD" => "CL AHEAD",
        "CLASS BEHIND" => "CL BEHIND",
        "POS AHEAD" => "P AHEAD",
        "POS BEHIND" => "P BEHIND",
        "CLASS LEADER" => "CL LEADER",
        "TRACK LIMITS" => "TL",
        "INCIDENTS" => "INC",
        "PIT STOPS" => "STOPS",
        "FUEL LAST LAP" => "FUEL LAST",
        "FUEL STINT AVG" => "FUEL STINT",
        "FUEL THIS LAP" => "FUEL LAP",
        "LIFT & COAST" => "L&C",
        "MOTOR WATER" => "MTR WATER",
        "PIT WINDOW" => "PIT WIN",
        "VE LAST LAP" => "VE LAST",
        "VE STINT AVG" => "VE STINT",
        "VE REFUEL" => "VE REF",
        _ => return None,
    })
}

/// `title`, or its short form when the whole one is wider than `room` at `size`: titles shorten
/// on a narrow box instead of shrinking past reading.
fn fitted_title<'t>(b: &Builder, title: &'t str, size: f64, room: f64) -> &'t str {
    match short_title(title) {
        Some(short) if b.text_width(title, size, TextWeight::LabelBold) > room => short,
        _ => title,
    }
}

/// Half the gutter between neighbouring frames, at 800x480.
const GAP: f64 = 3.0;

/// How far a box with its label in the top edge steps down, so the label clears the box above.
const NOTCH_DROP: f64 = 5.0;

/// One widget frame, then `children` in its content box (with the builder's origin at the content
/// box, and the palette to draw in — ink on a fill): a box with Sprint's radius and edge, its edge
/// in the text color (white by default, like a works team's wheel), its label cut into the top
/// edge (small above the value when the widget has no frame), or no label. A condition fills the
/// box and turns every text in it to the dark ink; a knob's identity color is its label's color,
/// or a tab before a frameless label. An untitled frame (a bar) keeps a thinner margin.
pub fn widget_frame(b: &mut Builder, frame: WidgetFrame, children: impl FnOnce(&mut Builder, f64, f64, &DashPaletteColors)) {
    let WidgetFrame { ctx, rect, title, accent, fill, palette } = frame;
    let s = ctx.scale;
    let gap = GAP * s;
    let labelled = title.is_some() && ctx.look.labelled;
    let edge = if ctx.look.framed { (EDGE * s).max(1.0) } else { 0.0 };
    let notched = labelled && edge > 0.0;
    let drop = if notched { NOTCH_DROP * s } else { 0.0 };
    let box_ = PixelRect::new(gap, gap + drop, (rect.width - gap * 2.0).max(0.0), (rect.height - gap * 2.0 - drop).max(0.0));
    let radius = (RADIUS * s).min(box_.width / 2.0).min(box_.height / 2.0);
    let band_height = match (labelled, notched) {
        (false, _) => 0.0,
        (true, true) => 7.0 * s,
        (true, false) => 15.0 * s,
    };
    let content_palette = if fill.is_some() { ink_palette(&palette) } else { palette };
    let pad = if title.is_some() { 6.0 * s } else { 2.0 * s };
    // An untitled frame (a bar) keeps the same 2 px on every side, so its meter sits evenly.
    let bottom = if title.is_some() { 3.0 * s } else { pad };
    // The box's inner edges.
    let (inner_left, inner_right) = (box_.left + edge + pad, box_.left + box_.width - edge - pad);
    let label_size = if notched { 10.0 * s } else { 11.0 * s };
    // A label in the edge keeps clear of the corners, with a 6-px gap in the edge either side.
    let notch_room = (box_.width - (radius.max(6.0 * s) + 8.0 * s) * 2.0).max(0.0);
    let title = title.filter(|_| labelled).map(|title| {
        let room = if notched { notch_room } else { inner_right - inner_left };
        fitted_title(b, title, label_size, room)
    });

    b.translated(rect.left, rect.top, |b| {
        if let Some(fill) = fill {
            b.rect(box_, Radii::all(radius), fill);
        }
        if edge > 0.0 {
            b.border(box_, edge, radius, fill.unwrap_or(palette.foreground));
        }
        if notched && let Some(title) = title {
            let size = label_size;
            let width = b.text_width(title, size, TextWeight::LabelBold).min(notch_room);
            let left = box_.left + (box_.width - width) / 2.0;
            // On a filled box the label sits on a round dark pill across the edge, so it never
            // sits on its fill; otherwise the notch only breaks the edge.
            if fill.is_some() {
                let height = size * 1.4;
                let pill = PixelRect::new(left - 5.0 * s, box_.top + edge / 2.0 - height / 2.0, width + 10.0 * s, height);
                b.rect(pill, Radii::all(height / 2.0), palette.background);
            } else {
                b.rect(PixelRect::new(left - 6.0 * s, box_.top - 1.0, width + 12.0 * s, edge + 2.0), Radii::ZERO, palette.background);
            }
            let color = fill.or(accent).unwrap_or(palette.secondary);
            text_line(
                b,
                TextLine {
                    text: title,
                    left,
                    top: box_.top + edge / 2.0,
                    size,
                    color,
                    align: TextAlign::Start,
                    max_width: Some(width),
                    weight: TextWeight::LabelBold,
                    sizing: TextSizing::Fit,
                },
            );
        } else if let Some(title) = title {
            // No frame: the label sits small above the value, after the knob's tab.
            let band = PixelRect::new(box_.left, box_.top, box_.width, band_height);
            let mut left = band.left + edge + pad;
            if let (Some(accent), None) = (accent, fill) {
                b.rect(PixelRect::new(left, band.top + edge + band.height / 2.0 - 4.0 * s, 3.0 * s, 9.0 * s), Radii::ZERO, accent);
                left += 7.0 * s;
            }
            let color = if fill.is_some() { with_alpha(palette.background, 0.78) } else { palette.muted };
            text_line(
                b,
                TextLine {
                    text: title,
                    left,
                    top: band.top + band.height / 2.0 + edge,
                    size: label_size,
                    color,
                    align: TextAlign::Start,
                    max_width: Some((band.left + band.width - left - pad).max(0.0)),
                    weight: TextWeight::LabelBold,
                    sizing: TextSizing::Fit,
                },
            );
        }
        let top = box_.top + edge + band_height + if labelled { 0.0 } else { 2.0 * s };
        let content = PixelRect::new(inner_left, top, (inner_right - inner_left).max(0.0), (box_.top + box_.height - edge - bottom - top).max(0.0));
        b.translated(content.left, content.top, |b| children(b, content.width, content.height, &content_palette));
    });
}

/// Sprint's group frame: one edge round `rect` (the union of its widgets' cells) with the
/// group's name breaking its top edge, like a fieldset's legend.
pub fn group_frame(b: &mut Builder, ctx: ChromeContext, rect: PixelRect, name: &str, palette: &DashPaletteColors) {
    let s = ctx.scale;
    let edge = (EDGE * s).max(1.0);
    let radius = (RADIUS * s + GAP * s).min(rect.width / 2.0).min(rect.height / 2.0);
    let size = 10.0 * s;
    let label_width = b.text_width(name, size, TextWeight::LabelBold);
    let label_left = rect.left + radius.max(8.0 * s) + 4.0 * s;
    b.border(rect, edge, radius, palette.foreground);
    b.rect(PixelRect::new(label_left - 4.0 * s, rect.top - 1.0, label_width + 8.0 * s, edge + 2.0), Radii::ZERO, palette.background);
    text_line(b, group_label(name, label_left, rect.top + edge / 2.0, size, palette.muted));
}

fn group_label(text: &str, left: f64, top: f64, size: f64, color: Rgba) -> TextLine<'_> {
    TextLine { text, left, top, size, color, align: TextAlign::Start, max_width: None, weight: TextWeight::LabelBold, sizing: TextSizing::Stable }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::draw::DrawOp;
    use crate::palette::{DEFAULT_DASH_PALETTE, dash_setting_colors};
    use crate::text::Fonts;

    fn at() -> ChromeContext {
        ChromeContext { scale: 1.0, look: Look::SPRINT }
    }

    fn frame_ops(title: &str, accent: Option<Rgba>, fill: Option<Rgba>) -> (Vec<DrawOp>, Option<DashPaletteColors>) {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let mut handed = None;
        let frame = WidgetFrame { ctx: at(), rect: PixelRect::new(0.0, 0.0, 120.0, 120.0), title: Some(title), accent, fill, palette: DEFAULT_DASH_PALETTE };
        widget_frame(&mut Builder::new(&fonts, &mut ops), frame, |_, _, _, palette| handed = Some(*palette));
        (ops, handed)
    }

    #[test]
    fn a_box_wears_a_white_edge_with_its_label_cut_into_it_in_a_knobs_color() {
        let tc = dash_setting_colors::TC;
        let (ops, _) = frame_ops("TC", Some(tc), None);
        let (edge, color) = ops
            .iter()
            .find_map(|op| match op {
                DrawOp::Border { rect, color, .. } => Some((*rect, *color)),
                _ => None,
            })
            .expect("an edge");
        assert_eq!(color, DEFAULT_DASH_PALETTE.foreground);
        let label = ops
            .iter()
            .find_map(|op| match op {
                DrawOp::Text(run) => Some(run),
                _ => None,
            })
            .expect("a label");
        assert_eq!(label.color, tc);
        assert!(label.baseline > edge.top && label.baseline < edge.top + 8.0, "the label straddles the top edge: {} vs {}", label.baseline, edge.top);
    }

    #[test]
    fn a_fill_covers_the_frame_and_hands_its_content_an_ink_palette() {
        let fill = DEFAULT_DASH_PALETTE.timing_personal_best;
        let (ops, handed) = frame_ops("DELTA", None, Some(fill));
        assert_eq!(handed.map(|p| p.foreground), Some(DEFAULT_DASH_PALETTE.background));
        assert!(matches!(ops[0], DrawOp::Rect { color, .. } if color == fill));
        let title = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) => Some(run.color),
            _ => None,
        });
        assert_eq!(title, Some(fill), "the label in the edge keeps the fill's colour on its dark pill");
    }

    /// A 160x60 frame titled "LAP" in `look`, `fill` lit; its ops, the label's run and the
    /// content box (marked by a rect the content draws over all of it).
    fn frame_parts(look: Look, fill: Option<Rgba>) -> (Vec<DrawOp>, Option<crate::draw::TextRun>, PixelRect) {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let marker = Rgba::rgb(1, 2, 3);
        let frame = WidgetFrame {
            ctx: ChromeContext { scale: 1.0, look },
            rect: PixelRect::new(0.0, 0.0, 160.0, 60.0),
            title: Some("LAP"),
            accent: None,
            fill,
            palette: DEFAULT_DASH_PALETTE,
        };
        widget_frame(&mut Builder::new(&fonts, &mut ops), frame, |b, w, h, _| b.rect(PixelRect::new(0.0, 0.0, w, h), Radii::ZERO, marker));
        let run = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) => Some(run.clone()),
            _ => None,
        });
        let content = ops.iter().find_map(|op| match op {
            DrawOp::Rect { rect, color, .. } if *color == marker => Some(*rect),
            _ => None,
        });
        (ops, run, content.expect("the content box"))
    }

    #[test]
    fn a_title_too_wide_for_its_box_prints_its_short_form() {
        let title_in = |width: f64| {
            let fonts = Fonts::new();
            let mut ops = Vec::new();
            let frame = WidgetFrame {
                ctx: ChromeContext { scale: 1.0, look: Look::SPRINT },
                rect: PixelRect::new(0.0, 0.0, width, 60.0),
                title: Some("SESSION BEST"),
                accent: None,
                fill: None,
                palette: DEFAULT_DASH_PALETTE,
            };
            widget_frame(&mut Builder::new(&fonts, &mut ops), frame, |_, _, _, _| {});
            ops.iter()
                .find_map(|op| match op {
                    DrawOp::Text(run) => Some(run.text.clone()),
                    _ => None,
                })
                .expect("a title")
        };
        assert_eq!(title_in(200.0), "SESSION BEST");
        assert_eq!(title_in(70.0), "SES BEST");
    }

    #[test]
    fn a_widget_without_its_frame_draws_no_edge_and_its_label_small_above_the_value() {
        let (ops, run, content) = frame_parts(Look { framed: false, labelled: true }, None);
        assert!(!ops.iter().any(|op| matches!(op, DrawOp::Border { .. })), "no edge");
        let run = run.expect("a label");
        assert!(run.baseline < content.top, "above the value: {} vs {}", run.baseline, content.top);
    }

    #[test]
    fn a_widget_without_its_label_gives_the_value_the_label_s_room() {
        let (_, labelled, with_label) = frame_parts(Look::SPRINT, None);
        let (_, none, without_label) = frame_parts(Look { framed: true, labelled: false }, None);
        assert!(labelled.is_some() && none.is_none());
        assert!(without_label.height > with_label.height, "{} vs {}", without_label.height, with_label.height);
    }

    #[test]
    fn a_label_in_the_edge_of_a_lit_box_sits_on_a_round_dark_pill() {
        let fill = DEFAULT_DASH_PALETTE.assist_active;
        let (ops, _, _) = frame_parts(Look::SPRINT, Some(fill));
        let pill = ops
            .iter()
            .find_map(|op| match op {
                DrawOp::Rect { rect, radii, color } if *color == DEFAULT_DASH_PALETTE.background => Some((*rect, *radii)),
                _ => None,
            })
            .expect("a pill under the label");
        assert_eq!(pill.1, Radii::all(pill.0.height / 2.0));
    }
}
