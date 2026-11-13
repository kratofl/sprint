// Detects finished laps for the lap summary popup: where the lap left the driver (lap x of y,
// position), the lap time against the best before it and against the plan's target, and the fuel
// the lap used against the plan's per-lap target. Clock-free like `DashAlertTracker`, which owns
// one of these and decides when the popup shows.
//
// Every delta is actual minus target, so negative is better for lap time and fuel alike.

use serde::Deserialize;

use crate::model::{DashTargets, TelemetryFrame};

/// What one finished lap came to. Each delta is `None` when there is nothing to compare against.
/// Deserializes from the JSON the TypeScript `LapSummary` serializes to (the lap summary banner).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapSummary {
    pub lap: f64,
    /// The session's lap limit, for "LAP 12 OF 24"; `None` when the session has none.
    pub total_laps: Option<f64>,
    /// The race position as the lap finished; `None` when the game reports none.
    pub position: Option<f64>,
    pub lap_time: f64,
    /// False when the game flagged the lap invalid; it never counts as a best.
    pub valid: bool,
    /// Lap time minus the best valid lap before it. Negative is a new best.
    pub lap_delta: Option<f64>,
    /// Lap time minus the plan's lap-time target the lap was driven with. Negative is faster.
    pub target_delta: Option<f64>,
    /// Liters the lap used, or `None` when the lap's start was not seen or the car was refueled.
    pub fuel_used: Option<f64>,
    /// Fuel used minus the plan's per-lap target. Positive means over target.
    pub fuel_delta: Option<f64>,
}

/// The game can publish a finished lap's time a few frames after the lap counter moves (see the
/// lap history's own wait in the desktop host). Past this, the time is not coming.
const LAP_TIME_WAIT_MS: f64 = 3000.0;

/// What Le Mans Ultimate reports as the lap limit of a session that has none (`int.MaxValue`).
/// The host's LMU mapper turns it into 0, but a replayed recording (`app/recordings`) plays back
/// frames as they were recorded, without the mapper, and recordings made before it carry this.
const NO_LAP_LIMIT: f64 = 2_147_483_647.0;

/// The session's lap limit, or `None` for a session run to time (reported as 0 or `int.MaxValue`).
fn lap_limit(max_laps: f64) -> Option<f64> {
    (max_laps > 0.0 && max_laps < NO_LAP_LIMIT).then_some(max_laps)
}

