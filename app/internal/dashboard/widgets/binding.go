package widgets

import "github.com/kratofl/sprint/pkg/dto"

// bindingPaths maps dot-path strings to accessor functions over TelemetryFrame.
// These paths are the same regardless of which game is active because
// dto.TelemetryFrame is the normalised DTO produced by every GameAdapter.
//
// Derived paths (e.g. "car.speedKPH") are computed here to avoid burdening
// widget Draw implementations with unit conversion.
var bindingPaths = map[string]func(*dto.TelemetryFrame) any{
	// Car
	"car.speedMS":        func(f *dto.TelemetryFrame) any { return f.Car.SpeedMS },
	"car.speedKPH":       func(f *dto.TelemetryFrame) any { return float32(f.Car.SpeedMS) * 3.6 },
	"car.gear":           func(f *dto.TelemetryFrame) any { return f.Car.Gear },
	"car.rpm":            func(f *dto.TelemetryFrame) any { return f.Car.RPM },
	"car.maxRPM":         func(f *dto.TelemetryFrame) any { return f.Car.MaxRPM },
	"car.throttle":       func(f *dto.TelemetryFrame) any { return f.Car.Throttle },
	"car.brake":          func(f *dto.TelemetryFrame) any { return f.Car.Brake },
	"car.clutch":         func(f *dto.TelemetryFrame) any { return f.Car.Clutch },
	"car.steering":       func(f *dto.TelemetryFrame) any { return f.Car.Steering },
	"car.fuel":           func(f *dto.TelemetryFrame) any { return f.Car.Fuel },
	"car.fuelPerLap":     func(f *dto.TelemetryFrame) any { return f.Car.FuelPerLap },
	"car.brakeBiasRear":  func(f *dto.TelemetryFrame) any { return f.Car.BrakeBiasRear },

	// Lap
	"lap.currentLap":      func(f *dto.TelemetryFrame) any { return f.Lap.CurrentLap },
	"lap.currentLapTime":  func(f *dto.TelemetryFrame) any { return f.Lap.CurrentLapTime },
	"lap.lastLapTime":     func(f *dto.TelemetryFrame) any { return f.Lap.LastLapTime },
	"lap.bestLapTime":     func(f *dto.TelemetryFrame) any { return f.Lap.BestLapTime },
	"lap.targetLapTime":   func(f *dto.TelemetryFrame) any { return f.Lap.TargetLapTime },
	"lap.sector":          func(f *dto.TelemetryFrame) any { return f.Lap.Sector },
	"lap.sector1Time":     func(f *dto.TelemetryFrame) any { return f.Lap.Sector1Time },
	"lap.sector2Time":     func(f *dto.TelemetryFrame) any { return f.Lap.Sector2Time },
	"lap.trackPosition":   func(f *dto.TelemetryFrame) any { return f.Lap.TrackPosition },
	"lap.isValid":         func(f *dto.TelemetryFrame) any { return f.Lap.IsValid },
	"lap.isInLap":         func(f *dto.TelemetryFrame) any { return f.Lap.IsInLap },
	"lap.isOutLap":        func(f *dto.TelemetryFrame) any { return f.Lap.IsOutLap },

	// Race
	"race.position":       func(f *dto.TelemetryFrame) any { return f.Race.Position },
	"race.totalPositions": func(f *dto.TelemetryFrame) any { return f.Race.TotalPositions },
	"race.gapAhead":       func(f *dto.TelemetryFrame) any { return f.Race.GapAhead },
	"race.gapBehind":      func(f *dto.TelemetryFrame) any { return f.Race.GapBehind },

	// Electronics
	"electronics.tc":        func(f *dto.TelemetryFrame) any { return f.Electronics.TC },
	"electronics.tcMax":     func(f *dto.TelemetryFrame) any { return f.Electronics.TCMax },
	"electronics.tcActive":  func(f *dto.TelemetryFrame) any { return f.Electronics.TCActive },
	"electronics.tcCut":     func(f *dto.TelemetryFrame) any { return f.Electronics.TCCut },
	"electronics.tcSlip":    func(f *dto.TelemetryFrame) any { return f.Electronics.TCSlip },
	"electronics.abs":       func(f *dto.TelemetryFrame) any { return f.Electronics.ABS },
	"electronics.absMax":    func(f *dto.TelemetryFrame) any { return f.Electronics.ABSMax },
	"electronics.absActive": func(f *dto.TelemetryFrame) any { return f.Electronics.ABSActive },
	"electronics.motorMap":  func(f *dto.TelemetryFrame) any { return f.Electronics.MotorMap },
	"electronics.drsActive": func(f *dto.TelemetryFrame) any { return f.Electronics.DRSActive },

	// Session
	"session.game":        func(f *dto.TelemetryFrame) any { return f.Session.Game },
	"session.track":       func(f *dto.TelemetryFrame) any { return f.Session.Track },
	"session.car":         func(f *dto.TelemetryFrame) any { return f.Session.Car },
	"session.sessionType": func(f *dto.TelemetryFrame) any { return string(f.Session.SessionType) },
	"session.sessionTime": func(f *dto.TelemetryFrame) any { return f.Session.SessionTime },
	"session.bestLapTime": func(f *dto.TelemetryFrame) any { return f.Session.BestLapTime },
	"session.maxLaps":     func(f *dto.TelemetryFrame) any { return f.Session.MaxLaps },
	"session.inCar":       func(f *dto.TelemetryFrame) any { return f.Session.InCar },

	// Energy
	"energy.virtualEnergy": func(f *dto.TelemetryFrame) any { return f.Energy.VirtualEnergy },
	"energy.soc":           func(f *dto.TelemetryFrame) any { return f.Energy.SoC },
	"energy.regenPower":    func(f *dto.TelemetryFrame) any { return f.Energy.RegenPower },
	"energy.deployPower":   func(f *dto.TelemetryFrame) any { return f.Energy.DeployPower },

	// Penalties
	"penalties.incidents":       func(f *dto.TelemetryFrame) any { return f.Penalties.Incidents },
	"penalties.trackLimitSteps": func(f *dto.TelemetryFrame) any { return f.Penalties.TrackLimitSteps },
	"penalties.pitStops":        func(f *dto.TelemetryFrame) any { return f.Penalties.PitStops },

	// Flags
	"flags.yellow":       func(f *dto.TelemetryFrame) any { return f.Flags.Yellow },
	"flags.doubleYellow": func(f *dto.TelemetryFrame) any { return f.Flags.DoubleYellow },
	"flags.red":          func(f *dto.TelemetryFrame) any { return f.Flags.Red },
	"flags.safetyCar":    func(f *dto.TelemetryFrame) any { return f.Flags.SafetyCar },
	"flags.vsc":          func(f *dto.TelemetryFrame) any { return f.Flags.VSC },
	"flags.checkered":    func(f *dto.TelemetryFrame) any { return f.Flags.Checkered },
}

// Resolve returns the value at path within frame, along with a bool indicating
// whether the path is known. The returned value may be any numeric, string, or
// bool type matching the underlying DTO field.
func Resolve(frame *dto.TelemetryFrame, path string) (any, bool) {
	fn, ok := bindingPaths[path]
	if !ok {
		return nil, false
	}
	return fn(frame), true
}
