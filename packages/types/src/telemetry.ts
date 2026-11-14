// Web-side telemetry contract — keep in sync with the desktop `Sprint.Desktop.Api` (TelemetryFrame).

export type SessionType = 'practice' | 'qualify' | 'race' | 'warmup' | 'unknown'

// Where a car is in a pit stop.
export type PitState = 'none' | 'requested' | 'entering' | 'stopped' | 'exiting'

export type FinishStatus = 'none' | 'finished' | 'dnf' | 'disqualified'

export interface Session {
  game: string
  track: string
  // Length of the track layout in metres; null when unknown. Recorded beside a lap's
  // context as a cross-check that two writers mean the same layout.
  trackLengthMeters: number | null
  car: string
  carClass: string // car class as the game states it (e.g. 'Hypercar'); '' when unknown
  sessionType: SessionType
  sessionTime: number // seconds elapsed in the session
  // Total length of a timed session in seconds. null when the session is lap-based or the
  // game reports an implausible value — unknown, never a number to plan against.
  totalSessionTime: number | null
  // Seconds left in a timed session; null whenever totalSessionTime is null, since a
  // remainder without a total describes nothing.
  sessionTimeRemaining: number | null
  bestLapTime: number
  maxLaps: number // total laps for this session; 0 for time-based sessions
  inCar: boolean  // true only when the player has an active vehicle on track
}

export interface CarState {
  speedMS: number
  gear: number
  rpm: number
  maxRPM: number
  throttle: number // driver position before traction-control filtering
  brake: number // driver position before ABS filtering
  clutch: number // driver position before vehicle-side filtering
  steering: number // driver position before steering-assist filtering
  fuel: number
  fuelPerLap: number
  positionX: number
  positionY: number
  positionZ: number
  brakeBiasRear: number // rear brake bias fraction (0–1); 0 = front biased
  // Pit lane and garage. null when the game does not say.
  inGarage: boolean | null   // in its own garage stall, where the setup can change
  inPitLane: boolean | null  // between pit entry and pit exit
  pitState: PitState | null
  pitLimiter: boolean | null // pit speed limiter switched on
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
  positionLapTime: number
  lastLapTime: number
  bestLapTime: number
  targetLapTime: number  // active reference lap time; 0 means no reference
  delta: number          // position-based delta to reference lap in seconds; 0 if no reference
  sector: number
  sector1Time: number
  sector2Time: number
  // Durations (not cumulative marks) of the last completed lap's sectors, in order.
  // Empty until the game reports credible marks.
  lastLapSectorsSeconds: number[]
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
  tcCut: number       // TC cut level (TC2); 0 = off
  tcCutMax: number    // maximum TC cut level for this car
  tcSlip: number      // TC slip level (TC3); 0 = off
  tcSlipMax: number   // maximum TC slip level for this car
  absActive: boolean
  abs: number
  absMax: number
  motorMap: number    // engine/motor map setting
  motorMapMax: number // maximum motor map setting for this car
  migration: number   // brake migration setting; its max is 0 when the car has none
  migrationMax: number
  frontAntiRollBar: number
  frontAntiRollBarMax: number
  rearAntiRollBar: number
  rearAntiRollBarMax: number
  drsActive: boolean  // DRS currently deployed

  // Availability flags — false when the feature is not present on the current car.
  absAvailable: boolean
  tcAvailable: boolean
  tcCutAvailable: boolean
  tcSlipAvailable: boolean
  motorMapAvailable: boolean
}

export interface RaceState {
  position: number       // 1-based race position; 0 if unknown
  totalPositions: number // total cars in session; 0 if unknown
  gapAhead: number       // seconds to car directly ahead; 0 if none/unknown
  gapBehind: number      // seconds to car directly behind; 0 if none/unknown
}

export interface EnergyState {
  virtualEnergy: number  // kJ remaining
  virtualEnergyPerLap: number // rolling virtual-energy consumption per completed lap
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
  conditions: SessionConditions
  // Every car in the session, the player's included, as the game last scored them (LMU:
  // ~5 Hz). Empty when the game does not report other cars.
  field: FieldCar[]
}

// One car in the session as scoring reports it: a timing-table row and a track-map dot.
export interface FieldCar {
  id: number              // the game's slot id; unique within one snapshot
  driver: string
  car: string             // the entry (team, livery, number), as Session.car names the player's
  carClass: string
  isPlayer: boolean
  place: number           // 1-based overall; 0 when unknown
  classPlace: number      // 1-based within carClass; 0 when unknown
  lapsCompleted: number
  lapDistanceMeters: number // against Session.trackLengthMeters it is the lap fraction
  sector: number          // 1–3; 0 when unknown
  bestLapTime: number | null
  lastLapTime: number | null
  // Sector durations of the last lap (null unless its marks were credible) and of the lap
  // being driven (each null until that sector is done).
  lastLapSector1: number | null
  lastLapSector2: number | null
  lastLapSector3: number | null
  currentLapSector1: number | null
  currentLapSector2: number | null
  gapToLeader: number     // seconds behind the overall leader, plus whole laps below
  lapsToLeader: number
  gapToNext: number       // seconds behind the car one place ahead, plus whole laps below
  lapsToNext: number
  inPitLane: boolean
  inGarage: boolean
  pitState: PitState
  pitStops: number
  finishStatus: FinishStatus
  // World position in metres, right-handed and seen from above: the frame lap traces use.
  positionX: number
  positionZ: number
}

// Conditions a session is run under. Every value is nullable because no game reports all
// of them: null means "this game did not say", never a default. Recorded with each lap so
// history can later be filtered by conditions without re-driving anything.
export interface SessionConditions {
  pathWetness: number | null      // average wetness of the racing line, 0–1
  trackGripLevel: number | null   // game-graded grip; only comparable against itself
  fuelMultiplier: number | null
  tireMultiplier: number | null
  fixedSetup: boolean | null
}
