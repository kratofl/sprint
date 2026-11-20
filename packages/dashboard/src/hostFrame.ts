import { TirePosition, type ElectricMotorState, type FieldCar, type FinishStatus, type PitState, type SessionType, type TelemetryFrame, type TireState } from '@sprint/types'

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
type HostElectricMotorState = 'Unavailable' | 'Inactive' | 'Propulsion' | 'Regeneration'

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
const motorStatePairs: readonly (readonly [HostElectricMotorState, ElectricMotorState])[] = [
  ['Unavailable', 'unavailable'], ['Inactive', 'inactive'], ['Propulsion', 'propulsion'], ['Regeneration', 'regeneration'],
]

/** Host name -> mirror value; a name that is not in the table reads as `undefined`. */
const byName = <H extends string, V>(pairs: readonly (readonly [H, V])[]): Map<string, V> => new Map<string, V>(pairs)
/** Mirror value -> host name. */
const byValue = <H extends string, V>(pairs: readonly (readonly [H, V])[]): Map<V, H> => new Map(pairs.map(([name, value]): [V, H] => [value, name]))

const sessionTypes = byName(sessionTypePairs)
const pitStates = byName(pitStatePairs)
const finishStatuses = byName(finishStatusPairs)
const tirePositions = byName(tirePositionPairs)
const motorStates = byName(motorStatePairs)
const sessionTypeNames = byValue(sessionTypePairs)
const pitStateNames = byValue(pitStatePairs)
const tirePositionNames = byValue(tirePositionPairs)
const motorStateNames = byValue(motorStatePairs)

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
    brakeTemp: num(t.brakeTempCelsius),
    optimalTemp: num(t.optimalTempCelsius),
    wearLastLap: numOrNull(t.wearLastLapPercent),
    avgTempLastLap: numOrNull(t.averageTempLastLapCelsius),
    flat: bool(t.flat),
    detached: bool(t.detached),
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

