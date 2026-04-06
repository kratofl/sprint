package dashboard

import (
	"os"
	"path/filepath"
	"testing"
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
