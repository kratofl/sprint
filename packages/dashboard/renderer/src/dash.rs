// The whole canvas: one page of a layout against a telemetry frame, as a display list. Ported
// from the composition in the retired React renderer's `DashRenderer.tsx`. A pure function of
// its inputs: the stateful parts (which banner is up, what the lap timer shows) arrive already
// decided, as `Overlays`.

use crate::alerts::DashAlertBanner;
use crate::chrome::{CHROME_CELL_PX, ChromeContext, WidgetFrame, bare_content, grid_outer_frame, group_frame, widget_frame};
use crate::draw::{Builder, DrawOp};
use crate::grid::{GEAR_SPOT, GridSpan, PixelRect, grid_rect, page_has_race_logic_lap_timer, select_page, zoned_rect};
use crate::groups::drawn_widgets;
use crate::model::{DashStyle, DashWidget, DashWidgetStyle, Scene, TelemetryFrame};
use crate::overlays::{alert_banner, flag_overlay, race_logic_lap_timer_overlay};
use crate::palette::{DashPaletteColors, Rgba, effective_color_system, resolve_dash_palette, resolve_style_color};
use crate::racelogic::RaceLogicLapTimerView;
use crate::text::Fonts;
use crate::widgets::{WidgetChrome, WidgetContext, widget_chrome, widget_content, zoned_gear};

/// The layout id of the focused RaceLogic purpose screen, which keeps a pure black canvas.
const PURPOSE_LAP_TIMES: &str = "purpose-lap-times";

/// The overlays decided outside the display list: the alert banner to draw (`alertBanner`), and
/// what the RaceLogic lap timer shows when the page has one (see `draws_race_logic_lap_timer`).
#[derive(Clone, Copy, Debug, Default)]
pub struct Overlays<'a> {
    pub banner: Option<&'a DashAlertBanner>,
    pub lap_timer: Option<&'a RaceLogicLapTimerView>,
}

/// The palette the scene's layout draws in.
pub fn scene_palette(scene: &Scene) -> DashPaletteColors {
    resolve_dash_palette(scene.layout.theme.as_ref(), effective_color_system(&scene.layout))
}

/// True when the scene's page draws the full-canvas RaceLogic lap timer, so its presenter must
/// be asked what to show (and, when false, the TypeScript unmounts it and its state is gone).
pub fn draws_race_logic_lap_timer(scene: &Scene) -> bool {
    page_has_race_logic_lap_timer(select_page(&scene.layout, scene.page_id.as_deref(), scene.idle))
}

/// The base palette with a widget's own text/label color overrides applied.
fn style_palette(base: &DashPaletteColors, style: Option<&DashWidgetStyle>) -> DashPaletteColors {
    let Some(style) = style.filter(|s| s.text_color.is_some() || s.label_color.is_some()) else {
        return *base;
    };
    let text = resolve_style_color(style.text_color.as_deref(), base);
    let label = resolve_style_color(style.label_color.as_deref(), base);
    DashPaletteColors { foreground: text.unwrap_or(base.foreground), neutral: text.unwrap_or(base.neutral), muted: label.unwrap_or(base.muted), ..*base }
}

/// What every tile on the canvas shares.
struct TileInputs<'a> {
    frame: &'a TelemetryFrame,
    scene: &'a Scene,
    palette: &'a DashPaletteColors,
    chrome: ChromeContext,
}