/** One of the host's other cars as the mirror's `FieldCar`; what is missing reads as its neutral value. */
export const parseFieldCar = (value: unknown): FieldCar => {
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
    penalties: num(c.penalties),
    finishStatus: finishStatuses.get(str(c.finishStatus)) ?? 'none',
    positionX: num(c.positionX),
    positionZ: num(c.positionZ),
    relativeGapSeconds: numOrNull(c.relativeGapSeconds),
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
      waterTemp: numOrNull(car.waterTempCelsius),
      oilTemp: numOrNull(car.oilTempCelsius),
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
      engineTorque: numOrNull(car.engineTorqueNewtonMeters),
      turboBoost: numOrNull(car.turboBoostPressure),
      headlights: boolOrNull(car.headlights),
      wiperState: numOrNull(car.wiperState),
      fuelLastLap: numOrNull(car.fuelLastLapLiters),
      fuelThisLap: numOrNull(car.fuelThisLapLiters),
      fuelStintPerLap: numOrNull(car.fuelStintPerLapLiters),
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
      currentLapSectorsSeconds: Array.isArray(lap.currentLapSectorsSeconds) ? lap.currentLapSectorsSeconds.map(num) : [],
      personalBestSectorsSeconds: Array.isArray(lap.personalBestSectorsSeconds) ? lap.personalBestSectorsSeconds.map(numOrNull) : [],
      sessionBestSectorsSeconds: Array.isArray(lap.sessionBestSectorsSeconds) ? lap.sessionBestSectorsSeconds.map(numOrNull) : [],
      classBestSectorsSeconds: Array.isArray(lap.classBestSectorsSeconds) ? lap.classBestSectorsSeconds.map(numOrNull) : [],
      sessionBestLapTime: numOrNull(lap.sessionBestLapTime),
      classBestLapTime: numOrNull(lap.classBestLapTime),
      isInLap: false,
      isOutLap: false,
      isValid: bool(lap.isValid, true),
      lastLapValid: bool(lap.lastLapValid, true),
      trackPosition: num(lap.trackPosition),
      lastFiveLapsAverage: numOrNull(lap.lastFiveLapsAverage),
      lastTenLapsAverage: numOrNull(lap.lastTenLapsAverage),
      allTimeBestLapTime: numOrNull(lap.allTimeBestLapTime),
      pitLoss: numOrNull(lap.pitLossSeconds),
      lastLapTopSpeedMS: numOrNull(lap.lastLapTopSpeedMetersPerSecond),
    },
    flags: {
      yellow: bool(flags.yellow),
      doubleYellow: bool(flags.doubleYellow),
      red: bool(flags.red),
      safetyCar: bool(flags.safetyCar),
      vsc: bool(flags.virtualSafetyCar),
      checkered: bool(flags.checkered),
    },
    // A setting counts as available when the car reports a non-zero maximum for it.
    electronics: {
      tcActive: bool(electronics.tractionControlActive),
      tc: num(electronics.tractionControl),
      tcMax,
      tcCut: num(electronics.tractionControlCut),
      tcCutMax,
      tcSlip: num(electronics.tractionControlSlip),
      tcSlipMax,
      absActive: bool(electronics.absActive),
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
      classGapAhead: numOrNull(race.classGapAhead),
      classGapBehind: numOrNull(race.classGapBehind),
      positionGapAhead: numOrNull(race.positionGapAhead),
      positionGapBehind: numOrNull(race.positionGapBehind),
      gapToLeader: numOrNull(race.gapToLeader),
      gapToClassLeader: numOrNull(race.gapToClassLeader),
      carLeftMeters: numOrNull(race.carLeftMeters),
      carRightMeters: numOrNull(race.carRightMeters),
    },
    energy: {
      virtualEnergy: num(energy.virtualEnergy),
      virtualEnergyPerLap: num(energy.virtualEnergyPerLap),
      soc: num(energy.stateOfCharge),
      regenPower: num(energy.regenPower),
      deployPower: num(energy.deployPower),
      motorState: motorStates.get(str(energy.motorState)) ?? 'unavailable',
      motorTemp: numOrNull(energy.motorTempCelsius),
      motorWaterTemp: numOrNull(energy.motorWaterTempCelsius),
      liftAndCoast: num(energy.liftAndCoastProgress),
      virtualEnergyLastLap: numOrNull(energy.virtualEnergyLastLap),
      virtualEnergyStintPerLap: numOrNull(energy.virtualEnergyStintPerLap),
    },
    penalties: {
      incidents: num(penalties.incidents),
      trackLimitSteps: num(penalties.trackLimitSteps),
      trackLimitStepsPerPenalty: num(penalties.trackLimitStepsPerPenalty),
      pitStops: num(penalties.pitStops),
      scheduledPitStops: num(penalties.scheduledPitStops),
    },
    conditions: {
      pathWetness: numOrNull(conditions.pathWetness),
      trackGripLevel: numOrNull(conditions.trackGripLevel),
      fuelMultiplier: numOrNull(conditions.fuelMultiplier),
      tireMultiplier: numOrNull(conditions.tireMultiplier),
      fixedSetup: boolOrNull(conditions.fixedSetup),
      airTemperature: numOrNull(conditions.airTemperatureCelsius),
      trackTemperature: numOrNull(conditions.trackTemperatureCelsius),
      raining: numOrNull(conditions.raining),
    },
    field: Array.isArray(value.field) ? value.field.map(parseFieldCar) : [],
  }
}

/** One other car on the wire, as far as the dash renderer reads it (and the ids that name it). */
export interface HostFieldCar {
  id: number; driver: string; car: string; carClass: string; isPlayer: boolean; place: number; classPlace: number; lapsCompleted: number; lapDistanceMeters: number
  inPitLane: boolean; penalties: number; relativeGapSeconds: number | null
}

/**
 * The host's frame JSON as far as the dash renderer reads it: what `toHostFrame` writes. The
 * real frame carries more (pose, wheel physics, the other cars' timing); the renderer reads none of
 * it. It reads the damage too, but the mirror has none, so the editor's frames never carry any.
 */
