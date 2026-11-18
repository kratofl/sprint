// Deterministic preview telemetry frames for the dash editor's Preview-state selector,
// ported from the desktop client's `Features/Dashes/DashPreviewFrames.cs`. Every state but
// `live` overrides the render frame with a representative canned frame so a dash can be
// verified in each condition without a live game session (PRD #122 US26).

import { TirePosition, type CarState, type FieldCar, type Flags, type LapState, type Session, type TelemetryFrame } from '@sprint/types'
import { parseFieldCar } from './hostFrame'

export type DashPreviewState = 'live' | 'idle' | 'mid_lap' | 'redline' | 'low_fuel' | 'yellow_flag' | 'red_flag' | 'pit'

/** In menu order, matching `DashPreviewFrames.Menu`. */
export const dashPreviewStates: readonly { state: DashPreviewState; label: string }[] = [
  { state: 'live', label: 'Live / demo' },
  { state: 'idle', label: 'Idle' },
  { state: 'mid_lap', label: 'Mid-lap' },
  { state: 'redline', label: 'Redline' },
  { state: 'low_fuel', label: 'Low fuel' },
  { state: 'yellow_flag', label: 'Yellow flag' },
  { state: 'red_flag', label: 'Red flag' },
  { state: 'pit', label: 'Pit' },
]

/**
 * Made-up cars round ours (P4, a third of the way round), so the relative widget has a road to
 * show: three ahead, three behind, the last of them a lap down.
 */
const PREVIEW_FIELD: FieldCar[] = [
  { id: 1, driver: 'R. Okafor', place: 1, lapsCompleted: 12, lapDistanceMeters: 2410 },
  { id: 2, driver: 'L. Brandt', place: 2, lapsCompleted: 12, lapDistanceMeters: 2240 },
  { id: 3, driver: 'T. Varga', place: 3, lapsCompleted: 12, lapDistanceMeters: 2010 },
  { id: 4, driver: 'You', place: 4, lapsCompleted: 12, lapDistanceMeters: 1930, isPlayer: true },
  { id: 5, driver: 'K. Ito', place: 5, lapsCompleted: 12, lapDistanceMeters: 1880 },
  { id: 6, driver: 'S. Novak', place: 6, lapsCompleted: 12, lapDistanceMeters: 1650 },
  { id: 7, driver: 'M. Duarte', place: 14, lapsCompleted: 11, lapDistanceMeters: 1420 },
].map(parseFieldCar)

const NO_FLAGS: Flags = { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false }