/// One widget's cell: its frame and title in the layout's dash style, then its values in the
/// content box (`WidgetTile`).
fn widget_tile(b: &mut Builder, widget: &DashWidget, rect: PixelRect, inputs: &TileInputs) {
    if rect.width < 1.0 || rect.height < 1.0 {
        return;
    }
    let tile_palette = style_palette(inputs.palette, widget.style.as_ref());
    // The flat chrome: the widget's own edge and label win over the dash's.
    let mut chrome = inputs.chrome;
    if let Some(style) = &widget.style {
        chrome.flat.border = style.border.unwrap_or(chrome.flat.border);
        chrome.flat.label = style.label.unwrap_or(chrome.flat.label);
    }
    let content = |b: &mut Builder, width: f64, height: f64, palette: &DashPaletteColors| {
        let ctx = WidgetContext {
            widget,
            frame: inputs.frame,
            palette,
            width,
            height,
            targets: inputs.scene.targets.as_ref(),
            settings: inputs.scene.settings.as_ref(),
            chrome,
        };
        widget_content(b, &ctx);
    };
    let cell = PixelRect::new(0.0, 0.0, rect.width, rect.height);

    // Mockup: the flat delta colors its value instead of filling its frame.
    let kind = match widget_chrome(widget, inputs.frame, &tile_palette) {
        WidgetChrome::Framed { title, accent, .. } if chrome.style.is_flat() && widget.widget_type == "delta" => {
            WidgetChrome::Framed { title, accent, fill: None }
        }
        kind => kind,
    };
    b.translated(rect.left, rect.top, |b| match kind {
        WidgetChrome::Framed { title, accent, fill } => {
            let title_color = resolve_style_color(widget.style.as_ref().and_then(|s| s.label_color.as_deref()), inputs.palette);
            let frame = WidgetFrame { ctx: chrome, rect: cell, title: Some(title), accent, fill, title_color, palette: tile_palette };
            widget_frame(b, frame, content);
        }
        WidgetChrome::Split => content(b, cell.width, cell.height, &tile_palette),
        // The grid rules every cell, so an unframed widget still sits inside its lines.
        WidgetChrome::Bare if chrome.style == DashStyle::Grid => {
            let frame = WidgetFrame { ctx: chrome, rect: cell, title: None, accent: None, fill: None, title_color: None, palette: tile_palette };
            widget_frame(b, frame, content);
        }
        WidgetChrome::Bare => {
            let inset = bare_content(chrome, rect.width, rect.height);
            b.translated(inset.left, inset.top, |b| content(b, inset.width, inset.height, &tile_palette));
        }
    });
}

fn union_rect(a: PixelRect, b: PixelRect) -> PixelRect {
    let (left, top) = (a.left.min(b.left), a.top.min(b.top));
    let right = (a.left + a.width).max(b.left + b.width);
    let bottom = (a.top + a.height).max(b.top + b.height);
    PixelRect::new(left, top, right - left, bottom - top)
}

fn inset_rect(r: PixelRect, by: f64) -> PixelRect {
    PixelRect::new(r.left + by, r.top + by, (r.width - by * 2.0).max(0.0), (r.height - by * 2.0).max(0.0))
}

/// `rect` pulled in by `pad` on each side it shares with its group's `outer` edge.
fn inset_touching(rect: PixelRect, outer: PixelRect, pad: f64) -> PixelRect {
    let near = |a: f64, b: f64| (a - b).abs() < 0.5;
    let left = rect.left + if near(rect.left, outer.left) { pad } else { 0.0 };
    let top = rect.top + if near(rect.top, outer.top) { pad } else { 0.0 };
    let right = rect.left + rect.width - if near(rect.left + rect.width, outer.left + outer.width) { pad } else { 0.0 };
    let bottom = rect.top + rect.height - if near(rect.top + rect.height, outer.top + outer.height) { pad } else { 0.0 };
    PixelRect::new(left, top, (right - left).max(0.0), (bottom - top).max(0.0))
}

