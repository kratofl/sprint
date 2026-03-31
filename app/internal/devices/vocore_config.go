package devices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// VoCoreConfig stores the user's selected VoCore screen configuration.
// Persisted to ~/.config/Sprint/screen.json.
type VoCoreConfig struct {
	// VID / PID identify the selected VoCore USB device.
	VID uint16 `json:"vid"`
	PID uint16 `json:"pid"`
	// Width / Height are the landscape render dimensions for the renderer.
	Width  int `json:"width"`
	Height int `json:"height"`
}

// voCoreConfigPath returns the path to the persisted screen config file.
func voCoreConfigPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Sprint", "screen.json")
}

// SaveVoCoreConfig persists cfg to disk.
func SaveVoCoreConfig(cfg *VoCoreConfig) error {
	path := voCoreConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal VoCoreConfig: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}

// LoadVoCoreConfig reads the persisted screen config. Returns nil (no error) if
// no config has been saved yet.
func LoadVoCoreConfig() (*VoCoreConfig, error) {
	path := voCoreConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("devices: read screen config: %w", err)
	}
	var cfg VoCoreConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("devices: parse screen config: %w", err)
	}
	return &cfg, nil
}