export interface HostTelemetryFrame {
  timestamp: string
  session: {
    game: string; track: string; trackLengthMeters: number | null; car: string; carClass: string; sessionType: HostSessionType
    sessionTime: number; totalSessionTime: number | null; sessionTimeRemaining: number | null; bestLapTime: number; maxLaps: number; inCar: boolean
  }
  car: {
    speedMetersPerSecond: number; gear: number; rpm: number; maxRpm: number; waterTempCelsius: number | null; oilTempCelsius: number | null
    throttle: number; brake: number; clutch: number; steering: number
    fuelLiters: number; fuelPerLapLiters: number; positionX: number; positionY: number; positionZ: number; brakeBiasRear: number
    inGarage: boolean | null; inPitLane: boolean | null; pitState: HostPitState | null; pitLimiter: boolean | null
    engineTorqueNewtonMeters: number | null; turboBoostPressure: number | null; headlights: boolean | null; wiperState: number | null
    fuelLastLapLiters: number | null; fuelThisLapLiters: number | null; fuelStintPerLapLiters: number | null
  }
  tires: {
    position: HostTirePosition; tempInnerCelsius: number; tempMiddleCelsius: number; tempOuterCelsius: number; tempSurfaceCelsius: number
    tempCoreCelsius: number; pressureKPa: number; wearPercent: number; compound: string; brakeTempCelsius: number; optimalTempCelsius: number
    wearLastLapPercent: number | null; averageTempLastLapCelsius: number | null; flat: boolean; detached: boolean
  }[]
  lap: {
    currentLap: number; currentLapTime: number; lastLapTime: number; bestLapTime: number; targetLapTime: number; delta: number; sector: number
    lastLapSectorsSeconds: number[]; currentLapSectorsSeconds: number[]; personalBestSectorsSeconds: (number | null)[]
    sessionBestSectorsSeconds: (number | null)[]; classBestSectorsSeconds: (number | null)[]; sessionBestLapTime: number | null; classBestLapTime: number | null
    isValid: boolean; lastLapValid: boolean; trackPosition: number
    lastFiveLapsAverage: number | null; lastTenLapsAverage: number | null; allTimeBestLapTime: number | null; pitLossSeconds: number | null
    lastLapTopSpeedMetersPerSecond: number | null
  }
  flags: { yellow: boolean; doubleYellow: boolean; red: boolean; safetyCar: boolean; virtualSafetyCar: boolean; checkered: boolean }
  electronics: {
    tractionControlActive: boolean; absActive: boolean; tractionControl: number; tractionControlMax: number; tractionControlSlip: number; tractionControlSlipMax: number
    tractionControlCut: number; tractionControlCutMax: number; abs: number; absMax: number; motorMap: number; motorMapMax: number
    migration: number; migrationMax: number; frontAntiRollBar: number; frontAntiRollBarMax: number; rearAntiRollBar: number; rearAntiRollBarMax: number
    drsActive: boolean
  }
  race: {
    position: number; totalPositions: number; gapAhead: number; gapBehind: number
    classGapAhead: number | null; classGapBehind: number | null; positionGapAhead: number | null; positionGapBehind: number | null
    gapToLeader: number | null; gapToClassLeader: number | null; carLeftMeters: number | null; carRightMeters: number | null
  }
  energy: {
    virtualEnergy: number; virtualEnergyPerLap: number; stateOfCharge: number; regenPower: number; deployPower: number
    motorState: HostElectricMotorState; motorTempCelsius: number | null; motorWaterTempCelsius: number | null; liftAndCoastProgress: number
    virtualEnergyLastLap: number | null; virtualEnergyStintPerLap: number | null
  }
  penalties: { incidents: number; trackLimitSteps: number; trackLimitStepsPerPenalty: number; pitStops: number; scheduledPitStops: number }
  conditions: {
    pathWetness: number | null; trackGripLevel: number | null; fuelMultiplier: number | null; tireMultiplier: number | null; fixedSetup: boolean | null
    airTemperatureCelsius: number | null; trackTemperatureCelsius: number | null; raining: number | null
  }
  field: HostFieldCar[]
}

