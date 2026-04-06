package devices

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed catalog.json
var catalogJSON []byte

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
	Driver      DriverType      `json:"driver"`
	Bindings    []DeviceBinding `json:"bindings"`
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
		Driver:   e.Driver,
		Bindings: append([]DeviceBinding(nil), e.Bindings...),
	}
}

var catalogEntries []CatalogEntry

func init() {
	if err := json.Unmarshal(catalogJSON, &catalogEntries); err != nil {
		panic(fmt.Sprintf("devices: failed to parse embedded catalog: %v", err))
	}
}

// Catalog returns all entries in the embedded device catalog.
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
