// The whole canvas: one page of a layout against a telemetry frame, as a display list. Ported
// from the composition in the retired React renderer's `DashRenderer.tsx`. A pure function of
// its inputs: the stateful parts (which banner is up, what the lap timer shows) arrive already
// decided, as `Overlays`.

use crate::alerts::{AlertLimits, DashAlertBanner, FlagBar, alert_limits, pit_limiter_alert_on};
use crate::chrome::{ChromeContext, WidgetFrame, bare_content, frame_box, group_frame, ink_palette, lit_content, widget_frame};
use crate::draw::{Builder, DrawOp, Radii};
use crate::forms::form_index;
use crate::grid::{GridSpan, PixelRect, layout_rect, page_has_race_logic_lap_timer, select_page, track_rect};
use crate::groups::drawn_widgets;
use crate::model::{DashPage, DashWidget, Scene, TelemetryFrame};
use crate::overlays::{alert_banner, flag_bar, race_logic_lap_timer_overlay};
use crate::palette::{DashPaletteColors, Rgba, effective_color_system, resolve_dash_palette};
use crate::pit_limiter::{PIT_INK, PIT_YELLOW, PitLimiter, PitLimiterStyle, draw_box_frame, draw_full_screen, draw_gear_box};
use crate::racelogic::RaceLogicLapTimerView;
use crate::text::Fonts;
use crate::widgets::{WidgetChrome, WidgetContext, widget_chrome, widget_content};

/// The layout id of the focused RaceLogic purpose screen, which keeps a pure black canvas.
const PURPOSE_LAP_TIMES: &str = "purpose-lap-times";

/// The overlays decided outside the display list: the alert banner to draw (`alertBanner`),
/// what the RaceLogic lap timer shows when the page has one (see `draws_race_logic_lap_timer`),
/// and the bar of a flag that is out (`alerts::flag_bar`, or the live tracker's).
#[derive(Clone, Copy, Debug, Default)]
pub struct Overlays<'a> {
    pub banner: Option<&'a DashAlertBanner>,
    pub lap_timer: Option<&'a RaceLogicLapTimerView>,
    pub flag_bar: Option<FlagBar>,
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

/// What every tile on the canvas shares.
struct TileInputs<'a> {
    frame: &'a TelemetryFrame,
    scene: &'a Scene,
    palette: &'a DashPaletteColors,
    chrome: ChromeContext,
    /// The app-wide limits the widgets warn from (`alert_limits`).
    limits: AlertLimits,
}

/// One widget's cell: its frame and label in the dash's look, then its values in the
/// content box (`WidgetTile`). `lit` fills its box in that colour with every text in the dark ink
/// whatever its condition (the pit limiter's own widgets).
fn widget_tile(b: &mut Builder, widget: &DashWidget, rect: PixelRect, inputs: &TileInputs, lit: Option<Rgba>) {
    if rect.width < 1.0 || rect.height < 1.0 {
        return;
    }
    // On a lit box the ink is the pit limiter's, not the theme's background.
    let tile_palette = if lit.is_some() { DashPaletteColors { background: PIT_INK, ..*inputs.palette } } else { *inputs.palette };
    // The widget's own label spot wins over the dash's.
    let mut chrome = inputs.chrome;
    chrome.look.label = widget.label.unwrap_or(chrome.look.label);
    // Forms are sized at 800x480, like the chrome.
    let reference = (inputs.scene.width / 800.0).min(inputs.scene.height / 480.0).max(f64::EPSILON);
    let form = form_index(&widget.widget_type, rect.width / reference, rect.height / reference);
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
            limits: inputs.limits,
            form,
        };
        widget_content(b, &ctx);
    };
    let cell = PixelRect::new(0.0, 0.0, rect.width, rect.height);

    let kind = widget_chrome(widget, inputs.frame, &tile_palette, inputs.scene.units(), inputs.limits.lift_point);
    b.translated(rect.left, rect.top, |b| match kind {
        WidgetChrome::Framed { title, accent, fill } => {
            // A knob's identity colour colours its value too: colour follows meaning.
            let palette = match accent {
                Some(color) => DashPaletteColors { foreground: color, neutral: color, ..tile_palette },
                None => tile_palette,
            };
            let frame = WidgetFrame { ctx: chrome, rect: cell, title: Some(title), accent, fill: lit.or(fill), palette };
            widget_frame(b, frame, content);
        }
        // An unframed widget lit up gets the box a frame would have, its values inked.
        WidgetChrome::Split | WidgetChrome::Bare | WidgetChrome::Edged if let Some(fill) = lit => {
            let (box_, radius) = frame_box(chrome, cell.width, cell.height);
            b.rect(box_, Radii::all(radius), fill);
            let inset = lit_content(chrome, cell.width, cell.height);
            b.translated(inset.left, inset.top, |b| content(b, inset.width, inset.height, &ink_palette(&tile_palette)));
        }
        WidgetChrome::Split => content(b, cell.width, cell.height, &tile_palette),
        // A bar wears the dash's edge (white by default), without a label.
        WidgetChrome::Edged => {
            let frame = WidgetFrame { ctx: chrome, rect: cell, title: None, accent: None, fill: None, palette: tile_palette };
            widget_frame(b, frame, content);
        }
        WidgetChrome::Bare => {
            let inset = bare_content(chrome, rect.width, rect.height);
            b.translated(inset.left, inset.top, |b| content(b, inset.width, inset.height, &tile_palette));
        }
    });
}

