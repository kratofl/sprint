package devices

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestCatalogByIDPrefersLiveSourcePresetAndReloadsChanges(t *testing.T) {
	prevLookupExeDir := lookupExeDir
	prevPresetsFS := presetsFS
	prevCatalogEntries := catalogEntries
	t.Cleanup(func() {
		lookupExeDir = prevLookupExeDir
		presetsFS = prevPresetsFS
		catalogEntries = prevCatalogEntries
	})

	root := t.TempDir()
	exeDir := filepath.Join(root, "app", "build", "bin")
	sourceDir := filepath.Join(root, "app", "presets", "devices")
	overrideDir := filepath.Join(exeDir, "DeviceCatalog")
	for _, dir := range []string{exeDir, sourceDir, overrideDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	const id = "bavarian-omega-v2-pro"
	const fileName = "bavarian-omega-v2-pro.json"

	writeCatalogFile(t, overrideDir, fileName, id, 5, 5, 0)
	writeCatalogFile(t, sourceDir, fileName, id, 0, 0, 5)

	lookupExeDir = func() string { return exeDir }
	InitPresets(fstest.MapFS{
		fileName: &fstest.MapFile{
			Data: []byte(catalogJSON(id, 9, 9, 9)),
		},
	})

	entry, ok := CatalogByID(id)
	if !ok {
		t.Fatalf("catalog entry %q not found", id)
	}
	if entry.OffsetX != 0 || entry.OffsetY != 0 || entry.Margin != 5 {
		t.Fatalf("expected live source preset, got offset_x=%d offset_y=%d margin=%d", entry.OffsetX, entry.OffsetY, entry.Margin)
	}

	writeCatalogFile(t, sourceDir, fileName, id, 11, 12, 13)

	entry, ok = CatalogByID(id)
	if !ok {
		t.Fatalf("catalog entry %q missing after update", id)
	}
	if entry.OffsetX != 11 || entry.OffsetY != 12 || entry.Margin != 13 {
		t.Fatalf("expected updated source preset, got offset_x=%d offset_y=%d margin=%d", entry.OffsetX, entry.OffsetY, entry.Margin)
	}
}

func writeCatalogFile(t *testing.T, dir, fileName, id string, offsetX, offsetY, margin int) {
	t.Helper()
	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, []byte(catalogJSON(id, offsetX, offsetY, margin)), 0644); err != nil {
		t.Fatalf("write catalog %s: %v", path, err)
	}
}

func catalogJSON(id string, offsetX, offsetY, margin int) string {
	return fmt.Sprintf(`{
  "id": %q,
  "name": "BavarianSimTec Omega PRO V2",
  "description": "Integrated wheel with VoCore screen and button inputs",
  "type": "wheel",
  "vid": 51314,
  "pid": 4100,
  "width": 800,
  "height": 480,
  "rotation": 90,
  "offset_x": %d,
  "offset_y": %d,
  "margin": %d,
  "driver": "vocore",
  "bindings": []
}`, id, offsetX, offsetY, margin)
}
