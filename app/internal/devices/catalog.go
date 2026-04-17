package devices

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
)

// CatalogEntry describes a known device configuration that users can add to
// their registry. Generic entries (VID=0, PID=0) trigger a USB scan for the
// first unregistered device of the given driver type.
type CatalogEntry struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        DeviceType      `json:"type"`
	VID         uint16          `json:"vid"`
	PID         uint16          `json:"pid"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	Rotation    int             `json:"rotation"`
	OffsetX     int             `json:"offset_x,omitempty"`
	OffsetY     int             `json:"offset_y,omitempty"`
	Margin      int             `json:"margin,omitempty"`
	Driver      DriverType      `json:"driver"`
	Purpose     DevicePurpose   `json:"purpose,omitempty"`
	Bindings    []DeviceBinding `json:"bindings,omitempty"`
}

// IsGeneric reports whether this entry requires a USB scan to resolve the
// physical device (VID and PID are both zero).
func (e *CatalogEntry) IsGeneric() bool {
	return e.VID == 0 && e.PID == 0
}

// ToSavedDevice converts a catalog entry into a SavedDevice ready to add to
// the registry. name overrides the catalog name if non-empty.
func (e *CatalogEntry) ToSavedDevice(name string) SavedDevice {
	if name == "" {
		name = e.Name
	}
	return SavedDevice{
		VID:      e.VID,
		PID:      e.PID,
		Type:     e.Type,
		Width:    e.Width,
		Height:   e.Height,
		Name:     name,
		Rotation: e.Rotation,
		OffsetX:  e.OffsetX,
		OffsetY:  e.OffsetY,
		Margin:   e.Margin,
		Driver:   e.Driver,
		Purpose:  e.Purpose,
		Bindings: append([]DeviceBinding(nil), e.Bindings...),
	}
}

// presetsFS is the embedded presets/devices sub-tree injected from package main.
var presetsFS fs.FS

// InitPresets sets the embedded fallback FS for the catalog.
// Call this in Startup() with fs.Sub(PresetsFS, "presets/devices").
func InitPresets(fsys fs.FS) {
	presetsFS = fsys
	catalogEntries = loadCatalog()
}

var catalogEntries []CatalogEntry

// loadCatalog loads catalog entries. Tries <exe_dir>/DeviceCatalog/*.json first;
// falls back to the injected embedded FS.
func loadCatalog() []CatalogEntry {
	if dir := filepath.Join(appdata.ExeDir(), "DeviceCatalog"); appdata.ExeDir() != "" {
		if entries, err := loadCatalogFromDir(dir); err == nil && len(entries) > 0 {
			return entries
		}
	}
	if presetsFS != nil {
		if entries, err := loadCatalogFromFS(presetsFS); err == nil {
			return entries
		}
	}
	return nil
}

func loadCatalogFromDir(dir string) ([]CatalogEntry, error) {
	pattern := filepath.Join(dir, "*.json")
	files, err := filepath.Glob(pattern)
	if err != nil || len(files) == 0 {
		return nil, err
	}
	var entries []CatalogEntry
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var e CatalogEntry
		if err := json.Unmarshal(data, &e); err != nil || e.ID == "" {
			continue
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func loadCatalogFromFS(fsys fs.FS) ([]CatalogEntry, error) {
	matches, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return nil, err
	}
	var entries []CatalogEntry
	for _, name := range matches {
		data, err := fs.ReadFile(fsys, name)
		if err != nil {
			continue
		}
		var e CatalogEntry
		if err := json.Unmarshal(data, &e); err != nil || e.ID == "" {
			continue
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// Catalog returns all entries in the device catalog.
func Catalog() []CatalogEntry {
	return catalogEntries
}

// CatalogByID returns the catalog entry with the given ID, or false if not found.
func CatalogByID(id string) (CatalogEntry, bool) {
	for _, e := range catalogEntries {
		if e.ID == id {
			return e, true
		}
	}
	return CatalogEntry{}, false
}
