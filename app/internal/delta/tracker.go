package delta

import (
	"log/slog"
	"sort"

	"github.com/kratofl/sprint/pkg/dto"
)

// numRefPoints is the number of evenly-spaced position points written into a
// finished ReferenceLap. A constant size makes files predictable and
// interpolation O(log n) with a fixed n.
const numRefPoints = 500

// deltaAlpha is the EMA weight for the displayed delta. At ~100 Hz poll rate,
// alpha=0.2 gives a ~50 ms time constant — responsive enough for driving
// feedback while suppressing the ±0.1 s jitter caused by LMU scoring data
// updating at a slower internal rate than telemetry.
const deltaAlpha = 0.2

// Tracker accumulates telemetry samples lap by lap, computes position-based
// delta against a reference lap, and persists the historical best lap.
//
// Not safe for concurrent use — call Process from a single goroutine.
type Tracker struct {
	logger *slog.Logger
	store  *Store

	// active reference used for delta computation.
	reference *ReferenceLap

	// lastValidLap is the most recently recorded valid completed lap;
	// used by SetManualReference (CmdSetTargetLap).
	lastValidLap *ReferenceLap

	// raw samples accumulated during the current lap.
	currentSamples []Sample
	// prevLap is the lap number seen on the previous frame.
	prevLap int
	// prevIsValid is the IsValid flag from the previous frame.
	prevIsValid bool
	// lapTainted is set when a yellow flag, SC/VSC, or in/out lap is seen.
	lapTainted bool

	// smoothedDelta is the EMA-filtered delta shown to the driver.
	smoothedDelta float64
	// hasDelta is true once the first valid delta has been computed.
	hasDelta bool

	// sessionKey tracks the current game/car/track combo to detect session changes.
	sessionGame  string
	sessionTrack string
	sessionCar   string
}

// New creates a Tracker. logger may be nil.
func New(logger *slog.Logger) *Tracker {
	if logger == nil {
		logger = slog.Default()
	}
	return &Tracker{
		logger: logger.With("component", "delta"),
		store:  NewStore(),
	}
}

// SetManualReference sets the most recently recorded valid lap as the active
// reference. Call this from the CmdSetTargetLap handler.
func (t *Tracker) SetManualReference() {
	if t.lastValidLap == nil {
		t.logger.Info("set target lap: no valid lap recorded yet")
		return
	}
	t.reference = t.lastValidLap
	t.logger.Info("manual reference set", "lapTime", t.lastValidLap.LapTime)
}

// Process updates internal state for the given frame and returns the
// position-based delta (in seconds) and the active reference lap time.
// Both values are 0 when no reference lap is available.
//
// The caller must NOT mutate frame — Process only reads it.
func (t *Tracker) Process(frame *dto.TelemetryFrame) (delta, refTime float64) {
	t.checkSessionChange(frame)
	t.updateTaint(frame)
	t.recordSample(frame)
	t.checkLapTransition(frame)

	t.prevLap = frame.Lap.CurrentLap
	t.prevIsValid = frame.Lap.IsValid

	return t.computeDelta(frame)
}

// checkSessionChange loads the historical best from disk when the game,
// car, or track combination changes.
func (t *Tracker) checkSessionChange(frame *dto.TelemetryFrame) {
	g, tr, c := frame.Session.Game, frame.Session.Track, frame.Session.Car
	if g == t.sessionGame && tr == t.sessionTrack && c == t.sessionCar {
		return
	}
	t.sessionGame, t.sessionTrack, t.sessionCar = g, tr, c

	// Reset lap state for new session context.
	t.currentSamples = t.currentSamples[:0]
	t.lapTainted = false
	t.hasDelta = false

	if g == "" || tr == "" || c == "" {
		return
	}

	hist, err := t.store.Load(g, tr, c)
	if err != nil {
		t.logger.Warn("delta: failed to load historical best", "err", err)
		return
	}
	if hist != nil {
		t.reference = hist
		t.logger.Info("delta: loaded historical best", "lapTime", hist.LapTime,
			"game", g, "track", tr, "car", c)
	}
}

// updateTaint marks the current lap as tainted when any invalidating condition
// is active. A tainted lap is never saved as a reference.
func (t *Tracker) updateTaint(frame *dto.TelemetryFrame) {
	if frame.Lap.IsInLap || frame.Lap.IsOutLap ||
		frame.Flags.Yellow || frame.Flags.DoubleYellow ||
		frame.Flags.SafetyCar || frame.Flags.VSC {
		t.lapTainted = true
	}
}