/// Builds the display list for one page of `scene` against `frame`, with the given overlays on
/// top. An error where the React renderer threw (a theme color `dimColor` cannot parse).
pub fn build_display_list(fonts: &Fonts, scene: &Scene, frame: &TelemetryFrame, overlays: Overlays, ops: &mut Vec<DrawOp>) -> Result<(), String> {
    ops.clear();
    let layout = &scene.layout;
    let palette = scene_palette(scene);
    let page = select_page(layout, scene.page_id.as_deref(), scene.idle);
    let cols = if layout.grid_cols > 0.0 { layout.grid_cols } else { 20.0 };
    let rows = if layout.grid_rows > 0.0 { layout.grid_rows } else { 12.0 };
    let (width, height) = (scene.width, scene.height);

    // Focused purpose screens own their visual language: the canvas stays pure black and the
    // flag overlay never covers it.
    let focused_lap_timer = layout.id == PURPOSE_LAP_TIMES;
    let background = if focused_lap_timer { Rgba::BLACK } else { palette.background };
    let style = layout.dash_style.unwrap_or_default();
    // The flat chrome is authored at 800x480 whatever the grid (the zones are a fine grid).
    let scale = if style.is_flat() || layout.zoned { (width / 800.0).min(height / 480.0) } else { (width / cols).min(height / rows) / CHROME_CELL_PX };
    let chrome = ChromeContext { style, scale, flat: layout.chrome };
    // The grid style rounds the whole canvas, so corner cells clip to its outer frame.
    let ruled = chrome.style == DashStyle::Grid && !focused_lap_timer;
    let canvas_color = if scene.transparent { Rgba::TRANSPARENT } else { background };

    let mut b = Builder::new(fonts, ops);
    b.fill(canvas_color);
    let inputs = TileInputs { frame, scene, palette: &palette, chrome };
    // Drawn widgets never overlap (only layers of one stack may, and a stack draws one), so
    // their order never shows.
    let drawn = page.map(drawn_widgets).unwrap_or_default();
    let rect_of = |widget: &DashWidget| {
        if layout.zoned { zoned_rect(width, height, GridSpan::from(widget)) } else { grid_rect(width, height, cols, rows, GridSpan::from(widget)) }
    };
    // Mockup v2: a styled group draws its frame round its widgets' cells, and they step inside it.
    let mut framed_groups: Vec<(&str, PixelRect, f64)> = Vec::new();
    if style.is_flat()
        && let Some(page) = page
    {
        for group in &page.groups {
            let Some(group_style) = group.style else { continue };
            let Some(union) = drawn.iter().filter(|w| w.group.as_deref() == Some(group.id.as_str())).map(|w| rect_of(w)).reduce(union_rect) else { continue };
            let outline = inset_rect(union, 3.0 * scale);
            group_frame(&mut b, chrome, outline, group_style, &group.name.to_uppercase(), &palette);
            framed_groups.push((group.id.as_str(), union, 5.0 * scale));
        }
    }
    // A zoned page's gear is always there; no widget may cover its spot.
    if layout.zoned && page.is_some() {
        let spot = zoned_rect(width, height, GEAR_SPOT);
        b.translated(spot.left, spot.top, |b| zoned_gear(b, &frame.car, &palette, spot.width, spot.height));
    }
    for widget in drawn {
        let mut rect = rect_of(widget);
        if let Some((_, union, pad)) = framed_groups.iter().find(|(id, ..)| widget.group.as_deref() == Some(*id)) {
            rect = inset_touching(rect, *union, *pad);
        }
        widget_tile(&mut b, widget, rect, &inputs);
    }
    if ruled {
        let canvas = PixelRect::new(0.0, 0.0, width, height);
        b.corner_cut(canvas, 14.0 * chrome.scale, canvas_color);
        grid_outer_frame(&mut b, chrome, width, height, &palette);
    }
    // Over everything, outside the grid style's rounded clip: the lap timer island, the alert
    // banner, then the flag overlay (never on the focused lap-timer screen, and not while the
    // flag alert is up: it names the flag itself, so the overlay would say it twice).
    if let Some(view) = overlays.lap_timer {
        race_logic_lap_timer_overlay(&mut b, view, frame, &palette, width, height);
    }
    if let Some(banner) = overlays.banner {
        alert_banner(&mut b, banner, &layout.lap_review, &palette, chrome, width, height);
    }
    if !focused_lap_timer && !overlays.banner.is_some_and(DashAlertBanner::is_flag_alert) {
        flag_overlay(&mut b, frame, &palette, width, height);
    }
    b.into_failure().map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_scene;
    use crate::palette::DEFAULT_DASH_PALETTE;
    use serde_json::json;

    fn scene(layout: serde_json::Value) -> Scene {
        parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene")
    }

    fn layout(dash_style: &str, widgets: serde_json::Value) -> serde_json::Value {
        json!({ "id": "l1", "name": "L", "gridCols": 20, "gridRows": 12, "dashStyle": dash_style, "pages": [{ "id": "p1", "name": "P", "widgets": widgets }] })
    }

    fn ops_for(scene: &Scene, frame: &TelemetryFrame) -> Vec<DrawOp> {
        let fonts = Fonts::new();
        let mut ops = Vec::new();
        build_display_list(&fonts, scene, frame, Overlays::default(), &mut ops).expect("drawable");
        ops
    }

    fn texts(ops: &[DrawOp]) -> Vec<String> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) => Some(run.text.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn a_widget_renders_the_value_bound_to_its_telemetry_channel() {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap_time = 92.345;
        let s = scene(layout("panels", json!([{ "id": "w", "type": "lap_time", "col": 0, "row": 0, "colSpan": 20, "rowSpan": 12 }])));
        assert!(texts(&ops_for(&s, &frame)).contains(&"1:32.345".to_owned()));
    }

    #[test]
    fn hidden_widgets_do_not_draw() {
        let s = scene(layout(
            "panels",
            json!([
                { "id": "a", "type": "shown_one", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2 },
                { "id": "b", "type": "hidden_one", "col": 8, "row": 0, "colSpan": 4, "rowSpan": 2, "hidden": true }
            ]),
        ));
        let text = texts(&ops_for(&s, &TelemetryFrame::default()));
        assert!(text.contains(&"SHOWN_ONE".to_owned()));
        assert!(!text.contains(&"HIDDEN_ONE".to_owned()));
    }

    #[test]
    fn a_stack_draws_only_its_shown_layer_and_a_hidden_group_draws_nothing() {
        let mut l = layout(
            "panels",
            json!([
                { "id": "a", "type": "layer_a", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "stack" },
                { "id": "b", "type": "layer_b", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "stack" },
                { "id": "c", "type": "gone_c", "col": 8, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "off" }
            ]),
        );
        l["pages"][0]["groups"] = json!([
            { "id": "stack", "name": "S", "mode": "oneAtATime", "shownFirst": "b" },
            { "id": "off", "name": "O", "mode": "together", "hidden": true }
        ]);
        assert_eq!(texts(&ops_for(&scene(l), &TelemetryFrame::default())), ["LAYER_B"]);
    }

    #[test]
    fn a_theme_color_dim_color_cannot_parse_makes_the_picture_an_error_like_the_typescript_throw() {
        // A tall rpm bar dims the primary color for its unlit segments; '#f00a' throws in dimColor.
        let mut l = layout("panels", json!([{ "id": "r", "type": "rpm_bar", "col": 0, "row": 0, "colSpan": 2, "rowSpan": 12 }]));
        l["colorSystem"] = json!("styled");
        l["theme"] = json!({ "primary": "#f00a" });
        let fonts = Fonts::new();
        let result = build_display_list(&fonts, &scene(l.clone()), &TelemetryFrame::default(), Overlays::default(), &mut Vec::new());
        assert!(result.is_err_and(|e| e.contains("dimColor")));
        l["theme"] = json!({ "primary": "#ff0000aa" });
        assert!(build_display_list(&fonts, &scene(l), &TelemetryFrame::default(), Overlays::default(), &mut Vec::new()).is_ok());
    }

    #[test]
    fn the_racelogic_lap_timer_cell_is_empty_but_the_grid_still_rules_it() {
        let widgets = json!([{ "id": "t", "type": "racelogic_lap_timer", "col": 0, "row": 0, "colSpan": 20, "rowSpan": 12 }]);
        let panels = ops_for(&scene(layout("panels", widgets.clone())), &TelemetryFrame::default());
        assert_eq!(panels.len(), 1, "only the canvas fill");
        let grid = ops_for(&scene(layout("grid", widgets)), &TelemetryFrame::default());
        assert!(texts(&grid).is_empty());
        assert!(matches!(grid[1], DrawOp::Border { width: 2.0, .. }), "{:?}", grid[1]);
    }

    #[test]
    fn a_framed_widget_sits_in_the_cell_its_grid_span_maps_to() {
        // col 5 row 2, span 4x3 -> cell (200, 80, 160, 120); panels inset the frame by 4px.
        let s = scene(layout("panels", json!([{ "id": "w", "type": "lap_time", "col": 5, "row": 2, "colSpan": 4, "rowSpan": 3 }])));
        let ops = ops_for(&s, &TelemetryFrame::default());
        let border = ops.iter().find_map(|op| match op {
            DrawOp::Border { rect, .. } => Some(*rect),
            _ => None,
        });
        assert_eq!(border, Some(PixelRect::new(204.0, 84.0, 152.0, 112.0)));
    }

    #[test]
    fn the_dash_style_changes_only_the_chrome_every_widget_keeps_its_cell() {
        // A centered gear sits on its cell's center line (col 4 + span 8 -> 160..480) in every
        // style; only the frame around it changes.
        let widgets = json!([{ "id": "gear", "type": "gear_speed", "col": 4, "row": 0, "colSpan": 8, "rowSpan": 6 }]);
        let fonts = Fonts::new();
        for style in ["panels", "grid", "bars"] {
            let ops = ops_for(&scene(layout(style, widgets.clone())), &TelemetryFrame::default());
            let center = ops.iter().find_map(|op| match op {
                DrawOp::Text(run) if run.text == "N" => Some(run.x + run.width(&fonts) / 2.0),
                _ => None,
            });
            assert!(center.is_some_and(|c| (c - 320.0).abs() < 1e-9), "{style}: {center:?}");
        }
    }

    #[test]
    fn the_grid_style_rounds_the_canvas_and_draws_the_outer_frame_last() {
        let s = scene(layout("grid", json!([{ "id": "w", "type": "lap_time", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 3 }])));
        let ops = ops_for(&s, &TelemetryFrame::default());
        let n = ops.len();
        assert!(matches!(ops[n - 2], DrawOp::CornerCut { radius: 14.0, color, .. } if color == DEFAULT_DASH_PALETTE.background));
        assert!(matches!(ops[n - 1], DrawOp::Border { width: 4.0, radius: 14.0, .. }));
    }

    #[test]
    fn the_purpose_lap_times_screen_keeps_a_pure_black_canvas_and_transparent_clears_it() {
        let mut l = layout("grid", json!([]));
        l["id"] = json!(PURPOSE_LAP_TIMES);
        let ops = ops_for(&scene(l), &TelemetryFrame::default());
        assert_eq!(ops, vec![DrawOp::Fill { color: Rgba::BLACK }], "no rounded grid frame either");

        let mut transparent = scene(layout("panels", json!([])));
        transparent.transparent = true;
        assert_eq!(ops_for(&transparent, &TelemetryFrame::default()), vec![DrawOp::Fill { color: Rgba::TRANSPARENT }]);
    }

    #[test]
    fn a_widget_style_recolors_its_values_and_title() {
        let s = scene(layout(
            "panels",
            json!([{ "id": "w", "type": "lap_time", "col": 0, "row": 0, "colSpan": 8, "rowSpan": 4, "config": { "show": "current" }, "style": { "textColor": "red", "labelColor": "ember" } }]),
        ));
        let ops = ops_for(&s, &TelemetryFrame::default());
        let colors: Vec<Rgba> = ops
            .iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) => Some(run.color),
                _ => None,
            })
            .collect();
        assert_eq!(colors, vec![DEFAULT_DASH_PALETTE.primary, DEFAULT_DASH_PALETTE.danger]);
    }
}
