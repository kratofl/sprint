// Text: the four embedded dash faces, shaping, line metrics and glyph outlines.
//
// Shaping is rustybuzz (HarfBuzz, as in Chromium) with `tnum` on — the React renderer this was
// ported from set `font-variant-numeric: tabular-nums` on every text — and HarfBuzz's default
// features (kerning, ligatures). Shaped runs are kept in font units, so one shaping serves every
// size; layout measures with them and the raster draws the very same glyph positions.
//
// The faces live in `../fonts` and are compiled in: Label = Inter Regular, LabelBold = Inter
// Bold, Value = Saira SemiCondensed Bold, ValueRegular = Saira SemiCondensed Medium.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use rustybuzz::ttf_parser::{GlyphId, OutlineBuilder};
use rustybuzz::{Direction, Face, Feature, ShapePlan, UnicodeBuffer, script};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextWeight {
    Label,
    LabelBold,
    Value,
    ValueRegular,
}

impl TextWeight {
    const ALL: [TextWeight; 4] = [TextWeight::Label, TextWeight::LabelBold, TextWeight::Value, TextWeight::ValueRegular];

    fn index(self) -> usize {
        self as usize
    }

    /// Average glyph advance as a fraction of font size (`AVG_ADVANCE_RATIO` in the retired React
    /// renderer), used only to decide whether "fit" text would overflow. Measured from the font
    /// files over printable ASCII; kept as the TypeScript had them so the same text engages the
    /// squeeze.
    pub fn avg_advance_ratio(self) -> f64 {
        match self {
            TextWeight::Label => 0.562,
            TextWeight::LabelBold => 0.587,
            TextWeight::Value => 0.483,
            TextWeight::ValueRegular => 0.471,
        }
    }
}

static INTER_REGULAR: &[u8] = include_bytes!("../fonts/Inter-Regular.ttf");
static INTER_BOLD: &[u8] = include_bytes!("../fonts/Inter-Bold.ttf");
static SAIRA_BOLD: &[u8] = include_bytes!("../fonts/SairaSemiCondensed-Bold.ttf");
static SAIRA_MEDIUM: &[u8] = include_bytes!("../fonts/SairaSemiCondensed-Medium.ttf");

fn font_data(weight: TextWeight) -> &'static [u8] {
    match weight {
        TextWeight::Label => INTER_REGULAR,
        TextWeight::LabelBold => INTER_BOLD,
        TextWeight::Value => SAIRA_BOLD,
        TextWeight::ValueRegular => SAIRA_MEDIUM,
    }
}

/// One shaped glyph, in font units relative to the run's pen start.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapedGlyph {
    pub id: u16,
    pub x: f32,
    pub y: f32,
}

/// A shaped run in font units.
#[derive(Debug, PartialEq)]
pub struct ShapedRun {
    pub glyphs: Vec<ShapedGlyph>,
    pub advance: f32,
}

/// The ascent and descent Chromium lays a line out with, in font units.
#[derive(Clone, Copy, Debug)]
struct VerticalMetrics {
    ascent: f64,
    descent: f64,
}

struct LoadedFace {
    face: Face<'static>,
    plan: ShapePlan,
    upem: f64,
    metrics: VerticalMetrics,
}

/// A shaped-run cache entry is dropped wholesale once the cache grows past this many runs: a
/// dash shows a few dozen distinct strings at a time, so this only ever clears on churn.
const SHAPE_CACHE_LIMIT: usize = 1024;

/// The embedded faces plus the shaping caches. One per `Renderer`; not shared across threads.
pub struct Fonts {
    faces: [LoadedFace; 4],
    shape_cache: RefCell<HashMap<(TextWeight, String), Rc<ShapedRun>>>,
    buffer: RefCell<Option<UnicodeBuffer>>,
}

impl Default for Fonts {
    fn default() -> Self {
        Fonts::new()
    }
}

impl Fonts {
    pub fn new() -> Fonts {
        let tnum = Feature::new(rustybuzz::ttf_parser::Tag::from_bytes(b"tnum"), 1, ..);
        let faces = TextWeight::ALL.map(|weight| {
            // The fonts are compiled in; a parse failure is a build defect, not an input error.
            let face = Face::from_slice(font_data(weight), 0).expect("embedded font parses");
            let plan = ShapePlan::new(&face, Direction::LeftToRight, Some(script::LATIN), None, &[tnum]);
            let upem = f64::from(face.units_per_em());
            let metrics = vertical_metrics(&face);
            LoadedFace { face, plan, upem, metrics }
        });
        Fonts { faces, shape_cache: RefCell::new(HashMap::new()), buffer: RefCell::new(Some(UnicodeBuffer::new())) }
    }

    fn face(&self, weight: TextWeight) -> &LoadedFace {
        &self.faces[weight.index()]
    }

    /// Shapes `text` in `weight`, from the cache when this run was shaped before.
    pub fn shape(&self, weight: TextWeight, text: &str) -> Rc<ShapedRun> {
        if let Some(run) = self.shape_cache.borrow().get(&(weight, text.to_owned())) {
            return Rc::clone(run);
        }
        let run = Rc::new(self.shape_uncached(weight, text));
        let mut cache = self.shape_cache.borrow_mut();
        if cache.len() >= SHAPE_CACHE_LIMIT {
            cache.clear();
        }
        cache.insert((weight, text.to_owned()), Rc::clone(&run));
        run
    }