/// The pit limiter overlay over `page` (`pit_limiter.rs`): its yellow parts in the layout's
/// style, then its own widgets lit yellow on the dash's grid. The gear style lights the page's
/// gear widget; a page without one shows the full screen.
fn pit_limiter_overlay(b: &mut Builder, inputs: &TileInputs, page: Option<&DashPage>, width: f64, height: f64) {
    let layout = &inputs.scene.layout;
    let scale = inputs.chrome.scale;
    let gear = page.and_then(|page| drawn_widgets(page).into_iter().find(|widget| widget.widget_type == "gear")).map(GridSpan::from);
    let style = match PitLimiter::style_on(layout) {
        PitLimiterStyle::Gear if gear.is_none() => PitLimiterStyle::Full,
        style => style,
    };
    let Some(tracks) = layout.tracks.as_ref().filter(|_| style != PitLimiterStyle::Full) else {
        return draw_full_screen(b, &inputs.frame.car, inputs.scene.units(), width, height);
    };
    match (style, gear) {
        (PitLimiterStyle::Box, _) => draw_box_frame(b, tracks, width, height, scale),
        (_, Some(gear)) => {
            let spot = track_rect(width, height, tracks, gear);
            let (box_, radius) = frame_box(inputs.chrome, spot.width, spot.height);
            let rect = PixelRect::new(spot.left + box_.left, spot.top + box_.top, box_.width, box_.height);
            let digit = bare_content(inputs.chrome, spot.width, spot.height);
            let digit = PixelRect::new(spot.left + digit.left, spot.top + digit.top, digit.width, digit.height);
            draw_gear_box(b, &inputs.frame.car, digit, rect, radius, scale);
        }
        _ => {}
    }
    for widget in drawn_widgets(&layout.pit_limiter.page).into_iter().filter(|widget| PitLimiter::draws(style, widget, tracks, gear)) {
        let rect = track_rect(width, height, tracks, GridSpan::from(widget));
        // The cell is the overlay's: nothing of the page shows through the gutters round its box.
        if has_area(rect) {
            b.rect(rect, Radii::ZERO, inputs.palette.background);
        }
        widget_tile(b, widget, rect, inputs, Some(PIT_YELLOW));
    }
}

