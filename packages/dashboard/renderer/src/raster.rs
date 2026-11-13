// The display list -> pixels: draws `DrawOp`s into a tiny-skia pixmap at the scene's device
// scale. Geometry arrives in logical px; one global scale transform maps it to device px, so
// absolute px caps in the layout never change with DPR.
//
// What this reproduces from Chromium beyond plain geometry:
// - CSS `border-radius` scaling: radii that do not fit a box shrink by a common factor.
// - A CSS border's inner edge is rounded by `radius - width`, clamped at 0.
// - Box backgrounds, borders and dots are pixel-snapped: Chromium rounds each edge of a box
//   to a whole device px before painting it, and a box with a real size keeps at least 1 px.
// - Text: Skia draws axis-aligned glyphs with subpixel x (quarter px) and a baseline snapped to
//   a whole device pixel; light text gets a contrast boost (`TEXT_GAMMA`), near-black ink on a
//   fill is thinned instead (`DARK_TEXT_EXPONENT`).
// The pixmap, the coverage mask and the glyph outlines are reused across frames.

use std::collections::HashMap;

use tiny_skia::{BlendMode, Color, FillRule, Mask, Paint, Path, PathBuilder, Pixmap, Rect, Transform};

use crate::RenderError;
use crate::draw::{DrawOp, Radii, TextRun};
use crate::grid::PixelRect;
use crate::palette::Rgba;
use crate::text::{Fonts, TextWeight};

/// Cubic Bezier handle length for a quarter circle.
const KAPPA: f32 = 0.552_284_8;

pub struct Raster {
    pixmap: Option<Pixmap>,
    /// Text coverage, the pixmap's size; allocated on first use.
    mask: Option<Mask>,
    /// Text coverage lookups for light and for dark text (see `TEXT_GAMMA`).
    text_luts: TextLuts,
    /// Glyph outlines in font units, per face and glyph id (`None` for an empty glyph).
    outlines: HashMap<(TextWeight, u16), Option<Path>>,
}

impl Default for Raster {
    fn default() -> Self {
        Raster::new()
    }
}

impl Raster {
    pub fn new() -> Raster {
        Raster { pixmap: None, mask: None, text_luts: TextLuts::new(), outlines: HashMap::new() }
    }

    /// Makes the pixmap `width` x `height` device px, keeping it when the size is unchanged.
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), RenderError> {
        if self.size_px() == (width, height) {
            return Ok(());
        }
        let pixmap = Pixmap::new(width, height).ok_or_else(|| RenderError::from(format!("cannot allocate a {width}x{height} pixmap")))?;
        self.pixmap = Some(pixmap);
        self.mask = None;
        Ok(())
    }

    pub fn size_px(&self) -> (u32, u32) {
        self.pixmap.as_ref().map_or((0, 0), |p| (p.width(), p.height()))
    }

    pub fn pixels(&self) -> &[u8] {
        self.pixmap.as_ref().map_or(&[], |p| p.data())
    }

    /// Draws `ops` in order over whatever the pixmap holds (the list starts with a `Fill`).
    pub fn draw(&mut self, fonts: &Fonts, ops: &[DrawOp], scale: f64) {
        let Raster { pixmap, mask, text_luts, outlines } = self;
        let Some(pixmap) = pixmap.as_mut() else {
            return;
        };
        for op in ops {
            match op {
                DrawOp::Fill { color } => pixmap.fill(to_color(*color)),
                DrawOp::Rect { rect, radii, color } => {
                    let rect = snap(*rect, scale);
                    let paint = paint(*color, BlendMode::SourceOver);
                    if radii.is_zero() {
                        if let Some(r) = to_rect(rect) {
                            pixmap.fill_rect(r, &paint, Transform::identity(), None);
                        }
                    } else if let Some(path) = rounded_rect(rect, css_radii(rect, radii.scaled(scale))) {
                        pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), None);
                    }
                }
                DrawOp::Border { rect, width, radius, color } => {
                    if let Some(path) = border_ring(snap(*rect, scale), width * scale, radius * scale) {
                        pixmap.fill_path(&path, &paint(*color, BlendMode::SourceOver), FillRule::EvenOdd, Transform::identity(), None);
                    }
                }
                DrawOp::Oval { rect, color } => {
                    if let Some(path) = to_rect(snap(*rect, scale)).and_then(PathBuilder::from_oval) {
                        pixmap.fill_path(&path, &paint(*color, BlendMode::SourceOver), FillRule::Winding, Transform::identity(), None);
                    }
                }
                DrawOp::CornerCut { rect, radius, color } => {
                    let rect = snap(*rect, scale);
                    if let Some(path) = corner_regions(rect, css_radii(rect, Radii::all(radius * scale))) {
                        // Source: a transparent canvas color clears the corners instead of doing nothing.
                        pixmap.fill_path(&path, &paint(*color, BlendMode::Source), FillRule::Winding, Transform::identity(), None);
                    }
                }
                DrawOp::Text(run) => draw_text(pixmap, mask, text_luts.for_color(run.color), outlines, fonts, run, scale),
            }
        }
    }
}

