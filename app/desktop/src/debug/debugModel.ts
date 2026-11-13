import type { StatusTone } from '../shell/Status'

// The dev debug window (electron/debugWindow.ts, `?debug=1`): the host's `GET /api/debug`
// (`DebugSnapshot` in Sprint.Desktop.Host) narrowed once here, then turned into the rows the window
// shows. Every number is `number | null`: a field an older host does not send reads "—", never 0.

export type DebugCorner = {
  position: string
  tempInner: number | null
  tempMiddle: number | null
  tempOuter: number | null
  tempCore: number | null
  pressureKPa: number | null
  wearPercent: number | null
  brakeTemp: number | null
  compound: string
}

/** The cockpit settings, each with the car's maximum (0: the car has none). */
export type DebugElectronics = {
  tc: number | null
  tcMax: number | null
  tcCut: number | null
  tcCutMax: number | null
  tcSlip: number | null
  tcSlipMax: number | null
  tcActive: boolean
  abs: number | null
  absMax: number | null
  motorMap: number | null
  motorMapMax: number | null
  migration: number | null
  migrationMax: number | null
}

export type DebugScreen = {
  deviceId: string
  name: string
  driver: string
  width: number | null
  height: number | null
  refreshHz: number | null
  /** `ScreenConnectionState` by name; null while the device has no running output. */
  state: string | null
  detail: string | null
  fps: number | null
  renderMs: number | null
  usbMs: number | null
  totalMs: number | null
  framesSent: number | null
  /** Drawn but held back: the same picture as the frame before. */
  framesUnchanged: number | null
  /** Drawn but lost in the USB transfer. */
  framesFailed: number | null
  viewers: number | null
}

export type DebugSnapshot = {
  telemetry: {
    source: string
    state: string
    detail: string | null
    hz: number | null
    frameAgeMs: number | null
    lastFrameValid: boolean
    invalidReason: string | null
  }
  session: {
    game: string
    track: string
    trackLengthMeters: number | null
    car: string
    carClass: string
    type: string
    phase: string
    inCar: boolean
    lap: number | null
    /** 0 without a lap limit. */
    maxLaps: number | null
    sessionTimeSeconds: number | null
    timeRemainingSeconds: number | null
    position: number | null
    totalPositions: number | null
    currentLapTime: number | null
    lastLapTime: number | null
    bestLapTime: number | null
    targetLapTime: number | null
    delta: number | null
    sector: number | null
    lapValid: boolean
    inPitLane: boolean
    inGarage: boolean
    pitState: string | null
  }
  car: {
    speedKph: number | null
    gear: number | null
    rpm: number | null
    maxRpm: number | null
    throttle: number | null
    throttleApplied: number | null
    brake: number | null
    brakeApplied: number | null
    clutch: number | null
    steering: number | null
    fuelLiters: number | null
    fuelCapacityLiters: number | null
    fuelPerLapLiters: number | null
    brakeBiasRear: number | null
    pitLimiter: boolean | null
    electronics: DebugElectronics
    virtualEnergy: number | null
    stateOfCharge: number | null
    corners: DebugCorner[]
  }
  screens: DebugScreen[]
  sprint: {
    targets: { lapTimeSeconds: number | null; fuelPerLapLiters: number | null; referenceLapSeconds: number | null }
    plan: { id: string; name: string; status: string; mode: string; avgLapTimeSeconds: number | null; fuelPerLapLiters: number | null } | null
    hud: { open: boolean; arranging: boolean; exclusiveFullscreen: boolean }
    link: {
      phase: string
      role: string | null
      path: string | null
      roundTripMs: number | null
      sampleRate: number | null
      lossPercent: number | null
      peerApp: string | null
      peerMatch: string | null
      detail: string | null
    }
    recorder: { sessionId: string; kind: string; track: string; car: string; startedAt: string | null; laps: number | null; lastLapFuelLiters: number | null } | null
    timings: { stateAssembledMs: number | null; publishTickMs: number | null }
  }
}

