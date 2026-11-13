// Detects finished laps for the lap summary popup: the lap time against the best before it,
// and the fuel the lap used against the plan's per-lap target. Port of
// `packages/dashboard/src/lapSummary.ts`. Clock-free like `DashAlertTracker`, which owns one of
// these and decides when the popup shows.

use serde::Deserialize;

use crate::model::TelemetryFrame;

/// What one finished lap came to. Each delta is `None` when there is nothing to compare against.
/// Deserializes from the JSON the TypeScript `LapSummary` serializes to (the lap summary banner).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapSummary {
    pub lap: f64,
    pub lap_time: f64,
    /// False when the game flagged the lap invalid; it never counts as a best.
    pub valid: bool,
    /// Lap time minus the best valid lap before it. Negative is a new best.
    pub lap_delta: Option<f64>,
    /// Liters the lap used, or `None` when the lap's start was not seen or the car was refueled.
    pub fuel_used: Option<f64>,
    /// Fuel used minus the plan's per-lap target. Positive means over target.
    pub fuel_delta: Option<f64>,
}

/// The game can publish a finished lap's time a few frames after the lap counter moves (see the
/// lap history's own wait in the desktop host). Past this, the time is not coming.
const LAP_TIME_WAIT_MS: f64 = 3000.0;

#[derive(Clone, Copy, Debug)]
struct PendingLap {
    lap: f64,
    valid: bool,
    fuel_used: Option<f64>,
    /// Out laps are tracked only to absorb their lap time, never reported.
    report: bool,
    since: f64,
}

/// The parts of the previous frame the watcher compares against.
#[derive(Clone, Copy, Debug)]
struct SeenLap {
    current_lap: f64,
    is_valid: bool,
    is_out_lap: bool,
}

#[derive(Clone, Debug, Default)]
pub struct LapSummaryWatcher {
    prev: Option<SeenLap>,
    lap_start_fuel: Option<f64>,
    /// The best valid lap so far, kept here so a lap is compared with the best before it,
    /// whenever the game updates its own.
    best: f64,
    /// The last lap time already matched to a lap, so a stale one is never reported again.
    matched_lap_time: f64,
    pending: Option<PendingLap>,
}

impl LapSummaryWatcher {
    /// Feeds one frame (`now` in ms; only differences are read); returns a summary on the frame the finished lap's
    /// time is known.
    pub fn observe(&mut self, frame: &TelemetryFrame, now: f64, fuel_target_liters: Option<f64>) -> Option<LapSummary> {
        let lap = &frame.lap;
        let prev = self.prev.replace(SeenLap { current_lap: lap.current_lap, is_valid: lap.is_valid, is_out_lap: lap.is_out_lap });
        let Some(prev) = prev else {
            self.best = lap.best_lap_time;
            self.matched_lap_time = lap.last_lap_time;
            return None;
        };

        if lap.current_lap > prev.current_lap && prev.current_lap > 0.0 {
            let used = self.lap_start_fuel.map(|start| start - frame.car.fuel);
            self.pending = Some(PendingLap {
                lap: prev.current_lap,
                valid: prev.is_valid,
                fuel_used: used.filter(|used| *used >= 0.0),
                report: !prev.is_out_lap,
                since: now,
            });
            // Fuel is measured from here on; a lap the watcher joined mid-way reports none.
            self.lap_start_fuel = Some(frame.car.fuel);
        }

        let pending = self.pending?;
        let lap_time = lap.last_lap_time;
        if lap_time > 0.0 && lap_time != self.matched_lap_time {
            self.pending = None;
            self.matched_lap_time = lap_time;
            let best_before = self.best;
            if pending.valid && (best_before <= 0.0 || lap_time < best_before) {
                self.best = lap_time;
            }
            if !pending.report {
                return None;
            }
            return Some(LapSummary {
                lap: pending.lap,
                lap_time,
                valid: pending.valid,
                lap_delta: (best_before > 0.0).then_some(lap_time - best_before),
                fuel_used: pending.fuel_used,
                fuel_delta: pending.fuel_used.zip(fuel_target_liters).map(|(used, target)| used - target),
            });
        }

        if now - pending.since > LAP_TIME_WAIT_MS {
            self.pending = None;
        }
        None
    }

