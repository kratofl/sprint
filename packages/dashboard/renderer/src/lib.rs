// The Sprint wheel-dash renderer: a dash layout and a telemetry frame in, pixels out.
//
// Three steps, each its own module family:
//   scene/frame JSON --serde--> model             (`model`: the boundary, lenient; the frame is
//                                                  the host's telemetry JSON, pinned by
//                                                  tests/fixtures/host-frame.json)
//   model + state    --pure---> Vec<DrawOp>       (`dash`, `widgets`, `chrome`, `primitives`, `overlays`)
//   Vec<DrawOp>      --raster-> tiny-skia pixmap  (`raster`)
// The display-list step is a pure function of its inputs and is where the tests live. The state
// a live output keeps (`alerts`, `lap_summary`, `racelogic`, `multi_dial`) is clock-free: time
// comes in as `now_ms`. `ffi` is the C ABI shared by the native library and the WASM build; it is the only
// `unsafe` code.

pub mod alerts;
pub mod bindings;
pub mod chrome;
pub mod dash;
pub mod draw;
pub mod ffi;
pub mod format;
pub mod grid;
pub mod groups;
pub mod lap_summary;
pub mod model;
pub mod multi_dial;
pub mod overlays;
pub mod palette;
pub mod primitives;
pub mod racelogic;
pub mod raster;
pub mod text;
pub mod widgets;

use std::fmt;

use alerts::{DashAlertBanner, DashAlertTracker};
use dash::Overlays;
use draw::DrawOp;
use model::Scene;
use multi_dial::{MultiDialPopupWatcher, MultiDialReading};
use racelogic::RaceLogicLapTimerPresenter;
use raster::Raster;
use text::Fonts;

/// Why a scene or a frame could not be drawn. Never a blank picture instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderError(String);

impl RenderError {
    pub fn message(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RenderError {}

impl From<String> for RenderError {
    fn from(message: String) -> Self {
        RenderError(message)
    }
}

/// What a render tells its caller beyond the pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RenderInfo {
    /// True while the picture can change without a new telemetry frame: an alert banner or the
    /// multi-dial popup is up (it expires), or the RaceLogic lap timer is holding a lap result
    /// (the hold ends). The
    /// caller must then render again even if the frame did not change; once it is false, the
    /// same frame draws the same picture. Always false for `render_still`.
    pub time_dependent: bool,
}

/// One dash output: the fonts and their caches, the current scene, the pixmap it draws into, and
/// the live state `render_live` keeps between frames (the alert tracker, the lap timer presenter,
/// and the wheel's dial reading with its popup watcher). Everything is reused across frames; only
/// `set_scene` with a new size reallocates the pixmap.
pub struct Renderer {
    fonts: Fonts,
    scene: Option<Scene>,
    ops: Vec<DrawOp>,
    raster: Raster,
    tracker: DashAlertTracker,
    lap_timer: RaceLogicLapTimerPresenter,
    /// The bytes of the last live frame, to tell a re-render of it from a new frame.
    last_frame: Option<Vec<u8>>,
    /// The wheel's multi-position dial as last set; `None` when the output has none.
    dial: Option<MultiDialReading>,
    dial_watcher: MultiDialPopupWatcher,
}

impl Default for Renderer {
    fn default() -> Self {
        Renderer::new()
    }
}

impl Renderer {
    pub fn new() -> Renderer {
        Renderer {
            fonts: Fonts::new(),
            scene: None,
            ops: Vec::new(),
            raster: Raster::new(),
            tracker: DashAlertTracker::default(),
            lap_timer: RaceLogicLapTimerPresenter::default(),
            last_frame: None,
            dial: None,
            dial_watcher: MultiDialPopupWatcher::default(),
        }
    }

    /// Layout, page, size and the slow-changing inputs. Called when any of them changes. On an
    /// error the previous scene stays in place.
    ///
    /// Live state survives a new scene, as it survived a new screen description in the Electron
    /// dash output this replaced: an active banner stays up and the next frame is still diffed
    /// against the last one. Only the lap timer's state goes when the new page does not draw the
    /// lap timer (the TypeScript unmounted its overlay).
    pub fn set_scene(&mut self, scene_json: &[u8]) -> Result<(), RenderError> {
        let scene = model::parse_scene(scene_json)?;
        let (width, height) = scene.size_px();
        self.raster.resize(width, height)?;
        if !dash::draws_race_logic_lap_timer(&scene) {
            self.lap_timer = RaceLogicLapTimerPresenter::default();
        }
        self.scene = Some(scene);
        Ok(())
    }

