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
}
