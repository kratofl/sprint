import { TirePosition, type FieldCar, type FinishStatus, type PitState, type SessionType, type TelemetryFrame, type TireState } from '@sprint/types'

// The host serialises `Sprint.Desktop.Api.Telemetry.TelemetryFrame` (C# names, enums as
// names, ISO timestamp). `@sprint/types` – what `packages/dashboard` reads – still carries the
// older mirror shape (`speedMS`, `fuel`, `vsc`, numeric tyre positions, …). This file is the one
// place that translates between them, so every renderer consumer (views, wheel output) gets a
// frame the dash can read. Fields the host does not publish get their neutral value.

type Bag = Record<string, unknown>

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null
const bag = (value: unknown): Bag => (isBag(value) ? value : {})
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const bool = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback)
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const sessionTypes: Record<string, SessionType> = {
  Practice: 'practice',
  Qualify: 'qualify',
  Race: 'race',
  Warmup: 'warmup',
  Unknown: 'unknown',
}

const pitStates: Record<string, PitState> = {
  None: 'none',
  Requested: 'requested',
  Entering: 'entering',
  Stopped: 'stopped',
  Exiting: 'exiting',
}

const finishStatuses: Record<string, FinishStatus> = {
  None: 'none',
  Finished: 'finished',
  Dnf: 'dnf',
  Disqualified: 'disqualified',
}

const tirePositions: Record<string, TirePosition> = {
  FrontLeft: TirePosition.FrontLeft,
  FrontRight: TirePosition.FrontRight,
  RearLeft: TirePosition.RearLeft,
  RearRight: TirePosition.RearRight,
}

const tire = (position: TirePosition, value: unknown): TireState => {
  const t = bag(value)
  return {
    position,
    tempInner: num(t.tempInnerCelsius),
    tempMiddle: num(t.tempMiddleCelsius),
    tempOuter: num(t.tempOuterCelsius),
    tempSurface: num(t.tempSurfaceCelsius),
    tempCore: num(t.tempCoreCelsius),
    pressureKPa: num(t.pressureKPa),
    wearPercent: num(t.wearPercent),
    compound: str(t.compound),
  }
}

/** Places each host tyre at its `TirePosition` index – the dash reads `tires[TirePosition.X]`. */
const tires = (value: unknown): TelemetryFrame['tires'] => {
  const byPosition = new Map<TirePosition, unknown>()
  if (Array.isArray(value)) {
    for (const entry of value) {
      const position = tirePositions[str(bag(entry).position)]
      if (position !== undefined) byPosition.set(position, entry)
    }
  }
  return [
    tire(TirePosition.FrontLeft, byPosition.get(TirePosition.FrontLeft)),
    tire(TirePosition.FrontRight, byPosition.get(TirePosition.FrontRight)),
    tire(TirePosition.RearLeft, byPosition.get(TirePosition.RearLeft)),
    tire(TirePosition.RearRight, byPosition.get(TirePosition.RearRight)),
  ]
}

const fieldCar = (value: unknown): FieldCar => {
  const c = bag(value)
  return {
    id: num(c.id),
    driver: str(c.driver),
    car: str(c.car),
    carClass: str(c.carClass),
    isPlayer: bool(c.isPlayer),
    place: num(c.place),
    classPlace: num(c.classPlace),
    lapsCompleted: num(c.lapsCompleted),
    lapDistanceMeters: num(c.lapDistanceMeters),
    sector: num(c.sector),
    bestLapTime: numOrNull(c.bestLapTime),
    lastLapTime: numOrNull(c.lastLapTime),
    lastLapSector1: numOrNull(c.lastLapSector1),
    lastLapSector2: numOrNull(c.lastLapSector2),
    lastLapSector3: numOrNull(c.lastLapSector3),
    currentLapSector1: numOrNull(c.currentLapSector1),
    currentLapSector2: numOrNull(c.currentLapSector2),
    gapToLeader: num(c.gapToLeader),
    lapsToLeader: num(c.lapsToLeader),
    gapToNext: num(c.gapToNext),
    lapsToNext: num(c.lapsToNext),
    inPitLane: bool(c.inPitLane),
    inGarage: bool(c.inGarage),
    pitState: pitStates[str(c.pitState)] ?? 'none',
    pitStops: num(c.pitStops),
    finishStatus: finishStatuses[str(c.finishStatus)] ?? 'none',
    positionX: num(c.positionX),
    positionZ: num(c.positionZ),
  }
}

