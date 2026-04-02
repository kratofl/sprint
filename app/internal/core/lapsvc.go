package core

import (
	"log/slog"

	"github.com/kratofl/sprint/pkg/dto"
)

const validLapTolerancePercent = 5.0

// LapRecord stores the result of a completed lap for target-lap selection.
type LapRecord struct {
	LapNum   int
	LapTime  float64 // seconds
	IsInLap  bool
	IsOutLap bool
	IsValid  bool // no track limits, no yellow flag
}

// LapService records completed laps from the telemetry stream and selects a
// qualifying target lap on demand. It belongs in core because "which lap
// qualifies as a delta reference?" is domain business logic, not input logic.
type LapService struct {
	laps        []LapRecord
	sessionBest float64
	logger      *slog.Logger

	prevLap     int // last known lap number for detecting lap completion
	prevLapTime float64
}

// NewLapService creates a LapService with no lap history.
func NewLapService(logger *slog.Logger) *LapService {
	return &LapService{logger: logger}
}

// OnFrame is called on every telemetry frame to record completed laps.
func (s *LapService) OnFrame(frame *dto.TelemetryFrame) {
	lap := frame.Lap
	// A new lap starts when the lap counter increments.
	if lap.CurrentLap > s.prevLap && s.prevLap != 0 && s.prevLapTime > 0 {
		s.recordLap(LapRecord{
			LapNum:   s.prevLap,
			LapTime:  s.prevLapTime,
			IsInLap:  lap.IsInLap,
			IsOutLap: lap.IsOutLap,
			IsValid:  lap.IsValid && !frame.Flags.Yellow && !frame.Flags.SafetyCar,
		})
	}
	if lap.CurrentLap != s.prevLap {
		s.prevLap = lap.CurrentLap
	}
	if lap.LastLapTime > 0 {
		s.prevLapTime = lap.LastLapTime
	}
}

// recordLap appends a completed lap and updates the session best.
func (s *LapService) recordLap(lap LapRecord) {
	s.laps = append(s.laps, lap)
	if lap.IsValid && (s.sessionBest == 0 || lap.LapTime < s.sessionBest) {
		s.sessionBest = lap.LapTime
	}
}

// SelectTargetLap returns the most recent lap that qualifies as a valid target.
// A lap qualifies when: not an in/out lap, no infringement flag, and its time
// is within validLapTolerancePercent of the session best.
func (s *LapService) SelectTargetLap() (LapRecord, bool) {
	for i := len(s.laps) - 1; i >= 0; i-- {
		lap := s.laps[i]
		if lap.IsInLap || lap.IsOutLap || !lap.IsValid {
			continue
		}
		if s.sessionBest > 0 {
			deviation := ((lap.LapTime - s.sessionBest) / s.sessionBest) * 100
			if deviation > validLapTolerancePercent {
				continue
			}
		}
		return lap, true
	}
	return LapRecord{}, false
}