/// Whether a widget's rect covers a pixel.
fn has_area(rect: PixelRect) -> bool {
    rect.width >= 1.0 && rect.height >= 1.0
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
    let (width, height) = (scene.width, scene.height);

    // Focused purpose screens own their visual language: the canvas stays pure black and the
    // flag bar never covers it.
    let focused_lap_timer = layout.id == PURPOSE_LAP_TIMES;
    let background = if focused_lap_timer { Rgba::BLACK } else { palette.background };
    // The chrome is authored at 800x480 whatever the grid.
    let scale = (width / 800.0).min(height / 480.0);
    let chrome = ChromeContext { scale, look: layout.chrome };
    let canvas_color = if scene.transparent || scene.pit_limiter_only { Rgba::TRANSPARENT } else { background };

    let mut b = Builder::new(fonts, ops);
    b.fill(canvas_color);
    let inputs = TileInputs { frame, scene, palette: &palette, chrome, limits: alert_limits(layout) };
    if scene.pit_limiter_only {
        pit_limiter_overlay(&mut b, &inputs, page, width, height);
        return b.into_failure().map_or(Ok(()), Err);
    }
    let rect_of = |widget: &DashWidget| layout_rect(layout, width, height, GridSpan::from(widget));
    // Drawn widgets never overlap (only layers of one stack may, and a stack draws one), so
    // their order never shows. One with no pixels (a span past the grid) is not drawn.
    let drawn: Vec<&DashWidget> = page.map(drawn_widgets).unwrap_or_default().into_iter().filter(|widget| has_area(rect_of(widget))).collect();
    // A styled group draws its frame round its widgets' cells, and they step inside it.
    let mut framed_groups: Vec<(&str, PixelRect, f64)> = Vec::new();
    if let Some(page) = page {
        for group in &page.groups {
            let Some(group_style) = group.style else { continue };
            let Some(union) = drawn.iter().filter(|w| w.group.as_deref() == Some(group.id.as_str())).map(|w| rect_of(w)).reduce(union_rect) else { continue };
            let outline = inset_rect(union, 3.0 * scale);
            group_frame(&mut b, chrome, outline, group_style, &group.name.to_uppercase(), &palette);
            framed_groups.push((group.id.as_str(), union, 5.0 * scale));
        }
    }
    for widget in drawn {
        let mut rect = rect_of(widget);
        if let Some((_, union, pad)) = framed_groups.iter().find(|(id, ..)| widget.group.as_deref() == Some(*id)) {
            rect = inset_touching(rect, *union, *pad);
        }
        widget_tile(&mut b, widget, rect, &inputs, None);
    }
    // Over everything: the pit limiter while it is on
    // (never over the idle page or the focused lap-timer screen), the lap timer island, the alert
    // banner, then the flag bar (never on the focused lap-timer screen, and not while the flag
    // alert is up: it names the flag itself, so the bar would say it twice).
    if frame.car.pit_limiter == Some(true) && !scene.idle && !focused_lap_timer && page.is_some() && pit_limiter_alert_on(layout) {
        pit_limiter_overlay(&mut b, &inputs, page, width, height);
    }
    if let Some(view) = overlays.lap_timer {
        race_logic_lap_timer_overlay(&mut b, view, frame, &palette, scene.units(), width, height);
    }
    if let Some(banner) = overlays.banner {
        alert_banner(&mut b, banner, &layout.lap_review, &palette, chrome, scene.units(), width, height);
    }
    if let Some(bar) = overlays.flag_bar
        && !focused_lap_timer
        && !overlays.banner.is_some_and(DashAlertBanner::is_flag_alert)
    {
        flag_bar(&mut b, bar, width, height);
    }
    b.into_failure().map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_scene;
    use serde_json::json;

    fn scene(layout: serde_json::Value) -> Scene {
        parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene")
    }

    fn layout(widgets: serde_json::Value) -> serde_json::Value {
        json!({ "id": "l1", "name": "L", "gridCols": 20, "gridRows": 12, "pages": [{ "id": "p1", "name": "P", "widgets": widgets }] })
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
        let s = scene(layout(json!([{ "id": "w", "type": "current_lap", "col": 0, "row": 0, "colSpan": 20, "rowSpan": 12 }])));
        assert!(texts(&ops_for(&s, &frame)).contains(&"1:32.345".to_owned()));
    }

    #[test]
    fn hidden_widgets_do_not_draw() {
        let s = scene(layout(json!([
            { "id": "a", "type": "shown_one", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2 },
            { "id": "b", "type": "hidden_one", "col": 8, "row": 0, "colSpan": 4, "rowSpan": 2, "hidden": true }
        ])));
        let text = texts(&ops_for(&s, &TelemetryFrame::default()));
        assert!(text.contains(&"SHOWN_ONE".to_owned()));
        assert!(!text.contains(&"HIDDEN_ONE".to_owned()));
    }

    /// A dash on its own 11 x 9 tracks (narrow first and last columns, a short top row, a wide
    /// centre column), a gear in the centre's top three rows and a TC widget top left, with the
    /// app's pit limiter alert on (`enabled`); its overlay in `style` with its own speed widget
    /// under the gear, one over the gear and a bar down the first column.
    fn pit_layout(style: &str, enabled: bool) -> serde_json::Value {
        json!({ "id": "z", "name": "Z", "gridCols": 11, "gridRows": 9,
            "colSizes": [40, 68, 68, 68, 68, 176, 68, 68, 68, 68, 40], "rowSizes": [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5],
            "pages": [{ "id": "p", "name": "P", "widgets": [
                { "id": "t", "type": "tc", "col": 1, "row": 1, "colSpan": 2, "rowSpan": 1 },
                { "id": "gear", "type": "gear", "col": 5, "row": 1, "colSpan": 1, "rowSpan": 3 }
            ] }],
            "alerts": [{ "id": "pit_limiter", "type": "pit_limiter", "enabled": enabled, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 }],
            "pitLimiter": { "style": style, "widgets": [
                { "id": "s", "type": "speed", "col": 5, "row": 4, "colSpan": 1, "rowSpan": 1 },
                { "id": "g", "type": "laps", "col": 5, "row": 3, "colSpan": 1, "rowSpan": 1 },
                { "id": "b", "type": "bar", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 9 }
            ] } })
    }

    #[test]
    fn a_dash_places_its_widgets_on_its_own_track_sizes() {
        let mut l = pit_layout("gear", false);
        l["pages"][0]["widgets"] = json!([{ "id": "w", "type": "marker", "col": 5, "row": 4, "colSpan": 1, "rowSpan": 5 }]);
        let ops = ops_for(&scene(l), &TelemetryFrame::default());
        let text = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) if run.text == "MARKER" => Some(run.x),
            _ => None,
        });
        assert!(text.is_some_and(|x| (312.0..488.0).contains(&x)), "inside the wide centre column: {text:?}");
    }

    fn pit_frame(on: bool) -> TelemetryFrame {
        let mut frame = TelemetryFrame::default();
        (frame.car.pit_limiter, frame.car.gear, frame.car.speed_ms) = (Some(on), 2.0, 16.0);
        frame
    }

    fn ink_texts(ops: &[DrawOp]) -> Vec<String> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Text(run) if run.color == PIT_INK => Some(run.text.clone()),
                _ => None,
            })
            .collect()
    }

    fn yellow_rects(ops: &[DrawOp]) -> Vec<PixelRect> {
        ops.iter()
            .filter_map(|op| match op {
                DrawOp::Rect { rect, color, .. } if *color == PIT_YELLOW => Some(*rect),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_pit_limiter_overlay_shows_while_the_limiter_is_on_and_its_alert_is_on() {
        let shows = |layout: serde_json::Value, on: bool, idle: bool| {
            let mut s = scene(layout);
            s.idle = idle;
            texts(&ops_for(&s, &pit_frame(on))).contains(&"PIT LIMITER".to_owned())
        };
        assert!(shows(pit_layout("gear", true), true, false));
        assert!(!shows(pit_layout("gear", true), false, false), "the limiter off");
        assert!(!shows(pit_layout("gear", false), true, false), "the alert off");
        assert!(!shows(pit_layout("gear", true), true, true), "never over the idle page");
        let mut no_alert = pit_layout("gear", true);
        no_alert["alerts"] = json!([]);
        assert!(!shows(no_alert, true, false), "a dash nothing stamped the alert on");
    }

    #[test]
    fn the_gear_style_lights_the_gears_box_and_the_overlays_widgets_never_the_gear() {
        let ops = ops_for(&scene(pit_layout("gear", true)), &pit_frame(true));
        let gear = PixelRect::new(312.0, 36.0, 176.0, 167.0);
        let lit = yellow_rects(&ops);
        assert!(lit.iter().any(|r| r.left > gear.left && r.top > gear.top && r.left + r.width < gear.left + gear.width), "{lit:?}");
        let ink = ink_texts(&ops);
        for text in ["2", "PIT LIMITER", "58"] {
            assert!(ink.contains(&text.to_owned()), "{text}: {ink:?}");
        }
        assert!(!texts(&ops).contains(&"LAP".to_owned()), "a widget over the gear is not drawn");
        // The first column is free in this style: the bar draws there, lit.
        assert!(lit.iter().any(|r| r.left < 40.0 && r.height > 400.0), "{lit:?}");
    }

    #[test]
    fn the_box_style_frames_the_first_and_last_columns_and_the_top_row_with_its_name_across_it() {
        let ops = ops_for(&scene(pit_layout("box", true)), &pit_frame(true));
        let lit = yellow_rects(&ops);
        assert!(lit.contains(&PixelRect::new(0.0, 0.0, 40.0, 480.0)) && lit.contains(&PixelRect::new(760.0, 0.0, 40.0, 480.0)), "{lit:?}");
        assert!(lit.contains(&PixelRect::new(40.0, 0.0, 720.0, 36.0)), "{lit:?}");
        let label = ops.iter().find_map(|op| match op {
            DrawOp::Text(run) if run.text == "PIT LIMITER" => Some(run.baseline),
            _ => None,
        });
        assert!(label.is_some_and(|baseline| baseline < 36.0), "across the top, never the bottom: {label:?}");
        assert!(ink_texts(&ops).contains(&"58".to_owned()), "its own speed widget, inked");
        assert_eq!(lit.iter().filter(|r| r.left < 40.0).count(), 1, "no bar drawn in the box's frame");
    }

    #[test]
    fn the_full_screen_is_all_yellow_with_the_gear_and_speed_and_no_widgets() {
        let ops = ops_for(&scene(pit_layout("full", true)), &pit_frame(true));
        assert!(ops.contains(&DrawOp::Fill { color: PIT_YELLOW }));
        let ink = ink_texts(&ops);
        assert_eq!(ink, ["2", "58", "PIT LIMITER"]);
        // An even-grid dash (an older one, no track sizes) always shows the full screen.
        let mut even = pit_layout("box", true);
        even.as_object_mut().map(|l| l.remove("colSizes"));
        assert!(ops_for(&scene(even), &pit_frame(true)).contains(&DrawOp::Fill { color: PIT_YELLOW }));
        // So does the gear style on a page without a gear.
        let mut gearless = pit_layout("gear", true);
        gearless["pages"][0]["widgets"] = json!([]);
        assert!(ops_for(&scene(gearless), &pit_frame(true)).contains(&DrawOp::Fill { color: PIT_YELLOW }));
    }

    #[test]
    fn the_designers_pit_limiter_stage_draws_only_the_overlay_on_a_clear_canvas() {
        let mut s = scene(pit_layout("gear", false));
        s.pit_limiter_only = true;
        let ops = ops_for(&s, &pit_frame(false));
        assert_eq!(ops[0], DrawOp::Fill { color: Rgba::TRANSPARENT });
        let text = texts(&ops);
        assert!(text.contains(&"PIT LIMITER".to_owned()) && !text.contains(&"TC".to_owned()), "the page is not drawn: {text:?}");
    }

    #[test]
    fn a_stack_draws_only_its_shown_layer_and_a_hidden_group_draws_nothing() {
        let mut l = layout(json!([
            { "id": "a", "type": "layer_a", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "stack" },
            { "id": "b", "type": "layer_b", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "stack" },
            { "id": "c", "type": "gone_c", "col": 8, "row": 0, "colSpan": 4, "rowSpan": 2, "group": "off" }
        ]));
        l["pages"][0]["groups"] = json!([
            { "id": "stack", "name": "S", "mode": "oneAtATime", "shownFirst": "b" },
            { "id": "off", "name": "O", "mode": "together", "hidden": true }
        ]);
        assert_eq!(texts(&ops_for(&scene(l), &TelemetryFrame::default())), ["LAYER_B"]);
    }

    #[test]
    fn a_theme_color_dim_color_cannot_parse_makes_the_picture_an_error_like_the_typescript_throw() {
        // A tall rpm bar dims the primary color for its unlit segments; '#f00a' throws in dimColor.
        let mut l = layout(json!([{ "id": "r", "type": "rpm_bar", "col": 0, "row": 0, "colSpan": 2, "rowSpan": 12 }]));
        l["colorSystem"] = json!("styled");
        l["theme"] = json!({ "primary": "#f00a" });
        let fonts = Fonts::new();
        let result = build_display_list(&fonts, &scene(l.clone()), &TelemetryFrame::default(), Overlays::default(), &mut Vec::new());
        assert!(result.is_err_and(|e| e.contains("dimColor")));
        l["theme"] = json!({ "primary": "#ff0000aa" });
        assert!(build_display_list(&fonts, &scene(l), &TelemetryFrame::default(), Overlays::default(), &mut Vec::new()).is_ok());
    }

    #[test]
    fn the_racelogic_lap_timer_cell_is_empty() {
        let widgets = json!([{ "id": "t", "type": "racelogic_lap_timer", "col": 0, "row": 0, "colSpan": 20, "rowSpan": 12 }]);
        assert_eq!(ops_for(&scene(layout(widgets)), &TelemetryFrame::default()).len(), 1, "only the canvas fill");
    }

    #[test]
    fn a_framed_widget_sits_in_the_cell_its_grid_span_maps_to() {
        // col 5 row 2, span 4x3 -> cell (200, 80, 160, 120); the frame keeps a 3px gutter and steps
        // 5px down so its label in the edge clears the box above.
        let s = scene(layout(json!([{ "id": "w", "type": "current_lap", "col": 5, "row": 2, "colSpan": 4, "rowSpan": 3 }])));
        let ops = ops_for(&s, &TelemetryFrame::default());
        let border = ops.iter().find_map(|op| match op {
            DrawOp::Border { rect, .. } => Some(*rect),
            _ => None,
        });
        assert_eq!(border, Some(PixelRect::new(203.0, 88.0, 154.0, 109.0)));
    }

    #[test]
    fn the_purpose_lap_times_screen_keeps_a_pure_black_canvas_and_transparent_clears_it() {
        let mut l = layout(json!([]));
        l["id"] = json!(PURPOSE_LAP_TIMES);
        let ops = ops_for(&scene(l), &TelemetryFrame::default());
        assert_eq!(ops, vec![DrawOp::Fill { color: Rgba::BLACK }]);

        let mut transparent = scene(layout(json!([])));
        transparent.transparent = true;
        assert_eq!(ops_for(&transparent, &TelemetryFrame::default()), vec![DrawOp::Fill { color: Rgba::TRANSPARENT }]);
    }

    #[test]
    fn a_knobs_colour_colours_its_edge_and_its_value() {
        let tc = crate::palette::dash_setting_colors::TC;
        let mut frame = TelemetryFrame::default();
        (frame.electronics.tc, frame.electronics.tc_max) = (4.0, 11.0);
        let drawn = |style: serde_json::Value| {
            let ops = ops_for(&scene(layout(json!([{ "id": "w", "type": "tc", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2, "style": style }]))), &frame);
            let edge = ops.iter().find_map(|op| match op {
                DrawOp::Border { color, .. } => Some(*color),
                _ => None,
            });
            let value = ops.iter().find_map(|op| match op {
                DrawOp::Text(run) if run.text == "4" => Some(run.color),
                _ => None,
            });
            (edge, value)
        };
        assert_eq!(drawn(json!({})), (Some(tc), Some(tc)));
        assert_eq!(drawn(json!({ "textColor": "foreground" })), (Some(tc), Some(tc)), "a saved value colour is gone: colour follows meaning");
    }

    #[test]
    fn a_bar_wears_the_dashs_edge_and_none_when_the_dash_has_none() {
        let edges = |chrome: serde_json::Value| {
            let mut l = layout(
                json!([{ "id": "b", "type": "bar", "col": 0, "row": 0, "colSpan": 1, "rowSpan": 12, "config": { "channel": "fuel" }, "style": { "border": "thick" } }]),
            );
            l["chrome"] = chrome;
            ops_for(&scene(l), &TelemetryFrame::default()).iter().filter(|op| matches!(op, DrawOp::Border { .. })).count()
        };
        assert_eq!((edges(json!({})), edges(json!({ "border": "none" }))), (1, 0), "a widget's saved edge is gone");
    }

    #[test]
    fn a_widget_moves_only_its_own_label_and_never_into_a_band() {
        let titles = |style: serde_json::Value| {
            let s = scene(layout(json!([{ "id": "w", "type": "current_lap", "col": 0, "row": 0, "colSpan": 8, "rowSpan": 4, "style": style }])));
            texts(&ops_for(&s, &TelemetryFrame::default())).iter().filter(|text| *text == "CURRENT").count()
        };
        assert_eq!(titles(json!({})), 1);
        assert_eq!(titles(json!({ "label": "off" })), 0);
        assert_eq!(titles(json!({ "label": "capsule" })), 1, "a band is the dash's alone: the dash's label stands");
    }
}