/**
 * What the debug window is sent each state poll: the host's snapshot (null with the reason when the
 * host has none, e.g. a Release host), how long Electron's last state poll took, and whether the
 * window keeps on top.
 */
export type DebugMessage = { snapshot: DebugSnapshot | null; error: string | null; statePollMs: number | null; onTop: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {})

function parseCorner(value: unknown): DebugCorner {
  const corner = record(value)
  return {
    position: str(corner.position),
    tempInner: num(corner.tempInner),
    tempMiddle: num(corner.tempMiddle),
    tempOuter: num(corner.tempOuter),
    tempCore: num(corner.tempCore),
    pressureKPa: num(corner.pressureKPa),
    wearPercent: num(corner.wearPercent),
    brakeTemp: num(corner.brakeTemp),
    compound: str(corner.compound),
  }
}

function parseScreen(value: unknown): DebugScreen | null {
  if (!isRecord(value) || typeof value.deviceId !== 'string') return null
  return {
    deviceId: value.deviceId,
    name: str(value.name),
    driver: str(value.driver),
    width: num(value.width),
    height: num(value.height),
    refreshHz: num(value.refreshHz),
    state: strOrNull(value.state),
    detail: strOrNull(value.detail),
    fps: num(value.fps),
    renderMs: num(value.renderMs),
    usbMs: num(value.usbMs),
    totalMs: num(value.totalMs),
    framesSent: num(value.framesSent),
    framesUnchanged: num(value.framesUnchanged),
    framesFailed: num(value.framesFailed),
    viewers: num(value.viewers),
  }
}

