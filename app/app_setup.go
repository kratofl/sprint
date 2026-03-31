package main

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/setup"
)

// SetupListAll returns every setup stored on disk, across all cars and tracks.
func (a *App) SetupListAll() ([]setup.Setup, error) {
	items, err := a.setups.ListAll()
	if err != nil {
		return nil, fmt.Errorf("SetupListAll: %w", err)
	}
	result := make([]setup.Setup, 0, len(items))
	for _, s := range items {
		result = append(result, *s)
	}
	return result, nil
}

// SetupSave writes a setup to disk. If s.ID is empty a new UUID is assigned.
func (a *App) SetupSave(s setup.Setup) (setup.Setup, error) {
	if s.ID == "" {
		s.ID = uuid.NewString()
	}
	if s.Name == "" || s.Car == "" || s.Track == "" {
		return setup.Setup{}, fmt.Errorf("name, car and track are required")
	}
	if err := a.setups.Save(&s); err != nil {
		return setup.Setup{}, fmt.Errorf("SetupSave: %w", err)
	}
	return s, nil
}

// SetupDelete removes a setup file from disk.
func (a *App) SetupDelete(car, track, id string) error {
	if err := a.setups.Delete(car, track, id); err != nil {
		return fmt.Errorf("SetupDelete: %w", err)
	}
	return nil
}
