// Package delta provides position-based lap delta calculation against a
// reference lap. It records telemetry samples during each lap and compares
// the current position against where the reference lap was at the same point.
package delta

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kratofl/sprint/app/internal/appdata"
)

// Sample is a single position→time measurement recorded during a lap.
type Sample struct {
	Pos float32 // track position 0–1
	T   float64 // lap time in seconds at this position
}

// ReferenceLap is a completed lap stored as a sorted list of position samples
// suitable for position-based delta interpolation.
type ReferenceLap struct {
	LapTime float64  // total lap time in seconds
	Samples []Sample // sorted by Pos ascending
}

// DeltaAt returns the reference lap's elapsed time at the given track position
// using linear interpolation. Returns (0, false) when no data is available or
// pos is outside the recorded range.
func (r *ReferenceLap) DeltaAt(pos float32) (float64, bool) {
	if r == nil || len(r.Samples) == 0 {
		return 0, false
	}
	s := r.Samples
	if pos <= s[0].Pos {
		return s[0].T, true
	}
	last := s[len(s)-1]
	if pos >= last.Pos {
		return last.T, true
	}

	lo, hi := 0, len(s)-1
	for lo < hi-1 {
		mid := (lo + hi) / 2
		if s[mid].Pos <= pos {
			lo = mid
		} else {
			hi = mid
		}
	}
	span := float64(s[hi].Pos - s[lo].Pos)
	if span == 0 {
		return s[lo].T, true
	}
	t := float64(pos-s[lo].Pos) / span
	return s[lo].T + t*(s[hi].T-s[lo].T), true
}

// referenceOnDisk is the JSON structure written to disk.
type referenceOnDisk struct {
	LapTime float64     `json:"lapTime"`
	Samples [][2]float64 `json:"samples"` // [pos, time] pairs
}

// Store persists the best reference lap per game/car/track combination.
type Store struct {
	dir string
}

// NewStore creates a Store that reads and writes files under dir.
func NewStore() *Store {
	return &Store{dir: filepath.Join(appdata.Dir(), "laps")}
}

// Load returns the stored best reference lap for the given combination.
// Returns nil (no error) if no stored lap exists yet.
func (s *Store) Load(game, track, car string) (*ReferenceLap, error) {
	path := s.path(game, track, car)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("delta store load: %w", err)
	}
	var d referenceOnDisk
	if err := json.Unmarshal(data, &d); err != nil {
		return nil, fmt.Errorf("delta store parse: %w", err)
	}
	ref := &ReferenceLap{
		LapTime: d.LapTime,
		Samples: make([]Sample, len(d.Samples)),
	}
	for i, pair := range d.Samples {
		ref.Samples[i] = Sample{Pos: float32(pair[0]), T: pair[1]}
	}
	return ref, nil
}

// Save writes ref as the best lap for the given combination, overwriting any
// previous file. It only saves if ref.LapTime is faster (smaller) than the
// currently stored lap — or if no stored lap exists yet.
func (s *Store) Save(game, track, car string, ref *ReferenceLap) error {
	if ref == nil || ref.LapTime <= 0 || len(ref.Samples) == 0 {
		return nil
	}

	existing, err := s.Load(game, track, car)
	if err == nil && existing != nil && existing.LapTime <= ref.LapTime {
		return nil // stored lap is already faster or equal
	}

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return fmt.Errorf("delta store mkdir: %w", err)
	}

	d := referenceOnDisk{
		LapTime: ref.LapTime,
		Samples: make([][2]float64, len(ref.Samples)),
	}
	for i, sample := range ref.Samples {
		d.Samples[i] = [2]float64{float64(sample.Pos), sample.T}
	}
	data, err := json.Marshal(d)
	if err != nil {
		return fmt.Errorf("delta store marshal: %w", err)
	}
	if err := os.WriteFile(s.path(game, track, car), data, 0o644); err != nil {
		return fmt.Errorf("delta store write: %w", err)
	}
	return nil
}

func (s *Store) path(game, track, car string) string {
	key := sanitize(game) + "_" + sanitize(track) + "_" + sanitize(car)
	return filepath.Join(s.dir, key+".json")
}

// sanitize removes characters that are unsafe in filenames.
func sanitize(s string) string {
	r := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_",
		"?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
		" ", "_",
	)
	return r.Replace(s)
}
