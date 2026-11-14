// The small state machine behind the RaceLogic-style purpose display. Port of
// `RaceLogicLapTimerPresenter` in `packages/dashboard/src/raceLogicLapTimer.ts`: it builds a
// reference truthfully, switches to predictive delta-T, and briefly freezes a completed lap at
// the lap boundary. Time comes in as epoch milliseconds; nothing here reads a clock.

use crate::format::{format_lap, to_fixed};
use crate::model::TelemetryFrame;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaceLogicLapTimerMode {
    Rolling,
    Predictive,
    LapResult,
}

/// What the overlay shows this instant.
#[derive(Clone, Debug, PartialEq)]
pub struct RaceLogicLapTimerView {
    pub mode: RaceLogicLapTimerMode,
    pub primary: String,
    pub status: String,
    pub delta: f64,
    pub show_delta_bar: bool,
}

/// How long a completed lap's result stays frozen on the display.
const RESULT_DURATION_MS: f64 = 3000.0;

/// `{delta:+0.00;-0.00;0.00}`: signed to 2dp, with a literal (not implicit) minus, and a bare
/// "0.00" at zero.
fn format_race_logic_delta(delta: f64) -> String {
    if delta > 0.0 {
        format!("+{}", to_fixed(delta, 2))
    } else if delta < 0.0 {
        format!("-{}", to_fixed(delta.abs(), 2))
    } else {
        "0.00".to_owned()
    }
}

/// One per live output: it watches for a lap boundary to freeze the result briefly.
#[derive(Clone, Debug, Default)]
pub struct RaceLogicLapTimerPresenter {
    observed_lap: Option<f64>,
    result_until: f64,
    result_lap_time: f64,
    result_delta: f64,
}

impl RaceLogicLapTimerPresenter {
    pub fn present(&mut self, frame: &TelemetryFrame, timestamp_ms: f64) -> RaceLogicLapTimerView {
        let lap = &frame.lap;
        if self.observed_lap.is_some_and(|observed| lap.current_lap > observed) && lap.last_lap_time > 0.0 {
            self.result_lap_time = lap.last_lap_time;
            self.result_delta = if lap.target_lap_time > 0.0 { lap.last_lap_time - lap.target_lap_time } else { 0.0 };
            self.result_until = timestamp_ms + RESULT_DURATION_MS;
        }
        self.observed_lap = Some(lap.current_lap);

        if self.is_holding(timestamp_ms) {
            let referenced = lap.target_lap_time > 0.0;
            return RaceLogicLapTimerView {
                mode: RaceLogicLapTimerMode::LapResult,
                primary: format_lap(self.result_lap_time),
                status: if referenced { format!("{} TO REFERENCE", format_race_logic_delta(self.result_delta)) } else { "LAP COMPLETE".to_owned() },
                delta: self.result_delta,
                show_delta_bar: referenced,
            };
        }

        if lap.target_lap_time <= 0.0 {
            return RaceLogicLapTimerView {
                mode: RaceLogicLapTimerMode::Rolling,
                primary: format_lap(lap.current_lap_time),
                status: if lap.is_valid { "BUILDING REFERENCE" } else { "INVALID LAP" }.to_owned(),
                delta: 0.0,
                show_delta_bar: false,
            };
        }

        RaceLogicLapTimerView {
            mode: RaceLogicLapTimerMode::Predictive,
            primary: format_race_logic_delta(lap.delta),
            status: if lap.is_valid { "PREDICTIVE" } else { "INVALID LAP" }.to_owned(),
            delta: lap.delta,
            show_delta_bar: true,
        }
    }

