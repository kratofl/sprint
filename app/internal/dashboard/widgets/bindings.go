package widgets

// Binding is a typed telemetry binding path (e.g. BindingCarFuel).
// Using named constants instead of raw strings provides IDE completion and
// prevents typos that would silently produce empty values at render time.
type Binding string

const (
	// Car
	BindingCarSpeedMS            Binding = "car.speedMS"
	BindingCarSpeedKPH           Binding = "car.speedKPH"
	BindingCarGear               Binding = "car.gear"
	BindingCarGearStr            Binding = "car.gearStr"
	BindingCarRPM                Binding = "car.rpm"
	BindingCarMaxRPM             Binding = "car.maxRPM"
	BindingCarRPMPct             Binding = "car.rpmPct"
	BindingCarRPMRedlineWarning  Binding = "car.rpmRedlineWarning"
	BindingCarThrottle           Binding = "car.throttle"
	BindingCarBrake              Binding = "car.brake"
	BindingCarClutch             Binding = "car.clutch"
	BindingCarSteering           Binding = "car.steering"
	BindingCarSteeringNorm       Binding = "car.steeringNorm"
	BindingCarFuel               Binding = "car.fuel"
	BindingCarFuelPerLap         Binding = "car.fuelPerLap"
	BindingCarFuelLapsRemaining  Binding = "car.fuelLapsRemaining"
	BindingCarBrakeBiasRear      Binding = "car.brakeBiasRear"
	BindingCarBrakeBiasPct       Binding = "car.brakeBiasPct"
	BindingCarBrakeBiasWarning   Binding = "car.brakeBiasWarning"

	// Lap
	BindingLapCurrentLap    Binding = "lap.currentLap"
	BindingLapCurrentLapTime Binding = "lap.currentLapTime"
	BindingLapLastLapTime   Binding = "lap.lastLapTime"
	BindingLapBestLapTime   Binding = "lap.bestLapTime"
	BindingLapTargetLapTime Binding = "lap.targetLapTime"
	BindingLapSector        Binding = "lap.sector"
	BindingLapSector1Time   Binding = "lap.sector1Time"
	BindingLapSector2Time   Binding = "lap.sector2Time"
	BindingLapSector1Active Binding = "lap.sector1Active"
	BindingLapSector2Active Binding = "lap.sector2Active"
	BindingLapSector3Active Binding = "lap.sector3Active"
	BindingLapTrackPosition Binding = "lap.trackPosition"
	BindingLapIsValid       Binding = "lap.isValid"
	BindingLapIsInLap       Binding = "lap.isInLap"
	BindingLapIsOutLap      Binding = "lap.isOutLap"
	BindingLapDelta         Binding = "lap.delta"
	BindingLapDeltaPositive Binding = "lap.deltaPositive"
	BindingLapDeltaNegative Binding = "lap.deltaNegative"
	BindingLapCounterStr    Binding = "lap.counterStr"

	// Race
	BindingRacePosition       Binding = "race.position"
	BindingRaceTotalPositions Binding = "race.totalPositions"
	BindingRaceGapAhead       Binding = "race.gapAhead"
	BindingRaceGapBehind      Binding = "race.gapBehind"
	BindingRacePositionStr    Binding = "race.positionStr"
	BindingRacePositionP1     Binding = "race.positionP1"

	// Electronics
	BindingElectronicsTC               Binding = "electronics.tc"
	BindingElectronicsTCMax            Binding = "electronics.tcMax"
	BindingElectronicsTCActive         Binding = "electronics.tcActive"
	BindingElectronicsTCCut            Binding = "electronics.tcCut"
	BindingElectronicsTCCutMax         Binding = "electronics.tcCutMax"
	BindingElectronicsTCSlip           Binding = "electronics.tcSlip"
	BindingElectronicsTCSlipMax        Binding = "electronics.tcSlipMax"
	BindingElectronicsABS              Binding = "electronics.abs"
	BindingElectronicsABSMax           Binding = "electronics.absMax"
	BindingElectronicsABSActive        Binding = "electronics.absActive"
	BindingElectronicsMotorMap         Binding = "electronics.motorMap"
	BindingElectronicsMotorMapMax      Binding = "electronics.motorMapMax"
	BindingElectronicsDRSActive        Binding = "electronics.drsActive"
	BindingElectronicsABSAvailable     Binding = "electronics.absAvailable"
	BindingElectronicsTCAvailable      Binding = "electronics.tcAvailable"
	BindingElectronicsTCCutAvailable   Binding = "electronics.tcCutAvailable"
	BindingElectronicsTCSlipAvailable  Binding = "electronics.tcSlipAvailable"
	BindingElectronicsMotorMapAvailable Binding = "electronics.motorMapAvailable"

	// Session
	BindingSessionGame        Binding = "session.game"
	BindingSessionTrack       Binding = "session.track"
	BindingSessionCar         Binding = "session.car"
	BindingSessionType        Binding = "session.sessionType"
	BindingSessionTime        Binding = "session.sessionTime"
	BindingSessionBestLapTime Binding = "session.bestLapTime"
	BindingSessionMaxLaps     Binding = "session.maxLaps"
	BindingSessionInCar       Binding = "session.inCar"

	// Energy
	BindingEnergyVirtual    Binding = "energy.virtualEnergy"
	BindingEnergySoC        Binding = "energy.soc"
	BindingEnergyRegenPower Binding = "energy.regenPower"
	BindingEnergyDeployPower Binding = "energy.deployPower"
	BindingEnergyVirtualPct Binding = "energy.virtualEnergyPct"

	// Penalties
	BindingPenaltiesIncidents       Binding = "penalties.incidents"
	BindingPenaltiesTrackLimitSteps Binding = "penalties.trackLimitSteps"
	BindingPenaltiesPitStops        Binding = "penalties.pitStops"

	// Flags
	BindingFlagsYellow      Binding = "flags.yellow"
	BindingFlagsDoubleYellow Binding = "flags.doubleYellow"
	BindingFlagsRed         Binding = "flags.red"
	BindingFlagsSafetyCar   Binding = "flags.safetyCar"
	BindingFlagsVSC         Binding = "flags.vsc"
	BindingFlagsCheckered   Binding = "flags.checkered"
	BindingFlagsActiveText  Binding = "flags.activeText"
	BindingFlagsColorRef    Binding = "flags.colorRef"

	// Tires
	BindingTiresFLAvgTemp Binding = "tires.fl.avgTemp"
	BindingTiresFRAvgTemp Binding = "tires.fr.avgTemp"
	BindingTiresRLAvgTemp Binding = "tires.rl.avgTemp"
	BindingTiresRRAvgTemp Binding = "tires.rr.avgTemp"
)
