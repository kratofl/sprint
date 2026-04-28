package settings

import "testing"

func TestSaveAndLoadRoundTripsDriverProfile(t *testing.T) {
	original, _ := Load()
	if original != nil {
		t.Cleanup(func() {
			_ = Save(original)
		})
	}

	want := &Settings{
		UpdateChannel: "stable",
		DriverName:    "Alice Example",
		DriverNumber:  "#22",
		DashEditorUI: DashEditorUIPreferences{
			Palette: DashEditorPanelPreferences{
				Open:   true,
				Pinned: false,
			},
			Inspector: DashEditorPanelPreferences{
				Open:   false,
				Pinned: true,
			},
		},
	}
	if err := Save(want); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.DriverName != want.DriverName {
		t.Fatalf("expected driver name %q, got %q", want.DriverName, got.DriverName)
	}
	if got.DriverNumber != want.DriverNumber {
		t.Fatalf("expected driver number %q, got %q", want.DriverNumber, got.DriverNumber)
	}
	if got.DashEditorUI.Palette != want.DashEditorUI.Palette {
		t.Fatalf("expected palette prefs %+v, got %+v", want.DashEditorUI.Palette, got.DashEditorUI.Palette)
	}
	if got.DashEditorUI.Inspector != want.DashEditorUI.Inspector {
		t.Fatalf("expected inspector prefs %+v, got %+v", want.DashEditorUI.Inspector, got.DashEditorUI.Inspector)
	}
}
