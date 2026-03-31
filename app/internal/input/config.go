package input

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/commands"
)

// Binding maps a hardware button number to an application command.
type Binding struct {
	Button  int              `json:"button"`
	Command commands.Command `json:"command"`
}

// Config holds the persisted button→command bindings.
type Config struct {
	Bindings []Binding `json:"bindings"`
}

// configPath returns the path to the persisted controls config file.
func configPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Sprint", "controls.json")
}

// LoadConfig reads the persisted binding config.
// Returns an empty Config (no error) if no config has been saved yet.
func LoadConfig() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, fmt.Errorf("input: read controls config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("input: parse controls config: %w", err)
	}
	return &cfg, nil
}

// SaveConfig persists the binding config to disk.
func SaveConfig(cfg *Config) error {
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("input: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("input: marshal controls config: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}