#[derive(Clone, Copy, Debug)]
struct PendingLap {
    lap: f64,
    total_laps: Option<f64>,
    position: Option<f64>,
    valid: bool,
    fuel_used: Option<f64>,
    /// The plan's targets the lap was driven with, kept from its last frame: the host latches the
    /// next lap's targets at the line, before this lap's time arrives.
    targets: Option<DashTargets>,
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
    targets: Option<DashTargets>,
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
    /// Feeds one frame (`now` in ms; only differences are read) with the plan's targets in force;
    /// returns a summary on the frame the finished lap's time is known.
    pub fn observe(&mut self, frame: &TelemetryFrame, now: f64, targets: Option<&DashTargets>) -> Option<LapSummary> {
        let lap = &frame.lap;
        let seen = SeenLap { current_lap: lap.current_lap, is_valid: lap.is_valid, is_out_lap: lap.is_out_lap, targets: targets.copied() };
        let prev = self.prev.replace(seen);
        let Some(prev) = prev else {
            self.best = lap.best_lap_time;
            self.matched_lap_time = lap.last_lap_time;
            return None;
        };

        if lap.current_lap > prev.current_lap && prev.current_lap > 0.0 {
            let used = self.lap_start_fuel.map(|start| start - frame.car.fuel);
            self.pending = Some(PendingLap {
                lap: prev.current_lap,
                total_laps: lap_limit(frame.session.max_laps),
                position: (frame.race.position > 0.0).then_some(frame.race.position),
                valid: prev.is_valid,
                fuel_used: used.filter(|used| *used >= 0.0),
                targets: prev.targets,
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
            let targets = pending.targets.unwrap_or_default();
            return Some(LapSummary {
                lap: pending.lap,
                total_laps: pending.total_laps,
                position: pending.position,
                lap_time,
                valid: pending.valid,
                lap_delta: (best_before > 0.0).then_some(lap_time - best_before),
                target_delta: targets.lap_time_seconds.map(|target| lap_time - target),
                fuel_used: pending.fuel_used,
                fuel_delta: pending.fuel_used.zip(targets.fuel_per_lap_liters).map(|(used, target)| used - target),
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

    /// A frame on lap `current_lap` with the given last lap time and fuel load, changed further
    /// by `edit`.
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

    /// A plan aiming at `lap_time` seconds a lap on `fuel` liters a lap.
    fn plan(lap_time: f64, fuel: f64) -> DashTargets {
        DashTargets { lap_time_seconds: Some(lap_time), fuel_per_lap_liters: Some(fuel) }
    }

    fn close(actual: Option<f64>, expected: f64) -> bool {
        actual.is_some_and(|actual| (actual - expected).abs() < 1e-9)
    }

    #[test]
    fn a_finished_lap_is_reported_once_its_time_arrives_against_the_best_before_it_and_the_plan() {
        let target = plan(209.5, 4.4);
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), 0.0, Some(&target));
        watcher.observe(&at(4.0, 210.0, 60.0, plain), 1000.0, Some(&target)); // lap 3 finishes in 210; lap 4's fuel is measured from here
        let crossing = at(5.0, 210.0, 55.5, |f| (f.session.max_laps, f.race.position) = (24.0, 4.0));
        assert_eq!(watcher.observe(&crossing, 2000.0, Some(&target)), None, "the counter moved but the time is still the old lap");
        let summary = watcher.observe(&at(5.0, 209.8, 55.5, plain), 2100.0, Some(&target)).expect("a summary");
        assert_eq!((summary.lap, summary.total_laps, summary.position), (4.0, Some(24.0), Some(4.0)), "as the lap finished");
        assert_eq!(summary.lap_time, 209.8);
        assert!(close(summary.lap_delta, -0.2), "a new best is negative");
        assert!(close(summary.target_delta, 0.3), "slower than the target is positive");
        assert_eq!(summary.fuel_used, Some(4.5));
        assert!(close(summary.fuel_delta, 0.1), "over target is positive");
    }

    #[test]
    fn a_lap_is_scored_against_the_targets_it_was_driven_with_not_the_ones_that_latched_at_the_line() {
        let (driven, next) = (plan(209.5, 4.4), plan(208.0, 5.0));
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, |f| f.lap.best_lap_time = 210.0), 0.0, Some(&driven));
        watcher.observe(&at(4.0, 210.0, 60.0, plain), 1000.0, Some(&driven)); // lap 4 is driven with `driven`
        // The host latches the next lap's targets at the line; they can reach the renderer with
        // the crossing frame itself, before the lap time arrives.
        watcher.observe(&at(5.0, 210.0, 55.5, plain), 2000.0, Some(&next));
        let summary = watcher.observe(&at(5.0, 209.8, 55.5, plain), 2100.0, Some(&next)).expect("a summary");
        assert!(close(summary.target_delta, 0.3), "209.8 against 209.5, not 208.0: {:?}", summary.target_delta);
        assert!(close(summary.fuel_delta, 0.1), "4.5 used against 4.4, not 5.0: {:?}", summary.fuel_delta);
    }

    #[test]
    fn a_lap_driven_without_a_plan_claims_no_target_delta_even_when_one_latches_at_the_line() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, plain), 0.0, None);
        watcher.observe(&at(4.0, 210.0, 60.0, plain), 1000.0, None);
        let summary = watcher.observe(&at(5.0, 209.8, 55.5, plain), 2000.0, Some(&plan(209.5, 4.4))).expect("a summary");
        assert_eq!((summary.target_delta, summary.fuel_delta, summary.fuel_used), (None, None, Some(4.5)));
    }

    #[test]
    fn a_session_run_to_time_has_no_lap_total_and_an_unreported_position_is_none() {
        // Le Mans Ultimate reports int.MaxValue as the lap limit of a session without one.
        for max_laps in [0.0, 2_147_483_647.0] {
            let mut watcher = LapSummaryWatcher::default();
            watcher.observe(&at(3.0, 0.0, 60.0, |f| f.session.max_laps = max_laps), 0.0, None);
            let summary = watcher.observe(&at(4.0, 210.0, 56.0, |f| f.session.max_laps = max_laps), 100.0, None).expect("a summary");
            assert_eq!((summary.total_laps, summary.position), (None, None), "max laps {max_laps}");
        }
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
