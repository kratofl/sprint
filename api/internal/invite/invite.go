// Package invite manages time-limited engineer session invite codes.
//
// A driver generates an invite code from their desktop app. Engineers must
// present the code to join the live session WebSocket relay. This prevents
// arbitrary authenticated users from eavesdropping on or sending commands
// to a driver they were not explicitly invited by.
//
// TODO: persist invite codes in the database for multi-instance deployments.
package invite

import (
	"errors"
	"sync"
	"time"
)

const codeTTL = 24 * time.Hour

// Code is a live engineer session invite.
type Code struct {
	Value        string // random hex string presented by the engineer
	DriverID     string // user ID of the driver who created the code
	SessionID    string // optional — links to a telemetry session record
	CreatedAt    time.Time
	ExpiresAt    time.Time
	DriverJoined bool // true once the driver's desktop app has connected
}

// Store is an in-memory registry of active invite codes.
type Store struct {
	mu    sync.RWMutex
	codes map[string]*Code
}

// NewStore returns an empty invite code store.
func NewStore() *Store {
	s := &Store{codes: make(map[string]*Code)}
	go s.reapLoop()
	return s
}

// Create generates a new invite code for the given driver.
func (s *Store) Create(driverID, sessionID string) *Code {
	code := &Code{
		Value:     newCode(),
		DriverID:  driverID,
		SessionID: sessionID,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(codeTTL),
	}
	s.mu.Lock()
	s.codes[code.Value] = code
	s.mu.Unlock()
	return code
}

// Validate checks whether a code is valid for the given driver or engineer.
// Returns the Code on success or an error describing why it's invalid.
func (s *Store) Validate(value string) (*Code, error) {
	s.mu.RLock()
	code, ok := s.codes[value]
	s.mu.RUnlock()

	if !ok {
		return nil, errors.New("invite code not found")
	}
	if time.Now().After(code.ExpiresAt) {
		return nil, errors.New("invite code expired")
	}
	return code, nil
}

// MarkDriverJoined records that the driver's desktop app has connected.
// Returns an error if a driver is already connected (prevents hijacking).
func (s *Store) MarkDriverJoined(value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	code, ok := s.codes[value]
	if !ok {
		return errors.New("invite code not found")
	}
	if code.DriverJoined {
		return errors.New("driver already connected on this invite code")
	}
	code.DriverJoined = true
	return nil
}

// Revoke immediately invalidates an invite code.
func (s *Store) Revoke(value string) {
	s.mu.Lock()
	delete(s.codes, value)
	s.mu.Unlock()
}

// reapLoop periodically removes expired codes to prevent unbounded memory growth.
func (s *Store) reapLoop() {
	for range time.NewTicker(time.Hour).C {
		s.mu.Lock()
		for k, c := range s.codes {
			if time.Now().After(c.ExpiresAt) {
				delete(s.codes, k)
			}
		}
		s.mu.Unlock()
	}
}
