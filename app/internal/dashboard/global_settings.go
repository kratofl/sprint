package dashboard

import (
	"encoding/json"
	"fmt"
	"image/color"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

// GlobalDashSettings holds the global default color palette and format
// preferences applied to every newly created dash layout. Users can override
// these per-dash in the editor.
type GlobalDashSettings struct {
	Theme             widgets.DashTheme          `json:"theme"`
	DomainPalette     widgets.DomainPalette      `json:"domainPalette"`
	Typography        widgets.TypographySettings `json:"typography,omitempty"`
	FormatPreferences widgets.FormatPreferences  `json:"formatPreferences"`
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
	switch {
	case s.Theme == zero:
		s.Theme = widgets.DefaultTheme()
	case s.Theme == legacyDefaultTheme():
		s.Theme = widgets.DefaultTheme()
	default:
		s.Theme = widgets.MergeTheme(widgets.DefaultTheme(), s.Theme)
	}
	s.DomainPalette = widgets.MergeDomainPalette(widgets.DefaultDomainPalette(), s.DomainPalette)
	zeroFP := widgets.FormatPreferences{}
	if s.FormatPreferences == zeroFP {
		s.FormatPreferences = widgets.DefaultFormatPreferences()
	}
}

func legacyDefaultTheme() widgets.DashTheme {
	return widgets.DashTheme{
		Primary: color.RGBA{R: 255, G: 139, B: 97, A: 255},
		Accent:  color.RGBA{R: 121, G: 214, B: 230, A: 255},
		Fg:      color.RGBA{R: 245, G: 247, B: 250, A: 255},
		Muted:   color.RGBA{R: 139, G: 147, B: 161, A: 255},
		Muted2:  color.RGBA{R: 183, G: 191, B: 202, A: 255},
		Success: color.RGBA{R: 79, G: 209, B: 155, A: 255},
		Warning: color.RGBA{R: 242, G: 184, B: 75, A: 255},
		Danger:  color.RGBA{R: 240, G: 125, B: 125, A: 255},
		Surface: color.RGBA{R: 21, G: 23, B: 28, A: 255},
		Bg:      color.RGBA{R: 9, G: 10, B: 12, A: 255},
		Border:  color.RGBA{R: 45, G: 49, B: 56, A: 255},
		RPMRed:  color.RGBA{R: 230, G: 74, B: 74, A: 255},
	}
}
