// Detects finished laps for the lap review, the full-screen alert (`lap_summary`) after each
// timed lap, and captures as the lap finished every value the review can show: the lap time
// against the best before it and against the plan's target, the sector times rated like a timing
// screen and against the driver's best sectors before the lap, where the lap left the driver (lap
// x of y, position of n, the gap ahead), the fuel and virtual energy the lap used, the laps of fuel
// and energy left, the most worn tyre and the lap's top speed (the host measures it). Clock-free like
// `DashAlertTracker`, which owns one of these and decides when the review shows. Which of those
// values the review shows is the layout's `lapReview` (`LapReview`).
//
// Every delta is actual minus target, so negative is better for lap time and fuel alike.

use serde::Deserialize;

use crate::model::{DashTargets, TelemetryFrame};
use crate::widgets::{SectorState, sector_state, ve_laps, virtual_energy_percent};

/// What one finished lap came to. A value is `None` when the game did not report it, and a delta
/// when there is nothing to compare against. Deserializes from the JSON the TypeScript
/// `DashLapSummaryPopup` serializes to (the lap review banner).
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapSummary {
    pub lap: f64,
    /// The session's lap limit, for "12 /24"; `None` when the session has none.
    pub total_laps: Option<f64>,
    /// The race position as the lap finished; `None` when the game reports none.
    pub position: Option<f64>,
    /// The cars in the session, for "P4 /22"; `None` when the game reports none.
    pub total_positions: Option<f64>,
    pub lap_time: f64,
    /// False when the game flagged the lap invalid; it never counts as a best.
    pub valid: bool,
    /// Lap time minus the best valid lap before it. Negative is a new best.
    pub lap_delta: Option<f64>,
    /// The best valid lap once this one is counted (this lap's own time when it is the best).
    pub best_lap: Option<f64>,
    /// Lap time minus the plan's lap-time target the lap was driven with. Negative is faster.
    pub target_delta: Option<f64>,
    /// The lap's three sector times, rated against the bests the game reports.
    #[serde(default)]
    pub sectors: [Option<LapSector>; 3],
    /// Liters the lap used, or `None` when the lap's start was not seen or the car was refueled.
    pub fuel_used: Option<f64>,
    /// Fuel used minus the plan's per-lap target. Positive means over target.
    pub fuel_delta: Option<f64>,
    /// Laps the fuel left lasts at the game's per-lap average.
    pub fuel_left_laps: Option<f64>,
    /// Virtual energy the lap used, percentage points; `None` for a car without it, a lap whose
    /// start was not seen, or one it was topped up on.
    pub energy_used: Option<f64>,
    /// Laps the virtual energy left lasts at the game's per-lap figure; `None` for a car without it.
    pub energy_left_laps: Option<f64>,
    /// The wear left on the most worn tyre, % (100 is new), as the tyre widgets read it.
    pub tyre_wear_left: Option<f64>,
    /// Seconds to the car ahead; `None` when there is none.
    pub gap_ahead: Option<f64>,
    /// The fastest the car went on the lap, m/s, as the host measured it; `None` when it did not.
    pub top_speed: Option<f64>,
}

/// One sector of a finished lap: its time, how it compares (purple, green or yellow) and its
/// delta to the driver's best of that sector before the lap (negative: a new best; `None`
/// without one).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct LapSector {
    pub seconds: f64,
    pub rating: SectorState,
    #[serde(default)]
    pub delta: Option<f64>,
}

/// One cell of the lap review (`lapReview.cells` on the layout), by its wire id.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LapReviewField {
    Sector1,
    Sector2,
    Sector3,
    /// A sector's time against the driver's best of it before the lap.
    Sector1Delta,
    Sector2Delta,
    Sector3Delta,
    Target,
    BestLap,
    /// Whether the lap counted: VALID or INVALID.
    Validity,
    Position,
    GapAhead,
    Lap,
    TopSpeed,
    FuelUsed,
    FuelLeft,
    EnergyUsed,
    EnergyLeft,
    /// Fuel and virtual energy used, side by side.
    FuelEnergyUsed,
    TyreWear,
    /// An empty cell: nothing drawn, not even a frame.
    Empty,
}

