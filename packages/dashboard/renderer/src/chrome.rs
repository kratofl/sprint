// Widget chrome: the frame and title a widget wears, drawn per dash style. Ported from
// the retired React renderer's `chrome.tsx`. Widgets render only their values; the frame, the
// title and the knob color come from here, so switching a layout's `dashStyle` restyles every widget
// without touching its content or its cell.
//
// Geometry is cell-local (0,0 is the widget's cell top-left) and scales with the grid cell, so
// a 40px cell on an 800x480 panel draws at the authored pixel sizes.

use crate::draw::{Builder, Radii};
use crate::grid::PixelRect;
use crate::model::DashStyle;
use crate::palette::{DashPaletteColors, Rgba, with_alpha};
use crate::primitives::{TextAlign, TextLine, TextSizing, text_line};
use crate::text::TextWeight;

/// What every frame on a dash shares: its style and the scale of one grid cell.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChromeContext {
    pub style: DashStyle,
    pub scale: f64,
}

/// The grid cell size the chrome's pixel sizes are authored at (an 800x480 panel on a 20x12 grid).
pub const CHROME_CELL_PX: f64 = 40.0;

const BORDER: f64 = 2.0;

/// The space between neighbouring frames, split across both. Grid frames grow 1px instead so
/// neighbouring lines overlap into one.
fn frame_inset(ctx: ChromeContext) -> f64 {
    match ctx.style {
        DashStyle::Panels => 4.0 * ctx.scale,
        DashStyle::Bars => 3.0 * ctx.scale,
        DashStyle::Grid => -1.0,
    }
}

fn frame_radius(ctx: ChromeContext) -> f64 {
    match ctx.style {
        DashStyle::Panels => 10.0 * ctx.scale,
        DashStyle::Bars => 8.0 * ctx.scale,
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
    let box_ = PixelRect::new(inset, inset, (width - inset * 2.0).max(0.0), (height - inset * 2.0).max(0.0));
    let inner = PixelRect::new(box_.left + BORDER, box_.top + BORDER, (box_.width - BORDER * 2.0).max(0.0), (box_.height - BORDER * 2.0).max(0.0));
    // Grid cells pad a little more: cells on the canvas edge sit under the 4px outer frame.
    let pad = (if ctx.style == DashStyle::Grid { 10.0 } else { 8.0 }) * ctx.scale;
    let title_height = if titled { (if ctx.style == DashStyle::Bars { 22.0 } else { 20.0 }) * ctx.scale } else { 0.0 };
    let title_offset = match ctx.style {
        DashStyle::Bars => 0.0,
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

/// Where an unframed widget's content goes: the same margin a frame keeps, so bare and framed
/// widgets line up.
pub fn bare_content(ctx: ChromeContext, width: f64, height: f64) -> PixelRect {
    let inset = frame_inset(ctx).max(0.0) + BORDER;
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
        ChromeContext { style, scale: 1.0 }
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
        let small = frame_geometry(ChromeContext { style: DashStyle::Bars, scale: 1.0 }, 120.0, 120.0, true);
        let large = frame_geometry(ChromeContext { style: DashStyle::Bars, scale: 2.0 }, 240.0, 240.0, true);
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
