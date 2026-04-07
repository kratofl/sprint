package lemansultimate

import "testing"

func TestMapToDTOInCarGarageStall(t *testing.T) {
	a := New()

	telem := &lmuVehicleTelemetry{}
	scoInfo := &lmuScoringInfo{}

	t.Run("in garage stall → InCar false", func(t *testing.T) {
		scoring := &lmuVehicleScoring{MInGarageStall: true}
		frame := a.mapToDTO(telem, scoring, scoInfo)
		if frame.Session.InCar {
			t.Error("expected InCar=false when MInGarageStall=true, got true")
		}
	})

	t.Run("not in garage stall → InCar true", func(t *testing.T) {
		scoring := &lmuVehicleScoring{MInGarageStall: false}
		frame := a.mapToDTO(telem, scoring, scoInfo)
		if !frame.Session.InCar {
			t.Error("expected InCar=true when MInGarageStall=false, got false")
		}
	})
}
