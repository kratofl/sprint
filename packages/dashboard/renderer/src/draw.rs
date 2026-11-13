// The display list: what the dash draws, in canvas coordinates and logical px, before any
// pixel exists. Widget, chrome and overlay code emits these through `Builder`; `raster.rs`
// turns them into pixels. Keeping this step pixel-free is what makes the layout testable.

use std::rc::Rc;

use crate::grid::PixelRect;
use crate::palette::Rgba;
use crate::text::{Fonts, ShapedRun, TextWeight};

/// Per-corner radii (circular), CSS order: top-left, top-right, bottom-right, bottom-left.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Radii {
    pub top_left: f64,
    pub top_right: f64,
    pub bottom_right: f64,
    pub bottom_left: f64,
}

impl Radii {
    pub const ZERO: Radii = Radii { top_left: 0.0, top_right: 0.0, bottom_right: 0.0, bottom_left: 0.0 };

    pub const fn all(radius: f64) -> Radii {
        Radii { top_left: radius, top_right: radius, bottom_right: radius, bottom_left: radius }
    }

    pub const fn top(radius: f64) -> Radii {
        Radii { top_left: radius, top_right: radius, bottom_right: 0.0, bottom_left: 0.0 }
    }

    /// Every radius times `factor`.
    pub fn scaled(&self, factor: f64) -> Radii {
        Radii {
            top_left: self.top_left * factor,
            top_right: self.top_right * factor,
            bottom_right: self.bottom_right * factor,
            bottom_left: self.bottom_left * factor,
        }
    }

    pub fn is_zero(&self) -> bool {
        self.top_left <= 0.0 && self.top_right <= 0.0 && self.bottom_right <= 0.0 && self.bottom_left <= 0.0
    }
}

/// A positioned, already shaped run of text.
#[derive(Clone, Debug, PartialEq)]
pub struct TextRun {
    /// The text as the TypeScript renders it (kept for tests and debugging).
    pub text: String,
    pub weight: TextWeight,
    pub size: f64,
    /// The pen start of the run (its left edge), canvas px.
    pub x: f64,
    /// The baseline, canvas px.
    pub baseline: f64,
    /// Horizontal squeeze about `x` (SVG `lengthAdjust="spacingAndGlyphs"`); 1 for none.
    pub scale_x: f64,
    pub color: Rgba,
    /// CSS `overflow: hidden` on the run's box, canvas px.
    pub clip: Option<PixelRect>,
    pub shaped: Rc<ShapedRun>,
}

impl TextRun {
    /// The run's drawn width in px (after any squeeze).
    pub fn width(&self, fonts: &Fonts) -> f64 {
        f64::from(self.shaped.advance) * fonts.units_to_px(self.weight, self.size) * self.scale_x
    }
}

/// One drawing step. Box geometry (`Rect`, `Border`, `Oval`, `CornerCut`, a run's `clip`) is in
/// layout units (see `layout_unit`); the raster pixel-snaps it as Chromium paints boxes.
#[derive(Clone, Debug, PartialEq)]
pub enum DrawOp {
    /// Replace the whole canvas with `color` (transparent clears it).
    Fill {
        color: Rgba,
    },
    /// A CSS box background: `rect` with per-corner radii.
    Rect {
        rect: PixelRect,
        radii: Radii,
        color: Rgba,
    },
    /// A CSS `border` (box-sizing: border-box): a ring `width` wide inside `rect`, its outer edge
    /// rounded by `radius` and its inner edge by `radius - width`.
    Border {
        rect: PixelRect,
        width: f64,
        radius: f64,
        color: Rgba,
    },
    /// A filled ellipse inscribed in `rect` (CSS `border-radius: 50%`).
    Oval {
        rect: PixelRect,
        color: Rgba,
    },
    Text(TextRun),
    /// `overflow: hidden` + `border-radius` on the whole canvas, expressed geometrically: the
    /// four regions outside `rect`'s rounded corners are replaced with `color`.
    CornerCut {
        rect: PixelRect,
        radius: f64,
        color: Rgba,
    },
}

/// A CSS length as Blink's layout stores it: fixed point in 1/64 px, truncated toward zero. Box
/// edges are later rounded to whole px, and the truncation decides which way a `.5` goes. Applied
/// in logical px, which is exact at device scale 1 (Blink quantizes zoomed px).
pub fn layout_unit(value: f64) -> f64 {
    (value * 64.0).trunc() / 64.0
}

