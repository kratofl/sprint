// The multi-dial popup: when the driver turns a wheel's multi-position dial, the dash shows the
// new position's name in its colour for a moment ("MULTI" above or beside it, the name big). The
// dial reading comes from the host's input tracker (`Renderer::set_multi_dial`), not the frame,
// so it shows with or without a game. Whether it shows, how big, inverted and for how long are
// the `dial_change` alert's settings (`dial_look`). Ported from the retired React renderer's
// `multiDial.tsx`; `overlays::multi_dial_popup` draws it.

use serde::Deserialize;

use crate::alerts::{AlertSize, AlertSpec, DashAlertType, css_hex_color};
use crate::model::DashLayout;
use crate::palette::Rgba;

/// What the popup draws (`DashMultiDialPopup`, banner kind `"multiDial"`). `inverted` swaps the
/// colours: a colour fill with lettering in the dash's background colour. `size` is its JSON
/// `displayMode`, full when absent.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct DashMultiDialPopup {
    pub caption: String,
    pub label: String,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
    pub inverted: bool,
    #[serde(default, rename = "displayMode")]
    pub size: AlertSize,
}

/// One dial position's name and colour.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct MultiDialLabel {
    pub label: String,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
}

/// The dial as the host reports it (`MultiDialReading`): its caption, where it stands (`None`
/// until the wheel has reported it) and the positions' names and colours. Any other field (the
/// per-device `invertPopup` the host used to send) is ignored: the popup's look is the
/// `dial_change` alert's.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDialReading {
    pub caption: String,
    pub position: Option<usize>,
    /// Counts real turns only; the popup shows whenever it moves.
    pub changes: u64,
    pub positions: Vec<MultiDialLabel>,
}

/// Parses a dial reading. An error names what is wrong.
pub fn parse_multi_dial(json: &[u8]) -> Result<MultiDialReading, String> {
    serde_json::from_slice(json).map_err(|e| format!("multi-dial is not a valid dial reading: {e}"))
}

/// How long the popup stays up on a layout without a `dial_change` alert (its default setting).
pub const MULTI_DIAL_POPUP_SECONDS: f64 = 2.0;

/// How the popup shows on a layout: its size, whether inverted, and for how long (`None`: until
/// acknowledged).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DialLook {
    pub size: AlertSize,
    pub inverted: bool,
    pub seconds: Option<f64>,
}

/// The layout's `dial_change` alert as the popup's look; `None` when that alert is off. A layout
/// without one (nobody stamped the app-wide alerts on it) shows the popup with the alert's
/// defaults, as every dash did before the dial became an alert.
pub fn dial_look(layout: &DashLayout) -> Option<DialLook> {
    let Some(spec) = layout.alerts.iter().filter_map(|alert| AlertSpec::of(alert, layout)).find(|spec| spec.alert_type == DashAlertType::DialChange) else {
        return Some(DialLook { size: AlertSize::Strip, inverted: false, seconds: Some(MULTI_DIAL_POPUP_SECONDS) });
    };
    spec.enabled.then(|| DialLook { size: spec.size(), inverted: spec.inverted(), seconds: spec.seconds() })
}

/// Decides when the popup is up. The first reading only sets where counting starts (a dash
/// opening, or the host restarting, is not a turn), each later change of `changes` with a known
/// position shows the popup in the layout's look, and losing the dial forgets the count. No
/// clock of its own: callers pass `now_ms`.
#[derive(Clone, Debug, Default)]
pub struct MultiDialPopupWatcher {
    seen: Option<u64>,
    /// When the popup runs out; `None` while it waits to be acknowledged.
    until: Option<f64>,
    popup: Option<DashMultiDialPopup>,
}

impl MultiDialPopupWatcher {
    /// Takes the dial's current reading (`None`: no dial) and the layout's look (`None`: the
    /// popup is off, turns are still counted) and returns the popup up at `now_ms`. The same
    /// reading again only lets time pass.
    pub fn observe(&mut self, reading: Option<&MultiDialReading>, now_ms: f64, look: Option<&DialLook>) -> Option<&DashMultiDialPopup> {
        let Some(reading) = reading else {
            self.seen = None;
            self.popup = None;
            return None;
        };

        if self.seen.is_some_and(|seen| seen != reading.changes)
            && let Some(position) = reading.position.and_then(|index| reading.positions.get(index))
            && let Some(look) = look
        {
            self.popup = Some(DashMultiDialPopup {
                caption: reading.caption.clone(),
                label: position.label.clone(),
                color: position.color,
                inverted: look.inverted,
                size: look.size,
            });
            self.until = look.seconds.map(|seconds| now_ms + seconds * 1000.0);
        }

        self.seen = Some(reading.changes);
        self.current(now_ms)
    }

    /// The popup still up at `now_ms`, or `None` once it has run out.
    pub fn current(&mut self, now_ms: f64) -> Option<&DashMultiDialPopup> {
        if self.until.is_some_and(|until| now_ms >= until) {
            self.popup = None;
        }
        self.popup.as_ref()
    }

    /// True while a popup is up that runs out by itself.
    pub fn expires(&self) -> bool {
        self.popup.is_some() && self.until.is_some()
    }