impl LapReviewField {
    /// Every field, in the editor's order (`dashLapReviewFields` in lapReview.ts; a test checks it).
    pub const ALL: [LapReviewField; 20] = [
        LapReviewField::Sector1,
        LapReviewField::Sector2,
        LapReviewField::Sector3,
        LapReviewField::Sector1Delta,
        LapReviewField::Sector2Delta,
        LapReviewField::Sector3Delta,
        LapReviewField::Target,
        LapReviewField::BestLap,
        LapReviewField::Validity,
        LapReviewField::Position,
        LapReviewField::GapAhead,
        LapReviewField::Lap,
        LapReviewField::TopSpeed,
        LapReviewField::FuelUsed,
        LapReviewField::FuelLeft,
        LapReviewField::EnergyUsed,
        LapReviewField::EnergyLeft,
        LapReviewField::FuelEnergyUsed,
        LapReviewField::TyreWear,
        LapReviewField::Empty,
    ];

    pub fn id(self) -> &'static str {
        match self {
            LapReviewField::Sector1 => "sector1",
            LapReviewField::Sector2 => "sector2",
            LapReviewField::Sector3 => "sector3",
            LapReviewField::Sector1Delta => "sector1_delta",
            LapReviewField::Sector2Delta => "sector2_delta",
            LapReviewField::Sector3Delta => "sector3_delta",
            LapReviewField::Target => "target",
            LapReviewField::BestLap => "best_lap",
            LapReviewField::Validity => "validity",
            LapReviewField::Position => "position",
            LapReviewField::GapAhead => "gap_ahead",
            LapReviewField::Lap => "lap",
            LapReviewField::TopSpeed => "top_speed",
            LapReviewField::FuelUsed => "fuel_used",
            LapReviewField::FuelLeft => "fuel_left",
            LapReviewField::EnergyUsed => "energy_used",
            LapReviewField::EnergyLeft => "energy_left",
            LapReviewField::FuelEnergyUsed => "fuel_energy_used",
            LapReviewField::TyreWear => "tyre_wear",
            LapReviewField::Empty => "none",
        }
    }

    pub fn parse(id: &str) -> Option<LapReviewField> {
        LapReviewField::ALL.into_iter().find(|field| field.id() == id)
    }
}

/// What the lap review shows under its fixed top row: six cells, rows 2 and 3 left to right.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LapReview {
    pub cells: [LapReviewField; 6],
}

impl LapReview {
    /// The review of a layout that sets none, like an F1 lap recap: the three sectors, then the
    /// position, the fuel used and the lap time against the target.
    pub const DEFAULT: LapReview = LapReview {
        cells: [
            LapReviewField::Sector1,
            LapReviewField::Sector2,
            LapReviewField::Sector3,
            LapReviewField::Position,
            LapReviewField::FuelUsed,
            LapReviewField::Target,
        ],
    };
}

impl Default for LapReview {
    fn default() -> Self {
        LapReview::DEFAULT
    }
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

/// What the lap left the car with, read on the frame the lap counter moves.
#[derive(Clone, Copy, Debug)]
struct PendingLap {
    lap: f64,
    total_laps: Option<f64>,
    position: Option<f64>,
    total_positions: Option<f64>,
    valid: bool,
    fuel_used: Option<f64>,
    fuel_left_laps: Option<f64>,
    energy_used: Option<f64>,
    energy_left_laps: Option<f64>,
    tyre_wear_left: Option<f64>,
    gap_ahead: Option<f64>,
    top_speed: Option<f64>,
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
    /// The virtual energy (%) the lap being driven started with.
    lap_start_energy: Option<f64>,
    /// The best valid lap so far, kept here so a lap is compared with the best before it,
    /// whenever the game updates its own.
    best: f64,
    /// The last lap time already matched to a lap, so a stale one is never reported again.
    matched_lap_time: f64,
    /// The driver's best of each sector before the lap being driven, for the sector deltas. Taken
    /// when a lap's time arrives, not live: the host improves a sector's best as soon as the
    /// sector is done, so a live read would compare a lap's sectors with themselves.
    sector_bests: [Option<f64>; 3],
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
            self.sector_bests = personal_bests(frame, [None; 3]);
            return None;
        };