    /// Forgets the previous frame, the fuel baseline and any pending lap. The best and the last
    /// matched lap time are re-read from the next frame.
    pub fn reset(&mut self) {
        self.prev = None;
        self.lap_start_fuel = None;
        self.pending = None;
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A frame on lap `current_lap` with the given last lap time and fuel load (`at` in
    /// lapSummary.test.ts), changed further by `edit`.
    pub(crate) fn at(current_lap: f64, last_lap_time: f64, fuel: f64, edit: impl FnOnce(&mut TelemetryFrame)) -> TelemetryFrame {
        let mut frame = TelemetryFrame::default();
        frame.session.session_type = "race".to_owned();
        frame.session.in_car = true;
        frame.car.fuel = fuel;
        frame.lap.current_lap = current_lap;
        frame.lap.last_lap_time = last_lap_time;
        edit(&mut frame);
        frame
    }

    fn plain(_: &mut TelemetryFrame) {}

    #[test]
    fn a_finished_lap_is_reported_once_its_time_arrives_against_the_best_before_it_and_the_fuel_target() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), 0.0, Some(4.4));
        watcher.observe(&at(4.0, 210.0, 60.0, plain), 1000.0, Some(4.4)); // lap 3 finishes in 210; lap 4's fuel is measured from here
        assert_eq!(watcher.observe(&at(5.0, 210.0, 55.5, plain), 2000.0, Some(4.4)), None, "the counter moved but the time is still the old lap");
        let summary = watcher.observe(&at(5.0, 209.8, 55.5, plain), 2100.0, Some(4.4)).expect("a summary");
        assert_eq!(summary.lap, 4.0);
        assert_eq!(summary.lap_time, 209.8);
        assert!((summary.lap_delta.unwrap_or(0.0) + 0.2).abs() < 1e-9, "a new best is negative");
        assert_eq!(summary.fuel_used, Some(4.5));
        assert!((summary.fuel_delta.unwrap_or(0.0) - 0.1).abs() < 1e-9, "over target is positive");
    }

    #[test]
    fn a_lap_whose_time_is_published_before_the_counter_moves_is_still_reported() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(2.0, 211.0, 60.0, |f| f.lap.best_lap_time = 211.0), 0.0, None);
        watcher.observe(&at(2.0, 212.4, 56.0, plain), 100.0, None);
        let summary = watcher.observe(&at(3.0, 212.4, 56.0, plain), 200.0, None);
        assert_eq!(summary.map(|s| s.lap_time), Some(212.4));
        assert_eq!(summary.and_then(|s| s.fuel_used), None, "the lap started before the watcher did");
        assert_eq!(summary.and_then(|s| s.fuel_delta), None);
    }

    #[test]
    fn an_out_lap_is_not_reported_and_its_time_is_never_passed_off_as_the_next_lap() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(1.0, 0.0, 80.0, |f| f.lap.is_out_lap = true), 0.0, None);
        assert_eq!(watcher.observe(&at(2.0, 0.0, 76.0, plain), 100.0, None), None);
        assert_eq!(watcher.observe(&at(2.0, 250.0, 76.0, plain), 200.0, None), None, "the out lap time");
        assert_eq!(watcher.observe(&at(3.0, 250.0, 72.0, plain), 300.0, None), None, "no new time yet for lap 2");
        assert_eq!(watcher.observe(&at(3.0, 214.0, 72.0, plain), 400.0, None).map(|s| s.lap), Some(2.0));
    }

    #[test]
    fn an_invalid_lap_is_reported_but_never_becomes_the_best() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(
            &at(1.0, 0.0, 80.0, |f| {
                f.lap.best_lap_time = 210.0;
                f.lap.is_valid = false;
            }),
            0.0,
            None,
        );
        let cut = watcher.observe(&at(2.0, 205.0, 76.0, plain), 100.0, None);
        assert_eq!(cut.map(|s| s.valid), Some(false));
        watcher.observe(&at(2.0, 205.0, 76.0, plain), 150.0, None);
        let next = watcher.observe(&at(3.0, 209.0, 72.0, plain), 200.0, None);
        assert!((next.and_then(|s| s.lap_delta).unwrap_or(0.0) + 1.0).abs() < 1e-9, "compared with 210, not the invalid 205");
    }

    #[test]
    fn a_lap_time_that_never_arrives_is_given_up_after_the_wait() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(2.0, 200.0, 60.0, plain), 0.0, None);
        watcher.observe(&at(3.0, 200.0, 56.0, plain), 100.0, None);
        assert_eq!(watcher.observe(&at(3.0, 200.0, 56.0, plain), 3101.0, None), None, "3001 ms after the counter moved");
        assert_eq!(watcher.observe(&at(3.0, 205.0, 56.0, plain), 3200.0, None), None, "too late: the lap is no longer pending");
    }
}
