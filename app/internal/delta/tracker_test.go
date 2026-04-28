package delta

import (
	"os"
	"testing"

	"github.com/kratofl/sprint/pkg/dto"
)

func newTestTracker(t *testing.T) *Tracker {
	t.Helper()

	dir, err := os.MkdirTemp(".", "delta-test-*")
	if err != nil {
		t.Fatalf("mkdir temp test dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(dir)
	})

	tracker := New(nil)
	tracker.store = &Store{dir: dir}
	return tracker
}

func makeFrame(lap int, lapTime float64, pos float32) *dto.TelemetryFrame {
	return makeFrameWithTimes(lap, lapTime, lapTime, pos)
}

func makeFrameWithTimes(lap int, currentLapTime, positionLapTime float64, pos float32) *dto.TelemetryFrame {
	return &dto.TelemetryFrame{
		Session: dto.Session{
			Game:  "acc",
			Track: "spa",
			Car:   "ferrari",
		},
		Lap: dto.LapState{
			CurrentLap:      lap,
			CurrentLapTime:  currentLapTime,
			PositionLapTime: positionLapTime,
			TrackPosition:   pos,
			IsValid:         true,
		},
	}
}

func TestProcessTransitionIgnoresNewLapOutLapTransient(t *testing.T) {
	tracker := newTestTracker(t)

	tracker.Process(makeFrame(1, 10, 0.05))
	tracker.Process(makeFrame(1, 92, 0.98))

	transition := makeFrame(2, 0.10, 0.01)
	transition.Lap.LastLapTime = 95.0
	transition.Lap.IsOutLap = true

	_, refTime := tracker.Process(transition)

	if tracker.lastValidLap == nil {
		t.Fatal("expected completed lap to be recorded as last valid lap")
	}
	if tracker.reference == nil {
		t.Fatal("expected completed lap to become active reference immediately")
	}
	if tracker.reference.LapTime != 95.0 {
		t.Fatalf("reference lap time: want 95.0, got %.3f", tracker.reference.LapTime)
	}
	if refTime != 95.0 {
		t.Fatalf("returned reference lap time: want 95.0, got %.3f", refTime)
	}
}

func TestProcessTransitionIgnoresNewLapFlagTransient(t *testing.T) {
	tracker := newTestTracker(t)

	tracker.Process(makeFrame(1, 11, 0.05))
	tracker.Process(makeFrame(1, 93, 0.99))

	transition := makeFrame(2, 0.10, 0.01)
	transition.Lap.LastLapTime = 96.0
	transition.Flags.Yellow = true

	tracker.Process(transition)

	if tracker.lastValidLap == nil {
		t.Fatal("expected completed lap to remain valid despite new-lap yellow transient")
	}
}

func TestProcessTransitionStillRejectsTaintedCompletedLap(t *testing.T) {
	tracker := newTestTracker(t)

	tracker.Process(makeFrame(1, 12, 0.05))

	tainted := makeFrame(1, 80, 0.90)
	tainted.Lap.IsInLap = true
	tracker.Process(tainted)

	transition := makeFrame(2, 0.10, 0.01)
	transition.Lap.LastLapTime = 97.0

	tracker.Process(transition)

	if tracker.lastValidLap != nil {
		t.Fatal("expected tainted completed lap to be rejected")
	}
	if tracker.reference != nil {
		t.Fatal("expected no reference from tainted completed lap")
	}
}

func TestBuildReferenceHandlesStartFinishWrap(t *testing.T) {
	raw := []Sample{
		{Pos: 0.02, T: 0.2},
		{Pos: 0.25, T: 24.0},
		{Pos: 0.50, T: 48.0},
		{Pos: 0.75, T: 72.0},
		{Pos: 0.98, T: 95.0},
		{Pos: 0.01, T: 95.5}, // wrap seen before lap number increments
	}

	ref := buildReference(raw, 96.0)
	if ref == nil {
		t.Fatal("expected reference to be built from wrapped samples")
	}

	start, ok := ref.DeltaAt(0.01)
	if !ok {
		t.Fatal("expected delta lookup at lap start")
	}
	if start > 2 {
		t.Fatalf("expected lap-start reference time near zero, got %.3f", start)
	}

	mid, ok := ref.DeltaAt(0.50)
	if !ok {
		t.Fatal("expected delta lookup at lap midpoint")
	}
	if mid < 40 || mid > 55 {
		t.Fatalf("expected midpoint reference near 48s, got %.3f", mid)
	}
}

func TestComputeDeltaDoesNotCountdownFromLapTimeAfterWrap(t *testing.T) {
	tracker := newTestTracker(t)
	tracker.reference = buildReference([]Sample{
		{Pos: 0.02, T: 0.2},
		{Pos: 0.25, T: 24.0},
		{Pos: 0.50, T: 48.0},
		{Pos: 0.75, T: 72.0},
		{Pos: 0.98, T: 95.0},
		{Pos: 0.01, T: 95.5},
	}, 96.0)
	if tracker.reference == nil {
		t.Fatal("expected reference lap")
	}

	deltaStart, _ := tracker.computeDelta(makeFrame(5, 0.8, 0.01))
	if deltaStart < -10 {
		t.Fatalf("unexpected large countdown-style delta at lap start: %.3f", deltaStart)
	}

	deltaLater, _ := tracker.computeDelta(makeFrame(5, 24.5, 0.25))
	if deltaLater < -10 {
		t.Fatalf("unexpected countdown-style delta later in lap: %.3f", deltaLater)
	}
}

func TestComputeDeltaPrefersPositionLapTimeWhenAvailable(t *testing.T) {
	tracker := newTestTracker(t)
	tracker.reference = buildReference([]Sample{
		{Pos: 0.02, T: 0.2},
		{Pos: 0.25, T: 24.0},
		{Pos: 0.50, T: 48.0},
		{Pos: 0.75, T: 72.0},
		{Pos: 0.98, T: 95.0},
		{Pos: 0.01, T: 95.5},
	}, 96.0)
	if tracker.reference == nil {
		t.Fatal("expected reference lap")
	}

	delta, _ := tracker.computeDelta(makeFrameWithTimes(5, 25.5, 24.5, 0.25))
	if delta < 0.49 || delta > 0.51 {
		t.Fatalf("delta should use position-aligned lap time: got %.3f, want about 0.5", delta)
	}
}

func TestRecordSampleFallsBackToCurrentLapTimeWithoutPositionLapTime(t *testing.T) {
	tracker := newTestTracker(t)
	frame := makeFrameWithTimes(2, 12.5, 0, 0.25)

	tracker.recordSample(frame)

	if len(tracker.currentSamples) != 1 {
		t.Fatalf("expected 1 recorded sample, got %d", len(tracker.currentSamples))
	}
	if tracker.currentSamples[0].T != 12.5 {
		t.Fatalf("sample time: got %.3f, want 12.5", tracker.currentSamples[0].T)
	}
}