    /// The wheel's multi-position dial reading (the host's `MultiDialReading` as JSON; empty or
    /// `null` when the output has no dial). Set whenever it changes; `render_live` pops the
    /// position up on each turn. On an error the previous reading stays.
    pub fn set_multi_dial(&mut self, reading_json: &[u8]) -> Result<(), RenderError> {
        self.dial = if is_absent_json(reading_json) { None } else { Some(multi_dial::parse_multi_dial(reading_json)?) };
        Ok(())
    }

    /// A live output at `now_ms` (milliseconds on any clock that never goes back: only differences
    /// are read; the host passes a monotonic one). Each new frame is fed to the alert tracker
    /// once, as the Electron dash output did; the same frame bytes again are a re-render (for
    /// `time_dependent`), which only lets time pass. "No data" (empty, `null`, not a frame)
    /// resets the tracker and draws the empty frame, no banner. A dial turn (`set_multi_dial`)
    /// shows its popup for the layout's alert duration, over any alert banner, with or without data.
    pub fn render_live(&mut self, frame_json: &[u8], now_ms: f64) -> Result<RenderInfo, RenderError> {
        let Renderer { fonts, scene, ops, raster, tracker, lap_timer, last_frame, dial, dial_watcher } = self;
        let scene = scene.as_ref().ok_or_else(|| RenderError("no scene set".to_owned()))?;
        let frame = model::parse_frame_data(frame_json)?;
        let repeat = last_frame.as_deref() == Some(frame_json);
        if !repeat {
            let bytes = last_frame.get_or_insert_with(Vec::new);
            bytes.clear();
            bytes.extend_from_slice(frame_json);
        }

        tracker.advance_to(now_ms);
        let banner = match &frame {
            None => {
                tracker.reset();
                None
            }
            Some(_) if repeat => tracker.current(),
            Some(frame) => tracker.evaluate(&scene.layout, frame, &dash::scene_palette(scene), scene.targets.as_ref()),
        };
        // The driver's own turn of the dial wins over a telemetry alert, which keeps running beneath it.
        let dial_popup = dial_watcher.observe(dial.as_ref(), now_ms, multi_dial::popup_seconds(&scene.layout)).cloned().map(DashAlertBanner::MultiDial);
        let banner = dial_popup.as_ref().or(banner);
        let frame = frame.unwrap_or_default();
        let view = if dash::draws_race_logic_lap_timer(scene) {
            Some(lap_timer.present(&frame, now_ms))
        } else {
            *lap_timer = RaceLogicLapTimerPresenter::default();
            None
        };

        let time_dependent = banner.is_some() || (view.is_some() && lap_timer.is_holding(now_ms));
        dash::build_display_list(fonts, scene, &frame, Overlays { banner, lap_timer: view.as_ref() }, ops)?;
        raster.draw(fonts, ops, scene.scale);
        Ok(RenderInfo { time_dependent })
    }

    /// The editor / a parity case: exactly the given banner (the TypeScript `DashAlertBanner` as
    /// JSON; absent, empty or `null` for none), no history. The lap timer shows what a fresh
    /// presenter shows for this frame (never a held lap result), so the picture never depends on
    /// time.
    pub fn render_still(&mut self, frame_json: &[u8], banner_json: Option<&[u8]>, now_ms: f64) -> Result<RenderInfo, RenderError> {
        let scene = self.scene.as_ref().ok_or_else(|| RenderError("no scene set".to_owned()))?;
        let banner = banner_json.filter(|json| !is_absent_json(json)).map(alerts::parse_banner).transpose()?;
        let frame = model::parse_frame(frame_json)?;
        let view = dash::draws_race_logic_lap_timer(scene).then(|| RaceLogicLapTimerPresenter::default().present(&frame, now_ms));
        dash::build_display_list(&self.fonts, scene, &frame, Overlays { banner: banner.as_ref(), lap_timer: view.as_ref() }, &mut self.ops)?;
        self.raster.draw(&self.fonts, &self.ops, scene.scale);
        Ok(RenderInfo { time_dependent: false })
    }