/// Collects draw ops with a stack of origins, so nested boxes position their children the way
/// CSS `position: absolute` children sit in their parent.
pub struct Builder<'a> {
    pub fonts: &'a Fonts,
    ops: &'a mut Vec<DrawOp>,
    origin: (f64, f64),
    failure: Option<String>,
}

impl<'a> Builder<'a> {
    pub fn new(fonts: &'a Fonts, ops: &'a mut Vec<DrawOp>) -> Builder<'a> {
        Builder { fonts, ops, origin: (0.0, 0.0), failure: None }
    }

    /// Marks the picture as undrawable, where the TypeScript renderer throws mid-render (a theme
    /// color `dimColor` cannot parse). The first failure wins; drawing carries on harmlessly.
    pub fn fail(&mut self, message: String) {
        self.failure.get_or_insert(message);
    }

    /// The first failure recorded, if any.
    pub fn into_failure(self) -> Option<String> {
        self.failure
    }

    /// Runs `body` with the origin moved by (`dx`, `dy`).
    pub fn translated<R>(&mut self, dx: f64, dy: f64, body: impl FnOnce(&mut Builder<'a>) -> R) -> R {
        let saved = self.origin;
        self.origin = (saved.0 + layout_unit(dx), saved.1 + layout_unit(dy));
        let result = body(self);
        self.origin = saved;
        result
    }

    /// A CSS box `rect` from local to canvas coordinates, its numbers in layout units.
    pub fn to_canvas(&self, rect: PixelRect) -> PixelRect {
        PixelRect {
            left: layout_unit(rect.left) + self.origin.0,
            top: layout_unit(rect.top) + self.origin.1,
            width: layout_unit(rect.width),
            height: layout_unit(rect.height),
        }
    }

    /// The local x whose canvas position is `x` rounded to a whole px: where Blink paints a
    /// replaced box (an `<svg>`) positioned at `x`.
    pub fn pixel_snapped_x(&self, x: f64) -> f64 {
        crate::grid::js_round(layout_unit(x) + self.origin.0) - self.origin.0
    }

    pub fn fill(&mut self, color: Rgba) {
        self.ops.push(DrawOp::Fill { color });
    }

    pub fn rect(&mut self, rect: PixelRect, radii: Radii, color: Rgba) {
        let rect = self.to_canvas(rect);
        self.ops.push(DrawOp::Rect { rect, radii, color });
    }

    pub fn border(&mut self, rect: PixelRect, width: f64, radius: f64, color: Rgba) {
        let rect = self.to_canvas(rect);
        self.ops.push(DrawOp::Border { rect, width, radius, color });
    }

    pub fn oval(&mut self, rect: PixelRect, color: Rgba) {
        let rect = self.to_canvas(rect);
        self.ops.push(DrawOp::Oval { rect, color });
    }

    pub fn corner_cut(&mut self, rect: PixelRect, radius: f64, color: Rgba) {
        let rect = self.to_canvas(rect);
        self.ops.push(DrawOp::CornerCut { rect, radius, color });
    }

    /// Adds a run whose `x`, `baseline` and `clip` are local coordinates.
    pub fn text(&mut self, mut run: TextRun) {
        run.x += self.origin.0;
        run.baseline += self.origin.1;
        run.clip = run.clip.map(|clip| self.to_canvas(clip));
        self.ops.push(DrawOp::Text(run));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_units_truncate_to_a_64th_toward_zero() {
        // 559.5618 is 559 + 35.96/64: Blink keeps 35/64, which decides how the edge rounds.
        assert_eq!(layout_unit(559.5618), 559.546875);
        assert_eq!(layout_unit(-0.01), 0.0);
        assert_eq!(layout_unit(12.5), 12.5);
    }

    #[test]
    fn nested_boxes_add_their_origins_in_layout_units() {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        let mut b = Builder::new(&fonts, &mut ops);
        b.translated(6.0, 0.0, |b| b.rect(PixelRect::new(559.5618, 0.0, 30.9454, 10.0), Radii::ZERO, Rgba::BLACK));
        let DrawOp::Rect { rect, .. } = ops[0] else { panic!("{:?}", ops[0]) };
        // 6 + 559.546875 + 30.9375 = 596.484375: the right edge snaps to 596, not 597.
        assert_eq!(rect.left + rect.width, 596.484375);
    }
}
