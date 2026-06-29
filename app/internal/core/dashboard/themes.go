package dashboard

import (
	"encoding/json"
	"fmt"
	"image/color"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
)

// ThemePreset is a named, reusable dashboard theme: a full colour palette
// (semantic + domain) plus typography defaults. Dashboards reference a preset by
// ID (DashLayout.ThemeID); the painter resolves the reference at render time so a
// theme edit reflects everywhere it is used (by-reference, never copied/overwritten).
type ThemePreset struct {
	ID            string                     `json:"id"`
	Name          string                     `json:"name"`
	BuiltIn       bool                       `json:"builtIn"`
	Theme         widgets.DashTheme          `json:"theme"`
	DomainPalette widgets.DomainPalette      `json:"domainPalette"`
	Typography    widgets.TypographySettings `json:"typography,omitempty"`
}

// domainFromTheme derives a cohesive domain palette from a theme's semantic
// colours, matching DefaultDomainPalette's mapping but tracking the theme.
func domainFromTheme(t widgets.DashTheme) widgets.DomainPalette {
	return widgets.DomainPalette{
		ABS:       t.Warning,
		TC:        t.Accent,
		BrakeBias: t.Warning,
		Energy:    t.Success,
		Motor:     t.Primary,
		BrakeMig:  t.Accent,
	}
}

func builtinPreset(id, name string, theme widgets.DashTheme) ThemePreset {
	return ThemePreset{
		ID:            id,
		Name:          name,
		BuiltIn:       true,
		Theme:         theme,
		DomainPalette: domainFromTheme(theme),
	}
}

// BuiltinThemePresets returns the predefined, read-only themes shipped with the
// app. They can be applied or duplicated, but never edited or deleted.
func BuiltinThemePresets() []ThemePreset {
	return []ThemePreset{
		// Sprint — the flat Figma default (matches the global compile-time theme).
		builtinPreset("sprint", "Sprint", widgets.DefaultTheme()),

		// Ice — cool blues and cyan on a blue-black canvas.
		builtinPreset("ice", "Ice", widgets.DashTheme{
			Primary: color.RGBA{90, 200, 255, 255},
			Accent:  color.RGBA{120, 230, 235, 255},
			Fg:      color.RGBA{235, 244, 250, 255},
			Muted:   color.RGBA{140, 160, 180, 255},
			Muted2:  color.RGBA{180, 198, 214, 255},
			Success: color.RGBA{52, 211, 153, 255},
			Warning: color.RGBA{251, 191, 36, 255},
			Danger:  color.RGBA{255, 99, 99, 255},
			Surface: color.RGBA{16, 20, 26, 255},
			Bg:      color.RGBA{8, 11, 16, 255},
			Border:  color.RGBA{64, 86, 110, 255},
			RPMRed:  color.RGBA{255, 80, 80, 255},
		}),

		// Mono — monochrome surfaces/text; alert colours kept legible.
		builtinPreset("mono", "Mono", widgets.DashTheme{
			Primary: color.RGBA{245, 245, 245, 255},
			Accent:  color.RGBA{180, 180, 180, 255},
			Fg:      color.RGBA{250, 250, 250, 255},
			Muted:   color.RGBA{140, 140, 140, 255},
			Muted2:  color.RGBA{195, 195, 195, 255},
			Success: color.RGBA{120, 200, 140, 255},
			Warning: color.RGBA{230, 190, 90, 255},
			Danger:  color.RGBA{235, 90, 90, 255},
			Surface: color.RGBA{20, 20, 20, 255},
			Bg:      color.RGBA{8, 8, 8, 255},
			Border:  color.RGBA{92, 92, 92, 255},
			RPMRed:  color.RGBA{235, 90, 90, 255},
		}),

		// Le Mans — endurance green with amber highlights.
		builtinPreset("lemans", "Le Mans", widgets.DashTheme{
			Primary: color.RGBA{126, 217, 87, 255},
			Accent:  color.RGBA{255, 196, 0, 255},
			Fg:      color.RGBA{240, 244, 235, 255},
			Muted:   color.RGBA{150, 160, 145, 255},
			Muted2:  color.RGBA{190, 198, 182, 255},
			Success: color.RGBA{52, 211, 153, 255},
			Warning: color.RGBA{251, 191, 36, 255},
			Danger:  color.RGBA{255, 80, 70, 255},
			Surface: color.RGBA{16, 20, 15, 255},
			Bg:      color.RGBA{8, 11, 7, 255},
			Border:  color.RGBA{78, 92, 70, 255},
			RPMRed:  color.RGBA{255, 70, 60, 255},
		}),

		// Crimson — aggressive red on near-black with white accents.
		builtinPreset("crimson", "Crimson", widgets.DashTheme{
			Primary: color.RGBA{255, 70, 70, 255},
			Accent:  color.RGBA{245, 245, 245, 255},
			Fg:      color.RGBA{248, 240, 240, 255},
			Muted:   color.RGBA{170, 150, 150, 255},
			Muted2:  color.RGBA{205, 188, 188, 255},
			Success: color.RGBA{52, 211, 153, 255},
			Warning: color.RGBA{251, 191, 36, 255},
			Danger:  color.RGBA{255, 59, 48, 255},
			Surface: color.RGBA{22, 16, 16, 255},
			Bg:      color.RGBA{12, 8, 8, 255},
			Border:  color.RGBA{110, 80, 80, 255},
			RPMRed:  color.RGBA{255, 59, 48, 255},
		}),

		// High Contrast — pure black canvas, bright colours, strong borders.
		builtinPreset("contrast", "High Contrast", widgets.DashTheme{
			Primary: color.RGBA{255, 138, 0, 255},
			Accent:  color.RGBA{0, 200, 255, 255},
			Fg:      color.RGBA{255, 255, 255, 255},
			Muted:   color.RGBA{200, 200, 200, 255},
			Muted2:  color.RGBA{230, 230, 230, 255},
			Success: color.RGBA{0, 230, 118, 255},
			Warning: color.RGBA{255, 214, 0, 255},
			Danger:  color.RGBA{255, 45, 45, 255},
			Surface: color.RGBA{18, 18, 18, 255},
			Bg:      color.RGBA{0, 0, 0, 255},
			Border:  color.RGBA{180, 180, 180, 255},
			RPMRed:  color.RGBA{255, 45, 45, 255},
		}),
	}
}