/// A CSS box in device px as Chromium paints it: scaled, then pixel-snapped (each edge rounded
/// to the nearest device px), so box backgrounds and borders have crisp, unblended edges.
fn snap(rect: PixelRect, scale: f64) -> PixelRect {
    let (left, width) = snap_span(rect.left * scale, rect.width * scale);
    let (top, height) = snap_span(rect.top * scale, rect.height * scale);
    PixelRect::new(left, top, width, height)
}

/// One axis of Blink's `PixelSnappedIntRect`: the start rounds to a whole px and the size is
/// `SnapSizeToPixel`, which never lets a box with a real size vanish (it keeps 1 px), so thin
/// boxes such as short rpm segments still paint.
fn snap_span(start: f64, size: f64) -> (f64, f64) {
    let edge = crate::grid::js_round;
    let snapped = edge(start + size) - edge(start);
    let snapped = if snapped == 0.0 && size > 4.0 / 64.0 { 1.0 } else { snapped.max(0.0) };
    (edge(start), snapped)
}

fn to_color(color: Rgba) -> Color {
    Color::from_rgba8(color.r, color.g, color.b, color.a)
}

fn paint(color: Rgba, blend_mode: BlendMode) -> Paint<'static> {
    let mut paint = Paint { anti_alias: true, blend_mode, ..Paint::default() };
    paint.set_color(to_color(color));
    paint
}

fn to_rect(rect: PixelRect) -> Option<Rect> {
    Rect::from_xywh(rect.left as f32, rect.top as f32, rect.width as f32, rect.height as f32)
}

/// CSS radius scaling: when two neighbouring radii exceed their shared side, every radius
/// shrinks by the same factor.
fn css_radii(rect: PixelRect, radii: Radii) -> Radii {
    let ratio = |side: f64, a: f64, b: f64| if a + b > side && a + b > 0.0 { side / (a + b) } else { 1.0 };
    let f = ratio(rect.width, radii.top_left, radii.top_right)
        .min(ratio(rect.width, radii.bottom_left, radii.bottom_right))
        .min(ratio(rect.height, radii.top_left, radii.bottom_left))
        .min(ratio(rect.height, radii.top_right, radii.bottom_right))
        .max(0.0);
    let r = |v: f64| (v * f).max(0.0);
    Radii { top_left: r(radii.top_left), top_right: r(radii.top_right), bottom_right: r(radii.bottom_right), bottom_left: r(radii.bottom_left) }
}

/// Adds a clockwise rounded rectangle contour (radii already CSS-scaled).
fn push_rounded_rect(pb: &mut PathBuilder, rect: PixelRect, radii: Radii) {
    let (l, t) = (rect.left as f32, rect.top as f32);
    let (r, b) = ((rect.left + rect.width) as f32, (rect.top + rect.height) as f32);
    let (tl, tr, br, bl) = (radii.top_left as f32, radii.top_right as f32, radii.bottom_right as f32, radii.bottom_left as f32);
    pb.move_to(l + tl, t);
    pb.line_to(r - tr, t);
    if tr > 0.0 {
        pb.cubic_to(r - tr + tr * KAPPA, t, r, t + tr - tr * KAPPA, r, t + tr);
    }
    pb.line_to(r, b - br);
    if br > 0.0 {
        pb.cubic_to(r, b - br + br * KAPPA, r - br + br * KAPPA, b, r - br, b);
    }
    pb.line_to(l + bl, b);
    if bl > 0.0 {
        pb.cubic_to(l + bl - bl * KAPPA, b, l, b - bl + bl * KAPPA, l, b - bl);
    }
    pb.line_to(l, t + tl);
    if tl > 0.0 {
        pb.cubic_to(l, t + tl - tl * KAPPA, l + tl - tl * KAPPA, t, l + tl, t);
    }
    pb.close();
}