/** Narrows `/api/debug`; null when it is not a snapshot at all. */
export function parseDebugSnapshot(value: unknown): DebugSnapshot | null {
  if (!isRecord(value) || !isRecord(value.telemetry) || !isRecord(value.session) || !isRecord(value.car) || !isRecord(value.sprint)) return null
  const { telemetry, session, car, sprint } = value
  const electronics = record(car.electronics)
  const targets = record(sprint.targets)
  const hud = record(sprint.hud)
  const link = record(sprint.link)
  const timings = record(sprint.timings)
  const plan = isRecord(sprint.plan) ? sprint.plan : null
  const recorder = isRecord(sprint.recorder) ? sprint.recorder : null
  return {
    telemetry: {
      source: str(telemetry.source),
      state: str(telemetry.state),
      detail: strOrNull(telemetry.detail),
      hz: num(telemetry.hz),
      frameAgeMs: num(telemetry.frameAgeMs),
      lastFrameValid: telemetry.lastFrameValid !== false,
      invalidReason: strOrNull(telemetry.invalidReason),
    },
    session: {
      game: str(session.game),
      track: str(session.track),
      trackLengthMeters: num(session.trackLengthMeters),
      car: str(session.car),
      carClass: str(session.carClass),
      type: str(session.type),
      phase: str(session.phase),
      inCar: session.inCar === true,
      lap: num(session.lap),
      maxLaps: num(session.maxLaps),
      sessionTimeSeconds: num(session.sessionTimeSeconds),
      timeRemainingSeconds: num(session.timeRemainingSeconds),
      position: num(session.position),
      totalPositions: num(session.totalPositions),
      currentLapTime: num(session.currentLapTime),
      lastLapTime: num(session.lastLapTime),
      bestLapTime: num(session.bestLapTime),
      targetLapTime: num(session.targetLapTime),
      delta: num(session.delta),
      sector: num(session.sector),
      lapValid: session.lapValid !== false,
      inPitLane: session.inPitLane === true,
      inGarage: session.inGarage === true,
      pitState: strOrNull(session.pitState),
    },
    car: {
      speedKph: num(car.speedKph),
      gear: num(car.gear),
      rpm: num(car.rpm),
      maxRpm: num(car.maxRpm),
      throttle: num(car.throttle),
      throttleApplied: num(car.throttleApplied),
      brake: num(car.brake),
      brakeApplied: num(car.brakeApplied),
      clutch: num(car.clutch),
      steering: num(car.steering),
      fuelLiters: num(car.fuelLiters),
      fuelCapacityLiters: num(car.fuelCapacityLiters),
      fuelPerLapLiters: num(car.fuelPerLapLiters),
      brakeBiasRear: num(car.brakeBiasRear),
      pitLimiter: boolOrNull(car.pitLimiter),
      electronics: {
        tc: num(electronics.tc),
        tcMax: num(electronics.tcMax),
        tcCut: num(electronics.tcCut),
        tcCutMax: num(electronics.tcCutMax),
        tcSlip: num(electronics.tcSlip),
        tcSlipMax: num(electronics.tcSlipMax),
        tcActive: electronics.tcActive === true,
        abs: num(electronics.abs),
        absMax: num(electronics.absMax),
        motorMap: num(electronics.motorMap),
        motorMapMax: num(electronics.motorMapMax),
        migration: num(electronics.migration),
        migrationMax: num(electronics.migrationMax),
      },
      virtualEnergy: num(car.virtualEnergy),
      stateOfCharge: num(car.stateOfCharge),
      corners: Array.isArray(car.corners) ? car.corners.map(parseCorner) : [],
    },
    screens: Array.isArray(value.screens) ? value.screens.map(parseScreen).filter((screen): screen is DebugScreen => screen !== null) : [],
    sprint: {
      targets: { lapTimeSeconds: num(targets.lapTimeSeconds), fuelPerLapLiters: num(targets.fuelPerLapLiters), referenceLapSeconds: num(targets.referenceLapSeconds) },
      plan: plan
        ? {
            id: str(plan.id),
            name: str(plan.name),
            status: str(plan.status),
            mode: str(plan.mode),
            avgLapTimeSeconds: num(plan.avgLapTimeSeconds),
            fuelPerLapLiters: num(plan.fuelPerLapLiters),
          }
        : null,
      hud: { open: hud.open === true, arranging: hud.arranging === true, exclusiveFullscreen: hud.exclusiveFullscreen === true },
      link: {
        phase: str(link.phase) || 'Off',
        role: strOrNull(link.role),
        path: strOrNull(link.path),
        roundTripMs: num(link.roundTripMs),
        sampleRate: num(link.sampleRate),
        lossPercent: num(link.lossPercent),
        peerApp: strOrNull(link.peerApp),
        peerMatch: strOrNull(link.peerMatch),
        detail: strOrNull(link.detail),
      },
      recorder: recorder
        ? {
            sessionId: str(recorder.sessionId),
            kind: str(recorder.kind),
            track: str(recorder.track),
            car: str(recorder.car),
            startedAt: strOrNull(recorder.startedAt),
            laps: num(recorder.laps),
            lastLapFuelLiters: num(recorder.lastLapFuelLiters),
          }
        : null,
      timings: { stateAssembledMs: num(timings.stateAssembledMs), publishTickMs: num(timings.publishTickMs) },
    },
  }
}

/** Narrows what electron/debugWindow.ts sends; null when it is not a debug message. */
export function parseDebugMessage(value: unknown): DebugMessage | null {
  if (!isRecord(value)) return null
  return {
    snapshot: parseDebugSnapshot(value.snapshot),
    error: strOrNull(value.error),
    statePollMs: num(value.statePollMs),
    onTop: value.onTop === true,
  }
}

// ── What the window shows ────────────────────────────────────────────────────

/** One label and its value; a tone puts a status dot before the value. */
export type DebugRow = { label: string; value: string; tone?: StatusTone }
export type DebugSection = { title: string; rows: DebugRow[] }
export type DebugTile = { label: string; value: string; sub: string | null }
export type DebugCornerView = { name: string; temps: string; core: string; pressure: string; wear: string; brake: string; compound: string }
export type DebugScreenView = { id: string; title: string; tone: StatusTone; status: string; rows: DebugRow[] }
export type DebugNotice = { tone: 'warning' | 'error'; title: string; message: string }

