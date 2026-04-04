package dashboard

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateLayoutFormat(t *testing.T) {
	t.Run("old-format is converted", func(t *testing.T) {
		oldJSON := `{"id":"abc","name":"Legacy","widgets":[{"x":40,"y":80,"w":160,"h":40,"type":"speed","id":"w1"}]}`
		layout, err := migrateLayoutFormat([]byte(oldJSON), "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(layout.Pages) == 0 {
			t.Fatal("expected at least one page")
		}
		w := layout.Pages[0].Widgets[0]
		if w.Col != 1 {
			t.Errorf("expected Col=1, got %d", w.Col)
		}
		if w.Row != 2 {
			t.Errorf("expected Row=2, got %d", w.Row)
		}
		if w.ColSpan != 4 {
			t.Errorf("expected ColSpan=4, got %d", w.ColSpan)
		}
		if w.RowSpan != 1 {
			t.Errorf("expected RowSpan=1, got %d", w.RowSpan)
		}
	})

	t.Run("new-format passes through unchanged", func(t *testing.T) {
		newLayout := &DashLayout{
			ID:       "new",
			Name:     "New",
			GridCols: DefaultGridCols,
			GridRows: DefaultGridRows,
			Pages:    []DashPage{NewPage("Main")},
		}
		data, _ := json.Marshal(newLayout)
		got, err := migrateLayoutFormat(data, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.ID != "new" {
			t.Errorf("expected id=new, got %s", got.ID)
		}
	})
}

func TestManagerLoadMigratesFile(t *testing.T) {
	dir := t.TempDir()
	m := &Manager{
		dir:     filepath.Join(dir, "layouts"),
		oldPath: filepath.Join(dir, "nope.json"),
	}

	oldJSON := `{"id":"migrated-id","name":"Migrated","widgets":[{"x":40,"y":80,"w":160,"h":40,"type":"speed","id":"xxx"}]}`
	id := "test-layout"
	if err := os.MkdirAll(m.dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(m.dir, id+".json"), []byte(oldJSON), 0644); err != nil {
		t.Fatal(err)
	}

	layout, err := m.Load(id)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if len(layout.Pages) == 0 || len(layout.Pages[0].Widgets) == 0 {
		t.Fatal("expected migrated layout with widgets")
	}
	w := layout.Pages[0].Widgets[0]
	if w.Col != 1 {
		t.Errorf("Col: want 1, got %d", w.Col)
	}
	if w.Row != 2 {
		t.Errorf("Row: want 2, got %d", w.Row)
	}
	if w.ColSpan != 4 {
		t.Errorf("ColSpan: want 4, got %d", w.ColSpan)
	}
	if w.RowSpan != 1 {
		t.Errorf("RowSpan: want 1, got %d", w.RowSpan)
	}
}

func TestDeleteDefaultLayout(t *testing.T) {
	dir := t.TempDir()
	m := &Manager{
		dir:     filepath.Join(dir, "layouts"),
		oldPath: filepath.Join(dir, "nope.json"),
	}

	defaultLayout := &DashLayout{
		ID:       "default-layout",
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
}

func TestPixelToGrid(t *testing.T) {
	cases := []struct{ px, want int }{
		{0, 0},
		{40, 1},
		{80, 2},
		{160, 4},
		{20, 1},   // rounds up from 0.5
		{19, 0},   // rounds down
		{200, 5},
	}
	for _, c := range cases {
		got := pixelToGrid(c.px)
		if got != c.want {
			t.Errorf("pixelToGrid(%d) = %d, want %d", c.px, got, c.want)
		}
	}
}
