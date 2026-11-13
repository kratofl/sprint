// The multi-dial popup: when the driver turns a wheel's multi-position dial, the dash shows the
// new position's name in its colour for a moment ("MULTI" above, the name big below). Not a
// telemetry alert: the dial reading comes from the host's input tracker
// (`Renderer::set_multi_dial`), not the frame, so it shows with or without a game. Ported from
// the retired React renderer's `multiDial.tsx`; `overlays::multi_dial_popup` draws it.

use serde::Deserialize;
use serde_json::Value;

use crate::alerts::css_hex_color;
use crate::model::DashLayout;
use crate::palette::Rgba;

/// What the popup draws (`DashMultiDialPopup`, banner kind `"multiDial"`). `inverted` swaps the
/// colours: a colour fill with lettering in the dash's background colour.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct DashMultiDialPopup {
    pub caption: String,
    pub label: String,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
    pub inverted: bool,
}

/// One dial position's name and colour.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct MultiDialLabel {
    pub label: String,
    #[serde(deserialize_with = "css_hex_color")]
    pub color: Rgba,
}

/// The dial as the host reports it (`MultiDialReading`): its caption, where it stands (`None`
/// until the wheel has reported it) and the positions' names and colours.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDialReading {
    pub caption: String,
    pub position: Option<usize>,
    /// Counts real turns only; the popup shows whenever it moves.
    pub changes: u64,
    pub positions: Vec<MultiDialLabel>,
    pub invert_popup: bool,
}

/// Parses a dial reading. An error names what is wrong.
pub fn parse_multi_dial(json: &[u8]) -> Result<MultiDialReading, String> {
    serde_json::from_slice(json).map_err(|e| format!("multi-dial is not a valid dial reading: {e}"))
}

/// How long the popup stays up when the layout does not set its own alert duration.
pub const MULTI_DIAL_POPUP_SECONDS: f64 = 1.5;

/// The layout's own alert duration, which every popup on the dash shares; unset or not positive
/// is `MULTI_DIAL_POPUP_SECONDS`.
pub fn popup_seconds(layout: &DashLayout) -> f64 {
    layout
        .alert_config
        .as_ref()
        .and_then(|config| config.get("durationSeconds"))
        .and_then(Value::as_f64)
        .filter(|seconds| *seconds > 0.0)
        .unwrap_or(MULTI_DIAL_POPUP_SECONDS)
}

/// Decides when the popup is up. The first reading only sets where counting starts (a dash
/// opening, or the host restarting, is not a turn), each later change of `changes` with a known
/// position shows the popup for `duration_seconds`, and losing the dial forgets the count. No
/// clock of its own: callers pass `now_ms`.
#[derive(Clone, Debug, Default)]
pub struct MultiDialPopupWatcher {
    seen: Option<u64>,
    until: f64,
    popup: Option<DashMultiDialPopup>,
}

impl MultiDialPopupWatcher {
    /// Takes the dial's current reading (`None`: no dial) and returns the popup up at `now_ms`.
    /// The same reading again only lets time pass.
    pub fn observe(&mut self, reading: Option<&MultiDialReading>, now_ms: f64, duration_seconds: f64) -> Option<&DashMultiDialPopup> {
        let Some(reading) = reading else {
            self.seen = None;
            self.popup = None;
            return None;
        };

        if self.seen.is_some_and(|seen| seen != reading.changes)
            && let Some(position) = reading.position.and_then(|index| reading.positions.get(index))
        {
            self.popup = Some(DashMultiDialPopup {
                caption: reading.caption.clone(),
                label: position.label.clone(),
                color: position.color,
                inverted: reading.invert_popup,
            });
            self.until = now_ms + duration_seconds * 1000.0;
        }

        self.seen = Some(reading.changes);
        self.current(now_ms)
    }