fn rounded_rect(rect: PixelRect, radii: Radii) -> Option<Path> {
    if rect.width <= 0.0 || rect.height <= 0.0 {
        return None;
    }
    let mut pb = PathBuilder::new();
    push_rounded_rect(&mut pb, rect, radii);
    pb.finish()
}

/// A CSS `border` with `box-sizing: border-box`: the outer rounded box minus the padding box,
/// whose corners are rounded by the outer radius less the border width.
fn border_ring(rect: PixelRect, width: f64, radius: f64) -> Option<Path> {
    if rect.width <= 0.0 || rect.height <= 0.0 || width <= 0.0 {
        return None;
    }
    let outer = css_radii(rect, Radii::all(radius));
    let mut pb = PathBuilder::new();
    push_rounded_rect(&mut pb, rect, outer);
    let inner_rect = PixelRect::new(rect.left + width, rect.top + width, rect.width - 2.0 * width, rect.height - 2.0 * width);
    if inner_rect.width > 0.0 && inner_rect.height > 0.0 {
        let inner = Radii {
            top_left: (outer.top_left - width).max(0.0),
            top_right: (outer.top_right - width).max(0.0),
            bottom_right: (outer.bottom_right - width).max(0.0),
            bottom_left: (outer.bottom_left - width).max(0.0),
        };
        push_rounded_rect(&mut pb, inner_rect, inner);
    }
    pb.finish()
}

/// The four regions between `rect`'s corners and its rounded corners: what `overflow: hidden`
/// with a `border-radius` cuts away.
fn corner_regions(rect: PixelRect, radii: Radii) -> Option<Path> {
    let (l, t) = (rect.left as f32, rect.top as f32);
    let (r, b) = ((rect.left + rect.width) as f32, (rect.top + rect.height) as f32);
    let mut pb = PathBuilder::new();
    let mut corner = |cx: f32, cy: f32, radius: f64, dx: f32, dy: f32| {
        // (cx, cy) is the box corner; (dx, dy) points into the box along each axis.
        let rad = radius as f32;
        if rad <= 0.0 {
            return;
        }
        pb.move_to(cx, cy);
        pb.line_to(cx + dx * rad, cy);
        pb.cubic_to(cx + dx * (rad - rad * KAPPA), cy, cx, cy + dy * (rad - rad * KAPPA), cx, cy + dy * rad);
        pb.close();
    };
    corner(l, t, radii.top_left, 1.0, 1.0);
    corner(r, t, radii.top_right, -1.0, 1.0);
    corner(r, b, radii.bottom_right, -1.0, -1.0);
    corner(l, b, radii.bottom_left, 1.0, -1.0);
    pb.finish()
}

/// Text coverage is boosted before it is blended, approximating the contrast Chromium's
/// DirectWrite text rendering adds over plain anti-aliasing (stems would otherwise read lighter
/// than in the reference). `coverage' = coverage^(1/TEXT_GAMMA)`; 2.2 was fitted against the
/// Chromium references (it matches the ink of large values; small hinted labels stay lighter).
const TEXT_GAMMA: f32 = 2.2;

/// Dark text (ink on a condition fill) is not boosted like light text: Chromium thickens light
/// text on dark and thins dark text on light. Its coverage is `coverage^DARK_TEXT_EXPONENT`,
/// fitted against the ink-on-fill references.
const DARK_TEXT_EXPONENT: f32 = 1.3;

/// The coverage lookups, one per text brightness.
struct TextLuts {
    light: [u8; 256],
    dark: [u8; 256],
}

impl TextLuts {
    fn new() -> TextLuts {
        TextLuts { light: coverage_lut(1.0 / TEXT_GAMMA), dark: coverage_lut(DARK_TEXT_EXPONENT) }
    }