    /// The last rendered picture: premultiplied RGBA8, `width_px * height_px * 4` bytes (straight
    /// and premultiplied are the same for the opaque canvas; they differ only under `transparent`).
    pub fn pixels(&self) -> &[u8] {
        self.raster.pixels()
    }

    /// The pixmap size in device pixels, (0, 0) before the first scene.
    pub fn size_px(&self) -> (u32, u32) {
        self.raster.size_px()
    }

    /// The display list of the last render (for tests and tools).
    pub fn display_list(&self) -> &[DrawOp] {
        &self.ops
    }
}

/// Empty, whitespace or `null`: no value given.
fn is_absent_json(json: &[u8]) -> bool {
    let trimmed = json.trim_ascii();
    trimmed.is_empty() || trimmed == b"null"
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCENE: &str = r#"{"layout":{"id":"l","name":"L","gridCols":20,"gridRows":12,"pages":[{"id":"p","name":"P","widgets":[{"id":"g","type":"gear_speed","col":0,"row":0,"colSpan":10,"rowSpan":12}]}]},"width":200,"height":120,"scale":1.5}"#;

    #[test]
    fn a_scene_sizes_the_pixmap_by_its_device_scale() {
        let mut r = Renderer::new();
        assert_eq!(r.size_px(), (0, 0));
        r.set_scene(SCENE.as_bytes()).unwrap();
        assert_eq!(r.size_px(), (300, 180));
        r.render_still(b"", None, 0.0).unwrap();
        assert_eq!(r.pixels().len(), 300 * 180 * 4);
    }

    #[test]
    fn rendering_needs_a_scene_and_a_bad_scene_keeps_the_old_one() {
        let mut r = Renderer::new();
        assert!(r.render_still(b"", None, 0.0).is_err());
        r.set_scene(SCENE.as_bytes()).unwrap();
        assert!(r.set_scene(b"{}").is_err());
        assert_eq!(r.size_px(), (300, 180));
        assert!(r.render_live(b"null", 0.0).is_ok());
    }

    #[test]
    fn a_banner_draws_and_null_is_no_banner_but_a_malformed_one_is_an_error() {
        let mut r = Renderer::new();
        r.set_scene(SCENE.as_bytes()).unwrap();
        assert!(r.render_still(b"", Some(b" null "), 0.0).is_ok());
        let plain = r.display_list().len();
        assert!(r.render_still(b"", Some(br#"{"kind":"setting"}"#), 0.0).is_err());
        let lap = br#"{"kind":"lapSummary","lap":3,"lapTime":92.5,"valid":true,"lapDelta":null,"fuelUsed":null,"fuelDelta":null}"#;
        assert_eq!(r.render_still(b"", Some(lap), 0.0), Ok(RenderInfo { time_dependent: false }));
        assert!(r.display_list().len() > plain);
    }

    /// A layout with a TC change alert (1 s) and a RaceLogic lap timer on its page.
    fn live_scene(layout_id: &str, timer: bool) -> String {
        let widget = if timer { r#"{"id":"t","type":"racelogic_lap_timer","col":0,"row":0,"colSpan":20,"rowSpan":12}"# } else { "" };
        format!(
            r#"{{"layout":{{"id":"{layout_id}","name":"L","gridCols":20,"gridRows":12,"pages":[{{"id":"p","name":"P","widgets":[{widget}]}}],
                "alerts":[{{"id":"a","type":"tc_change","enabled":true,"col":6,"row":3,"colSpan":8,"rowSpan":6,"durationSeconds":1}}],
                "alertConfig":{{"displayMode":"center"}}}},"width":200,"height":120}}"#
        )
    }

    /// A host-shaped frame; `timestamp` only makes otherwise equal frames differ in bytes.
    fn live_frame(timestamp: f64, tc: f64, lap: f64, last_lap_time: f64) -> Vec<u8> {
        format!(
            r#"{{"timestamp":"t{timestamp}","session":{{}},"car":{{}},"lap":{{"currentLap":{lap},"lastLapTime":{last_lap_time},"targetLapTime":90}},"flags":{{}},"electronics":{{"tractionControl":{tc},"tractionControlMax":9}},"race":{{}},"energy":{{}}}}"#
        )
        .into_bytes()
    }

    fn shows(r: &Renderer, text: &str) -> bool {
        r.display_list().iter().any(|op| matches!(op, DrawOp::Text(run) if run.text == text))
    }

    #[test]
    fn a_setting_change_raises_a_banner_that_keeps_the_picture_time_dependent_until_it_expires() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        assert_eq!(r.render_live(&live_frame(0.0, 2.0, 1.0, 0.0), 1000.0), Ok(RenderInfo { time_dependent: false }), "nothing to diff yet");
        assert_eq!(r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 1100.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "TC") && shows(&r, "3"), "the centered popup names the setting and its value");