    /// The popup still up at `now_ms`, or `None` once it has run out.
    pub fn current(&mut self, now_ms: f64) -> Option<&DashMultiDialPopup> {
        if self.popup.is_some() && now_ms >= self.until {
            self.popup = None;
        }
        self.popup.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_scene;
    use serde_json::json;

    const DASH: Rgba = Rgba::hex("#1F7FE6");
    const TC2: Rgba = Rgba::hex("#E0A30C");

    fn reading(position: Option<usize>, changes: u64, invert_popup: bool) -> MultiDialReading {
        MultiDialReading {
            caption: "MULTI".to_owned(),
            position,
            changes,
            positions: vec![MultiDialLabel { label: "DASH".to_owned(), color: DASH }, MultiDialLabel { label: "TC2".to_owned(), color: TC2 }],
            invert_popup,
        }
    }

    #[test]
    fn the_first_reading_is_where_counting_starts_not_a_turn() {
        let mut watcher = MultiDialPopupWatcher::default();
        assert_eq!(watcher.observe(Some(&reading(Some(1), 4, false)), 0.0, 1.5), None);
        assert_eq!(watcher.observe(Some(&reading(Some(1), 4, false)), 100.0, 1.5), None);
    }

    #[test]
    fn a_turn_shows_the_new_position_for_the_duration_then_it_runs_out() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 0, false)), 0.0, 1.5);

        let popup = watcher.observe(Some(&reading(Some(1), 1, true)), 1000.0, 1.5).cloned();

        assert_eq!(popup, Some(DashMultiDialPopup { caption: "MULTI".to_owned(), label: "TC2".to_owned(), color: TC2, inverted: true }));
        assert!(watcher.current(2499.0).is_some());
        assert_eq!(watcher.observe(Some(&reading(Some(1), 1, true)), 2500.0, 1.5), None);
    }

    #[test]
    fn losing_the_dial_forgets_the_count_so_its_return_is_not_a_turn() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 3, false)), 0.0, 1.5);
        watcher.observe(None, 100.0, 1.5);

        assert_eq!(watcher.observe(Some(&reading(Some(1), 0, false)), 200.0, 1.5), None);
    }

    #[test]
    fn a_turn_to_an_unknown_position_shows_nothing_but_still_counts() {
        let mut watcher = MultiDialPopupWatcher::default();
        watcher.observe(Some(&reading(Some(0), 0, false)), 0.0, 1.5);
        assert_eq!(watcher.observe(Some(&reading(None, 1, false)), 100.0, 1.5), None);
        assert_eq!(watcher.observe(Some(&reading(Some(5), 2, false)), 200.0, 1.5), None, "no such position");
        assert!(watcher.observe(Some(&reading(Some(0), 3, false)), 300.0, 1.5).is_some());
    }

    #[test]
    fn the_reading_parses_from_the_host_json() {
        let json = br##"{"caption":"MULTI","position":null,"changes":0,"positions":[{"label":"DASH","color":"#1F7FE6"}],"invertPopup":true}"##;
        assert_eq!(
            parse_multi_dial(json),
            Ok(MultiDialReading {
                caption: "MULTI".to_owned(),
                position: None,
                changes: 0,
                positions: vec![MultiDialLabel { label: "DASH".to_owned(), color: DASH }],
                invert_popup: true
            })
        );
        assert!(parse_multi_dial(br#"{"caption":"MULTI"}"#).is_err());
        assert!(parse_multi_dial(br#"{"caption":"M","position":0,"changes":0,"positions":[{"label":"A","color":"blue"}],"invertPopup":false}"#).is_err());
    }

    #[test]
    fn the_popup_lasts_the_layouts_alert_duration_or_its_own_default() {
        let layout = |config: serde_json::Value| {
            let layout = json!({ "id": "l", "name": "L", "gridCols": 20, "gridRows": 12, "pages": [], "alertConfig": config });
            parse_scene(json!({ "layout": layout, "width": 800, "height": 480 }).to_string().as_bytes()).expect("scene").layout
        };
        assert_eq!(popup_seconds(&layout(json!({ "durationSeconds": 3 }))), 3.0);
        assert_eq!(popup_seconds(&layout(json!({ "durationSeconds": 0 }))), MULTI_DIAL_POPUP_SECONDS);
        assert_eq!(popup_seconds(&layout(json!({}))), MULTI_DIAL_POPUP_SECONDS);
    }
}
