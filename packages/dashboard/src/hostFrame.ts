import { TirePosition, type FieldCar, type FinishStatus, type PitState, type SessionType, type TelemetryFrame, type TireState } from '@sprint/types'

// The host serialises `Sprint.Desktop.Api.Telemetry.TelemetryFrame` (C# names in camelCase,
// enums as names, ISO timestamp): that JSON is the telemetry contract, and it is what the dash
// renderer reads (packages/dashboard/renderer/src/model.rs; renderer/tests/fixtures/host-frame.json
// pins it). `@sprint/types` keeps the older mirror shape (`speedMS`, `fuel`, `vsc`, numeric tyre
// positions, …) that the app's views, HUD and dash editor work in. This file is the one place
// that translates between the two: `parseHostFrame` for the app's live frames, `toHostFrame` for
// the frames the editor hands the renderer. Fields the host does not publish get their neutral value.

type Bag = Record<string, unknown>

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null
const bag = (value: unknown): Bag => (isBag(value) ? value : {})
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const bool = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback)
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

type HostSessionType = 'Practice' | 'Qualify' | 'Race' | 'Warmup' | 'Unknown'
type HostPitState = 'None' | 'Requested' | 'Entering' | 'Stopped' | 'Exiting'
type HostTirePosition = 'FrontLeft' | 'FrontRight' | 'RearLeft' | 'RearRight'

// Each enum as pairs of (host name, mirror value), read in both directions.
const sessionTypePairs: readonly (readonly [HostSessionType, SessionType])[] = [
  ['Practice', 'practice'], ['Qualify', 'qualify'], ['Race', 'race'], ['Warmup', 'warmup'], ['Unknown', 'unknown'],
]
const pitStatePairs: readonly (readonly [HostPitState, PitState])[] = [
  ['None', 'none'], ['Requested', 'requested'], ['Entering', 'entering'], ['Stopped', 'stopped'], ['Exiting', 'exiting'],
]
const finishStatusPairs: readonly (readonly [string, FinishStatus])[] = [
  ['None', 'none'], ['Finished', 'finished'], ['Dnf', 'dnf'], ['Disqualified', 'disqualified'],
]
const tirePositionPairs: readonly (readonly [HostTirePosition, TirePosition])[] = [
  ['FrontLeft', TirePosition.FrontLeft], ['FrontRight', TirePosition.FrontRight], ['RearLeft', TirePosition.RearLeft], ['RearRight', TirePosition.RearRight],
]

/** Host name -> mirror value; a name that is not in the table reads as `undefined`. */
const byName = <H extends string, V>(pairs: readonly (readonly [H, V])[]): Map<string, V> => new Map<string, V>(pairs)
/** Mirror value -> host name. */
const byValue = <H extends string, V>(pairs: readonly (readonly [H, V])[]): Map<V, H> => new Map(pairs.map(([name, value]): [V, H] => [value, name]))

const sessionTypes = byName(sessionTypePairs)
const pitStates = byName(pitStatePairs)
const finishStatuses = byName(finishStatusPairs)
const tirePositions = byName(tirePositionPairs)
const sessionTypeNames = byValue(sessionTypePairs)
const pitStateNames = byValue(pitStatePairs)
const tirePositionNames = byValue(tirePositionPairs)

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
      const position = tirePositions.get(str(bag(entry).position))
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
    pitState: pitStates.get(str(c.pitState)) ?? 'none',
    pitStops: num(c.pitStops),
    finishStatus: finishStatuses.get(str(c.finishStatus)) ?? 'none',
    positionX: num(c.positionX),
    positionZ: num(c.positionZ),
  }
}

/** Converts the host's telemetry frame JSON into the `@sprint/types` mirror; `null` when there is no frame. */
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
      sessionType: sessionTypes.get(str(session.sessionType)) ?? 'unknown',
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
      pitState: pitStates.get(str(car.pitState)) ?? null,
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

/**
 * The host's frame JSON as far as the dash renderer reads it: what `toHostFrame` writes. The
 * real frame carries more (pose, wheel physics, damage, the other cars); the renderer reads none of it.
 */
