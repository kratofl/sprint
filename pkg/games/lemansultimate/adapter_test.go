package lemansultimate

import (
	"math"
	"testing"
)

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

func TestMapToDTOCurrentLapTimeUsesScoringTimeIntoLap(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MElapsedTime: 5,
		MLapStartET:  10, // would be negative if telemetry-based timing was used
		MLapNumber:   3,
	}
	scoring := &lmuVehicleScoring{MTimeIntoLap: 12.345}
	frame := a.mapToDTO(telem, scoring, &lmuScoringInfo{})

	if math.Abs(frame.Lap.CurrentLapTime-12.345) > 1e-9 {
		t.Fatalf("CurrentLapTime = %.6f, want %.6f", frame.Lap.CurrentLapTime, 12.345)
	}
}

func TestMapToDTOCurrentLapTimePrefersTelemetryWhenAvailable(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MElapsedTime: 100,
		MLapStartET:  90,
		MLapNumber:   4,
	}
	scoring := &lmuVehicleScoring{MTimeIntoLap: 9.25}
	frame := a.mapToDTO(telem, scoring, &lmuScoringInfo{})

	if math.Abs(frame.Lap.CurrentLapTime-10.0) > 1e-9 {
		t.Fatalf("CurrentLapTime = %.6f, want %.6f", frame.Lap.CurrentLapTime, 10.0)
	}
}

func TestMapToDTOPositionLapTimeUsesScoringTimeIntoLap(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MElapsedTime: 100,
		MLapStartET:  90,
		MLapNumber:   4,
	}
	scoring := &lmuVehicleScoring{MTimeIntoLap: 9.25}
	frame := a.mapToDTO(telem, scoring, &lmuScoringInfo{})

	if math.Abs(frame.Lap.PositionLapTime-9.25) > 1e-9 {
		t.Fatalf("PositionLapTime = %.6f, want %.6f", frame.Lap.PositionLapTime, 9.25)
	}
	if math.Abs(frame.Lap.CurrentLapTime-10.0) > 1e-9 {
		t.Fatalf("CurrentLapTime = %.6f, want %.6f", frame.Lap.CurrentLapTime, 10.0)
	}
}

func TestMapToDTOCurrentLapTimeMonotonicWithinLap(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{MLapNumber: 7}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 100}

	first := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.5}, si)
	si.MCurrentET = 101
	second := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 11.2}, si)
	si.MCurrentET = 102
	third := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 13.8}, si)

	if first.Lap.CurrentLapTime != 12.5 {
		t.Fatalf("first CurrentLapTime = %.6f, want %.6f", first.Lap.CurrentLapTime, 12.5)
	}
	if second.Lap.CurrentLapTime != 12.5 {
		t.Fatalf("second CurrentLapTime = %.6f, want %.6f", second.Lap.CurrentLapTime, 12.5)
	}
	if third.Lap.CurrentLapTime != 13.8 {
		t.Fatalf("third CurrentLapTime = %.6f, want %.6f", third.Lap.CurrentLapTime, 13.8)
	}
}

func TestMapToDTOCurrentLapTimeStationaryTelemetryFallback(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   7,
		MElapsedTime: 200.0,
		MLapStartET:  188.0,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 200.0}

	first := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.0}, si)
	telem.MElapsedTime = 201.5
	si.MCurrentET = 201.5
	second := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.0}, si)

	if math.Abs(first.Lap.CurrentLapTime-12.0) > 1e-9 {
		t.Fatalf("first CurrentLapTime = %.6f, want %.6f", first.Lap.CurrentLapTime, 12.0)
	}
	if math.Abs(second.Lap.CurrentLapTime-13.5) > 1e-9 {
		t.Fatalf("second CurrentLapTime = %.6f, want %.6f", second.Lap.CurrentLapTime, 13.5)
	}
}

func TestMapToDTOCurrentLapTimeUsesSmoothTelemetryAcrossSteppedScoring(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   7,
		MElapsedTime: 200.100,
		MLapStartET:  188.000,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 200.100}

	first := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.0}, si)
	telem.MElapsedTime = 200.450
	si.MCurrentET = 200.450
	second := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.0}, si)
	telem.MElapsedTime = 200.800
	si.MCurrentET = 200.800
	third := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.5}, si)

	if math.Abs(first.Lap.CurrentLapTime-12.1) > 1e-9 {
		t.Fatalf("first CurrentLapTime = %.6f, want %.6f", first.Lap.CurrentLapTime, 12.1)
	}
	if math.Abs(second.Lap.CurrentLapTime-12.45) > 1e-9 {
		t.Fatalf("second CurrentLapTime = %.6f, want %.6f", second.Lap.CurrentLapTime, 12.45)
	}
	if math.Abs(third.Lap.CurrentLapTime-12.8) > 1e-9 {
		t.Fatalf("third CurrentLapTime = %.6f, want %.6f", third.Lap.CurrentLapTime, 12.8)
	}
}

func TestMapToDTOCurrentLapTimeNeverGoesBackward(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   4,
		MElapsedTime: 120.0,
		MLapStartET:  100.0,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 120.0}

	first := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 20.0}, si)
	telem.MElapsedTime = 119.0
	si.MCurrentET = 121.0
	second := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 18.0}, si)

	if math.Abs(first.Lap.CurrentLapTime-20.0) > 1e-9 {
		t.Fatalf("first CurrentLapTime = %.6f, want %.6f", first.Lap.CurrentLapTime, 20.0)
	}
	if math.Abs(second.Lap.CurrentLapTime-20.0) > 1e-9 {
		t.Fatalf("second CurrentLapTime = %.6f, want %.6f", second.Lap.CurrentLapTime, 20.0)
	}
}