        // Re-rendering the same frame only lets time pass: still up at 2099, gone at 2100.
        let same = live_frame(1.0, 3.0, 1.0, 0.0);
        assert_eq!(r.render_live(&same, 2099.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "TC"));
        assert_eq!(r.render_live(&same, 2100.0), Ok(RenderInfo { time_dependent: false }));
        assert!(!shows(&r, "TC"));
        // A new frame with the same setting fires nothing.
        assert_eq!(r.render_live(&live_frame(2.0, 3.0, 1.0, 0.0), 2200.0), Ok(RenderInfo { time_dependent: false }));
    }

    #[test]
    fn a_repeated_frame_is_not_diffed_twice_and_a_new_one_is() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 1.0, 0.0), 0.0).unwrap();
        r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 100.0).unwrap();
        // The banner fired at 100 for 1 s; a new frame at 1200 lets it expire.
        assert_eq!(r.render_live(&live_frame(2.0, 3.0, 1.0, 0.0), 1200.0), Ok(RenderInfo { time_dependent: false }));
        // TC back to 2 on a new frame fires again.
        assert_eq!(r.render_live(&live_frame(3.0, 2.0, 1.0, 0.0), 1300.0), Ok(RenderInfo { time_dependent: true }));
    }

    #[test]
    fn a_new_scene_keeps_the_banner_and_no_data_resets_the_tracker() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 1.0, 0.0), 0.0).unwrap();
        r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 100.0).unwrap();

        // The Electron dash output kept its tracker across a new screen description: the
        // banner stays up on the new layout, and the next frame is still diffed against the last.
        r.set_scene(live_scene("other", false).as_bytes()).unwrap();
        assert_eq!(r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 200.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "TC"));

        // No data clears the banner and the diff baseline: the next frame cannot fire.
        assert_eq!(r.render_live(b"null", 300.0), Ok(RenderInfo { time_dependent: false }));
        assert!(!shows(&r, "TC"));
        assert_eq!(r.render_live(&live_frame(2.0, 5.0, 1.0, 0.0), 400.0), Ok(RenderInfo { time_dependent: false }));
    }

    #[test]
    fn the_lap_timer_holds_a_finished_lap_and_a_page_without_it_forgets_its_state() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", true).as_bytes()).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 4.0, 0.0), 0.0).unwrap();
        assert_eq!(r.render_live(&live_frame(1.0, 2.0, 5.0, 91.5), 1000.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "1:31.500") && shows(&r, "+1.50 TO REFERENCE"));
        assert_eq!(r.render_live(&live_frame(1.0, 2.0, 5.0, 91.5), 3999.0), Ok(RenderInfo { time_dependent: true }));
        assert_eq!(r.render_live(&live_frame(1.0, 2.0, 5.0, 91.5), 4000.0), Ok(RenderInfo { time_dependent: false }));
        assert!(shows(&r, "PREDICTIVE"));

        // A scene whose page has no lap timer drops the presenter: back on a timer page, the
        // first frame is a baseline again and the next lap boundary cannot be missed or doubled.
        r.render_live(&live_frame(2.0, 2.0, 5.0, 91.5), 5000.0).unwrap();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        r.set_scene(live_scene("l", true).as_bytes()).unwrap();
        assert_eq!(r.render_live(&live_frame(3.0, 2.0, 6.0, 92.0), 6000.0), Ok(RenderInfo { time_dependent: false }), "no lap seen before this frame");
    }

    fn dial_reading(position: usize, changes: u64) -> Vec<u8> {
        let positions = r##"[{"label":"DASH","color":"#1F7FE6"},{"label":"TC2","color":"#E0A30C"}]"##;
        format!(r#"{{"caption":"MULTI","position":{position},"changes":{changes},"positions":{positions},"invertPopup":false}}"#).into_bytes()
    }

    #[test]
    fn a_dial_turn_pops_up_without_data_for_the_layouts_alert_duration() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        r.set_multi_dial(&dial_reading(0, 4)).unwrap();
        assert_eq!(r.render_live(b"", 0.0), Ok(RenderInfo { time_dependent: false }), "the first reading is no turn");
        assert!(!shows(&r, "DASH"));

        r.set_multi_dial(&dial_reading(1, 5)).unwrap();
        assert_eq!(r.render_live(b"", 100.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "MULTI") && shows(&r, "TC2"));
        // No `alertConfig.durationSeconds` on this layout: 1.5 s.
        assert_eq!(r.render_live(b"", 1599.0), Ok(RenderInfo { time_dependent: true }));
        assert_eq!(r.render_live(b"", 1600.0), Ok(RenderInfo { time_dependent: false }));
        assert!(!shows(&r, "TC2"));

        // No dial forgets the count: its return is not a turn.
        r.set_multi_dial(b"").unwrap();
        r.render_live(b"", 1700.0).unwrap();
        r.set_multi_dial(&dial_reading(0, 6)).unwrap();
        assert_eq!(r.render_live(b"", 1800.0), Ok(RenderInfo { time_dependent: false }));
        assert!(r.set_multi_dial(b"{").is_err());
    }

    #[test]
    fn the_dial_popup_covers_an_alert_banner_that_keeps_running_beneath_it() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", false).as_bytes()).unwrap();
        r.set_multi_dial(&dial_reading(0, 0)).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 1.0, 0.0), 0.0).unwrap();
        // A turn at 100 (up until 1600), a TC change at 1000 (up until 2000).
        r.set_multi_dial(&dial_reading(1, 1)).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 1.0, 0.0), 100.0).unwrap();
        r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 1000.0).unwrap();
        assert!(shows(&r, "TC2") && !shows(&r, "TC"), "the dial popup, not the TC change");
        assert_eq!(r.render_live(&live_frame(1.0, 3.0, 1.0, 0.0), 1600.0), Ok(RenderInfo { time_dependent: true }));
        assert!(shows(&r, "TC") && !shows(&r, "TC2"), "the TC change was tracked beneath it");
    }

    #[test]
    fn a_dial_popup_banner_draws_as_a_still() {
        let mut r = Renderer::new();
        r.set_scene(SCENE.as_bytes()).unwrap();
        let popup = br##"{"kind":"multiDial","caption":"MULTI","label":"PIT","color":"#16B566","inverted":true}"##;
        assert_eq!(r.render_still(b"", Some(popup), 0.0), Ok(RenderInfo { time_dependent: false }));
        assert!(shows(&r, "PIT"));
    }

    #[test]
    fn a_still_never_depends_on_time_and_never_touches_the_live_state() {
        let mut r = Renderer::new();
        r.set_scene(live_scene("l", true).as_bytes()).unwrap();
        r.render_live(&live_frame(0.0, 2.0, 4.0, 0.0), 0.0).unwrap();
        assert_eq!(r.render_still(&live_frame(1.0, 3.0, 5.0, 91.5), None, 100.0), Ok(RenderInfo { time_dependent: false }));
        assert!(shows(&r, "PREDICTIVE"), "a fresh presenter has no lap boundary to hold");
        assert_eq!(r.render_live(&live_frame(2.0, 3.0, 5.0, 91.5), 200.0), Ok(RenderInfo { time_dependent: true }), "the live state saw neither");
    }
}
