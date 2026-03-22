// Mirrors pkg/dto/telemetry.go — keep in sync with the Go source of truth.

export type SessionType = 'practice' | 'qualify' | 'race' | 'warmup' | 'unknown'

export interface Session {
  game: string
  track: string
  car: string
  sessionType: SessionType
  sessionTime: number
  bestLapTime: number
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

export interface TelemetryFrame {
  timestamp: number
  session: Session
  car: CarState
  tires: [TireState, TireState, TireState, TireState]
  lap: LapState
  flags: Flags
}