    fn shape_uncached(&self, weight: TextWeight, text: &str) -> ShapedRun {
        let loaded = self.face(weight);
        let mut buffer = self.buffer.borrow_mut().take().unwrap_or_default();
        buffer.push_str(text);
        buffer.set_direction(Direction::LeftToRight);
        buffer.set_script(script::LATIN);
        let shaped = rustybuzz::shape_with_plan(&loaded.face, &loaded.plan, buffer);
        let mut pen = 0.0f32;
        let glyphs = shaped
            .glyph_infos()
            .iter()
            .zip(shaped.glyph_positions())
            .map(|(info, pos)| {
                let glyph = ShapedGlyph { id: info.glyph_id as u16, x: pen + pos.x_offset as f32, y: pos.y_offset as f32 };
                pen += pos.x_advance as f32;
                glyph
            })
            .collect();
        *self.buffer.borrow_mut() = Some(shaped.clear());
        ShapedRun { glyphs, advance: pen }
    }

    /// Font units -> px at `size`.
    pub fn units_to_px(&self, weight: TextWeight, size: f64) -> f64 {
        size / self.face(weight).upem
    }

    /// The run's advance width at `size`, in px.
    pub fn advance(&self, weight: TextWeight, text: &str, size: f64) -> f64 {
        f64::from(self.shape(weight, text).advance) * self.units_to_px(weight, size)
    }

    /// Ascent and descent at `size`, each rounded to whole px as Chromium's `SimpleFontData`
    /// does before it lays out a line.
    pub fn rounded_ascent_descent(&self, weight: TextWeight, size: f64) -> (f64, f64) {
        let m = self.face(weight).metrics;
        let k = self.units_to_px(weight, size);
        ((m.ascent * k).round(), (m.descent * k).round())
    }

    /// Where the baseline of a CSS line box falls, from the line box's top, for a line box
    /// `line_height` tall in `weight` at `size`: Chromium's LayoutNG puts the rounded ascent
    /// below half the leading, the half-leading floored to whole px.
    pub fn line_box_baseline(&self, weight: TextWeight, size: f64, line_height: f64) -> f64 {
        let (ascent, descent) = self.rounded_ascent_descent(weight, size);
        ascent + ((line_height - (ascent + descent)) / 2.0).floor()
    }

    /// SVG `dominant-baseline: central`: the baseline offset below `y` that centers the font's
    /// ascent+descent box on `y`.
    pub fn central_baseline_offset(&self, weight: TextWeight, size: f64) -> f64 {
        let (ascent, descent) = self.rounded_ascent_descent(weight, size);
        (ascent - descent) / 2.0
    }

    /// The glyph's ink box in font units (x0, y0, x1, y1, y up), or `None` for an empty glyph.
    pub fn glyph_bounds(&self, weight: TextWeight, glyph: u16) -> Option<[f32; 4]> {
        self.face(weight).face.glyph_bounding_box(GlyphId(glyph)).map(|r| [f32::from(r.x_min), f32::from(r.y_min), f32::from(r.x_max), f32::from(r.y_max)])
    }

    /// The glyph's outline in font units (y up), or `None` for an empty glyph.
    pub fn glyph_outline(&self, weight: TextWeight, glyph: u16) -> Option<tiny_skia::Path> {
        let mut builder = PathSink(tiny_skia::PathBuilder::new());
        self.face(weight).face.outline_glyph(GlyphId(glyph), &mut builder)?;
        builder.0.finish()
    }
}

/// Chromium on Windows reads ascent/descent through DirectWrite, which takes the OS/2 typo
/// metrics when the font sets USE_TYPO_METRICS and the OS/2 win metrics otherwise.
fn vertical_metrics(face: &Face<'static>) -> VerticalMetrics {
    let tables = face.tables();
    match tables.os2 {
        Some(os2) if os2.use_typographic_metrics() => {
            VerticalMetrics { ascent: f64::from(os2.typographic_ascender()), descent: -f64::from(os2.typographic_descender()) }
        }
        Some(os2) => VerticalMetrics { ascent: f64::from(os2.windows_ascender()), descent: -f64::from(os2.windows_descender()) },
        None => VerticalMetrics { ascent: f64::from(tables.hhea.ascender), descent: -f64::from(tables.hhea.descender) },
    }
}

struct PathSink(tiny_skia::PathBuilder);

impl OutlineBuilder for PathSink {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.move_to(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.0.line_to(x, y);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.0.quad_to(x1, y1, x, y);
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.0.cubic_to(x1, y1, x2, y2, x, y);
    }
    fn close(&mut self) {
        self.0.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digits_shape_tabular_where_the_face_has_tnum() {
        // Saira SemiCondensed has no tnum feature, so its digits stay proportional — in
        // Chromium too. Inter has one.
        let fonts = Fonts::new();
        for weight in [TextWeight::Label, TextWeight::LabelBold] {
            let one = fonts.advance(weight, "1111", 100.0);
            let eight = fonts.advance(weight, "8888", 100.0);
            assert!((one - eight).abs() < 1e-6, "{weight:?}: {one} vs {eight}");
        }
    }

    #[test]
    fn a_run_is_shaped_once_and_reused() {
        let fonts = Fonts::new();
        let a = fonts.shape(TextWeight::Value, "1:32.456");
        let b = fonts.shape(TextWeight::Value, "1:32.456");
        assert!(Rc::ptr_eq(&a, &b));
        assert_eq!(a.glyphs.len(), 8);
    }

    #[test]
    fn every_face_has_an_outline_for_its_digits() {
        let fonts = Fonts::new();
        for weight in TextWeight::ALL {
            let run = fonts.shape(weight, "0123456789");
            assert!(run.glyphs.iter().all(|g| g.id != 0 && fonts.glyph_outline(weight, g.id).is_some()), "{weight:?}");
        }
    }
}