export interface HostTelemetryFrame {
  timestamp: string
  session: {
    game: string; track: string; trackLengthMeters: number | null; car: string; carClass: string; sessionType: HostSessionType
    sessionTime: number; totalSessionTime: number | null; sessionTimeRemaining: number | null; bestLapTime: number; maxLaps: number; inCar: boolean
  }
  car: {
    speedMetersPerSecond: number; gear: number; rpm: number; maxRpm: number; throttle: number; brake: number; clutch: number; steering: number
    fuelLiters: number; fuelPerLapLiters: number; positionX: number; positionY: number; positionZ: number; brakeBiasRear: number
    inGarage: boolean | null; inPitLane: boolean | null; pitState: HostPitState | null; pitLimiter: boolean | null
  }
  tires: {
    position: HostTirePosition; tempInnerCelsius: number; tempMiddleCelsius: number; tempOuterCelsius: number; tempSurfaceCelsius: number
    tempCoreCelsius: number; pressureKPa: number; wearPercent: number; compound: string
  }[]
  lap: {
    currentLap: number; currentLapTime: number; lastLapTime: number; bestLapTime: number; targetLapTime: number; delta: number; sector: number
    lastLapSectorsSeconds: number[]; isValid: boolean; trackPosition: number
  }
  flags: { yellow: boolean; doubleYellow: boolean; red: boolean; safetyCar: boolean; virtualSafetyCar: boolean; checkered: boolean }
  electronics: {
    tractionControlActive: boolean; tractionControl: number; tractionControlMax: number; tractionControlSlip: number; tractionControlSlipMax: number
    tractionControlCut: number; tractionControlCutMax: number; abs: number; absMax: number; motorMap: number; motorMapMax: number
    migration: number; migrationMax: number; frontAntiRollBar: number; frontAntiRollBarMax: number; rearAntiRollBar: number; rearAntiRollBarMax: number
    drsActive: boolean
  }
  race: { position: number; totalPositions: number; gapAhead: number; gapBehind: number }
  energy: { virtualEnergy: number; virtualEnergyPerLap: number; stateOfCharge: number; regenPower: number; deployPower: number }
  penalties: { incidents: number; trackLimitSteps: number; pitStops: number }
  conditions: { pathWetness: number | null; trackGripLevel: number | null; fuelMultiplier: number | null; tireMultiplier: number | null; fixedSetup: boolean | null }
}

/**
 * A mirror frame as the host would have sent it: the inverse of `parseHostFrame` for every field
 * the renderer reads, so the editor's frames (live ones and `previewFrames`) reach the renderer
 * in the one shape it reads. The mirror fields the host does not publish (`positionLapTime`,
 * the sector times, in/out lap, ABS active, the availability flags, which follow the maxima)
 * have no place on the wire, and `field` is left off: no dash widget reads the other cars.
 */
export function toHostFrame(frame: TelemetryFrame): HostTelemetryFrame {
  const { session, car, lap, flags, electronics: e, race, energy, penalties, conditions } = frame
  const timestamp = new Date(frame.timestamp)
  return {
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date(0).toISOString() : timestamp.toISOString(),
    session: { ...session, sessionType: sessionTypeNames.get(session.sessionType) ?? 'Unknown' },
    car: {
      speedMetersPerSecond: car.speedMS,
      gear: car.gear,
      rpm: car.rpm,
      maxRpm: car.maxRPM,
      throttle: car.throttle,
      brake: car.brake,
      clutch: car.clutch,
      steering: car.steering,
      fuelLiters: car.fuel,
      fuelPerLapLiters: car.fuelPerLap,
      positionX: car.positionX,
      positionY: car.positionY,
      positionZ: car.positionZ,
      brakeBiasRear: car.brakeBiasRear,
      inGarage: car.inGarage,
      inPitLane: car.inPitLane,
      pitState: car.pitState === null ? null : (pitStateNames.get(car.pitState) ?? null),
      pitLimiter: car.pitLimiter,
    },
    tires: frame.tires.flatMap((t) => {
      const position = tirePositionNames.get(t.position)
      if (position === undefined) return []
      return [{
        position,
        tempInnerCelsius: t.tempInner,
        tempMiddleCelsius: t.tempMiddle,
        tempOuterCelsius: t.tempOuter,
        tempSurfaceCelsius: t.tempSurface,
        tempCoreCelsius: t.tempCore,
        pressureKPa: t.pressureKPa,
        wearPercent: t.wearPercent,
        compound: t.compound,
      }]
    }),
    lap: {
      currentLap: lap.currentLap,
      currentLapTime: lap.currentLapTime,
      lastLapTime: lap.lastLapTime,
      bestLapTime: lap.bestLapTime,
      targetLapTime: lap.targetLapTime,
      delta: lap.delta,
      sector: lap.sector,
      lastLapSectorsSeconds: lap.lastLapSectorsSeconds,
      isValid: lap.isValid,
      trackPosition: lap.trackPosition,
    },
    flags: { yellow: flags.yellow, doubleYellow: flags.doubleYellow, red: flags.red, safetyCar: flags.safetyCar, virtualSafetyCar: flags.vsc, checkered: flags.checkered },
    electronics: {
      tractionControlActive: e.tcActive,
      tractionControl: e.tc,
      tractionControlMax: e.tcMax,
      tractionControlSlip: e.tcSlip,
      tractionControlSlipMax: e.tcSlipMax,
      tractionControlCut: e.tcCut,
      tractionControlCutMax: e.tcCutMax,
      abs: e.abs,
      absMax: e.absMax,
      motorMap: e.motorMap,
      motorMapMax: e.motorMapMax,
      migration: e.migration,
      migrationMax: e.migrationMax,
      frontAntiRollBar: e.frontAntiRollBar,
      frontAntiRollBarMax: e.frontAntiRollBarMax,
      rearAntiRollBar: e.rearAntiRollBar,
      rearAntiRollBarMax: e.rearAntiRollBarMax,
      drsActive: e.drsActive,
    },
    race: { ...race },
    energy: { virtualEnergy: energy.virtualEnergy, virtualEnergyPerLap: energy.virtualEnergyPerLap, stateOfCharge: energy.soc, regenPower: energy.regenPower, deployPower: energy.deployPower },
    penalties: { ...penalties },
    conditions: { ...conditions },
  }
}