/** The whole window, worked out from one message; the view only lays it out. */
export type DebugView = {
  kind: 'ready'
  link: { tone: StatusTone; label: string }
  notices: DebugNotice[]
  tiles: DebugTile[]
  sections: DebugSection[]
  corners: DebugCornerView[]
  screens: DebugScreenView[]
  sprint: DebugSection
}

const DASH = '—'
/** A frame this old is no longer live, whatever the link says (the host calls a link stale past its own window). */
const SLOW_FRAME_MS = 500

const fixed = (value: number | null, digits: number, unit = ''): string => (value === null ? DASH : `${value.toFixed(digits)}${unit}`)
const percent = (fraction: number | null): string => (fraction === null ? DASH : `${Math.round(fraction * 100)}%`)
const orDash = (text: string): string => (text.trim().length > 0 ? text : DASH)
/** An enum name in sentence case: "WaitingForViewer" → "Waiting for viewer". */
const words = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, (_match, before: string, upper: string) => `${before} ${upper.toLowerCase()}`)

/** A lap or session time: m:ss.fff, h:mm:ss past an hour; a dash for none (0 is "not set" in the frame). */
export function formatTime(seconds: number | null, { millis = true }: { millis?: boolean } = {}): string {
  if (seconds === null || seconds <= 0) return DASH
  const totalMs = Math.round(seconds * 1000)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  const tail = millis ? `.${String(ms).padStart(3, '0')}` : ''
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${tail}` : `${minutes}:${String(secs).padStart(2, '0')}${tail}`
}

const signed = (value: number | null, digits: number): string => (value === null ? DASH : `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}`)

/** Past this a lap limit is the game's "no limit" (LMU sends int.MaxValue; the mapper turns it into 0, an older recording does not). */
const MAX_LAP_LIMIT = 10_000

/**
 * "12 / 30", or "12 · no lap limit" when the session has none: 0, or a raw "no limit" from a
 * frame recorded before the mapper cleaned it, which is shown beside it.
 */
export function lapCount(lap: number | null, maxLaps: number | null): string {
  if (lap === null) return DASH
  if (maxLaps !== null && maxLaps > 0 && maxLaps < MAX_LAP_LIMIT) return `${lap} / ${maxLaps}`
  return maxLaps !== null && maxLaps > 0 ? `${lap} · no lap limit (${maxLaps})` : `${lap} · no lap limit`
}

/** "100% → 82%": the pedal as pressed, then as the car applied it (aids); just the first without the second. */
export function pedal(raw: number | null, applied: number | null): string {
  if (raw === null) return DASH
  return applied === null ? percent(raw) : `${percent(raw)} → ${percent(applied)}`
}

/** "3 / 11": a cockpit setting against its maximum, or null when the car has none (maximum 0). */
const setting = (value: number | null, max: number | null): string | null => (max === null || max <= 0 ? null : `${value ?? DASH} / ${max}`)

const gearLabel = (gear: number | null): string => (gear === null ? DASH : gear === 0 ? 'N' : gear < 0 ? 'R' : String(gear))

const LINK_TONES: Record<string, StatusTone> = {
  Connected: 'success',
  Connecting: 'info',
  WaitingForGame: 'neutral',
  Disconnected: 'neutral',
  Stale: 'warning',
  Unsupported: 'neutral',
  PermissionDenied: 'danger',
  Faulted: 'danger',
}

const SCREEN_TONES: Record<string, StatusTone> = {
  Connected: 'success',
  Connecting: 'info',
  WaitingForViewer: 'neutral',
  Disconnected: 'warning',
  ConfigurationRequired: 'warning',
  DeviceBusy: 'warning',
  DeviceConflict: 'warning',
  Unsupported: 'neutral',
  PermissionDenied: 'danger',
  Faulted: 'danger',
}

const CORNER_NAMES: Record<string, string> = { FrontLeft: 'FL', FrontRight: 'FR', RearLeft: 'RL', RearRight: 'RR' }

function pitLine(session: DebugSnapshot['session']): string {
  if (session.inGarage) return 'In the garage'
  if (session.inPitLane) return session.pitState && session.pitState !== 'None' ? `Pit lane · ${words(session.pitState)}` : 'Pit lane'
  return session.inCar ? 'On track' : 'Not in the car'
}

/** The live link's rows: its phase and role, then (while it has them) its health and the other side's build. */
function linkRows(link: DebugSnapshot['sprint']['link']): DebugRow[] {
  const tone: StatusTone = link.phase === 'Connected' ? 'success' : link.phase === 'Interrupted' || link.phase === 'Failed' ? 'warning' : 'neutral'
  const rows: DebugRow[] = [{ label: 'Live link', value: [words(link.phase), link.role?.toLowerCase(), link.detail].filter((part) => part).join(' · '), tone }]
  const health = [
    link.path ? words(link.path) : null,
    link.roundTripMs !== null ? `${link.roundTripMs} ms` : null,
    link.sampleRate !== null ? `${link.sampleRate.toFixed(0)}/s` : null,
    link.lossPercent !== null ? `${link.lossPercent.toFixed(0)}% loss` : null,
  ].filter((part): part is string => part !== null)
  if (health.length > 0) rows.push({ label: 'Link health', value: health.join(' · ') })
  if (link.peerApp || link.peerMatch) rows.push({ label: 'Peer', value: [link.peerApp, link.peerMatch ? words(link.peerMatch) : null].filter((part) => part).join(' · ') })
  return rows
}

function screenView(screen: DebugScreen): DebugScreenView {
  const size = screen.width !== null && screen.height !== null ? `${screen.width}×${screen.height}` : DASH
  const frames = screen.framesSent === null ? DASH : `${screen.framesSent} sent · ${screen.framesUnchanged ?? 0} unchanged · ${screen.framesFailed ?? 0} failed`
  const rows: DebugRow[] = [
    { label: 'Panel', value: `${size} @ ${screen.refreshHz ?? DASH} Hz · ${orDash(screen.driver)}` },
    { label: 'Output', value: screen.fps === null ? 'Not running' : `${screen.fps.toFixed(1)} fps` },
    {
      label: 'Frame time',
      value: screen.totalMs === null ? DASH : `${fixed(screen.renderMs, 1)} draw · ${fixed(screen.usbMs, 1)} USB · ${fixed(screen.totalMs, 1)} ms`,
    },
    { label: 'Frames', value: frames, tone: screen.framesFailed !== null && screen.framesFailed > 0 ? 'warning' : undefined },
  ]
  if (screen.viewers !== null) rows.push({ label: 'Viewers', value: String(screen.viewers) })
  if (screen.detail) rows.push({ label: 'Detail', value: screen.detail })
  return {
    id: screen.deviceId,
    title: orDash(screen.name),
    tone: screen.state === null ? 'neutral' : SCREEN_TONES[screen.state] ?? 'neutral',
    status: screen.state === null ? 'No output' : words(screen.state),
    rows,
  }
}

/** No snapshot to show: the host has no `/api/debug` (a Release host) or it failed. */
export type DebugUnavailable = { kind: 'unavailable'; reason: string }

/** Everything the window shows for one message; with no snapshot, only the reason. */
export function debugView(message: DebugMessage): DebugView | DebugUnavailable {
  const snapshot = message.snapshot
  if (!snapshot) return { kind: 'unavailable', reason: message.error ?? 'The host sent no debug snapshot.' }
  const { telemetry, session, car, sprint } = snapshot

  const notices: DebugNotice[] = []
  if (sprint.hud.exclusiveFullscreen) {
    notices.push({
      tone: 'warning',
      title: 'Exclusive fullscreen',
      message: 'Nothing can be drawn over the game in exclusive fullscreen, this window included. Switch the game to borderless.',
    })
  }
  if (!telemetry.lastFrameValid) {
    notices.push({ tone: 'error', title: 'Invalid frame', message: telemetry.invalidReason ?? 'The latest frame failed validation.' })
  }

  const slow = telemetry.state === 'Connected' && telemetry.frameAgeMs !== null && telemetry.frameAgeMs > SLOW_FRAME_MS
  const electronics = car.electronics
  const tc = [
    setting(electronics.tc, electronics.tcMax),
    setting(electronics.tcCut, electronics.tcCutMax) && `cut ${setting(electronics.tcCut, electronics.tcCutMax)}`,
    setting(electronics.tcSlip, electronics.tcSlipMax) && `slip ${setting(electronics.tcSlip, electronics.tcSlipMax)}`,
  ].filter((part): part is string => typeof part === 'string')
  const carRows: DebugRow[] = [
    { label: 'Throttle', value: pedal(car.throttle, car.throttleApplied) },
    { label: 'Brake', value: pedal(car.brake, car.brakeApplied) },
    { label: 'Clutch', value: percent(car.clutch) },
    { label: 'Steering', value: car.steering === null ? DASH : `${signed(car.steering * 100, 0)}%` },
    { label: 'Fuel', value: car.fuelCapacityLiters === null ? fixed(car.fuelLiters, 1, ' L') : `${fixed(car.fuelLiters, 1)} / ${fixed(car.fuelCapacityLiters, 1, ' L')}` },
    {
      label: 'Fuel per lap',
      value: `${fixed(car.fuelPerLapLiters, 2, ' L')} · last lap ${fixed(sprint.recorder?.lastLapFuelLiters ?? null, 2, ' L')}`,
    },
    { label: 'Brake bias', value: car.brakeBiasRear === null ? DASH : `${((1 - car.brakeBiasRear) * 100).toFixed(1)}% front` },
    { label: 'TC', value: tc.length > 0 ? `${tc.join(' · ')}${electronics.tcActive ? ' · cutting' : ''}` : 'None' },
    { label: 'ABS', value: setting(electronics.abs, electronics.absMax) ?? 'None' },
    { label: 'Motor map', value: setting(electronics.motorMap, electronics.motorMapMax) ?? 'None' },
    { label: 'Migration', value: setting(electronics.migration, electronics.migrationMax) ?? 'None' },
    { label: 'Pit limiter', value: car.pitLimiter === null ? DASH : car.pitLimiter ? 'On' : 'Off' },
  ]
  if (car.virtualEnergy !== null && car.virtualEnergy > 0) {
    carRows.push({ label: 'Energy', value: `${car.virtualEnergy.toFixed(0)} kJ virtual · ${percent(car.stateOfCharge)} charge` })
  }

  const targets = sprint.targets
  const plan = sprint.plan
  const recorder = sprint.recorder
  const timings = sprint.timings
  const sprintSection: DebugSection = {
    title: 'Sprint',
    rows: [
      {
        label: 'Targets',
        value: targets.lapTimeSeconds === null && targets.fuelPerLapLiters === null ? 'None latched' : `${formatTime(targets.lapTimeSeconds)} · ${fixed(targets.fuelPerLapLiters, 2, ' L/lap')}`,
      },
      { label: 'Delta reference', value: targets.referenceLapSeconds === null ? 'Own session best' : `Plan lap ${formatTime(targets.referenceLapSeconds)}` },
      {
        label: 'Plan',
        value: plan ? `${orDash(plan.name)} · ${words(plan.status)} · ${plan.mode}` : 'None active',
        tone: plan ? (plan.status === 'Tracking' ? 'success' : 'info') : 'neutral',
      },
      { label: 'HUD', value: sprint.hud.arranging ? 'Arranging' : sprint.hud.open ? 'On' : 'Off', tone: sprint.hud.open || sprint.hud.arranging ? 'success' : 'neutral' },
      ...linkRows(sprint.link),
      {
        label: 'Recorder',
        value: recorder ? `${words(recorder.kind)} · ${recorder.laps ?? 0} ${recorder.laps === 1 ? 'lap' : 'laps'}` : 'Not recording',
        tone: recorder ? 'success' : 'neutral',
      },
      {
        label: 'Host timing',
        value: `state assembled ${fixed(timings.stateAssembledMs, 1, ' ms')} · tick ${fixed(timings.publishTickMs, 2, ' ms')} · poll ${fixed(message.statePollMs, 0, ' ms')}`,
      },
    ],
  }

  return {
    kind: 'ready',
    link: { tone: slow ? 'warning' : LINK_TONES[telemetry.state] ?? 'neutral', label: slow ? 'Slow frames' : words(telemetry.state) || 'Unknown' },
    notices,
    tiles: [
      { label: 'Speed', value: fixed(car.speedKph, 0), sub: 'km/h' },
      { label: 'Gear', value: gearLabel(car.gear), sub: null },
      { label: 'RPM', value: fixed(car.rpm, 0), sub: car.maxRpm === null || car.maxRpm <= 0 ? null : `of ${car.maxRpm.toFixed(0)}` },
      { label: 'Delta', value: session.targetLapTime !== null && session.targetLapTime > 0 ? signed(session.delta, 3) : DASH, sub: null },
    ],
    sections: [
      {
        title: 'Telemetry',
        rows: [
          { label: 'Source', value: orDash(telemetry.source) },
          { label: 'Link', value: words(telemetry.state) || DASH, tone: LINK_TONES[telemetry.state] ?? 'neutral' },
          { label: 'Rate', value: fixed(telemetry.hz, 1, ' Hz') },
          { label: 'Frame age', value: fixed(telemetry.frameAgeMs, 0, ' ms'), tone: telemetry.frameAgeMs === null ? 'neutral' : slow ? 'warning' : 'success' },
          ...(telemetry.detail ? [{ label: 'Detail', value: telemetry.detail }] : []),
        ],
      },
      {
        title: 'Session',
        rows: [
          { label: 'Track', value: session.trackLengthMeters === null ? orDash(session.track) : `${orDash(session.track)} · ${(session.trackLengthMeters / 1000).toFixed(3)} km` },
          { label: 'Car', value: session.carClass ? `${orDash(session.car)} · ${session.carClass}` : orDash(session.car) },
          { label: 'Session', value: `${orDash(words(session.type))} · ${orDash(words(session.phase))}` },
          { label: 'Lap', value: lapCount(session.lap, session.maxLaps) },
          {
            label: 'Time left',
            value: session.timeRemainingSeconds === null ? 'No clock' : formatTime(session.timeRemainingSeconds, { millis: false }),
          },
          { label: 'Elapsed', value: formatTime(session.sessionTimeSeconds, { millis: false }) },
          { label: 'Position', value: session.position !== null && session.position > 0 ? `P${session.position} of ${session.totalPositions ?? DASH}` : DASH },
          { label: 'Lap time', value: `${formatTime(session.currentLapTime)} · sector ${session.sector ?? DASH}`, tone: session.lapValid ? undefined : 'warning' },
          { label: 'Last · best', value: `${formatTime(session.lastLapTime)} · ${formatTime(session.bestLapTime)}` },
          { label: 'Target', value: formatTime(session.targetLapTime) },
          { label: 'Where', value: pitLine(session) },
          // A replay or recording names itself as the source; the game is then worth its own row.
          ...(session.game && session.game !== telemetry.source ? [{ label: 'Game', value: session.game }] : []),
        ],
      },
      { title: 'Car', rows: carRows },
    ],
    corners: car.corners.map((corner) => ({
      name: CORNER_NAMES[corner.position] ?? orDash(corner.position),
      temps: `${fixed(corner.tempInner, 0)} · ${fixed(corner.tempMiddle, 0)} · ${fixed(corner.tempOuter, 0)} °C`,
      core: fixed(corner.tempCore, 0, ' °C'),
      pressure: fixed(corner.pressureKPa, 1, ' kPa'),
      wear: fixed(corner.wearPercent, 1, '%'),
      brake: fixed(corner.brakeTemp, 0, ' °C'),
      compound: orDash(corner.compound),
    })),
    screens: snapshot.screens.map(screenView),
    sprint: sprintSection,
  }
}