    /// The lookup for text in `color`. Only near-black text counts as dark: on this canvas that
    /// is ink on a fill; grey labels (`muted` is luma ~110) still sit on the dark canvas.
    fn for_color(&self, color: Rgba) -> &[u8; 256] {
        let luma = 0.2126 * f32::from(color.r) + 0.7152 * f32::from(color.g) + 0.0722 * f32::from(color.b);
        if luma < 64.0 { &self.dark } else { &self.light }
    }
}

/// `coverage^exponent` as a byte lookup.
fn coverage_lut(exponent: f32) -> [u8; 256] {
    std::array::from_fn(|i| ((i as f32 / 255.0).powf(exponent) * 255.0).round() as u8)
}

/// Draws a shaped run. Its glyph outlines are filled into the coverage mask over the run's ink
/// box, the coverage is boosted, and the color is blended through it once; a clip only narrows
/// that box. The baseline snaps to a whole device px and each glyph's x to a quarter px, as Skia
/// positions axis-aligned text.
fn draw_text(
    pixmap: &mut Pixmap,
    mask: &mut Option<Mask>,
    lut: &[u8; 256],
    outlines: &mut HashMap<(TextWeight, u16), Option<Path>>,
    fonts: &Fonts,
    run: &TextRun,
    scale: f64,
) {
    let s = scale as f32;
    let k = fonts.units_to_px(run.weight, run.size) as f32 * s;
    let kx = k * run.scale_x as f32;
    let baseline = (run.baseline as f32 * s).round();
    let origin = run.x as f32 * s;

    let Some(ink) = run_ink(fonts, run, origin, baseline, k, kx) else {
        return;
    };
    let (width, height) = (pixmap.width() as i64, pixmap.height() as i64);
    let ink_box = [
        (ink[0].floor() as i64).clamp(0, width),
        (ink[1].floor() as i64).clamp(0, height),
        (ink[2].ceil() as i64).clamp(0, width),
        (ink[3].ceil() as i64).clamp(0, height),
    ];
    let mut paint_box = ink_box;
    if let Some(clip) = run.clip {
        let c = snap(clip, scale);
        paint_box = [
            paint_box[0].max(c.left as i64),
            paint_box[1].max(c.top as i64),
            paint_box[2].min((c.left + c.width) as i64),
            paint_box[3].min((c.top + c.height) as i64),
        ];
    }
    if paint_box[0] >= paint_box[2] || paint_box[1] >= paint_box[3] {
        return;
    }

    let mask = match mask {
        Some(m) => m,
        None => match Mask::new(pixmap.width(), pixmap.height()) {
            Some(m) => mask.insert(m),
            None => return,
        },
    };
    // Only the ink box is read below, so only it needs to start clear.
    let stride = width as usize;
    for y in ink_box[1]..ink_box[3] {
        let row = y as usize * stride;
        mask.data_mut()[row + ink_box[0] as usize..row + ink_box[2] as usize].fill(0);
    }
    for glyph in &run.shaped.glyphs {
        let outline = outlines.entry((run.weight, glyph.id)).or_insert_with(|| fonts.glyph_outline(run.weight, glyph.id));
        let Some(path) = outline else {
            continue;
        };
        let x = ((origin + glyph.x * kx) * 4.0).round() / 4.0;
        let y = baseline - glyph.y * k;
        mask.fill_path(path, FillRule::Winding, true, Transform::from_row(kx, 0.0, 0.0, -k, x, y));
    }
    for y in paint_box[1]..paint_box[3] {
        let row = y as usize * stride;
        for value in &mut mask.data_mut()[row + paint_box[0] as usize..row + paint_box[2] as usize] {
            *value = lut[*value as usize];
        }
    }
    let rect = Rect::from_ltrb(paint_box[0] as f32, paint_box[1] as f32, paint_box[2] as f32, paint_box[3] as f32);
    if let Some(rect) = rect {
        pixmap.fill_rect(rect, &paint(run.color, BlendMode::SourceOver), Transform::identity(), Some(mask));
    }
}

