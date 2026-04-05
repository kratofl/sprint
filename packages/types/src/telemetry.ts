// Mirrors pkg/dto/telemetry.go — keep in sync with the Go source of truth.

export type SessionType = 'practice' | 'qualify' | 'race' | 'warmup' | 'unknown'

export interface Session {
  game: string
  track: string
  car: string
  sessionType: SessionType
  sessionTime: number
  bestLapTime: number
  maxLaps: number // total laps for this session; 0 for time-based sessions
}

export interface CarState {
  speedMS: number
  gear: number
  rpm: number
  maxRPM: number
  throttle: number
  brake: number
  clutch: number
  steering: number
  fuel: number
  fuelPerLap: number
  positionX: number
  positionY: number
  positionZ: number
  brakeBiasRear: number // rear brake bias fraction (0–1); 0 = front biased
}

export enum TirePosition {
  FrontLeft = 0,
  FrontRight = 1,
  RearLeft = 2,
  RearRight = 3,
}

export interface TireState {
  position: TirePosition
  tempInner: number
  tempMiddle: number
  tempOuter: number
  tempSurface: number
  tempCore: number
  pressureKPa: number
  wearPercent: number
  compound: string
}

export interface LapState {
  currentLap: number
  currentLapTime: number
  lastLapTime: number
  bestLapTime: number
  targetLapTime: number
  sector: number
  sector1Time: number
  sector2Time: number
  isInLap: boolean
  isOutLap: boolean
  isValid: boolean
  trackPosition: number
}

export interface Flags {
  yellow: boolean
  doubleYellow: boolean
  red: boolean
  safetyCar: boolean
  vsc: boolean
  checkered: boolean
}

export interface Electronics {
  tcActive: boolean
  tc: number
  tcMax: number
  absActive: boolean
  abs: number
  absMax: number
  tcCut: number       // TC cut level (TC2); 0 = off
  tcCutMax: number    // maximum TC cut level for this car
  tcSlip: number      // TC slip level (TC3); 0 = off
  tcSlipMax: number   // maximum TC slip level for this car
  motorMap: number    // engine/motor map setting
  motorMapMax: number // maximum motor map setting for this car
  drsActive: boolean  // DRS currently deployed
}

export interface RaceState {
  position: number       // 1-based race position; 0 if unknown
  totalPositions: number // total cars in session; 0 if unknown
  gapAhead: number       // seconds to car directly ahead; 0 if none/unknown
  gapBehind: number      // seconds to car directly behind; 0 if none/unknown
}

export interface EnergyState {
  virtualEnergy: number  // kJ remaining
  soc: number            // state of charge fraction (0–1)
  regenPower: number     // current regen power in kW
  deployPower: number    // current deploy power in kW
}

export interface Penalties {
  incidents: number
  trackLimitSteps: number
  pitStops: number
}

export interface TelemetryFrame {
  timestamp: number
  session: Session
  car: CarState
  tires: [TireState, TireState, TireState, TireState]
  lap: LapState
  flags: Flags
  electronics: Electronics
  race: RaceState
  energy: EnergyState
  penalties: Penalties
}
