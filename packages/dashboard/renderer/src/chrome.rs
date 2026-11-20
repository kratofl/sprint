// Widget chrome: the frame and title a widget wears, drawn per dash style. Ported from
// the retired React renderer's `chrome.tsx`. Widgets render only their values; the frame, the
// title and the knob color come from here, so switching a layout's `dashStyle` restyles every widget
// without touching its content or its cell.
//
// Geometry is cell-local (0,0 is the widget's cell top-left) and scales with the grid cell, so
// a 40px cell on an 800x480 panel draws at the authored pixel sizes.

use crate::draw::{Builder, Radii};
use crate::grid::PixelRect;
use crate::model::{BorderWeight, DashChrome, DashStyle, GroupStyle, LabelMode};
use crate::palette::{DashPaletteColors, Rgba, with_alpha};
use crate::primitives::{TextAlign, TextLine, TextSizing, text_line};
use crate::text::TextWeight;

/// What every frame on a dash shares: its style and the scale of one grid cell.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChromeContext {
    pub style: DashStyle,
    pub scale: f64,
    /// The flat chrome's settings, with the widget's own edge and label already applied.
    pub flat: DashChrome,
}

/// The grid cell size the chrome's pixel sizes are authored at (an 800x480 panel on a 20x12 grid).
pub const CHROME_CELL_PX: f64 = 40.0;

const BORDER: f64 = 2.0;

/// The frame's edge: 2px in the boxed styles, the dash's chosen weight in the flat one.
fn border_width(ctx: ChromeContext) -> f64 {
    match ctx.style {
        DashStyle::Panels | DashStyle::Grid | DashStyle::Bars => BORDER,
        DashStyle::Flat => ctx.flat.border.px(),
    }
}

/// The space between neighbouring frames, split across both. Grid frames grow 1px instead so
/// neighbouring lines overlap into one.
fn frame_inset(ctx: ChromeContext) -> f64 {
    match ctx.style {
        DashStyle::Panels => 4.0 * ctx.scale,
        DashStyle::Bars | DashStyle::Flat => 3.0 * ctx.scale,
        DashStyle::Grid => -1.0,
    }
}