/** Converts the host's telemetry frame JSON into the dash renderer's `TelemetryFrame`; `null` when there is no frame. */
export function parseHostFrame(value: unknown): TelemetryFrame | null {
  if (!isBag(value)) return null
  const session = bag(value.session)
  const car = bag(value.car)
  const lap = bag(value.lap)
  const flags = bag(value.flags)
  const electronics = bag(value.electronics)
  const race = bag(value.race)
  const energy = bag(value.energy)
  const penalties = bag(value.penalties)
  const conditions = bag(value.conditions)
  const timestamp = typeof value.timestamp === 'string' ? Date.parse(value.timestamp) : NaN
  const tcMax = num(electronics.tractionControlMax)
  const absMax = num(electronics.absMax)
  const motorMapMax = num(electronics.motorMapMax)
  const tcCutMax = num(electronics.tractionControlCutMax)
  const tcSlipMax = num(electronics.tractionControlSlipMax)

  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    session: {
      game: str(session.game),
      track: str(session.track),
      trackLengthMeters: numOrNull(session.trackLengthMeters),
      car: str(session.car),
      carClass: str(session.carClass),
      sessionType: sessionTypes[str(session.sessionType)] ?? 'unknown',
      sessionTime: num(session.sessionTime),
      totalSessionTime: numOrNull(session.totalSessionTime),
      sessionTimeRemaining: numOrNull(session.sessionTimeRemaining),
      bestLapTime: num(session.bestLapTime),
      maxLaps: num(session.maxLaps),
      inCar: bool(session.inCar),
    },
    car: {
      speedMS: num(car.speedMetersPerSecond),
      gear: num(car.gear),
      rpm: num(car.rpm),
      maxRPM: num(car.maxRpm),
      throttle: num(car.throttle),
      brake: num(car.brake),
      clutch: num(car.clutch),
      steering: num(car.steering),
      fuel: num(car.fuelLiters),
      fuelPerLap: num(car.fuelPerLapLiters),
      positionX: num(car.positionX),
      positionY: num(car.positionY),
      positionZ: num(car.positionZ),
      brakeBiasRear: num(car.brakeBiasRear),
      inGarage: boolOrNull(car.inGarage),
      inPitLane: boolOrNull(car.inPitLane),
      pitState: pitStates[str(car.pitState)] ?? null,
      pitLimiter: boolOrNull(car.pitLimiter),
    },
    tires: tires(value.tires),
    lap: {
      currentLap: num(lap.currentLap),
      currentLapTime: num(lap.currentLapTime),
      positionLapTime: 0,
      lastLapTime: num(lap.lastLapTime),
      bestLapTime: num(lap.bestLapTime),
      targetLapTime: num(lap.targetLapTime),
      delta: num(lap.delta),
      sector: num(lap.sector),
      sector1Time: 0,
      sector2Time: 0,
      lastLapSectorsSeconds: Array.isArray(lap.lastLapSectorsSeconds) ? lap.lastLapSectorsSeconds.map(num) : [],
      isInLap: false,
      isOutLap: false,
      isValid: bool(lap.isValid, true),
      trackPosition: num(lap.trackPosition),
    },
    flags: {
      yellow: bool(flags.yellow),
      doubleYellow: bool(flags.doubleYellow),
      red: bool(flags.red),
      safetyCar: bool(flags.safetyCar),
      vsc: bool(flags.virtualSafetyCar),
      checkered: bool(flags.checkered),
    },
    // The host publishes no ABS-active channel; a setting counts as available when the car
    // reports a non-zero maximum for it.
    electronics: {
      tcActive: bool(electronics.tractionControlActive),
      tc: num(electronics.tractionControl),
      tcMax,
      tcCut: num(electronics.tractionControlCut),
      tcCutMax,
      tcSlip: num(electronics.tractionControlSlip),
      tcSlipMax,
      absActive: false,
      abs: num(electronics.abs),
      absMax,
      motorMap: num(electronics.motorMap),
      motorMapMax,
      migration: num(electronics.migration),
      migrationMax: num(electronics.migrationMax),
      frontAntiRollBar: num(electronics.frontAntiRollBar),
      frontAntiRollBarMax: num(electronics.frontAntiRollBarMax),
      rearAntiRollBar: num(electronics.rearAntiRollBar),
      rearAntiRollBarMax: num(electronics.rearAntiRollBarMax),
      drsActive: bool(electronics.drsActive),
      absAvailable: absMax > 0,
      tcAvailable: tcMax > 0,
      tcCutAvailable: tcCutMax > 0,
      tcSlipAvailable: tcSlipMax > 0,
      motorMapAvailable: motorMapMax > 0,
    },
    race: {
      position: num(race.position),
      totalPositions: num(race.totalPositions),
      gapAhead: num(race.gapAhead),
      gapBehind: num(race.gapBehind),
    },
    energy: {
      virtualEnergy: num(energy.virtualEnergy),
      virtualEnergyPerLap: num(energy.virtualEnergyPerLap),
      soc: num(energy.stateOfCharge),
      regenPower: num(energy.regenPower),
      deployPower: num(energy.deployPower),
    },
    penalties: {
      incidents: num(penalties.incidents),
      trackLimitSteps: num(penalties.trackLimitSteps),
      pitStops: num(penalties.pitStops),
    },
    conditions: {
      pathWetness: numOrNull(conditions.pathWetness),
      trackGripLevel: numOrNull(conditions.trackGripLevel),
      fuelMultiplier: numOrNull(conditions.fuelMultiplier),
      tireMultiplier: numOrNull(conditions.tireMultiplier),
      fixedSetup: boolOrNull(conditions.fixedSetup),
    },
    field: Array.isArray(value.field) ? value.field.map(fieldCar) : [],
  }
}
