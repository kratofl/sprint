package dashboard

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/kratofl/sprint/app/internal/dashboard/alerts"
)

func TestDeleteDefaultLayout(t *testing.T) {
	dir := t.TempDir()
	m := &Manager{
		dir: filepath.Join(dir, "layouts"),
	}

	defaultLayout := &DashLayout{
		ID:       EmbeddedDefaultID,
		Name:     "Default",
		Default:  true,
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		Pages:    []DashPage{NewPage("Main")},
	}
	if err := m.Save(defaultLayout); err != nil {
		t.Fatalf("Save default layout: %v", err)
	}

	if err := m.Delete(defaultLayout.ID); err == nil {
		t.Fatal("expected error deleting default layout, got nil")
	}

	nonDefault := &DashLayout{
		ID:       "non-default-layout",
		Name:     "Other",
		Default:  false,
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		Pages:    []DashPage{NewPage("Main")},
	}
	if err := m.Save(nonDefault); err != nil {
		t.Fatalf("Save non-default layout: %v", err)
	}
	if err := m.Delete(nonDefault.ID); err != nil {
		t.Fatalf("Delete non-default layout: %v", err)
	}

	// The entire layout directory must be gone after delete.
	if _, err := os.Stat(m.layoutDir(nonDefault.ID)); !os.IsNotExist(err) {
		t.Errorf("expected layout directory to be removed after delete, got: %v", err)
	}
}

func TestCreateUsesCompactLayoutAndPageIDs(t *testing.T) {
	m := &Manager{
		dir: filepath.Join(t.TempDir(), "layouts"),
	}

	layout, err := m.Create("Test")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if !strings.HasPrefix(layout.ID, "lay_") {
		t.Fatalf("expected compact layout id with lay_ prefix, got %q", layout.ID)
	}
	if strings.Contains(layout.ID, "-") {
		t.Fatalf("expected compact layout id without UUID hyphens, got %q", layout.ID)
	}
	if !strings.HasPrefix(layout.IdlePage.ID, "page_") {
		t.Fatalf("expected compact idle page id, got %q", layout.IdlePage.ID)
	}
	if got := layout.Pages[0].ID; !strings.HasPrefix(got, "page_") {
		t.Fatalf("expected compact main page id, got %q", got)
	}
}

func TestDefaultLayoutPresetIncludesExpectedAlerts(t *testing.T) {
	m := &Manager{
		dir:       filepath.Join(t.TempDir(), "layouts"),
		presetsFS: testDashPresetFS(t),
	}

	layout, err := m.defaultLayout()
	if err != nil {
		t.Fatalf("defaultLayout: %v", err)
	}

	if err := ValidateLayout(layout); err != nil {
		t.Fatalf("ValidateLayout(default preset): %v", err)
	}
	if layout.IdlePage.ID == "" {
		t.Fatal("expected idle page to exist")
	}

	if got, want := len(layout.Alerts), 3; got != want {
		t.Fatalf("expected %d default alerts, got %d", want, got)
	}

	wantTypes := []alerts.AlertType{
		alerts.AlertTypeTC,
		alerts.AlertTypeABS,
		alerts.AlertTypeEngineMap,
	}
	for i, want := range wantTypes {
		if got := layout.Alerts[i].Type; got != want {
			t.Fatalf("alert %d: expected type %q, got %q", i, want, got)
		}
	}

	if got := layout.IdlePage.Widgets; len(got) < 2 {
		t.Fatalf("expected idle page profile widgets, got %d widgets", len(got))
	} else {
		nameBinding, _ := got[0].Config["binding"].(string)
		numberBinding, _ := got[1].Config["binding"].(string)
		if nameBinding != "profile.driverName" {
			t.Fatalf("expected idle name binding %q, got %q", "profile.driverName", nameBinding)
		}
		if numberBinding != "profile.driverNumber" {
			t.Fatalf("expected idle number binding %q, got %q", "profile.driverNumber", numberBinding)
		}
	}
}

func testDashPresetFS(t *testing.T) fs.FS {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return os.DirFS(filepath.Join(filepath.Dir(file), "..", "..", "presets", "dash"))
}