    /// True while a completed lap's result is frozen at `timestamp_ms`: the display will change
    /// when the hold ends, without a new frame.
    pub fn is_holding(&self, timestamp_ms: f64) -> bool {
        timestamp_ms < self.result_until
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(current_lap: f64, last_lap_time: f64, target_lap_time: f64) -> TelemetryFrame {
        let mut frame = TelemetryFrame::default();
        frame.lap.current_lap = current_lap;
        frame.lap.last_lap_time = last_lap_time;
        frame.lap.target_lap_time = target_lap_time;
        frame.lap.current_lap_time = 12.5;
        frame.lap.delta = -0.25;
        frame
    }

    #[test]
    fn it_rolls_until_there_is_a_reference_then_predicts() {
        let mut presenter = RaceLogicLapTimerPresenter::default();
        let rolling = presenter.present(&frame(1.0, 0.0, 0.0), 0.0);
        assert_eq!((rolling.mode, rolling.primary.as_str(), rolling.status.as_str()), (RaceLogicLapTimerMode::Rolling, "0:12.500", "BUILDING REFERENCE"));
        assert!(!rolling.show_delta_bar);

        let mut invalid = frame(1.0, 0.0, 90.0);
        invalid.lap.is_valid = false;
        let predictive = presenter.present(&invalid, 10.0);
        assert_eq!((predictive.mode, predictive.primary.as_str(), predictive.status.as_str()), (RaceLogicLapTimerMode::Predictive, "-0.25", "INVALID LAP"));
        assert!(predictive.show_delta_bar);
    }

    #[test]
    fn a_completed_lap_holds_its_result_for_three_seconds_from_the_boundary_frame() {
        let mut presenter = RaceLogicLapTimerPresenter::default();
        presenter.present(&frame(4.0, 0.0, 90.0), 1000.0);
        let result = presenter.present(&frame(5.0, 91.234, 90.0), 2000.0);
        assert_eq!(result.mode, RaceLogicLapTimerMode::LapResult);
        assert_eq!((result.primary.as_str(), result.status.as_str()), ("1:31.234", "+1.23 TO REFERENCE"));
        assert!(result.show_delta_bar && (result.delta - 1.234).abs() < 1e-9);

        assert!(presenter.is_holding(4999.0));
        assert_eq!(presenter.present(&frame(5.0, 91.234, 90.0), 4999.0).mode, RaceLogicLapTimerMode::LapResult, "a later frame of the same lap keeps the hold");
        assert!(!presenter.is_holding(5000.0));
        assert_eq!(presenter.present(&frame(5.0, 91.234, 90.0), 5000.0).mode, RaceLogicLapTimerMode::Predictive, "the hold ends at the boundary + 3000 ms");
    }

    #[test]
    fn no_hold_without_a_previous_lap_or_a_lap_time() {
        let mut fresh = RaceLogicLapTimerPresenter::default();
        assert_eq!(fresh.present(&frame(5.0, 91.0, 90.0), 0.0).mode, RaceLogicLapTimerMode::Predictive, "the first frame has no boundary to see");
        assert!(!fresh.is_holding(0.0));

        let mut presenter = RaceLogicLapTimerPresenter::default();
        presenter.present(&frame(1.0, 0.0, 0.0), 0.0);
        assert_eq!(presenter.present(&frame(2.0, 0.0, 0.0), 10.0).mode, RaceLogicLapTimerMode::Rolling, "no lap time published yet");
        assert_eq!(presenter.present(&frame(2.0, 95.0, 0.0), 20.0).mode, RaceLogicLapTimerMode::Rolling, "the time arrived after the boundary frame");
    }

    #[test]
    fn without_a_reference_the_result_says_lap_complete_and_hides_the_bar() {
        let mut presenter = RaceLogicLapTimerPresenter::default();
        presenter.present(&frame(1.0, 0.0, 0.0), 0.0);
        let result = presenter.present(&frame(2.0, 95.0, 0.0), 10.0);
        assert_eq!((result.mode, result.status.as_str(), result.delta, result.show_delta_bar), (RaceLogicLapTimerMode::LapResult, "LAP COMPLETE", 0.0, false));
    }

    #[test]
    fn the_delta_prints_signed_with_a_bare_zero() {
        assert_eq!(format_race_logic_delta(0.125), "+0.13");
        assert_eq!(format_race_logic_delta(-1.5), "-1.50");
        assert_eq!(format_race_logic_delta(0.0), "0.00");
        assert_eq!(format_race_logic_delta(-0.001), "-0.00");
    }
}
