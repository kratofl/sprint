/**
 * The driving guide as the renderer sees it: the settings and status the host puts in
 * `/api/state`, and the messages of its `/api/guide/stream`. Narrowed here, once; the
 * overlay and the Settings view take these types as given. Host side:
 * `DrivingGuideSettings`, `DrivingGuideState`, `DrivingGuideStream`.
 */

export type GuideSettings = {
  showLine: boolean
  showBoards: boolean
  monitorOverlay: boolean
  vrHeadset: boolean
  eyeRightMeters: number
  eyeUpMeters: number
  eyeForwardMeters: number
  yawOffsetDegrees: number
  pitchOffsetDegrees: number
  monitorFovDegrees: number
  metersAhead: number
}

/** Mirrors `DrivingGuideStatus` in Sprint.Desktop.Core; the host sends enum names. */
export type GuideStatus = 'Idle' | 'Searching' | 'Ready' | 'NoLap'

export type GuideLap = { lapTimeSeconds: number; car: string; recordedAt: string; sameCar: boolean }

export type GuideVr = { available: boolean; registered: boolean; detail: string | null }

export type GuideState = {
  settings: GuideSettings
  status: GuideStatus
  lap: GuideLap | null
  boards: number
  vr: GuideVr
}

/** What the overlay draws from. Points are flat: x, y, z, pedal for each. */
export type GuideGeometry = {
  positionStep: number
  trackLength: number
  points: Float64Array
  boards: GuideBoard[]
  boardWidth: number
  boardHeight: number
}

export type GuideBoard = { x: number; y: number; z: number; facingX: number; facingZ: number; index: number }

/** The car's pose in the host's `CarPose` convention (right-handed, Y up, body -Z forward). */
export type GuidePose = {
  x: number; y: number; z: number
  qx: number; qy: number; qz: number; qw: number
  vx: number; vy: number; vz: number
  wx: number; wy: number; wz: number
  trackPosition: number
}

export type GuideView = {
  showLine: boolean
  showBoards: boolean
  eyeRight: number
  eyeUp: number
  eyeForward: number
  yaw: number
  pitch: number
  fov: number
  metersAhead: number
}

export type GuideMessage =
  | { type: 'settings'; view: GuideView }
  | { type: 'geometry'; geometry: GuideGeometry | null }
  | { type: 'pose'; pose: GuidePose | null }

/** The values `DrivingGuideSettings` defaults to, for a host that sends none. */
export const defaultGuideSettings = (): GuideSettings => ({
  showLine: false,
  showBoards: false,
  monitorOverlay: false,
  vrHeadset: false,
  eyeRightMeters: 0,
  eyeUpMeters: 1,
  eyeForwardMeters: 0,
  yawOffsetDegrees: 0,
  pitchOffsetDegrees: 0,
  monitorFovDegrees: 50,
  metersAhead: 250,
})

const guideStatuses: readonly GuideStatus[] = ['Idle', 'Searching', 'Ready', 'NoLap']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const numberOr = (value: unknown, fallback: number): number => (finite(value) ? value : fallback)

/** `settings.drivingGuide` and the top-level `guide` of `/api/state`. */
export const parseGuideState = (settings: unknown, guide: unknown): GuideState => {
  const defaults = defaultGuideSettings()
  const raw = isRecord(settings) ? settings : {}
  const state = isRecord(guide) ? guide : {}
  const lap = isRecord(state.lap) && finite(state.lap.lapTimeSeconds)
    ? {
        lapTimeSeconds: state.lap.lapTimeSeconds,
        car: typeof state.lap.car === 'string' ? state.lap.car : '',
        recordedAt: typeof state.lap.recordedAt === 'string' ? state.lap.recordedAt : '',
        sameCar: state.lap.sameCar !== false,
      }
    : null
  const vr = isRecord(state.vr) ? state.vr : {}
  return {
    settings: {
      showLine: raw.showLine === true,
      showBoards: raw.showBoards === true,
      monitorOverlay: raw.monitorOverlay === true,
      vrHeadset: raw.vrHeadset === true,
      eyeRightMeters: numberOr(raw.eyeRightMeters, defaults.eyeRightMeters),
      eyeUpMeters: numberOr(raw.eyeUpMeters, defaults.eyeUpMeters),
      eyeForwardMeters: numberOr(raw.eyeForwardMeters, defaults.eyeForwardMeters),
      yawOffsetDegrees: numberOr(raw.yawOffsetDegrees, defaults.yawOffsetDegrees),
      pitchOffsetDegrees: numberOr(raw.pitchOffsetDegrees, defaults.pitchOffsetDegrees),
      monitorFovDegrees: numberOr(raw.monitorFovDegrees, defaults.monitorFovDegrees),
      metersAhead: numberOr(raw.metersAhead, defaults.metersAhead),
    },
    status: guideStatuses.find((status) => status === state.status) ?? 'Idle',
    lap,
    boards: finite(state.boards) ? state.boards : 0,
    vr: {
      available: vr.available === true,
      registered: vr.registered === true,
      detail: typeof vr.detail === 'string' && vr.detail.length > 0 ? vr.detail : null,
    },
  }
}

/** One line of `/api/guide/stream`, or null for anything malformed. */
export const parseGuideMessage = (value: unknown): GuideMessage | null => {
  if (!isRecord(value)) return null
  switch (value.type) {
    case 'settings':
      return {
        type: 'settings',
        view: {
          showLine: value.showLine === true,
          showBoards: value.showBoards === true,
          eyeRight: numberOr(value.eyeRight, 0),
          eyeUp: numberOr(value.eyeUp, 1),
          eyeForward: numberOr(value.eyeForward, 0),
          yaw: numberOr(value.yaw, 0),
          pitch: numberOr(value.pitch, 0),
          fov: numberOr(value.fov, 50),
          metersAhead: numberOr(value.metersAhead, 250),
        },
      }
    case 'geometry':
      return { type: 'geometry', geometry: parseGeometry(value.geometry) }
    case 'pose':
      return { type: 'pose', pose: parsePose(value.pose) }
    default:
      return null
  }
}

const parseGeometry = (value: unknown): GuideGeometry | null => {
  if (!isRecord(value) || !finite(value.positionStep) || value.positionStep <= 0 || !finite(value.trackLength) || value.trackLength <= 0) return null
  if (!Array.isArray(value.points) || value.points.length < 8 || value.points.length % 4 !== 0 || !value.points.every(finite)) return null
  const boards = Array.isArray(value.boards) && value.boards.length % 6 === 0 && value.boards.every(finite) ? value.boards : []
  const parsedBoards: GuideBoard[] = []
  for (let i = 0; i < boards.length; i += 6) {
    parsedBoards.push({ x: boards[i], y: boards[i + 1], z: boards[i + 2], facingX: boards[i + 3], facingZ: boards[i + 4], index: boards[i + 5] })
  }
  return {
    positionStep: value.positionStep,
    trackLength: value.trackLength,
    points: Float64Array.from(value.points),
    boards: parsedBoards,
    boardWidth: numberOr(value.boardWidth, 1.5),
    boardHeight: numberOr(value.boardHeight, 2),
  }
}

const poseFields = ['x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'vx', 'vy', 'vz', 'wx', 'wy', 'wz', 'trackPosition'] as const

const parsePose = (value: unknown): GuidePose | null => {
  if (!isRecord(value)) return null
  const pose: GuidePose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, trackPosition: 0 }
  for (const field of poseFields) {
    const reading = value[field]
    if (!finite(reading)) return null
    pose[field] = reading
  }
  return pose
}