        if lap.current_lap > prev.current_lap && prev.current_lap > 0.0 {
            let used = self.lap_start_fuel.map(|start| start - frame.car.fuel);
            let energy = virtual_energy_percent(frame);
            // A car without virtual energy reads 0 all lap.
            let energy_used = self.lap_start_energy.filter(|start| *start > 0.0).map(|start| start - energy);
            let positive = |value: f64| (value > 0.0).then_some(value);
            self.pending = Some(PendingLap {
                lap: prev.current_lap,
                total_laps: lap_limit(frame.session.max_laps),
                position: positive(frame.race.position),
                total_positions: positive(frame.race.total_positions),
                valid: prev.is_valid,
                fuel_used: used.filter(|used| *used >= 0.0),
                fuel_left_laps: positive(frame.car.fuel_per_lap).map(|per_lap| frame.car.fuel.max(0.0) / per_lap),
                energy_used: energy_used.filter(|used| *used >= 0.0),
                energy_left_laps: ve_laps(frame),
                tyre_wear_left: frame.tires.iter().map(|tire| tire.wear_percent).filter(|left| *left > 0.0).min_by(f64::total_cmp),
                gap_ahead: positive(frame.race.gap_ahead),
                top_speed: frame.lap.last_lap_top_speed_ms.filter(|speed| *speed > 0.0),
                targets: prev.targets,
                report: !prev.is_out_lap,
                since: now,
            });
            // Fuel and energy are measured from here on; a lap the watcher joined mid-way reports none.
            self.lap_start_fuel = Some(frame.car.fuel);
            self.lap_start_energy = Some(energy);
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
            // The sectors arrive with the lap time, rated against the bests the game holds then
            // and timed against the driver's bests before the lap. An invalid lap's sectors never
            // become bests.
            let times: [Option<f64>; 3] = std::array::from_fn(|i| lap.last_lap_sectors_seconds.get(i).copied().filter(|seconds| *seconds > 0.0));
            let counted = if pending.valid { times } else { [None; 3] };
            let bests_before = std::mem::replace(&mut self.sector_bests, personal_bests(frame, counted));
            if !pending.report {
                return None;
            }
            let targets = pending.targets.unwrap_or_default();
            let sectors = std::array::from_fn(|i| {
                times[i].map(|seconds| LapSector { seconds, rating: sector_state(lap, i, seconds), delta: bests_before[i].map(|best| seconds - best) })
            });
            return Some(LapSummary {
                lap: pending.lap,
                total_laps: pending.total_laps,
                position: pending.position,
                total_positions: pending.total_positions,
                lap_time,
                valid: pending.valid,
                lap_delta: (best_before > 0.0).then_some(lap_time - best_before),
                best_lap: (self.best > 0.0).then_some(self.best),
                target_delta: targets.lap_time_seconds.map(|target| lap_time - target),
                sectors,
                fuel_used: pending.fuel_used,
                fuel_delta: pending.fuel_used.zip(targets.fuel_per_lap_liters).map(|(used, target)| used - target),
                fuel_left_laps: pending.fuel_left_laps,
                energy_used: pending.energy_used,
                energy_left_laps: pending.energy_left_laps,
                tyre_wear_left: pending.tyre_wear_left,
                gap_ahead: pending.gap_ahead,
                top_speed: pending.top_speed,
            });
        }

        if now - pending.since > LAP_TIME_WAIT_MS {
            self.pending = None;
            self.sector_bests = personal_bests(frame, [None; 3]);
        }
        None
    }

    /// Forgets the previous frame, the fuel and energy baselines and any pending lap. The best, the
    /// sector bests and the last matched lap time are re-read from the next frame.
    pub fn reset(&mut self) {
        self.prev = None;
        self.lap_start_fuel = None;
        self.lap_start_energy = None;
        self.pending = None;
    }
}