fn frame_radius(ctx: ChromeContext) -> f64 {
    match ctx.style {
        DashStyle::Panels => 10.0 * ctx.scale,
        DashStyle::Bars => 8.0 * ctx.scale,
        DashStyle::Flat => ctx.flat.radius * ctx.scale,
        DashStyle::Grid => 0.0,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FrameGeometry {
    /// The frame's outer box, border included.
    pub box_: PixelRect,
    /// The title band (the bar itself in the bars style), or `None` for an untitled frame.
    pub title: Option<PixelRect>,
    /// Where the widget's values go.
    pub content: PixelRect,
}

/// A framed widget's geometry inside a `width` x `height` cell.
pub fn frame_geometry(ctx: ChromeContext, width: f64, height: f64, titled: bool) -> FrameGeometry {
    let inset = frame_inset(ctx);
    let edge = border_width(ctx);
    let box_ = PixelRect::new(inset, inset, (width - inset * 2.0).max(0.0), (height - inset * 2.0).max(0.0));
    let inner = PixelRect::new(box_.left + edge, box_.top + edge, (box_.width - edge * 2.0).max(0.0), (box_.height - edge * 2.0).max(0.0));
    // Grid cells pad a little more: cells on the canvas edge sit under the 4px outer frame. Open
    // cells have no edge to keep off, so their label and value start at the cell's own edge.
    let pad = (if ctx.style == DashStyle::Grid { 10.0 } else { 8.0 }) * ctx.scale;
    let title_height = if titled {
        (match ctx.style {
            DashStyle::Bars => 22.0,
            DashStyle::Flat => flat_label_height(ctx.flat.label),
            _ => 20.0,
        }) * ctx.scale
    } else {
        0.0
    };
    let title_offset = match ctx.style {
        DashStyle::Bars | DashStyle::Flat => 0.0,
        DashStyle::Grid => 4.0,
        DashStyle::Panels => 2.0,
    };
    let title = titled.then(|| PixelRect::new(inner.left, inner.top + title_offset * ctx.scale, inner.width, title_height));
    let top = match title {
        Some(t) => t.top + t.height + if ctx.style == DashStyle::Bars { 4.0 * ctx.scale } else { 0.0 },
        None => inner.top + pad / 2.0,
    };
    let bottom = inner.top + inner.height - pad / 2.0;
    FrameGeometry { box_, title, content: PixelRect::new(inner.left + pad, top, (inner.width - pad * 2.0).max(0.0), (bottom - top).max(0.0)) }
}

/// The box a frame fills in a `width` x `height` cell, and its corner radius: where an unframed
/// widget gets its fill when an overlay lights it (the pit limiter's own widgets).
pub fn frame_box(ctx: ChromeContext, width: f64, height: f64) -> (PixelRect, f64) {
    let box_ = frame_geometry(ctx, width, height, false).box_;
    (box_, frame_radius(ctx).min(box_.width / 2.0).min(box_.height / 2.0))
}

/// Where an unframed widget's content goes: the same margin a frame keeps, so bare and framed
/// widgets line up.
pub fn bare_content(ctx: ChromeContext, width: f64, height: f64) -> PixelRect {
    let inset = frame_inset(ctx).max(0.0) + border_width(ctx);
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
    /// A widget's own label color override, if any.
    pub title_color: Option<Rgba>,
    pub palette: DashPaletteColors,
}

/// One widget frame in the layout's dash style, then `children` in its content box (with the
/// builder's origin at the content box, and the palette to draw in — ink on a fill):
/// - panels: a separate rounded box; a knob's color is its border.
/// - grid: ruled cells that share their lines; a knob's color is a small tab before the title.
/// - bars: a rounded box with a title bar; a knob's color fills the bar.
pub fn widget_frame(b: &mut Builder, frame: WidgetFrame, children: impl FnOnce(&mut Builder, f64, f64, &DashPaletteColors)) {
    if ctx_is_flat(frame.ctx) {
        return flat_frame(b, frame, children);
    }
    let WidgetFrame { ctx, rect, title, accent, fill, title_color, palette } = frame;
    let geometry = frame_geometry(ctx, rect.width, rect.height, title.is_some());
    let edge = if ctx.style == DashStyle::Grid {
        palette.border
    } else {
        fill.or(if ctx.style == DashStyle::Panels { accent } else { None }).unwrap_or(palette.border)
    };
    let bar_color = fill.or(accent).unwrap_or(palette.border);
    let on_color = fill.is_some() || (ctx.style == DashStyle::Bars && accent.is_some());
    let resolved_title_color = if on_color {
        with_alpha(palette.background, 0.78)
    } else if ctx.style == DashStyle::Bars {
        palette.foreground
    } else {
        title_color.unwrap_or(palette.secondary)
    };
    let content_palette = if fill.is_some() { ink_palette(&palette) } else { palette };
    let tab = ctx.style == DashStyle::Grid && accent.is_some() && fill.is_none();
    let title_size = 12.0 * ctx.scale;
    let title_pad = (if ctx.style == DashStyle::Grid { 10.0 } else { 8.0 }) * ctx.scale;
    let title_left = geometry.title.map_or(0.0, |t| t.left) + title_pad + if tab { 10.0 * ctx.scale } else { 0.0 };
    let radius = frame_radius(ctx);

    b.translated(rect.left, rect.top, |b| {
        // CSS paint order: the box's background, its border, then its children (the bar).
        let box_ = geometry.box_;
        if let Some(fill) = fill {
            b.rect(box_, Radii::all(radius), fill);
        }
        b.border(box_, BORDER, radius, edge);
        if ctx.style == DashStyle::Bars
            && let Some(title_band) = geometry.title
        {
            // The bar is a child of the box's padding box, so `overflow: hidden` rounds its
            // top corners by the inner radius and cuts it at the padding box's bottom.
            let padding_height = (box_.height - BORDER * 2.0).max(0.0);
            let bar = PixelRect::new(box_.left + BORDER, box_.top + BORDER, (box_.width - BORDER * 2.0).max(0.0), title_band.height.min(padding_height));
            b.rect(bar, Radii::top((radius - BORDER).max(0.0)), bar_color);
        }
        if let (Some(title_band), Some(title)) = (geometry.title, title) {
            if tab && let Some(accent) = accent {
                let tab_rect =
                    PixelRect::new(title_band.left + title_pad, title_band.top + title_band.height / 2.0 - 6.5 * ctx.scale, 5.0 * ctx.scale, 13.0 * ctx.scale);
                b.rect(tab_rect, Radii::all(2.5 * ctx.scale), accent);
            }
            text_line(
                b,
                TextLine {
                    text: title,
                    left: title_left,
                    top: title_band.top + title_band.height / 2.0,
                    size: title_size,
                    color: resolved_title_color,
                    align: TextAlign::Start,
                    max_width: Some((title_band.left + title_band.width - title_left - title_pad).max(0.0)),
                    weight: TextWeight::LabelBold,
                    sizing: TextSizing::Fit,
                },
            );
        }
        let content = geometry.content;
        b.translated(content.left, content.top, |b| children(b, content.width, content.height, &content_palette));
    });
}

fn ctx_is_flat(ctx: ChromeContext) -> bool {
    ctx.style.is_flat()
}

/// Half the gutter between neighbouring flat frames, at 800x480.
const FLAT_GAP: f64 = 3.0;

/// How far a box with its label in the top edge steps down, so the label clears the box above.
const NOTCH_DROP: f64 = 5.0;

/// A label band's height for the flat chrome, at 800x480.
fn flat_label_height(label: LabelMode) -> f64 {
    match label {
        LabelMode::Off => 0.0,
        LabelMode::On => 15.0,
        LabelMode::Capsule => 17.0,
    }
}

/// The flat chrome's frame: a box with the dash's radius and the widget's edge weight, its edge
/// in the text color (white by default, like a works team's wheel), and its label off, in a band
/// across the top, or `On`: cut into the top edge, or small above the value when there is no
/// edge. A condition fills the box and turns every text in it to the dark ink; a knob's identity
/// color is its label's color, a tab before an edgeless label, or the band's color.
fn flat_frame(b: &mut Builder, frame: WidgetFrame, children: impl FnOnce(&mut Builder, f64, f64, &DashPaletteColors)) {
    let WidgetFrame { ctx, rect, title, accent, fill, title_color, palette } = frame;
    let s = ctx.scale;
    let gap = FLAT_GAP * s;
    let label = if title.is_some() { ctx.flat.label } else { LabelMode::Off };
    let edge = if ctx.flat.border == BorderWeight::None { 0.0 } else { (ctx.flat.border.px() * s).max(1.0) };
    let notched = label == LabelMode::On && edge > 0.0;
    let drop = if notched { NOTCH_DROP * s } else { 0.0 };
    let box_ = PixelRect::new(gap, gap + drop, (rect.width - gap * 2.0).max(0.0), (rect.height - gap * 2.0 - drop).max(0.0));
    let radius = (ctx.flat.radius * s).min(box_.width / 2.0).min(box_.height / 2.0);
    let band_height = if notched { 7.0 * s } else { flat_label_height(label) * s };
    let content_palette = if fill.is_some() { ink_palette(&palette) } else { palette };
    let pad = 6.0 * s;

    b.translated(rect.left, rect.top, |b| {
        if let Some(fill) = fill {
            b.rect(box_, Radii::all(radius), fill);
        }
        if edge > 0.0 {
            b.border(box_, edge, radius, fill.unwrap_or(palette.foreground));
        }
        if notched && let Some(title) = title {
            let size = 10.0 * s;
            let left = box_.left + radius.max(6.0 * s) + 4.0 * s;
            let width = b.text_width(title, size, TextWeight::LabelBold).min((box_.width - (left - box_.left) * 2.0).max(0.0));
            // On a filled box the notch is a full label high, so the label never sits on its fill.
            let notch = if fill.is_some() {
                PixelRect::new(left - 4.0 * s, box_.top - 1.0, width + 8.0 * s, size * 0.75)
            } else {
                PixelRect::new(left - 4.0 * s, box_.top - 1.0, width + 8.0 * s, edge + 2.0)
            };
            b.rect(notch, Radii::ZERO, palette.background);
            let color = fill.or(accent).unwrap_or_else(|| title_color.unwrap_or(palette.secondary));
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
            let band = PixelRect::new(box_.left, box_.top, box_.width, band_height);
            let (left, color) = match label {
                LabelMode::Off => (0.0, palette.muted),
                LabelMode::On => {
                    let mut left = band.left + edge + pad;
                    if let (Some(accent), None) = (accent, fill) {
                        b.rect(PixelRect::new(left, band.top + edge + band.height / 2.0 - 4.0 * s, 3.0 * s, 9.0 * s), Radii::ZERO, accent);
                        left += 7.0 * s;
                    }
                    let color = if fill.is_some() { with_alpha(palette.background, 0.78) } else { title_color.unwrap_or(palette.muted) };
                    (left, color)
                }
                LabelMode::Capsule => {
                    let band_fill = if fill.is_some() { with_alpha(palette.background, 0.22) } else { accent.unwrap_or(palette.surface) };
                    b.rect(band, Radii::top(radius), band_fill);
                    let on_color = fill.is_some() || accent.is_some();
                    (band.left + pad, if on_color { with_alpha(palette.background, 0.85) } else { title_color.unwrap_or(palette.secondary) })
                }
            };
            if label != LabelMode::Off {
                let top = band.top + band.height / 2.0 + if label == LabelMode::On { edge } else { 0.0 };
                text_line(
                    b,
                    TextLine {
                        text: title,
                        left,
                        top,
                        size: 11.0 * s,
                        color,
                        align: TextAlign::Start,
                        max_width: Some((band.left + band.width - left - pad).max(0.0)),
                        weight: TextWeight::LabelBold,
                        sizing: TextSizing::Fit,
                    },
                );
            }
        }
        let top = box_.top + edge + band_height + if label == LabelMode::Off { 2.0 * s } else { 0.0 };
        let content =
            PixelRect::new(box_.left + edge + pad, top, (box_.width - (edge + pad) * 2.0).max(0.0), (box_.top + box_.height - edge - 3.0 * s - top).max(0.0));
        b.translated(content.left, content.top, |b| children(b, content.width, content.height, &content_palette));
    });
}

/// A group's own frame (mockup v2): one edge round `rect` (the union of its widgets' cells) and
/// its name set into the top edge, plain or in a pill.
pub fn group_frame(b: &mut Builder, ctx: ChromeContext, rect: PixelRect, style: GroupStyle, name: &str, palette: &DashPaletteColors) {
    let s = ctx.scale;
    let edge = if style.border == BorderWeight::None { 0.0 } else { (style.border.px() * s).max(1.0) };
    let radius = (ctx.flat.radius * s + FLAT_GAP * s).min(rect.width / 2.0).min(rect.height / 2.0);
    let size = 10.0 * s;
    let label_width = b.text_width(name, size, TextWeight::LabelBold);
    let label_left = if style.centered { rect.left + (rect.width - label_width) / 2.0 } else { rect.left + radius.max(8.0 * s) + 4.0 * s };
    if edge > 0.0 {
        b.border(rect, edge, radius, palette.foreground);
    }
    match style.label {
        LabelMode::Off => {}
        LabelMode::On => {
            // The name breaks the top edge, like a fieldset's legend.
            b.rect(PixelRect::new(label_left - 4.0 * s, rect.top - 1.0, label_width + 8.0 * s, edge + 2.0), Radii::ZERO, palette.background);
            text_line(b, group_label(name, label_left, rect.top + edge / 2.0, size, palette.muted));
        }
        LabelMode::Capsule => {
            let pill = PixelRect::new(label_left - 6.0 * s, rect.top - 7.0 * s + edge / 2.0, label_width + 12.0 * s, 14.0 * s);
            b.rect(pill, Radii::all(7.0 * s), palette.border);
            text_line(b, group_label(name, label_left, pill.top + pill.height / 2.0, size, palette.foreground));
        }
    }
}

fn group_label(text: &str, left: f64, top: f64, size: f64, color: Rgba) -> TextLine<'_> {
    TextLine { text, left, top, size, color, align: TextAlign::Start, max_width: None, weight: TextWeight::LabelBold, sizing: TextSizing::Stable }
}

/// The grid style's outer frame: one rounded edge around the whole canvas, drawn over the
/// cells' own lines.
pub fn grid_outer_frame(b: &mut Builder, ctx: ChromeContext, width: f64, height: f64, palette: &DashPaletteColors) {
    b.border(PixelRect::new(0.0, 0.0, width, height), 4.0 * ctx.scale, 14.0 * ctx.scale, palette.border);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::draw::DrawOp;
    use crate::palette::{DEFAULT_DASH_PALETTE, dash_setting_colors};
    use crate::text::Fonts;

    fn at(style: DashStyle) -> ChromeContext {
        ChromeContext { style, scale: 1.0, flat: DashChrome::default() }
    }

    fn frame_ops(style: DashStyle, title: &str, accent: Option<Rgba>, fill: Option<Rgba>) -> (Vec<DrawOp>, Option<DashPaletteColors>) {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let mut handed = None;
        let frame = WidgetFrame {
            ctx: at(style),
            rect: PixelRect::new(0.0, 0.0, 120.0, 120.0),
            title: Some(title),
            accent,
            fill,
            title_color: None,
            palette: DEFAULT_DASH_PALETTE,
        };
        widget_frame(&mut Builder::new(&fonts, &mut ops), frame, |_, _, _, palette| handed = Some(*palette));
        (ops, handed)
    }

    #[test]
    fn panels_keep_a_gap_between_frames_and_grid_frames_overlap_into_one_shared_line() {
        assert_eq!(frame_geometry(at(DashStyle::Panels), 120.0, 120.0, true).box_.left, 4.0);
        assert_eq!(frame_geometry(at(DashStyle::Grid), 120.0, 120.0, true).box_.left, -1.0);
    }

    #[test]
    fn the_content_box_sits_below_the_title_band_in_every_style_and_fills_the_frame_when_untitled() {
        for style in [DashStyle::Panels, DashStyle::Grid, DashStyle::Bars] {
            let titled = frame_geometry(at(style), 120.0, 120.0, true);
            let title = titled.title.expect("titled");
            assert!(titled.content.top >= title.top + title.height, "{style:?}");
            let untitled = frame_geometry(at(style), 120.0, 120.0, false);
            assert_eq!(untitled.title, None);
            assert!(untitled.content.height > titled.content.height, "{style:?}");
        }
    }

    #[test]
    fn chrome_scales_with_the_grid_cell() {
        let small = frame_geometry(ChromeContext { style: DashStyle::Bars, scale: 1.0, flat: DashChrome::default() }, 120.0, 120.0, true);
        let large = frame_geometry(ChromeContext { style: DashStyle::Bars, scale: 2.0, flat: DashChrome::default() }, 240.0, 240.0, true);
        assert_eq!(large.title.map(|t| t.height), small.title.map(|t| t.height * 2.0));
    }

    #[test]
    fn a_knob_carries_its_identity_color_in_the_border_for_panels_and_in_the_title_bar_for_bars() {
        let tc = dash_setting_colors::TC;
        let (panels, _) = frame_ops(DashStyle::Panels, "TC", Some(tc), None);
        assert!(panels.iter().any(|op| matches!(op, DrawOp::Border { width: 2.0, color, .. } if *color == tc)));

        let (bars, _) = frame_ops(DashStyle::Bars, "TC", Some(tc), None);
        assert!(bars.iter().any(|op| matches!(op, DrawOp::Border { color, .. } if *color == DEFAULT_DASH_PALETTE.border)));
        assert!(bars.iter().any(|op| matches!(op, DrawOp::Rect { color, radii, .. } if *color == tc && radii.bottom_left == 0.0)));
    }

    #[test]
    fn a_flat_box_wears_a_white_edge_with_its_label_cut_into_it_in_a_knobs_color() {
        let tc = dash_setting_colors::TC;
        let (ops, _) = frame_ops(DashStyle::Flat, "TC", Some(tc), None);
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
    fn a_grid_knob_gets_a_tab_before_its_title() {
        let (ops, _) = frame_ops(DashStyle::Grid, "ABS", Some(dash_setting_colors::ABS), None);
        assert!(ops.iter().any(|op| matches!(op, DrawOp::Rect { rect, color, .. } if *color == dash_setting_colors::ABS && rect.width == 5.0)));
        let title = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) => Some(run),
            _ => None,
        });
        assert_eq!(title.map(|t| t.x), Some(1.0 + 10.0 + 10.0));
    }

    #[test]
    fn a_fill_covers_the_frame_and_hands_its_content_an_ink_palette() {
        let fill = DEFAULT_DASH_PALETTE.timing_personal_best;
        let (ops, handed) = frame_ops(DashStyle::Panels, "DELTA", None, Some(fill));
        assert_eq!(handed.map(|p| p.foreground), Some(DEFAULT_DASH_PALETTE.background));
        assert!(matches!(ops[0], DrawOp::Rect { color, .. } if color == fill));
        let title = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) => Some(run.color),
            _ => None,
        });
        assert_eq!(title, Some(with_alpha(DEFAULT_DASH_PALETTE.background, 0.78)));
    }
}