// recordSample appends a position sample if the frame has useful data.
func (t *Tracker) recordSample(frame *dto.TelemetryFrame) {
	if frame.Lap.CurrentLapTime <= 0 || frame.Lap.TrackPosition <= 0 {
		return
	}
	t.currentSamples = append(t.currentSamples, Sample{
		Pos: frame.Lap.TrackPosition,
		T:   frame.Lap.CurrentLapTime,
	})
}

// checkLapTransition handles a lap number change: evaluates the completed
// lap for validity, saves it if it is the new best, and resets state.
func (t *Tracker) checkLapTransition(frame *dto.TelemetryFrame) {
	if t.prevLap == 0 || frame.Lap.CurrentLap == t.prevLap {
		return
	}

	lapTime := frame.Lap.LastLapTime
	valid := lapTime > 0 && t.prevIsValid && !t.lapTainted &&
		!frame.Lap.IsInLap && !frame.Lap.IsOutLap

	if valid {
		ref := buildReference(t.currentSamples, lapTime)
		if ref != nil {
			t.lastValidLap = ref
			if t.reference == nil || lapTime < t.reference.LapTime {
				t.reference = ref
				if err := t.store.Save(t.sessionGame, t.sessionTrack, t.sessionCar, ref); err != nil {
					t.logger.Warn("delta: failed to persist best lap", "err", err)
				} else {
					t.logger.Info("delta: new best lap saved", "lapTime", lapTime)
				}
			}
		}
	}

	t.currentSamples = t.currentSamples[:0]
	t.lapTainted = false
	t.hasDelta = false
}

// computeDelta returns (delta, refLapTime) at the current track position.
// The returned delta is EMA-smoothed to absorb jitter from scoring data updating
// at a slower internal rate than the telemetry poll interval.
func (t *Tracker) computeDelta(frame *dto.TelemetryFrame) (float64, float64) {
	if t.reference == nil {
		t.hasDelta = false
		return 0, 0
	}
	refAtPos, ok := t.reference.DeltaAt(frame.Lap.TrackPosition)
	if !ok {
		t.hasDelta = false
		return 0, t.reference.LapTime
	}
	raw := frame.Lap.CurrentLapTime - refAtPos
	if !t.hasDelta {
		t.smoothedDelta = raw
		t.hasDelta = true
	} else {
		t.smoothedDelta = deltaAlpha*raw + (1-deltaAlpha)*t.smoothedDelta
	}
	return t.smoothedDelta, t.reference.LapTime
}

// buildReference converts raw recorded samples into a normalized ReferenceLap
// with numRefPoints evenly-spaced position points. Returns nil if there are
// fewer than two samples or the position range is too small.
func buildReference(raw []Sample, lapTime float64) *ReferenceLap {
	if len(raw) < 2 {
		return nil
	}

	// Sort by position.
	sorted := make([]Sample, len(raw))
	copy(sorted, raw)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Pos < sorted[j].Pos
	})

	minPos := sorted[0].Pos
	maxPos := sorted[len(sorted)-1].Pos
	if maxPos-minPos < 0.01 {
		return nil // not enough position range to be useful
	}

	// Downsample to numRefPoints evenly-spaced positions via linear interpolation.
	ref := &ReferenceLap{
		LapTime: lapTime,
		Samples: make([]Sample, numRefPoints),
	}
	for i := range ref.Samples {
		pos := minPos + float32(i)*(maxPos-minPos)/float32(numRefPoints-1)
		ref.Samples[i] = Sample{Pos: pos, T: interpolateAt(sorted, pos)}
	}
	return ref
}

// interpolateAt returns the lap time at pos by linear interpolation within
// the sorted samples slice.
func interpolateAt(sorted []Sample, pos float32) float64 {
	if pos <= sorted[0].Pos {
		return sorted[0].T
	}
	last := sorted[len(sorted)-1]
	if pos >= last.Pos {
		return last.T
	}
	lo, hi := 0, len(sorted)-1
	for lo < hi-1 {
		mid := (lo + hi) / 2
		if sorted[mid].Pos <= pos {
			lo = mid
		} else {
			hi = mid
		}
	}
	span := float64(sorted[hi].Pos - sorted[lo].Pos)
	if span == 0 {
		return sorted[lo].T
	}
	frac := float64(pos-sorted[lo].Pos) / span
	return sorted[lo].T + frac*(sorted[hi].T-sorted[lo].T)
}
