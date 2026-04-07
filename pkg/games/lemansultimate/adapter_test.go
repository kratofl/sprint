package lemansultimate

import "testing"

// TestMapToDTOInCarAlwaysTrue verifies that mapToDTO always produces InCar=true.
// mapToDTO is only reached when playerHasVehicle=true (player assigned & on track).
// The not-in-car path is handled upstream by sessionOnlyFrame (InCar zero value =
// false), so mapToDTO never needs to set InCar=false itself.
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
// This is the path taken when playerHasVehicle=false (garage / pre-session menu).
func TestSessionOnlyFrameInCarFalse(t *testing.T) {
	a := New()
	frame := a.sessionOnlyFrame(&lmuScoringInfo{})
	if frame.Session.InCar {
		t.Error("sessionOnlyFrame: expected InCar=false, got true")
	}
}
