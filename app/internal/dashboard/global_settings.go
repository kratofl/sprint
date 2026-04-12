package dashboard

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

// GlobalDashSettings holds the global default color palette and format
// preferences applied to every newly created dash layout. Users can override
// these per-dash in the editor.
type GlobalDashSettings struct {
	Theme            widgets.DashTheme        `json:"theme"`
	DomainPalette    widgets.DomainPalette    `json:"domainPalette"`
	FormatPreferences widgets.FormatPreferences `json:"formatPreferences"`
}

// globalSettingsPath returns the path to the global dash settings file.
func globalSettingsPath() string {
	return filepath.Join(appdata.Dir(), "global_dash_settings.json")
}

// LoadGlobalSettings reads the global dash settings from disk.
// Returns fully-populated defaults if the file does not exist or cannot be parsed.
func LoadGlobalSettings() (*GlobalDashSettings, error) {
	data, err := os.ReadFile(globalSettingsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return defaultGlobalSettings(), nil
		}
		return nil, fmt.Errorf("dash: read global settings: %w", err)
	}
	var s GlobalDashSettings
	if err := json.Unmarshal(data, &s); err != nil {
		return defaultGlobalSettings(), nil
	}
	fillGlobalDefaults(&s)
	return &s, nil
}

// SaveGlobalSettings writes the global dash settings to disk.
func SaveGlobalSettings(s *GlobalDashSettings) error {
	if err := os.MkdirAll(appdata.Dir(), 0o755); err != nil {
		return fmt.Errorf("dash: mkdir global settings: %w", err)
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("dash: marshal global settings: %w", err)
	}
	if err := os.WriteFile(globalSettingsPath(), data, 0o644); err != nil {
		return fmt.Errorf("dash: write global settings: %w", err)
	}
	return nil
}

// defaultGlobalSettings returns a GlobalDashSettings pre-filled with the
// compile-time defaults from the widgets package.
func defaultGlobalSettings() *GlobalDashSettings {
	return &GlobalDashSettings{
		Theme:             widgets.DefaultTheme(),
		DomainPalette:     widgets.DefaultDomainPalette(),
		FormatPreferences: widgets.DefaultFormatPreferences(),
	}
}

// fillGlobalDefaults fills zero-value fields with the compile-time defaults.
// This ensures partial JSON files still yield a fully-populated struct without
// overwriting intentional customisations.
func fillGlobalDefaults(s *GlobalDashSettings) {
	zero := widgets.DashTheme{}
	if s.Theme == zero {
		s.Theme = widgets.DefaultTheme()
	}
	zeroFP := widgets.FormatPreferences{}
	if s.FormatPreferences == zeroFP {
		s.FormatPreferences = widgets.DefaultFormatPreferences()
	}
}
