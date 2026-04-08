// Package settings manages persistent application preferences.
// Settings are stored in {appdata.Dir()}/settings.json next to the executable.
// If the file does not exist, defaults are loaded from the embedded preset.
package settings

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
)

// Settings holds persistent application preferences.
type Settings struct {
	UpdateChannel string `json:"updateChannel"` // "stable" | "pre-release"
}

var presetsFS fs.FS

// InitPresets provides the embedded FS rooted at presets/settings/.
// Call from app.go Startup() via fs.Sub(PresetsFS, "presets/settings").
func InitPresets(f fs.FS) {
	presetsFS = f
}

// Load reads settings from disk. Falls back to the embedded default preset
// if the user file is missing or cannot be parsed.
func Load() (*Settings, error) {
	path := filepath.Join(appdata.Dir(), "settings.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return loadDefault()
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return loadDefault()
	}
	return &s, nil
}

func loadDefault() (*Settings, error) {
	if presetsFS != nil {
		data, err := fs.ReadFile(presetsFS, "default.json")
		if err == nil {
			var s Settings
			if json.Unmarshal(data, &s) == nil {
				return &s, nil
			}
		}
	}
	return &Settings{UpdateChannel: "stable"}, nil
}

// Save writes s to {appdata.Dir()}/settings.json, creating the directory if needed.
func Save(s *Settings) error {
	dir := appdata.Dir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create settings dir: %w", err)
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal settings: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), data, 0o644); err != nil {
		return fmt.Errorf("write settings: %w", err)
	}
	return nil
}