/// The driver's best of each sector as `frame` holds them, each improved by `times` (a lap's
/// sectors the host may not have counted yet).
fn personal_bests(frame: &TelemetryFrame, times: [Option<f64>; 3]) -> [Option<f64>; 3] {
    std::array::from_fn(|i| {
        let held = frame.lap.personal_best_sectors.get(i).copied().flatten().filter(|best| *best > 0.0);
        match (held, times[i]) {
            (Some(held), Some(time)) => Some(held.min(time)),
            (held, time) => held.or(time),
        }
    })
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
    fn a_lap_keeps_its_sectors_rated_like_a_timing_screen_and_what_it_left_the_car_with() {
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, |f| f.lap.best_lap_time = 125.2), 0.0, None);
        // Lap 4 starts with 62 % virtual energy (the game's 0-1 scale).
        watcher.observe(&at(4.0, 125.2, 60.0, |f| f.energy.virtual_energy = 0.62), 1000.0, None);
        let crossing = at(5.0, 125.2, 57.5, |f| {
            (f.energy.virtual_energy, f.energy.virtual_energy_per_lap, f.car.fuel_per_lap) = (0.578, 0.042, 2.5);
            f.lap.last_lap_top_speed_ms = Some(86.4);
            (f.race.position, f.race.total_positions, f.race.gap_ahead) = (4.0, 22.0, 1.384);
            for (tire, left) in f.tires.iter_mut().zip([84.0, 81.0, 88.0, 86.0]) {
                tire.wear_percent = left;
            }
        });
        watcher.observe(&crossing, 2000.0, None);
        let timed = at(5.0, 124.912, 57.5, |f| {
            f.lap.last_lap_sectors_seconds = vec![38.412, 44.187, 42.313];
            f.lap.personal_best_sectors = vec![Some(38.412), Some(44.187), Some(42.1)];
            f.lap.session_best_sectors = vec![Some(38.2), Some(44.187), Some(41.9)];
        });
        let summary = watcher.observe(&timed, 2100.0, None).expect("a summary");
        let sectors = summary.sectors.map(|sector| sector.map(|s| (s.seconds, s.rating)));
        assert_eq!(sectors, [Some((38.412, SectorState::PersonalBest)), Some((44.187, SectorState::Fastest)), Some((42.313, SectorState::Slower))]);
        assert_eq!(summary.best_lap, Some(124.912), "the new best is this lap");
        assert_eq!((summary.total_positions, summary.gap_ahead), (Some(22.0), Some(1.384)));
        assert_eq!(summary.tyre_wear_left, Some(81.0), "the most worn corner");
        assert!(close(summary.fuel_left_laps, 23.0), "57.5 L at 2.5 a lap: {:?}", summary.fuel_left_laps);
        assert!(close(summary.energy_used, 4.2), "62 % down to 57.8 %: {:?}", summary.energy_used);
        assert!(close(summary.energy_left_laps, 0.578 / 0.042), "{:?}", summary.energy_left_laps);
        assert_eq!(summary.top_speed, Some(86.4), "as the host measured it");
    }

    #[test]
    fn each_sector_is_timed_against_the_drivers_best_of_it_before_the_lap() {
        let sectors =
            |summary: Option<LapSummary>| summary.expect("a summary").sectors.map(|sector| sector.and_then(|s| s.delta).map(|d| (d * 1000.0).round()));
        let mut watcher = LapSummaryWatcher::default();
        let bests = |f: &mut TelemetryFrame, bests: [f64; 3]| f.lap.personal_best_sectors = bests.map(Some).to_vec();
        watcher.observe(&at(3.0, 0.0, 60.0, |f| bests(f, [38.5, 44.3, 42.1])), 0.0, None);
        // Sector 1 of lap 3 is done: the host has already made it the best.
        watcher.observe(&at(3.0, 0.0, 60.0, |f| bests(f, [38.412, 44.3, 42.1])), 500.0, None);
        watcher.observe(&at(4.0, 0.0, 60.0, |f| bests(f, [38.412, 44.3, 42.1])), 1000.0, None);
        let lap3 = at(4.0, 125.0, 60.0, |f| {
            bests(f, [38.412, 44.3, 42.0]);
            f.lap.last_lap_sectors_seconds = vec![38.412, 44.4, 42.0];
        });
        assert_eq!(sectors(watcher.observe(&lap3, 1100.0, None)), [Some(-88.0), Some(100.0), Some(-100.0)], "against the bests before lap 3");

        // The host has not counted lap 4's sectors when its time arrives (nor lap 3's last one):
        // lap 4 is still timed against lap 3's 42.0.
        watcher.observe(&at(5.0, 125.0, 60.0, |f| bests(f, [38.412, 44.3, 42.1])), 2000.0, None);
        let lap4 = at(5.0, 124.9, 60.0, |f| {
            bests(f, [38.412, 44.3, 42.1]);
            f.lap.last_lap_sectors_seconds = vec![38.5, 44.2, 42.05];
        });
        assert_eq!(sectors(watcher.observe(&lap4, 2100.0, None)), [Some(88.0), Some(-100.0), Some(50.0)]);
    }

    #[test]
    fn an_invalid_laps_sectors_never_become_the_bests_the_next_lap_is_timed_against() {
        let deltas = |summary: Option<LapSummary>| summary.expect("a summary").sectors.map(|sector| sector.and_then(|s| s.delta).map(|d| (d * 1000.0).round()));
        let bests = |f: &mut TelemetryFrame| f.lap.personal_best_sectors = [38.5, 44.3, 42.1].map(Some).to_vec();
        let mut watcher = LapSummaryWatcher::default();
        watcher.observe(&at(3.0, 0.0, 60.0, bests), 0.0, None);
        // Lap 3 is cut: every sector quicker than the bests, none of them counting.
        watcher.observe(
            &at(3.0, 0.0, 60.0, |f| {
                bests(f);
                f.lap.is_valid = false;
            }),
            500.0,
            None,
        );
        watcher.observe(&at(4.0, 0.0, 60.0, bests), 1000.0, None);
        let cut = at(4.0, 123.0, 60.0, |f| {
            bests(f);
            f.lap.last_lap_sectors_seconds = vec![38.0, 44.0, 41.0];
        });
        assert_eq!(deltas(watcher.observe(&cut, 1100.0, None)), [Some(-500.0), Some(-300.0), Some(-1100.0)]);

        watcher.observe(&at(5.0, 123.0, 60.0, bests), 2000.0, None);
        let lap4 = at(5.0, 125.0, 60.0, |f| {
            bests(f);
            f.lap.last_lap_sectors_seconds = vec![38.6, 44.3, 42.0];
        });
        assert_eq!(deltas(watcher.observe(&lap4, 2100.0, None)), [Some(100.0), Some(0.0), Some(-100.0)], "against the valid bests, not the cut lap's");
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
            // Nothing else is reported (no field, wear, fuel average or sectors) or measured.
            assert_eq!(
                (summary.total_positions, summary.gap_ahead, summary.energy_used, summary.tyre_wear_left, summary.fuel_left_laps),
                (None, None, None, None, None)
            );
            assert_eq!((summary.energy_left_laps, summary.top_speed), (None, None));
            assert_eq!(summary.sectors, [None, None, None]);
        }
    }

    #[test]
    fn the_editor_offers_exactly_these_review_fields_in_this_order_and_the_same_default() {
        let source = include_str!("../../src/lapReview.ts");
        let block = |start: &str| {
            let from = source.find(start).unwrap_or_else(|| panic!("{start} in lapReview.ts")) + start.len();
            &source[from..from + source[from..].find(']').expect("its end")]
        };
        let ids: Vec<&str> = block("dashLapReviewFields: readonly { id: DashLapReviewField; label: string }[] = [")
            .split("id: '")
            .skip(1)
            .filter_map(|entry| entry.split('\'').next())
            .collect();
        assert_eq!(ids, LapReviewField::ALL.map(LapReviewField::id));
        let defaults: Vec<&str> = block("DEFAULT_LAP_REVIEW_CELLS: readonly DashLapReviewField[] = [").split('\'').skip(1).step_by(2).collect();
        assert_eq!(defaults, LapReview::DEFAULT.cells.map(LapReviewField::id));
        for field in LapReviewField::ALL {
            assert_eq!(LapReviewField::parse(field.id()), Some(field));
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