func TestMapToDTOCurrentLapTimeResetsOnLapIncrement(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{MLapNumber: 3}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 400}

	prevLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 80}, si)
	telem.MLapNumber = 4
	si.MCurrentET = 401
	newLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 1.25}, si)

	if prevLap.Lap.CurrentLapTime != 80 {
		t.Fatalf("previous lap CurrentLapTime = %.6f, want %.6f", prevLap.Lap.CurrentLapTime, 80.0)
	}
	if newLap.Lap.CurrentLapTime != 1.25 {
		t.Fatalf("new lap CurrentLapTime = %.6f, want %.6f", newLap.Lap.CurrentLapTime, 1.25)
	}
}

func TestMapToDTOCurrentLapTimeResetsOnLapIncrementWithStaleTelemetry(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   3,
		MElapsedTime: 150.0,
		MLapStartET:  100.0,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 150.0}

	prevLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 50.0}, si)
	telem.MLapNumber = 4
	telem.MElapsedTime = 150.0 // intentionally stale telemetry timing
	si.MCurrentET = 151.0
	newLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 1.2}, si)

	if math.Abs(prevLap.Lap.CurrentLapTime-50.0) > 1e-9 {
		t.Fatalf("previous lap CurrentLapTime = %.6f, want %.6f", prevLap.Lap.CurrentLapTime, 50.0)
	}
	if math.Abs(newLap.Lap.CurrentLapTime-1.2) > 1e-9 {
		t.Fatalf("new lap CurrentLapTime = %.6f, want %.6f", newLap.Lap.CurrentLapTime, 1.2)
	}
}

func TestMapToDTOCurrentLapTimePrefersNearZeroSourceOnLapIncrement(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   3,
		MElapsedTime: 150.0,
		MLapStartET:  60.0,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 150.0}

	prevLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 90.0}, si)
	telem.MLapNumber = 4
	telem.MElapsedTime = 150.1
	telem.MLapStartET = 150.0
	si.MCurrentET = 150.1
	newLap := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 90.0}, si)

	if math.Abs(prevLap.Lap.CurrentLapTime-90.0) > 1e-9 {
		t.Fatalf("previous lap CurrentLapTime = %.6f, want %.6f", prevLap.Lap.CurrentLapTime, 90.0)
	}
	if math.Abs(newLap.Lap.CurrentLapTime-0.1) > 1e-9 {
		t.Fatalf("new lap CurrentLapTime = %.6f, want %.6f", newLap.Lap.CurrentLapTime, 0.1)
	}
}

func TestMapToDTOCurrentLapTimeResetsOnSessionReset(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{MLapNumber: 5}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 900}

	initial := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 45}, si)
	si.MCurrentET = 20
	afterReset := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 3}, si)

	if initial.Lap.CurrentLapTime != 45 {
		t.Fatalf("initial CurrentLapTime = %.6f, want %.6f", initial.Lap.CurrentLapTime, 45.0)
	}
	if afterReset.Lap.CurrentLapTime != 3 {
		t.Fatalf("after reset CurrentLapTime = %.6f, want %.6f", afterReset.Lap.CurrentLapTime, 3.0)
	}
}

func TestDisconnectResetsMonotonicCurrentLapTimeState(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{MLapNumber: 2}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 200}

	a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 30}, si)
	si.MCurrentET = 201
	clamped := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 20}, si)
	if clamped.Lap.CurrentLapTime != 30 {
		t.Fatalf("clamped CurrentLapTime = %.6f, want %.6f", clamped.Lap.CurrentLapTime, 30.0)
	}

	if err := a.Disconnect(); err != nil {
		t.Fatalf("Disconnect() returned error: %v", err)
	}

	si.MCurrentET = 202
	afterDisconnect := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 5}, si)
	if afterDisconnect.Lap.CurrentLapTime != 5 {
		t.Fatalf("after disconnect CurrentLapTime = %.6f, want %.6f", afterDisconnect.Lap.CurrentLapTime, 5.0)
	}
}

func TestMapToDTOCurrentLapTimeRejectsTelemetrySpike(t *testing.T) {
	a := New()
	telem := &lmuVehicleTelemetry{
		MLapNumber:   4,
		MElapsedTime: 120.0,
		MLapStartET:  108.0,
	}
	si := &lmuScoringInfo{MSession: 10, MCurrentET: 120.0}

	first := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 11.9}, si)
	telem.MElapsedTime = 420.0
	si.MCurrentET = 120.1
	spike := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.2}, si)
	telem.MElapsedTime = 120.4
	si.MCurrentET = 120.4
	recovered := a.mapToDTO(telem, &lmuVehicleScoring{MTimeIntoLap: 12.3}, si)

	if math.Abs(first.Lap.CurrentLapTime-12.0) > 1e-9 {
		t.Fatalf("first CurrentLapTime = %.6f, want %.6f", first.Lap.CurrentLapTime, 12.0)
	}
	if math.Abs(spike.Lap.CurrentLapTime-12.2) > 1e-9 {
		t.Fatalf("spike CurrentLapTime = %.6f, want %.6f", spike.Lap.CurrentLapTime, 12.2)
	}
	if math.Abs(recovered.Lap.CurrentLapTime-12.4) > 1e-9 {
		t.Fatalf("recovered CurrentLapTime = %.6f, want %.6f", recovered.Lap.CurrentLapTime, 12.4)
	}
}