// A healthy mid-lap racing frame used directly for `mid_lap` and as the base every other
// simulated state tweaks from — mirrors `DashPreviewFrames.Base()`. Its moment (for the clock)
// is a fixed afternoon, read in the viewer's time zone.
function baseFrame(): TelemetryFrame {
  return {
    timestamp: Date.UTC(2026, 5, 14, 13, 42),
    session: {
      game: 'Preview',
      track: 'Preview Circuit',
      trackLengthMeters: 5793,
      car: 'GT3',
      carClass: 'GT3',
      sessionType: 'race',
      sessionTime: 1452,
      totalSessionTime: null,
      sessionTimeRemaining: null,
      bestLapTime: 103.412,
      maxLaps: 24,
      inCar: true,
    },
    car: {
      speedMS: 61,
      gear: 4,
      rpm: 7200,
      maxRPM: 9000,
      waterTemp: 88,
      oilTemp: 104,
      throttle: 0.82,
      brake: 0,
      clutch: 0,
      steering: 0,
      fuel: 42,
      fuelPerLap: 2.6,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      brakeBiasRear: 0.435,
      inGarage: null,
      inPitLane: null,
      pitState: null,
      pitLimiter: null,
    },
    tires: [
      { position: TirePosition.FrontLeft, tempInner: 84, tempMiddle: 86, tempOuter: 88, tempSurface: 86, tempCore: 90, pressureKPa: 165, wearPercent: 12, compound: 'Medium', brakeTemp: 420 },
      { position: TirePosition.FrontRight, tempInner: 86, tempMiddle: 88, tempOuter: 90, tempSurface: 88, tempCore: 92, pressureKPa: 166, wearPercent: 12, compound: 'Medium', brakeTemp: 434 },
      { position: TirePosition.RearLeft, tempInner: 89, tempMiddle: 91, tempOuter: 93, tempSurface: 91, tempCore: 95, pressureKPa: 162, wearPercent: 14, compound: 'Medium', brakeTemp: 372 },
      { position: TirePosition.RearRight, tempInner: 90, tempMiddle: 92, tempOuter: 94, tempSurface: 92, tempCore: 96, pressureKPa: 163, wearPercent: 14, compound: 'Medium', brakeTemp: 381 },
    ],
    lap: {
      currentLap: 7,
      currentLapTime: 48.317,
      positionLapTime: 48.317,
      lastLapTime: 104.021,
      bestLapTime: 103.412,
      targetLapTime: 103.9,
      delta: -0.184,
      sector: 2,
      sector1Time: 32.1,
      sector2Time: 35.0,
      lastLapSectorsSeconds: [32.5, 35.0, 36.521],
      // Sector 1 of this lap is done: a class best (purple). The last lap shows one of each colour.
      currentLapSectorsSeconds: [32.1],
      personalBestSectorsSeconds: [32.1, 34.8, 36.521],
      sessionBestSectorsSeconds: [31.874, 34.512, 36.204],
      classBestSectorsSeconds: [32.1, 34.6, 36.3],
      sessionBestLapTime: 102.884,
      classBestLapTime: 103.215,
      isInLap: false,
      isOutLap: false,
      isValid: true,
      trackPosition: 0.46,
    },
    flags: NO_FLAGS,
    electronics: {
      tcActive: false,
      tc: 4,
      tcMax: 12,
      tcCut: 0,
      tcCutMax: 0,
      tcSlip: 0,
      tcSlipMax: 0,
      absActive: false,
      abs: 3,
      absMax: 12,
      motorMap: 3,
      motorMapMax: 8,
      migration: 0,
      migrationMax: 0,
      frontAntiRollBar: 0,
      frontAntiRollBarMax: 0,
      rearAntiRollBar: 0,
      rearAntiRollBarMax: 0,
      drsActive: false,
      absAvailable: true,
      tcAvailable: true,
      tcCutAvailable: false,
      tcSlipAvailable: false,
      motorMapAvailable: true,
    },
    // K. Ito (behind) is alongside on the right, a little back.
    race: { position: 4, totalPositions: 20, gapAhead: -1.2, gapBehind: 0.8, carLeftMeters: null, carRightMeters: -1.8 },
    energy: { virtualEnergy: 68, virtualEnergyPerLap: 3.4, soc: 0.68, regenPower: 18, deployPower: 92 },
    penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
    conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null, airTemperature: 24, trackTemperature: 33, raining: 0 },
    field: PREVIEW_FIELD,
  }
}

function withCar(base: TelemetryFrame, patch: Partial<CarState>): CarState {
  return { ...base.car, ...patch }
}

function withLap(base: TelemetryFrame, patch: Partial<LapState>): LapState {
  return { ...base.lap, ...patch }
}

function withSession(base: TelemetryFrame, patch: Partial<Session>): Session {
  return { ...base.session, ...patch }
}

/** The canned frame for a simulated state (never called for `'live'`) — mirrors `DashPreviewFrames.For`. */
export function previewFrame(state: Exclude<DashPreviewState, 'live'>): TelemetryFrame {
  const base = baseFrame()
  switch (state) {
    case 'idle':
      return { ...base, car: withCar(base, { gear: 0, rpm: 1100, speedMS: 0, throttle: 0, brake: 0 }), lap: withLap(base, { currentLapTime: 0, sector: 0 }), session: withSession(base, { inCar: false }) }
    case 'redline':
      return { ...base, car: withCar(base, { gear: 5, rpm: 8850, maxRPM: 9000, speedMS: 78, throttle: 1 }) }
    case 'low_fuel':
      return { ...base, car: withCar(base, { fuel: 2.4, fuelPerLap: 2.6 }) }
    case 'yellow_flag':
      return { ...base, flags: { ...NO_FLAGS, yellow: true } }
    case 'red_flag':
      return { ...base, flags: { ...NO_FLAGS, red: true }, car: withCar(base, { gear: 0, rpm: 1200, speedMS: 0, throttle: 0, brake: 1 }) }
    case 'pit':
      return { ...base, car: withCar(base, { gear: 1, rpm: 3200, speedMS: 16, throttle: 0.3 }), lap: withLap(base, { sector: 3 }) }
    case 'mid_lap':
    default:
      return base
  }
}

/** The frame to render for a preview state; `'live'` passes the live frame through unchanged (including `null`, when telemetry hasn't connected). */
export function resolvePreviewFrame(state: DashPreviewState, live: TelemetryFrame | null): TelemetryFrame | null {
  return state === 'live' ? live : previewFrame(state)
}
