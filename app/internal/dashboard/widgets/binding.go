package widgets

import (
	"fmt"
	"math"

	"github.com/kratofl/sprint/pkg/dto"
)

// bindingPaths maps dot-path strings to accessor functions over TelemetryFrame.
// These paths are the same regardless of which game is active because
// dto.TelemetryFrame is the normalised DTO produced by every GameAdapter.
//
// Derived paths (e.g. "car.speedKPH") are computed here to avoid burdening
// widget Definition implementations with unit conversion.
var bindingPaths = map[Binding]func(*dto.TelemetryFrame) any{
	// Car
	"car.speedMS":       func(f *dto.TelemetryFrame) any { return f.Car.SpeedMS },
	"car.speedKPH":      func(f *dto.TelemetryFrame) any { return float32(f.Car.SpeedMS) * 3.6 },
	"car.gear":          func(f *dto.TelemetryFrame) any { return f.Car.Gear },
	"car.rpm":           func(f *dto.TelemetryFrame) any { return f.Car.RPM },
	"car.maxRPM":        func(f *dto.TelemetryFrame) any { return f.Car.MaxRPM },
	"car.throttle":      func(f *dto.TelemetryFrame) any { return f.Car.Throttle },
	"car.brake":         func(f *dto.TelemetryFrame) any { return f.Car.Brake },
	"car.clutch":        func(f *dto.TelemetryFrame) any { return f.Car.Clutch },
	"car.steering":      func(f *dto.TelemetryFrame) any { return f.Car.Steering },
	"car.fuel":          func(f *dto.TelemetryFrame) any { return f.Car.Fuel },
	"car.fuelPerLap":    func(f *dto.TelemetryFrame) any { return f.Car.FuelPerLap },
	"car.brakeBiasRear": func(f *dto.TelemetryFrame) any { return f.Car.BrakeBiasRear },

	// Car — derived
	"car.rpmPct": func(f *dto.TelemetryFrame) any {
		if f.Car.MaxRPM == 0 {
			return 0.0
		}
		v := float64(f.Car.RPM) / float64(f.Car.MaxRPM)
		return clamp01(v)
	},
	"car.steeringNorm": func(f *dto.TelemetryFrame) any {
		return (float64(f.Car.Steering) + 1.0) / 2.0
	},
	"car.gearStr": func(f *dto.TelemetryFrame) any {
		g := f.Car.Gear
		if g < 0 {
			return "R"
		}
		if g == 0 {
			return "N"
		}
		return fmt.Sprintf("%d", g)
	},
	"car.fuelLapsRemaining": func(f *dto.TelemetryFrame) any {
		if f.Car.FuelPerLap <= 0 {
			return 0.0
		}
		return float64(f.Car.Fuel) / float64(f.Car.FuelPerLap)
	},
	"car.brakeBiasPct": func(f *dto.TelemetryFrame) any {
		return float64(f.Car.BrakeBiasRear) * 100
	},
	"car.brakeBiasWarning": func(f *dto.TelemetryFrame) any {
		return f.Car.BrakeBiasRear < 0.45
	},

	// Lap
	"lap.currentLap":     func(f *dto.TelemetryFrame) any { return f.Lap.CurrentLap },
	"lap.currentLapTime": func(f *dto.TelemetryFrame) any { return f.Lap.CurrentLapTime },
	"lap.lastLapTime":    func(f *dto.TelemetryFrame) any { return f.Lap.LastLapTime },
	"lap.bestLapTime":    func(f *dto.TelemetryFrame) any { return f.Lap.BestLapTime },
	"lap.targetLapTime":  func(f *dto.TelemetryFrame) any { return f.Lap.TargetLapTime },
	"lap.sector":         func(f *dto.TelemetryFrame) any { return f.Lap.Sector },
	"lap.sector1Time":    func(f *dto.TelemetryFrame) any { return f.Lap.Sector1Time },
	"lap.sector2Time":    func(f *dto.TelemetryFrame) any { return f.Lap.Sector2Time },
	"lap.trackPosition":  func(f *dto.TelemetryFrame) any { return f.Lap.TrackPosition },
	"lap.isValid":        func(f *dto.TelemetryFrame) any { return f.Lap.IsValid },
	"lap.isInLap":        func(f *dto.TelemetryFrame) any { return f.Lap.IsInLap },
	"lap.isOutLap":       func(f *dto.TelemetryFrame) any { return f.Lap.IsOutLap },

	// Lap — derived
	"lap.delta": func(f *dto.TelemetryFrame) any {
		return f.Lap.Delta
	},
	"lap.deltaPositive": func(f *dto.TelemetryFrame) any {
		return f.Lap.Delta > 0
	},
	"lap.deltaNegative": func(f *dto.TelemetryFrame) any {
		return f.Lap.Delta < 0
	},
	"lap.counterStr": func(f *dto.TelemetryFrame) any {
		if f.Session.MaxLaps == 0 || f.Session.MaxLaps == math.MaxInt32 {
			return fmt.Sprintf("%d", f.Lap.CurrentLap)
		}
		return fmt.Sprintf("%d / %d", f.Lap.CurrentLap, f.Session.MaxLaps)
	},
	"lap.sector1Active": func(f *dto.TelemetryFrame) any { return f.Lap.Sector == 1 },
	"lap.sector2Active": func(f *dto.TelemetryFrame) any { return f.Lap.Sector == 2 },
	"lap.sector3Active": func(f *dto.TelemetryFrame) any { return f.Lap.Sector >= 3 },

	// Race
	"race.position":       func(f *dto.TelemetryFrame) any { return f.Race.Position },
	"race.totalPositions": func(f *dto.TelemetryFrame) any { return f.Race.TotalPositions },
	"race.gapAhead":       func(f *dto.TelemetryFrame) any { return f.Race.GapAhead },
	"race.gapBehind":      func(f *dto.TelemetryFrame) any { return f.Race.GapBehind },

	// Race — derived
	"race.positionStr": func(f *dto.TelemetryFrame) any {
		if f.Race.Position == 0 {
			return "---"
		}
		return fmt.Sprintf("P%d", f.Race.Position)
	},
	"race.positionP1": func(f *dto.TelemetryFrame) any { return f.Race.Position == 1 },

	// Electronics
	"electronics.tc":                func(f *dto.TelemetryFrame) any { return f.Electronics.TC },
	"electronics.tcMax":             func(f *dto.TelemetryFrame) any { return f.Electronics.TCMax },
	"electronics.tcActive":          func(f *dto.TelemetryFrame) any { return f.Electronics.TCActive },
	"electronics.tcCut":             func(f *dto.TelemetryFrame) any { return f.Electronics.TCCut },
	"electronics.tcCutMax":          func(f *dto.TelemetryFrame) any { return f.Electronics.TCCutMax },
	"electronics.tcSlip":            func(f *dto.TelemetryFrame) any { return f.Electronics.TCSlip },
	"electronics.tcSlipMax":         func(f *dto.TelemetryFrame) any { return f.Electronics.TCSlipMax },
	"electronics.abs":               func(f *dto.TelemetryFrame) any { return f.Electronics.ABS },
	"electronics.absMax":            func(f *dto.TelemetryFrame) any { return f.Electronics.ABSMax },
	"electronics.absActive":         func(f *dto.TelemetryFrame) any { return f.Electronics.ABSActive },
	"electronics.motorMap":          func(f *dto.TelemetryFrame) any { return f.Electronics.MotorMap },
	"electronics.motorMapMax":       func(f *dto.TelemetryFrame) any { return f.Electronics.MotorMapMax },
	"electronics.drsActive":         func(f *dto.TelemetryFrame) any { return f.Electronics.DRSActive },
	"electronics.absAvailable":      func(f *dto.TelemetryFrame) any { return f.Electronics.ABSAvailable },
	"electronics.tcAvailable":       func(f *dto.TelemetryFrame) any { return f.Electronics.TCAvailable },
	"electronics.tcCutAvailable":    func(f *dto.TelemetryFrame) any { return f.Electronics.TCCutAvailable },
	"electronics.tcSlipAvailable":   func(f *dto.TelemetryFrame) any { return f.Electronics.TCSlipAvailable },
	"electronics.motorMapAvailable": func(f *dto.TelemetryFrame) any { return f.Electronics.MotorMapAvailable },

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

	// Energy — derived
	"energy.virtualEnergyPct": func(f *dto.TelemetryFrame) any {
		return float64(f.Energy.VirtualEnergy) * 100
	},

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

	// Flags — derived display helpers
	"flags.activeText": func(f *dto.TelemetryFrame) any {
		fl := f.Flags
		switch {
		case fl.Red:
			return "RED"
		case fl.SafetyCar:
			return "SAFETY CAR"
		case fl.VSC:
			return "VSC"
		case fl.DoubleYellow:
			return "DBL YELLOW"
		case fl.Yellow:
			return "YELLOW"
		case fl.Checkered:
			return "CHECKERED"
		default:
			return "GREEN"
		}
	},
	"flags.colorRef": func(f *dto.TelemetryFrame) any {
		fl := f.Flags
		switch {
		case fl.Red:
			return "danger"
		case fl.SafetyCar, fl.VSC, fl.DoubleYellow, fl.Yellow:
			return "warning"
		case fl.Checkered:
			return "fg"
		default:
			return "success"
		}
	},

	// Tires — averaged temperature per corner
	"tires.fl.avgTemp": func(f *dto.TelemetryFrame) any {
		t := f.Tires[0]
		return (float64(t.TempInner) + float64(t.TempMiddle) + float64(t.TempOuter)) / 3
	},
	"tires.fr.avgTemp": func(f *dto.TelemetryFrame) any {
		t := f.Tires[1]
		return (float64(t.TempInner) + float64(t.TempMiddle) + float64(t.TempOuter)) / 3
	},
	"tires.rl.avgTemp": func(f *dto.TelemetryFrame) any {
		t := f.Tires[2]
		return (float64(t.TempInner) + float64(t.TempMiddle) + float64(t.TempOuter)) / 3
	},
	"tires.rr.avgTemp": func(f *dto.TelemetryFrame) any {
		t := f.Tires[3]
		return (float64(t.TempInner) + float64(t.TempMiddle) + float64(t.TempOuter)) / 3
	},
	"tires.fl.coreTemp": func(f *dto.TelemetryFrame) any { return f.Tires[0].TempCore },
	"tires.fr.coreTemp": func(f *dto.TelemetryFrame) any { return f.Tires[1].TempCore },
	"tires.rl.coreTemp": func(f *dto.TelemetryFrame) any { return f.Tires[2].TempCore },
	"tires.rr.coreTemp": func(f *dto.TelemetryFrame) any { return f.Tires[3].TempCore },
}

// Resolve returns the value at path within frame, along with a bool indicating
// whether the path is known. The returned value may be any numeric, string, or
// bool type matching the underlying DTO field.
func Resolve(frame *dto.TelemetryFrame, path Binding) (any, bool) {
	fn, ok := bindingPaths[path]
	if !ok {
		return nil, false
	}
	return fn(frame), true
}

// ResolveWithPrefs resolves frame binding paths that depend on display precision.
// Paths without precision semantics fall back to Resolve.
func ResolveWithPrefs(frame *dto.TelemetryFrame, path Binding, prefs FormatPreferences) (any, bool) {
	if frame == nil {
		return nil, false
	}

	switch path {
	case BindingLapDeltaPositive:
		rounded := roundDeltaValue(frame.Lap.Delta, resolvedFormatPreferences(prefs).DeltaPrecision)
		return rounded > 0, true
	case BindingLapDeltaNegative:
		rounded := roundDeltaValue(frame.Lap.Delta, resolvedFormatPreferences(prefs).DeltaPrecision)
		return rounded < 0, true
	default:
		return Resolve(frame, path)
	}
}