    /// The driver acknowledged: the popup goes at once.
    pub fn acknowledge(&mut self) {
        self.popup = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_scene;
    use serde_json::json;

    const DASH: Rgba = Rgba::hex("#1A7CFF");
    const TC2: Rgba = Rgba::hex("#FFCC00");
    const LOOK: DialLook = DialLook { size: AlertSize::Full, inverted: false, seconds: Some(1.5) };

    fn reading(position: Option<usize>, changes: u64) -> MultiDialReading {
        MultiDialReading {
            caption: "MULTI".to_owned(),
            position,
            changes,
            positions: vec![MultiDialLabel { label: "DASH".to_owned(), color: DASH }, MultiDialLabel { label: "TC2".to_owned(), color: TC2 }],
        }
    }

    #[test]
    fn the_first_reading_is_where_counting_starts_not_a_turn() {
        let mut watcher = MultiDialPopupWatcher::default();
        assert_eq!(watcher.observe(Some(&reading(Some(1), 4)), 0.0, Some(&LOOK)), None);
        assert_eq!(watcher.observe(Some(&reading(Some(1), 4)), 100.0, Some(&LOOK)), None);
    }

    #[test]
    fn a_turn_shows_the_new_position_in_the_layouts_look_for_its_duration_then_it_runs_out() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 0)), 0.0, Some(&LOOK));

        let strip = DialLook { size: AlertSize::Strip, inverted: true, seconds: Some(1.5) };
        let popup = watcher.observe(Some(&reading(Some(1), 1)), 1000.0, Some(&strip)).cloned();

        assert_eq!(
            popup,
            Some(DashMultiDialPopup { caption: "MULTI".to_owned(), label: "TC2".to_owned(), color: TC2, inverted: true, size: AlertSize::Strip })
        );
        assert!(watcher.current(2499.0).is_some() && watcher.expires());
        assert_eq!(watcher.observe(Some(&reading(Some(1), 1)), 2500.0, Some(&strip)), None);
    }

    #[test]
    fn a_popup_held_until_acknowledged_stays_until_the_driver_acknowledges_it() {
        let mut watcher = MultiDialPopupWatcher::default();
        let held = DialLook { seconds: None, ..LOOK };
        watcher.observe(Some(&reading(Some(0), 0)), 0.0, Some(&held));
        watcher.observe(Some(&reading(Some(1), 1)), 100.0, Some(&held));
        assert!(watcher.current(600_000.0).is_some() && !watcher.expires());
        watcher.acknowledge();
        assert_eq!(watcher.current(600_100.0), None);
    }

    #[test]
    fn with_the_alert_off_a_turn_shows_nothing_but_still_counts() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 0)), 0.0, None);
        assert_eq!(watcher.observe(Some(&reading(Some(1), 1)), 100.0, None), None);
        assert_eq!(watcher.observe(Some(&reading(Some(1), 1)), 200.0, Some(&LOOK)), None, "turning it on is no turn");
    }

    #[test]
    fn losing_the_dial_forgets_the_count_so_its_return_is_not_a_turn() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 3)), 0.0, Some(&LOOK));
        watcher.observe(None, 100.0, Some(&LOOK));

        assert_eq!(watcher.observe(Some(&reading(Some(1), 0)), 200.0, Some(&LOOK)), None);
    }

    #[test]
    fn a_turn_to_an_unknown_position_shows_nothing_but_still_counts() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 0)), 0.0, Some(&LOOK));
        assert_eq!(watcher.observe(Some(&reading(None, 1)), 100.0, Some(&LOOK)), None);
        assert_eq!(watcher.observe(Some(&reading(Some(5), 2)), 200.0, Some(&LOOK)), None, "no such position");
        assert!(watcher.observe(Some(&reading(Some(0), 3)), 300.0, Some(&LOOK)).is_some());
    }

    #[test]
    fn the_reading_parses_from_the_host_json() {
        let json = br##"{"caption":"MULTI","position":null,"changes":0,"positions":[{"label":"DASH","color":"#1A7CFF"}],"invertPopup":true}"##;
        assert_eq!(
            parse_multi_dial(json),
            Ok(MultiDialReading {
                caption: "MULTI".to_owned(),
                position: None,
                changes: 0,
                positions: vec![MultiDialLabel { label: "DASH".to_owned(), color: DASH }]
            })
        );
        assert!(parse_multi_dial(br#"{"caption":"MULTI"}"#).is_err());
        assert!(parse_multi_dial(br#"{"caption":"M","position":0,"changes":0,"positions":[{"label":"A","color":"blue"}]}"#).is_err());
    }

    #[test]
    fn the_popup_wears_the_dial_change_alerts_settings_or_its_defaults_without_one() {
        let layout = |alerts: serde_json::Value| {
            let layout = json!({ "id": "l", "name": "L", "gridCols": 20, "gridRows": 12, "pages": [], "alerts": alerts });
            parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene").layout
        };
        let dial = |fields: serde_json::Value| {
            let mut alert = json!({ "id": "d", "type": "dial_change", "enabled": true, "col": 0, "row": 0, "colSpan": 1, "rowSpan": 1 });
            alert.as_object_mut().expect("object").extend(fields.as_object().cloned().unwrap_or_default());
            layout(json!([alert]))
        };
        assert_eq!(dial_look(&layout(json!([]))), Some(DialLook { size: AlertSize::Strip, inverted: false, seconds: Some(MULTI_DIAL_POPUP_SECONDS) }));
        assert_eq!(dial_look(&dial(json!({ "enabled": false }))), None);
        assert_eq!(
            dial_look(&dial(json!({ "displayMode": "full", "invertColors": true, "durationSeconds": 45 }))),
            Some(DialLook { size: AlertSize::Full, inverted: true, seconds: Some(30.0) })
        );
        assert_eq!(dial_look(&dial(json!({ "displayMode": "strip", "untilAck": true }))).map(|look| (look.size, look.seconds)), Some((AlertSize::Strip, None)));
        assert_eq!(dial_look(&dial(json!({}))).map(|look| look.seconds), Some(Some(1.5)), "the default duration when the alert has none");
    }
}