/// The run's ink box in device px (left, top, right, bottom), or `None` when it has no ink.
fn run_ink(fonts: &Fonts, run: &TextRun, origin: f32, baseline: f32, k: f32, kx: f32) -> Option<[f32; 4]> {
    let mut ink: Option<[f32; 4]> = None;
    for glyph in &run.shaped.glyphs {
        let Some([x0, y0, x1, y1]) = fonts.glyph_bounds(run.weight, glyph.id) else {
            continue;
        };
        let gx = origin + glyph.x * kx;
        let gy = baseline - glyph.y * k;
        let bounds = [gx + x0 * kx, gy - y1 * k, gx + x1 * kx, gy - y0 * k];
        ink = Some(match ink {
            None => bounds,
            Some(i) => [i[0].min(bounds[0]), i[1].min(bounds[1]), i[2].max(bounds[2]), i[3].max(bounds[3])],
        });
    }
    // One px of slack for anti-aliasing at the edges.
    ink.map(|i| [i[0] - 1.0, i[1] - 1.0, i[2] + 1.0, i[3] + 1.0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_radii_shrink_together_when_they_do_not_fit() {
        let r = css_radii(PixelRect::new(0.0, 0.0, 10.0, 100.0), Radii::all(10.0));
        assert_eq!(r, Radii::all(5.0));
        let fits = css_radii(PixelRect::new(0.0, 0.0, 100.0, 100.0), Radii::top(8.0));
        assert_eq!(fits, Radii::top(8.0));
    }

    #[test]
    fn boxes_snap_each_edge_to_a_whole_device_px() {
        assert_eq!(snap(PixelRect::new(565.5, 0.25, 30.9, 10.0), 1.0), PixelRect::new(566.0, 0.0, 30.0, 10.0));
        assert_eq!(snap(PixelRect::new(1.3, 1.3, 2.0, 2.0), 1.5), PixelRect::new(2.0, 2.0, 3.0, 3.0));
    }

    #[test]
    fn a_thin_box_keeps_at_least_one_device_px_like_blinks_snap_size_to_pixel() {
        // 10.4..11.3 rounds to 10..11 anyway; 10.6..11.2 rounds both edges to 11 and would vanish.
        assert_eq!(snap(PixelRect::new(0.0, 10.6, 5.0, 0.6), 1.0), PixelRect::new(0.0, 11.0, 5.0, 1.0));
        assert_eq!(snap(PixelRect::new(0.0, 10.6, 5.0, 0.0), 1.0).height, 0.0);
    }

    #[test]
    fn light_text_is_boosted_and_near_black_ink_is_thinned() {
        let luts = TextLuts::new();
        let ink = luts.for_color(Rgba::hex("#08080A"));
        let label = luts.for_color(Rgba::hex("#6F6F78"));
        assert!(ink[128] < 128 && label[128] > 128, "ink {} label {}", ink[128], label[128]);
        assert_eq!((ink[0], ink[255], label[0], label[255]), (0, 255, 0, 255));
    }

    #[test]
    fn a_transparent_corner_cut_clears_the_corner_and_keeps_the_middle() {
        let mut raster = Raster::new();
        raster.resize(40, 40).unwrap();
        let fonts = Fonts::new();
        let rect = PixelRect::new(0.0, 0.0, 40.0, 40.0);
        let ops = [DrawOp::Fill { color: Rgba::rgb(255, 0, 0) }, DrawOp::CornerCut { rect, radius: 10.0, color: Rgba::TRANSPARENT }];
        raster.draw(&fonts, &ops, 1.0);
        let px = |x: usize, y: usize| raster.pixels()[(y * 40 + x) * 4 + 3];
        assert_eq!(px(0, 0), 0);
        assert_eq!(px(20, 20), 255);
        assert_eq!(px(20, 0), 255);
    }

    #[test]
    fn a_border_leaves_its_padding_box_untouched() {
        let mut raster = Raster::new();
        raster.resize(20, 20).unwrap();
        let fonts = Fonts::new();
        let ops = [
            DrawOp::Fill { color: Rgba::BLACK },
            DrawOp::Border { rect: PixelRect::new(0.0, 0.0, 20.0, 20.0), width: 2.0, radius: 0.0, color: Rgba::rgb(255, 255, 255) },
        ];
        raster.draw(&fonts, &ops, 1.0);
        let red = |x: usize, y: usize| raster.pixels()[(y * 20 + x) * 4];
        assert_eq!((red(0, 10), red(1, 10), red(2, 10), red(10, 10)), (255, 255, 0, 0));
    }
}
