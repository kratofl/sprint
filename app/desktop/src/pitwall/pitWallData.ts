import { parsePlan, type SessionPlan } from '../views/SessionPlannerDomain'

// The pit wall's data as the host sends it (`state.link.pitWall`, `state.pitWallLayout`,
// `GET /api/pitwall/trace`), typed and narrowed once here; bridge.ts calls these parsers and
// everything inward of it trusts the result.

/** Every tile the pit wall has. A tile slot holds one (a plain tile) or several (a stack). */
export type TileKind = 'session' | 'timing' | 'track' | 'stint' | 'fuel' | 'relative' | 'target' | 'tyres' | 'pressure' | 'damage' | 'radar' | 'traces'

export const TILE_KINDS: readonly TileKind[] = ['session', 'timing', 'track', 'stint', 'fuel', 'relative', 'target', 'tyres', 'pressure', 'damage', 'radar', 'traces']

/** Mirrors `SessionType` in Sprint.Desktop.Api; the host sends enum names. */
export type SessionKind = 'Practice' | 'Qualify' | 'Race' | 'Warmup' | 'Unknown'
/** Mirrors `PitState` in Sprint.Desktop.Api. */
export type PitState = 'None' | 'Requested' | 'Entering' | 'Stopped' | 'Exiting'
export type TyrePosition = 'FrontLeft' | 'FrontRight' | 'RearLeft' | 'RearRight'

/** Three sector times (s1, s2, s3 durations, seconds); null where unknown. */
export type Sectors = readonly [number | null, number | null, number | null]

export type PitWallSession = {
  track: string
  trackLengthMeters: number | null
  sessionType: SessionKind
  /** Seconds. */
  timeRemaining: number | null
  totalTime: number | null
  maxLaps: number
  airTemp: number | null
  trackTemp: number | null
  /** Path wetness 0..1. */
  wetness: number | null
  raining: number | null
  /** The game's own grip grade (LMU's `mTrackGripLevel`), comparable only with itself; not 0..1. */
  gripLevel: number | null
}

/** One car in the field, the driver's own included (`isPlayer`). */
export type FieldEntry = {
  id: number
  driver: string
  car: string
  carClass: string
  isPlayer: boolean
  place: number
  classPlace: number
  /** Place when the race started; null outside a race. */
  startPlace: number | null
  lapsCompleted: number
  lapFraction: number
  sector: number
  lastLap: number | null
  bestLap: number | null
  lastSectors: Sectors
  bestSectors: Sectors
  gapToLeader: number
  lapsToLeader: number
  gapToNext: number
  lapsToNext: number
  inPit: boolean
  pitState: PitState
  pitStops: number
  compound: string | null
  x: number
  z: number
}

/** One tyre: surface inner/middle/outer, carcass core and brake (°C), pressure and tread. */
export type TyreCorner = {
  position: TyrePosition
  inner: number
  middle: number
  outer: number
  core: number
  brake: number
  pressureKPa: number
  wearPercent: number
  compound: string
}

export type CarDamage = {
  /** Eight dent severities (0 none, 1 some, 2 more) in LMU's `mDentSeverity` order. */
  dents: readonly number[]
  lastImpact: { sessionTime: number; magnitude: number; lap: number | null } | null
  overheating: boolean
  detachedParts: boolean
}

export type PitWallCar = {
  /** Always front left, front right, rear left, rear right — whichever the host sent. */
  tyres: readonly TyreCorner[]
  fuelLiters: number
  fuelPerLapLiters: number
  fuelCapacityLiters: number | null
  virtualEnergy: number | null
  virtualEnergyPerLap: number | null
  battery: number | null
  damage: CarDamage | null
}

/** A car near ours, in metres: `right` positive to our right, `ahead` positive in front. */
export type RadarCar = { id: number; driver: string; right: number; ahead: number }

export type TyrePressures = { lap: number; fl: number; fr: number; rl: number; rr: number }

/** What the driver's PC sends the engineer: the session, the field, the car, the radar and the plan. */
export type PitWall = {
  session: PitWallSession
  field: FieldEntry[]
  car: PitWallCar
  radar: RadarCar[]
  outline: { x: number; z: number }[]
  pressures: TyrePressures[]
  /** The driver's session plan while they share it. */
  plan: SessionPlan | null
  receivedAt: number
}

export type Bounds = { x: number; y: number; width: number; height: number }

/** One slot on a page: `layers` holds one tile kind, or several for a stack. Grid cells, 12 × 8. */
export type PitWallTile = {
  id: string
  layers: TileKind[]
  x: number
  y: number
  w: number
  h: number
  /** Seconds between layers; null switches by hand. */
  cycleSeconds: number | null
  pauseOnHover: boolean
  jumpRadar: boolean
  jumpDamage: boolean
  detached: boolean
  bounds: Bounds | null
}

