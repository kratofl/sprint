// Web-side telemetry contract — keep in sync with the desktop `Sprint.Desktop.Api` (TelemetryFrame).

export type SessionType = 'practice' | 'qualify' | 'race' | 'warmup' | 'unknown'

// Where a car is in a pit stop.
export type PitState = 'none' | 'requested' | 'entering' | 'stopped' | 'exiting'

export type FinishStatus = 'none' | 'finished' | 'dnf' | 'disqualified'

// What a car's hybrid motor is doing; 'unavailable' for a car without one.
export type ElectricMotorState = 'unavailable' | 'inactive' | 'propulsion' | 'regeneration'

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
  waterTemp: number | null // engine water, °C; null when the game does not say
  oilTemp: number | null   // engine oil, °C; null when the game does not say
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
  engineTorque: number | null // Nm, hybrid torque included; null when the game does not say
  turboBoost: number | null   // as the game reports it (LMU states no unit); null without a turbo
  headlights: boolean | null
  wiperState: number | null   // the game's own wiper setting, 0 presumably off
  // Fuel per lap as the host measures it from the tank, litres; null until known. The stint
  // average counts only laps with no pit lane and no yellow, safety car or full course yellow.
  fuelLastLap: number | null
  fuelThisLap: number | null
  fuelStintPerLap: number | null
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
  brakeTemp: number // °C
  optimalTemp: number // the compound's ideal temperature, °C; 0 when unknown
  wearLastLap: number | null    // wear the last lap took, percentage points; null until known
  avgTempLastLap: number | null // tread temperature averaged over the last lap, °C; null until known
  flat: boolean     // a puncture
  detached: boolean // the wheel has come off
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
  // Durations of the sectors of the lap being driven that are done so far (none to two).
  currentLapSectorsSeconds: number[]
  // The session's best in each sector: three entries (null where nobody has a time yet), or
  // empty when unknown. The player's own, anyone's, and the player's class's.
  personalBestSectorsSeconds: (number | null)[]
  sessionBestSectorsSeconds: (number | null)[]
  classBestSectorsSeconds: (number | null)[]
  sessionBestLapTime: number | null // fastest lap anyone has set this session
  classBestLapTime: number | null   // fastest lap in the player's class this session
  isInLap: boolean
  isOutLap: boolean
  isValid: boolean
  lastLapValid: boolean // whether the last completed lap counted; true until one has been
  trackPosition: number
  // From the player's own laps, seconds; null until known.
  lastFiveLapsAverage: number | null // average of the last five valid laps this session
  lastTenLapsAverage: number | null  // average of the last ten valid laps this session
  allTimeBestLapTime: number | null  // fastest valid lap ever at this track in this car
  pitLoss: number | null             // what a pit stop costs: lane loss plus standing time
  lastLapTopSpeedMS: number | null   // the fastest the car went on the last completed lap, m/s
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
  // Gaps in seconds, timed by the host from where the cars were when (so they hold while both
  // cars brake), else the game's own figure.
  gapAhead: number       // to the nearest car ahead on the road; 0 if none/unknown
  gapBehind: number      // to the nearest car behind on the road; 0 if none/unknown
  classGapAhead: number | null    // to the car one place ahead in our class; null if none/unknown
  classGapBehind: number | null
  positionGapAhead: number | null // to the car one place ahead overall; null if none/unknown
  positionGapBehind: number | null
  gapToLeader: number | null      // null when we lead or it is unknown
  gapToClassLeader: number | null
  // The spotter: how far ahead (negative: behind) the nearest car alongside is, metres, on
  // each side; null when nobody is alongside.
  carLeftMeters: number | null
  carRightMeters: number | null
}

export interface EnergyState {
  virtualEnergy: number  // kJ remaining
  virtualEnergyPerLap: number // rolling virtual-energy consumption per completed lap
  soc: number            // state of charge fraction (0–1)
  regenPower: number     // current regen power in kW
  deployPower: number    // current deploy power in kW; 0 unless the motor propels the car
  motorState: ElectricMotorState
  motorTemp: number | null      // hybrid motor, °C; null without one
  motorWaterTemp: number | null // hybrid motor cooling water, °C; null without a cooler
  liftAndCoast: number   // the game's lift-and-coast cue, 0–255, counting up
  virtualEnergyLastLap: number | null     // used by the last lap; null until known
  virtualEnergyStintPerLap: number | null // per clean lap of the stint, as fuelStintPerLap
}

export interface Penalties {
  incidents: number
  trackLimitSteps: number
  trackLimitStepsPerPenalty: number // 0 when unknown
  pitStops: number
  scheduledPitStops: number // pit stops the game's strategy plans; 0 when none
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
  penalties: number       // penalties still to serve
  finishStatus: FinishStatus
  // World position in metres, right-handed and seen from above: the frame lap traces use.
  positionX: number
  positionZ: number
  // Seconds on the road from the player's car (negative: ahead), timed by the host; null for
  // the player's own car and while the host has too little history.
  relativeGapSeconds: number | null
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
  airTemperature: number | null   // °C
  trackTemperature: number | null // °C
  raining: number | null          // how hard it rains, 0–1
}