// isBuiltinThemeID reports whether id belongs to a shipped, read-only preset.
func isBuiltinThemeID(id string) bool {
	for _, p := range BuiltinThemePresets() {
		if p.ID == id {
			return true
		}
	}
	return false
}

// themesPath returns the path to the user theme library file.
func themesPath() string {
	return filepath.Join(appdata.Dir(), "dash_themes.json")
}

// LoadUserThemes reads the user-created theme presets from disk.
// Returns nil (no error) when the file is missing or unparseable.
func LoadUserThemes() ([]ThemePreset, error) {
	data, err := os.ReadFile(themesPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("dash: read themes: %w", err)
	}
	var themes []ThemePreset
	if err := json.Unmarshal(data, &themes); err != nil {
		return nil, nil // tolerate a corrupt file rather than wiping the library
	}
	for i := range themes {
		themes[i].BuiltIn = false // never trust a persisted built-in flag
	}
	return themes, nil
}

// SaveUserThemes writes the user theme presets to disk.
func SaveUserThemes(themes []ThemePreset) error {
	if err := os.MkdirAll(appdata.Dir(), 0o755); err != nil {
		return fmt.Errorf("dash: mkdir themes: %w", err)
	}
	data, err := json.MarshalIndent(themes, "", "  ")
	if err != nil {
		return fmt.Errorf("dash: marshal themes: %w", err)
	}
	if err := os.WriteFile(themesPath(), data, 0o644); err != nil {
		return fmt.Errorf("dash: write themes: %w", err)
	}
	return nil
}

// ListThemes returns the full library: built-in presets followed by user presets.
func ListThemes() ([]ThemePreset, error) {
	user, err := LoadUserThemes()
	if err != nil {
		return nil, err
	}
	out := BuiltinThemePresets()
	return append(out, user...), nil
}

// SaveTheme creates (empty ID) or updates a user theme preset and returns the
// persisted value. Built-in presets cannot be modified — duplicate them instead.
func SaveTheme(p ThemePreset) (*ThemePreset, error) {
	if isBuiltinThemeID(p.ID) {
		return nil, fmt.Errorf("dash: cannot modify built-in theme %q", p.ID)
	}
	p.BuiltIn = false
	if p.Name == "" {
		p.Name = "Untitled theme"
	}
	user, err := LoadUserThemes()
	if err != nil {
		return nil, err
	}
	if p.ID == "" {
		p.ID = newDashID("theme")
		user = append(user, p)
	} else {
		found := false
		for i := range user {
			if user[i].ID == p.ID {
				user[i] = p
				found = true
				break
			}
		}
		if !found {
			user = append(user, p)
		}
	}
	if err := SaveUserThemes(user); err != nil {
		return nil, err
	}
	return &p, nil
}

// DeleteTheme removes a user theme preset. Built-in presets cannot be deleted.
func DeleteTheme(id string) error {
	if isBuiltinThemeID(id) {
		return fmt.Errorf("dash: cannot delete built-in theme %q", id)
	}
	user, err := LoadUserThemes()
	if err != nil {
		return err
	}
	out := make([]ThemePreset, 0, len(user))
	for _, p := range user {
		if p.ID != id {
			out = append(out, p)
		}
	}
	return SaveUserThemes(out)
}

// ThemeLibrary maps theme IDs to presets. Painters hold an immutable snapshot
// and use it to resolve DashLayout.ThemeID references at render time.
type ThemeLibrary map[string]ThemePreset

// BuildThemeLibrary loads the full library into an ID-keyed snapshot.
// On error it falls back to the built-in presets so rendering always works.
func BuildThemeLibrary() ThemeLibrary {
	themes, err := ListThemes()
	if err != nil {
		themes = BuiltinThemePresets()
	}
	lib := make(ThemeLibrary, len(themes))
	for _, p := range themes {
		lib[p.ID] = p
	}
	return lib
}

// Get resolves a theme by ID. Returns ok=false for empty IDs or unknown themes.
func (l ThemeLibrary) Get(id string) (ThemePreset, bool) {
	if l == nil || id == "" {
		return ThemePreset{}, false
	}
	p, ok := l[id]
	return p, ok
}
