package lemansultimate

import "testing"

// TestMapToDTOInCarAlwaysTrue verifies that mapToDTO always produces InCar=true.
// mapToDTO is only reached when playerInCar returns true (player assigned & in
// realtime). The not-in-car path is handled upstream by sessionOnlyFrame
// (InCar zero value = false), so mapToDTO never needs to set InCar=false itself.
func TestMapToDTOInCarAlwaysTrue(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{}
	scoInfo := &lmuScoringInfo{}

	for _, garageStall := range []bool{false, true} {
		scoring := &lmuVehicleScoring{MInGarageStall: garageStall}
		frame := a.mapToDTO(telem, scoring, scoInfo)
		if !frame.Session.InCar {
			t.Errorf("mapToDTO: expected InCar=true (garageStall=%v), got false", garageStall)
		}
	}
}

// TestSessionOnlyFrameInCarFalse verifies that sessionOnlyFrame returns InCar=false.
// This is the path taken when playerInCar returns false.
func TestSessionOnlyFrameInCarFalse(t *testing.T) {
	a := New()
	frame := a.sessionOnlyFrame(&lmuScoringInfo{})
	if frame.Session.InCar {
		t.Error("sessionOnlyFrame: expected InCar=false, got true")
	}
}

// TestPlayerInCar verifies the gate that decides whether to decode full telemetry.
// The key case is when playerHasVehicle is stale (true) but MInRealtime is false —
// this happens when the player exits a session and LMU does not flush the SHM byte.
func TestPlayerInCar(t *testing.T) {
	tests := []struct {
		name             string
		playerHasVehicle bool
		mInRealtime      bool
		want             bool
	}{
		{"driving", true, true, true},
		{"garage (both false)", false, false, false},
		{"stale vehicle byte after session exit", true, false, false},
		{"inRealtime but no vehicle assigned", false, true, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			si := &lmuScoringInfo{MInRealtime: tc.mInRealtime}
			if got := playerInCar(tc.playerHasVehicle, si); got != tc.want {
				t.Errorf("playerInCar(%v, MInRealtime=%v) = %v, want %v",
					tc.playerHasVehicle, tc.mInRealtime, got, tc.want)
			}
		})
	}
}