/**
 * A mirror frame as the host would have sent it: the inverse of `parseHostFrame` for every field
 * the renderer reads, so the editor's frames (live ones and `previewFrames`) reach the renderer
 * in the one shape it reads. The mirror fields the host does not publish (`positionLapTime`,
 * the sector times, in/out lap, the availability flags, which follow the maxima)
 * have no place on the wire, and of the other cars only what the renderer reads is written.
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
      waterTempCelsius: car.waterTemp,
      oilTempCelsius: car.oilTemp,
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
      engineTorqueNewtonMeters: car.engineTorque,
      turboBoostPressure: car.turboBoost,
      headlights: car.headlights,
      wiperState: car.wiperState,
      fuelLastLapLiters: car.fuelLastLap,
      fuelThisLapLiters: car.fuelThisLap,
      fuelStintPerLapLiters: car.fuelStintPerLap,
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
        brakeTempCelsius: t.brakeTemp,
        optimalTempCelsius: t.optimalTemp,
        wearLastLapPercent: t.wearLastLap,
        averageTempLastLapCelsius: t.avgTempLastLap,
        flat: t.flat,
        detached: t.detached,
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
      currentLapSectorsSeconds: lap.currentLapSectorsSeconds,
      personalBestSectorsSeconds: lap.personalBestSectorsSeconds,
      sessionBestSectorsSeconds: lap.sessionBestSectorsSeconds,
      classBestSectorsSeconds: lap.classBestSectorsSeconds,
      sessionBestLapTime: lap.sessionBestLapTime,
      classBestLapTime: lap.classBestLapTime,
      isValid: lap.isValid,
      lastLapValid: lap.lastLapValid,
      trackPosition: lap.trackPosition,
      lastFiveLapsAverage: lap.lastFiveLapsAverage,
      lastTenLapsAverage: lap.lastTenLapsAverage,
      allTimeBestLapTime: lap.allTimeBestLapTime,
      pitLossSeconds: lap.pitLoss,
      lastLapTopSpeedMetersPerSecond: lap.lastLapTopSpeedMS,
    },
    flags: { yellow: flags.yellow, doubleYellow: flags.doubleYellow, red: flags.red, safetyCar: flags.safetyCar, virtualSafetyCar: flags.vsc, checkered: flags.checkered },
    electronics: {
      tractionControlActive: e.tcActive,
      absActive: e.absActive,
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
    energy: {
      virtualEnergy: energy.virtualEnergy,
      virtualEnergyPerLap: energy.virtualEnergyPerLap,
      stateOfCharge: energy.soc,
      regenPower: energy.regenPower,
      deployPower: energy.deployPower,
      motorState: motorStateNames.get(energy.motorState) ?? 'Unavailable',
      motorTempCelsius: energy.motorTemp,
      motorWaterTempCelsius: energy.motorWaterTemp,
      liftAndCoastProgress: energy.liftAndCoast,
      virtualEnergyLastLap: energy.virtualEnergyLastLap,
      virtualEnergyStintPerLap: energy.virtualEnergyStintPerLap,
    },
    penalties: { ...penalties },
    conditions: {
      pathWetness: conditions.pathWetness,
      trackGripLevel: conditions.trackGripLevel,
      fuelMultiplier: conditions.fuelMultiplier,
      tireMultiplier: conditions.tireMultiplier,
      fixedSetup: conditions.fixedSetup,
      airTemperatureCelsius: conditions.airTemperature,
      trackTemperatureCelsius: conditions.trackTemperature,
      raining: conditions.raining,
    },
    field: frame.field.map(({ id, driver, car, carClass, isPlayer, place, classPlace, lapsCompleted, lapDistanceMeters, inPitLane, penalties, relativeGapSeconds }) => ({
      id, driver, car, carClass, isPlayer, place, classPlace, lapsCompleted, lapDistanceMeters, inPitLane, penalties, relativeGapSeconds,
    })),
  }
}
