// Package wheel detects steering wheel button presses and implements the
// "set target lap" logic: when the driver presses the designated button,
// the detector finds the most recent valid lap and updates the target delta.
package wheel

import (
	"context"
	"log/slog"

	"github.com/kratofl/sprint/app/internal/engineer"
	"github.com/kratofl/sprint/pkg/dto"
)

const (
	// validLapTolerancePercent is the maximum deviation from the session best
	// for a lap to be considered valid as a target reference.
	validLapTolerancePercent = 5.0
)

// LapRecord stores the result of a completed lap for target-lap selection.
type LapRecord struct {
	LapNum   int
	LapTime  float64 // seconds
	IsInLap  bool
	IsOutLap bool
	IsValid  bool // no track limits, no yellow flag
}

// Detector listens to telemetry frames and wheel button events.
// On a target-lap button press it selects the best recent valid lap and
// broadcasts a SetTargetLap command to all connected engineers.
type Detector struct {
	laps        []LapRecord
	sessionBest float64
	logger      *slog.Logger
}

// NewDetector creates a Detector with no lap history.
func NewDetector(logger *slog.Logger) *Detector {
	return &Detector{logger: logger}
}

// Run starts the detector loop. hub is used to broadcast target changes.
func (d *Detector) Run(ctx context.Context, hub *engineer.Hub) {
	d.logger.Info("detector running")
	// TODO: subscribe to telemetry frame channel to record completed laps
	// TODO: subscribe to wheel button event channel to trigger SetTargetLap
	<-ctx.Done()
	d.logger.Info("detector stopped")
}

// RecordLap appends a completed lap to the history and updates sessionBest.
func (d *Detector) RecordLap(lap LapRecord) {
	d.laps = append(d.laps, lap)
	if lap.IsValid && (d.sessionBest == 0 || lap.LapTime < d.sessionBest) {
		d.sessionBest = lap.LapTime
	}
}

// SelectTargetLap returns the most recent lap that qualifies as a valid target.
// A lap is valid when: not an in/out lap, no infringement flag set, and its
// time is within validLapTolerancePercent of the session best.
func (d *Detector) SelectTargetLap() (LapRecord, bool) {
	for i := len(d.laps) - 1; i >= 0; i-- {
		lap := d.laps[i]
		if lap.IsInLap || lap.IsOutLap || !lap.IsValid {
			continue
		}
		if d.sessionBest > 0 {
			deviation := ((lap.LapTime - d.sessionBest) / d.sessionBest) * 100
			if deviation > validLapTolerancePercent {
				continue
			}
		}
		return lap, true
	}
	return LapRecord{}, false
}

// buildSetTargetEvent creates an EngineerEvent for a target lap change.
func buildSetTargetEvent(lap LapRecord) *dto.EngineerEvent {
	return &dto.EngineerEvent{
		Type: dto.EvtTargetChanged,
		Payload: dto.SetTargetLapPayload{
			LapTime: lap.LapTime,
			LapNum:  lap.LapNum,
		},
	}
}