export type PitWallPage = { id: string; name: string; detached: boolean; bounds: Bounds | null; tiles: PitWallTile[] }

export type PitWallLayout = { pages: PitWallPage[]; mainBounds: Bounds | null }

/** Which lap a trace is of (`GET /api/pitwall/trace?lap=`). */
export type TraceLap = 'current' | 'last' | 'best' | 'target'

/** A lap's channels against distance round the lap (0..1): speed km/h, pedals 0..1, steering −1..1. */
export type PitWallTrace = {
  lap: number | null
  lapTime: number | null
  distance: number[]
  speed: number[]
  throttle: number[]
  brake: number[]
  steering: number[]
}

export const EMPTY_TRACE: PitWallTrace = { lap: null, lapTime: null, distance: [], speed: [], throttle: [], brake: [], steering: [] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const optional = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numbers = (value: unknown): number[] => (Array.isArray(value) ? value.map(finite) : [])

const SESSION_KINDS: readonly SessionKind[] = ['Practice', 'Qualify', 'Race', 'Warmup', 'Unknown']
const PIT_STATES: readonly PitState[] = ['None', 'Requested', 'Entering', 'Stopped', 'Exiting']
const TYRE_POSITIONS: readonly TyrePosition[] = ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight']

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => options.find((option) => option === value) ?? fallback
export const isTileKind = (value: unknown): value is TileKind => TILE_KINDS.some((kind) => kind === value)

const sectors = (value: unknown): Sectors => {
  const list = Array.isArray(value) ? value : []
  return [optional(list[0]), optional(list[1]), optional(list[2])]
}

const parseSession = (value: unknown): PitWallSession => {
  const row = isRecord(value) ? value : {}
  return {
    track: text(row.track),
    trackLengthMeters: optional(row.trackLengthMeters),
    sessionType: pick(SESSION_KINDS, row.sessionType, 'Unknown'),
    timeRemaining: optional(row.timeRemaining),
    totalTime: optional(row.totalTime),
    maxLaps: finite(row.maxLaps),
    airTemp: optional(row.airTemp),
    trackTemp: optional(row.trackTemp),
    wetness: optional(row.wetness),
    raining: optional(row.raining),
    gripLevel: optional(row.gripLevel),
  }
}

const parseFieldEntry = (value: unknown): FieldEntry[] => {
  if (!isRecord(value) || typeof value.id !== 'number') return []
  return [
    {
      id: value.id,
      driver: text(value.driver),
      car: text(value.car),
      carClass: text(value.carClass),
      isPlayer: value.isPlayer === true,
      place: finite(value.place),
      classPlace: finite(value.classPlace),
      startPlace: optional(value.startPlace),
      lapsCompleted: finite(value.lapsCompleted),
      lapFraction: Math.min(1, Math.max(0, finite(value.lapFraction))),
      sector: finite(value.sector),
      lastLap: optional(value.lastLap),
      bestLap: optional(value.bestLap),
      lastSectors: sectors(value.lastSectors),
      bestSectors: sectors(value.bestSectors),
      gapToLeader: finite(value.gapToLeader),
      lapsToLeader: finite(value.lapsToLeader),
      gapToNext: finite(value.gapToNext),
      lapsToNext: finite(value.lapsToNext),
      inPit: value.inPit === true,
      pitState: pick(PIT_STATES, value.pitState, 'None'),
      pitStops: finite(value.pitStops),
      compound: typeof value.compound === 'string' && value.compound.length > 0 ? value.compound : null,
      x: finite(value.x),
      z: finite(value.z),
    },
  ]
}

const parseTyre = (value: unknown): TyreCorner | null => {
  if (!isRecord(value)) return null
  const position = TYRE_POSITIONS.find((candidate) => candidate === value.position)
  if (!position) return null
  return {
    position,
    inner: finite(value.inner),
    middle: finite(value.middle),
    outer: finite(value.outer),
    core: finite(value.core),
    brake: finite(value.brake),
    pressureKPa: finite(value.pressureKPa),
    wearPercent: finite(value.wearPercent),
    compound: text(value.compound),
  }
}

const parseDamage = (value: unknown): CarDamage | null => {
  if (!isRecord(value)) return null
  const impact = isRecord(value.lastImpact) ? value.lastImpact : null
  const dents = numbers(value.dents).slice(0, 8)
  while (dents.length < 8) dents.push(0)
  return {
    dents,
    lastImpact: impact ? { sessionTime: finite(impact.sessionTime), magnitude: finite(impact.magnitude), lap: optional(impact.lap) } : null,
    overheating: value.overheating === true,
    detachedParts: value.detachedParts === true,
  }
}

const parseCar = (value: unknown): PitWallCar => {
  const row = isRecord(value) ? value : {}
  const tyres = Array.isArray(row.tyres) ? row.tyres.map(parseTyre).filter((tyre): tyre is TyreCorner => tyre !== null) : []
  return {
    tyres: TYRE_POSITIONS.flatMap((position) => tyres.filter((tyre) => tyre.position === position).slice(0, 1)),
    fuelLiters: finite(row.fuelLiters),
    fuelPerLapLiters: finite(row.fuelPerLapLiters),
    fuelCapacityLiters: optional(row.fuelCapacityLiters),
    virtualEnergy: optional(row.virtualEnergy),
    virtualEnergyPerLap: optional(row.virtualEnergyPerLap),
    battery: optional(row.battery),
    damage: parseDamage(row.damage),
  }
}

/** Narrows `state.link.pitWall`. Null when absent: no board has arrived, or this PC drives. */
export const parsePitWall = (value: unknown): PitWall | null => {
  if (!isRecord(value)) return null
  return {
    session: parseSession(value.session),
    field: Array.isArray(value.field) ? value.field.flatMap(parseFieldEntry) : [],
    car: parseCar(value.car),
    radar: Array.isArray(value.radar)
      ? value.radar.flatMap((row: unknown) =>
          isRecord(row) && typeof row.id === 'number' ? [{ id: row.id, driver: text(row.driver), right: finite(row.right), ahead: finite(row.ahead) }] : [],
        )
      : [],
    outline: Array.isArray(value.outline) ? value.outline.flatMap((row: unknown) => (isRecord(row) ? [{ x: finite(row.x), z: finite(row.z) }] : [])) : [],
    pressures: Array.isArray(value.pressures)
      ? value.pressures.flatMap((row: unknown) =>
          isRecord(row) ? [{ lap: finite(row.lap), fl: finite(row.fl), fr: finite(row.fr), rl: finite(row.rl), rr: finite(row.rr) }] : [],
        )
      : [],
    plan: isRecord(value.plan) ? parsePlan(value.plan) : null,
    receivedAt: finite(value.receivedAt),
  }
}

const parseBounds = (value: unknown): Bounds | null =>
  isRecord(value) && [value.x, value.y, value.width, value.height].every((part) => typeof part === 'number' && Number.isFinite(part))
    ? { x: finite(value.x), y: finite(value.y), width: finite(value.width), height: finite(value.height) }
    : null

const parseTile = (value: unknown): PitWallTile[] => {
  if (!isRecord(value) || typeof value.id !== 'string') return []
  const layers = Array.isArray(value.layers) ? value.layers.filter(isTileKind) : []
  if (layers.length === 0) return []
  return [
    {
      id: value.id,
      layers,
      x: finite(value.x),
      y: finite(value.y),
      w: Math.max(1, finite(value.w)),
      h: Math.max(1, finite(value.h)),
      cycleSeconds: optional(value.cycleSeconds),
      pauseOnHover: value.pauseOnHover === true,
      jumpRadar: value.jumpRadar === true,
      jumpDamage: value.jumpDamage === true,
      detached: value.detached === true,
      bounds: parseBounds(value.bounds),
    },
  ]
}

/** Narrows `state.pitWallLayout`; null when the host sent none (an older host). */
export const parsePitWallLayout = (value: unknown): PitWallLayout | null => {
  if (!isRecord(value) || !Array.isArray(value.pages)) return null
  const pages = value.pages.flatMap((page: unknown): PitWallPage[] =>
    isRecord(page) && typeof page.id === 'string'
      ? [
          {
            id: page.id,
            name: text(page.name) || 'Page',
            detached: page.detached === true,
            bounds: parseBounds(page.bounds),
            tiles: Array.isArray(page.tiles) ? page.tiles.flatMap(parseTile) : [],
          },
        ]
      : [],
  )
  return pages.length > 0 ? { pages, mainBounds: parseBounds(value.mainBounds) } : null
}

/** Narrows one trace answer; anything malformed is an empty trace. Channels are cut to the shortest. */
export const parsePitWallTrace = (value: unknown): PitWallTrace => {
  if (!isRecord(value)) return EMPTY_TRACE
  const distance = numbers(value.distance)
  const speed = numbers(value.speed)
  const throttle = numbers(value.throttle)
  const brake = numbers(value.brake)
  const steering = numbers(value.steering)
  const length = Math.min(distance.length, speed.length, throttle.length, brake.length, steering.length)
  return {
    lap: optional(value.lap),
    lapTime: optional(value.lapTime),
    distance: distance.slice(0, length),
    speed: speed.slice(0, length),
    throttle: throttle.slice(0, length),
    brake: brake.slice(0, length),
    steering: steering.slice(0, length),
  }
}
