import type { SprintCommand } from '../bridge'
import type { DashLayout } from '@sprint/dashboard'
import { parseDashLayout } from './DashesDomain'

/**
 * Devices domain model and parsing.
 *
 * The bridge's `/api/state` does not publish the host's device-hardware enums
 * (orientation labels, purposes, refresh rates) — it only serializes the raw
 * `SavedDevice`/`CatalogDevice` records. Those enums are small, versioned, and
 * owned by the native host at app/Sprint.Desktop.Core/Features/Devices/*.cs
 * (DeviceOrientations, DevicePurposes, DeviceRefreshRates), so this file keeps
 * a hand-mirrored copy in sync by hand rather than inventing a new shape. If
 * the host catalog changes, this file must change with it.
 */

export type DeviceOrientation = 0 | 90 | 180 | 270

// Rotation-degree labels are fixed and must not be renamed: 0 is always
// Portrait (vertical), 90 Landscape (horizontal), 180/270 their inverted
// variants — see DeviceOrientations.cs.
export const ORIENTATIONS: ReadonlyArray<{ value: DeviceOrientation; label: string }> = [
  { value: 0, label: 'Portrait' },
  { value: 90, label: 'Landscape' },
  { value: 180, label: 'Portrait inverted' },
  { value: 270, label: 'Landscape inverted' },
]

export const orientationLabel = (rotation: DeviceOrientation): string =>
  ORIENTATIONS.find((option) => option.value === rotation)?.label ?? 'Portrait'

// DeviceRefreshRates.cs: a small fixed set, not a free number.
export const REFRESH_RATES: readonly number[] = [5, 10, 15, 20, 30, 60]

export type DevicePurposeId = 'dash' | 'rear-view-mirror' | 'flags' | 'lap-times'

export type DevicePurpose = {
  id: DevicePurposeId
  label: string
  description: string
  needsCaptureRegion: boolean
}

// DevicePurposes.cs.
export const PURPOSES: readonly DevicePurpose[] = [
  { id: 'dash', label: 'Dashboard', description: 'Show a customizable racing dashboard.', needsCaptureRegion: false },
  {
    id: 'rear-view-mirror',
    label: 'Rear-view mirror',
    description: 'Mirror a selected area of your desktop on this screen.',
    needsCaptureRegion: true,
  },
  {
    id: 'flags',
    label: 'Flag display',
    description: 'Show the active marshalling flag at maximum glanceability.',
    needsCaptureRegion: false,
  },
  {
    id: 'lap-times',
    label: 'Lap timer',
    description: 'Show current, last, and best lap times with a live delta.',
    needsCaptureRegion: false,
  },
]

const isDevicePurposeId = (value: string): value is DevicePurposeId =>
  PURPOSES.some((purpose) => purpose.id === value)

export const resolvePurpose = (id: string): DevicePurpose =>
  PURPOSES.find((purpose) => purpose.id === id) ?? PURPOSES[0]

export type CaptureRegion = { x: number; y: number; width: number; height: number }

export type Device = {
  id: string
  name: string
  driver: string
  type: string
  vid: number
  pid: number
  width: number
  height: number
  rotation: DeviceOrientation
  offsetX: number
  offsetY: number
  margin: number
  dashId: string
  purpose: DevicePurposeId
  refreshHz: number
  disabled: boolean
  captureRegion: CaptureRegion | null
  bindingCount: number
}

export type CatalogEntry = {
  id: string
  name: string
  description: string
  type: string
  driver: string
  vid: number
  pid: number
  width: number
  height: number
}

export const isGenericCatalogEntry = (entry: CatalogEntry): boolean => entry.vid === 0 && entry.pid === 0

// A device can publish pixels either because it is a standalone screen or a
// wheel with a known integrated screen transport — DeviceCapabilities.HasScreen.
export const deviceHasScreen = (device: Device): boolean =>
  device.width > 0 &&
  device.height > 0 &&
  (device.type.toLowerCase() === 'screen' || device.driver.toLowerCase() === 'vocore' || device.driver.toLowerCase() === 'usbd480')

// DeviceOrientations.Transform, without the pixel-rotation component: the
// short/long native edge swaps into the logical width/height a landscape
// orientation expects. Used for the read-only dimensions readout only — no
// preview is rendered here.
export const logicalSize = (device: Pick<Device, 'width' | 'height' | 'rotation'>): { width: number; height: number } => {
  if (device.width <= 0 || device.height <= 0) {
    return { width: 0, height: 0 }
  }

  const shortEdge = Math.min(device.width, device.height)
  const longEdge = Math.max(device.width, device.height)
  const landscape = device.rotation === 90 || device.rotation === 270
  return landscape ? { width: longEdge, height: shortEdge } : { width: shortEdge, height: longEdge }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * `SprintState.catalog` is typed as a plain `Record<string, unknown>` in bridge.ts,
 * but the host serializes `runtime.Catalog` as a JSON array. `Object.values` reads
 * correctly either way (an array's own enumerable values are its elements), so this
 * is the one place that ambiguity is resolved rather than trusted with a cast.
 */
export const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : []
const str = (row: Record<string, unknown>, key: string, fallback = ''): string => {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}
const num = (row: Record<string, unknown>, key: string, fallback = 0): number => {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
const bool = (row: Record<string, unknown>, key: string, fallback = false): boolean => {
  const value = row[key]
  return typeof value === 'boolean' ? value : fallback
}

const resolveRotation = (value: number): DeviceOrientation =>
  value === 90 || value === 180 || value === 270 ? value : 0

const parseCaptureRegion = (value: unknown): CaptureRegion | null => {
  if (!isRecord(value)) return null
  const region = { x: num(value, 'x'), y: num(value, 'y'), width: num(value, 'width'), height: num(value, 'height') }
  return region.width > 0 && region.height > 0 ? region : null
}

/** Parses one raw `devices[]` row from `SprintState`. Returns `null` for a row with no id — never a fabricated device. */
export const parseDevice = (row: Record<string, unknown>): Device | null => {
  const id = str(row, 'id')
  if (!id) return null

  const purposeId = str(row, 'purpose', 'dash')
  const bindings = row.bindings
  return {
    id,
    name: str(row, 'name', id),
    driver: str(row, 'driver'),
    type: str(row, 'type', 'screen'),
    vid: num(row, 'vid'),
    pid: num(row, 'pid'),
    width: num(row, 'width'),
    height: num(row, 'height'),
    rotation: resolveRotation(num(row, 'rotation')),
    offsetX: num(row, 'offsetX'),
    offsetY: num(row, 'offsetY'),
    margin: num(row, 'margin'),
    dashId: str(row, 'dashId'),
    purpose: isDevicePurposeId(purposeId) ? purposeId : 'dash',
    refreshHz: num(row, 'refreshHz', 30),
    disabled: bool(row, 'disabled'),
    captureRegion: parseCaptureRegion(row.captureRegion),
    bindingCount: Array.isArray(bindings) ? bindings.length : 0,
  }
}

export const parseDevices = (rows: ReadonlyArray<Record<string, unknown>>): Device[] =>
  rows.map(parseDevice).filter((device): device is Device => device !== null)

/** Parses one raw `catalog[]` row. Returns `null` for a row with no id. */
export const parseCatalogEntry = (row: Record<string, unknown>): CatalogEntry | null => {
  const id = str(row, 'id')
  if (!id) return null
  return {
    id,
    name: str(row, 'name', id),
    description: str(row, 'description'),
    type: str(row, 'type', 'screen'),
    driver: str(row, 'driver'),
    vid: num(row, 'vid'),
    pid: num(row, 'pid'),
    width: num(row, 'width'),
    height: num(row, 'height'),
  }
}

export const parseCatalog = (rows: ReadonlyArray<Record<string, unknown>>): CatalogEntry[] =>
  rows.map(parseCatalogEntry).filter((entry): entry is CatalogEntry => entry !== null)

export type DashOption = { id: string; name: string }

export const parseDashOptions = (rows: ReadonlyArray<Record<string, unknown>>): DashOption[] =>
  rows
    .map((row) => ({ id: str(row, 'id'), name: str(row, 'name') }))
    .filter((option): option is DashOption => option.id.length > 0)

// ── Command builders ────────────────────────────────────────────────────────
// devices.update replaces name/rotation/offsetX/offsetY/margin/dashId together
// (RuntimeCoordinator.UpdateDevice has no per-field patch for these), so every
// caller sends the device's current values with only the changed field overridden.

export type DeviceUpdateFields = Pick<Device, 'name' | 'rotation' | 'offsetX' | 'offsetY' | 'margin' | 'dashId'>

export const buildDeviceUpdate = (device: Device, overrides: Partial<DeviceUpdateFields>): SprintCommand => ({
  type: 'devices.update',
  deviceId: device.id,
  name: overrides.name ?? device.name,
  rotation: overrides.rotation ?? device.rotation,
  offsetX: overrides.offsetX ?? device.offsetX,
  offsetY: overrides.offsetY ?? device.offsetY,
  margin: overrides.margin ?? device.margin,
  dashId: overrides.dashId ?? device.dashId,
})

export const OFFSET_MIN = 0
export const OFFSET_MAX = 2000
export const MARGIN_MIN = 0
export const MARGIN_MAX = 400

// ── Screen hardware status + performance ────────────────────────────────────
//
// `state.screens[]` describes one CONFIGURED dashboard output per enabled,
// dash-purpose device (app/Sprint.Desktop.Host/ScreenOutputs.cs) — it never has
// an entry for a disabled device, a non-dashboard purpose, or a runtime with no
// dash layout at all. `hardware` (app/Sprint.Desktop.Host/ScreenOutputService.cs,
// ScreenModels.cs) is the real link status and delivery performance for that
// output, absent until the publisher exists. `bridge.ts` does not type either
// field, so both are narrowed from `unknown` here, once.

// ScreenConnectionState mirrors Sprint.Desktop.Features.Hardware.ScreenConnectionState.
export type ScreenConnectionState =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'ConfigurationRequired'
  | 'PermissionDenied'
  | 'DeviceBusy'
  | 'DeviceConflict'
  | 'Unsupported'
  | 'Faulted'

const SCREEN_CONNECTION_STATES: readonly ScreenConnectionState[] = [
  'Disconnected', 'Connecting', 'Connected', 'ConfigurationRequired',
  'PermissionDenied', 'DeviceBusy', 'DeviceConflict', 'Unsupported', 'Faulted',
]

const isScreenConnectionState = (value: unknown): value is ScreenConnectionState =>
  typeof value === 'string' && SCREEN_CONNECTION_STATES.some((state) => state === value)

export type ScreenHardwareStatus = { state: ScreenConnectionState; detail: string | null; isConnected: boolean }

export type ScreenHardwarePerformance = {
  framesPerSecond: number
  sourceTimeMs: number | null
  pixelTransformTimeMs: number | null
  frameTimeMs: number | null
  usbTransferTimeMs: number | null
  totalFrameTimeMs: number | null
  framesRendered: number
  framesSent: number
  framesSkipped: number
  hasSamples: boolean
}

export type ScreenHardware = { status: ScreenHardwareStatus; performance: ScreenHardwarePerformance }

/** Electron's offscreen-browser frame delivery stats (FrameStore) — separate from `hardware.performance`, which is the real USB delivery. */
export type ScreenDelivery = { sequence: number; bytes: number; receivedAt: string | null }

export type ScreenOutput = {
  deviceId: string
  width: number
  height: number
  refreshHz: number
  layout: DashLayout | null
  pageId: string
  idle: boolean
  delivery: ScreenDelivery | null
  hardware: ScreenHardware | null
}

// .NET's built-in TimeSpan JSON converter (net8+, used by ScreenPerformanceSnapshot's
// duration fields) writes the constant "c" format: "[-][d.]hh:mm:ss[.fffffff]".
const parseTimeSpanMs = (value: unknown): number | null => {
  if (typeof value !== 'string') return null
  const match = /^-?(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value)
  if (!match) return null
  const [, days, hours, minutes, seconds] = match
  const totalSeconds = (days ? Number(days) * 86400 : 0) + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  return totalSeconds * 1000
}

const optionalStr = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

const parseScreenHardwareStatus = (value: unknown): ScreenHardwareStatus | null => {
  if (!isRecord(value) || !isScreenConnectionState(value.state)) return null
  return { state: value.state, detail: optionalStr(value.detail), isConnected: value.isConnected === true }
}

const parseScreenHardwarePerformance = (value: unknown): ScreenHardwarePerformance | null => {
  if (!isRecord(value)) return null
  return {
    framesPerSecond: num(value, 'framesPerSecond'),
    sourceTimeMs: parseTimeSpanMs(value.sourceTime),
    pixelTransformTimeMs: parseTimeSpanMs(value.pixelTransformTime),
    frameTimeMs: parseTimeSpanMs(value.frameTime),
    usbTransferTimeMs: parseTimeSpanMs(value.usbTransferTime),
    totalFrameTimeMs: parseTimeSpanMs(value.totalFrameTime),
    framesRendered: num(value, 'framesRendered'),
    framesSent: num(value, 'framesSent'),
    framesSkipped: num(value, 'framesSkipped'),
    hasSamples: bool(value, 'hasSamples'),
  }
}

const parseScreenHardware = (value: unknown): ScreenHardware | null => {
  if (!isRecord(value)) return null
  const status = parseScreenHardwareStatus(value.status)
  const performance = parseScreenHardwarePerformance(value.performance)
  return status && performance ? { status, performance } : null
}

const parseScreenDelivery = (value: unknown): ScreenDelivery | null => {
  if (!isRecord(value)) return null
  return { sequence: num(value, 'sequence'), bytes: num(value, 'bytes'), receivedAt: optionalStr(value.receivedAt) }
}

/** Parses one raw `screens[]` row. Returns `null` for a row with no device id — never a fabricated entry. */
export const parseScreen = (value: unknown): ScreenOutput | null => {
  if (!isRecord(value) || typeof value.deviceId !== 'string' || value.deviceId.length === 0) return null
  return {
    deviceId: value.deviceId,
    width: num(value, 'width'),
    height: num(value, 'height'),
    refreshHz: num(value, 'refreshHz'),
    layout: isRecord(value.layout) ? parseDashLayout(value.layout) : null,
    pageId: str(value, 'pageId'),
    idle: bool(value, 'idle'),
    delivery: parseScreenDelivery(value.performance),
    hardware: parseScreenHardware(value.hardware),
  }
}

export const parseScreens = (rows: ReadonlyArray<unknown>): ScreenOutput[] =>
  rows.map(parseScreen).filter((screen): screen is ScreenOutput => screen !== null)

export const findScreen = (screens: readonly ScreenOutput[], deviceId: string): ScreenOutput | undefined =>
  screens.find((screen) => screen.deviceId === deviceId)

/** A screen status's dot colour: the subset of `StatusTone` (shell/Status.tsx) a screen can be in. */
export type ScreenStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type ScreenStatusPresentation = { label: string; detail: string; tone: ScreenStatusTone }

// A device with a screen but no `screens[]` entry (disabled aside — see below) has no active
// publisher: ScreenOutputService only builds one for an enabled, dash-purpose device with a
// resolvable layout. Mirrors the deleted Avalonia client's own fallback
// (`_screens.StatusFor(device.Id) ?? ScreenStatus.Disconnected("No active screen publisher.")`).
const NO_ACTIVE_OUTPUT_STATUS: ScreenHardwareStatus = { state: 'Disconnected', detail: 'No active screen publisher.', isConnected: false }

/** Mirrors `ScreenStatusPresentation.Describe` (ScreenModels.cs) — must stay in sync by hand. */
const describeScreenStatus = (status: ScreenHardwareStatus): ScreenStatusPresentation => {
  const presentation: ScreenStatusPresentation = (() => {
    switch (status.state) {
      case 'Connected':
        return { label: 'Connected', detail: 'Sprint owns the screen and can send frames.', tone: 'success' }
      case 'Connecting':
        return { label: 'Connecting', detail: 'Sprint is opening the configured USB screen.', tone: 'info' }
      case 'ConfigurationRequired':
        return {
          label: 'Setup needed',
          detail: 'This saved screen has no VID/PID. Select or detect the physical USB device.',
          tone: 'warning',
        }
      case 'DeviceBusy':
        return {
          label: 'In use',
          detail: 'Another application, commonly SimHub, is using the screen. Disable its VoCore output or close it, then retry.',
          tone: 'warning',
        }
      case 'DeviceConflict':
        return {
          label: 'Duplicate target',
          detail: 'Another saved Sprint device already owns the same physical USB screen. Disable or remove one of the duplicate entries.',
          tone: 'warning',
        }
      case 'PermissionDenied':
        return {
          label: 'USB access failed',
          detail:
            'Sprint found the screen but could not use its current Windows USB binding. Sprint does not ask you to install ' +
            'a separate driver here; it reuses a compatible existing binding. Close other screen-output software, reconnect the screen, and retry.',
          tone: 'warning',
        }
      case 'Unsupported':
        return { label: 'Unsupported', detail: 'This screen transport is not supported on the current operating system.', tone: 'neutral' }
      case 'Faulted':
        return {
          label: 'Connection failed',
          detail: 'The USB operation failed. Open the diagnostics log for the native error and attempted step.',
          tone: 'danger',
        }
      default:
        return { label: 'Not found', detail: 'No matching screen was found. Check the USB connection and configured VID/PID.', tone: 'neutral' }
    }
  })()

  return status.detail ? { ...presentation, detail: `${presentation.detail} Technical detail: ${status.detail}` } : presentation
}

/** Mirrors `DeviceStatusView` (the deleted Avalonia client's `MainWindow.cs`). Only meaningful for `deviceHasScreen(device)`. */
export const describeDeviceStatus = (device: Device, screen: ScreenOutput | undefined): ScreenStatusPresentation => {
  if (device.disabled) {
    return { label: 'Disabled', detail: 'This screen is disabled. Enable it to start output.', tone: 'neutral' }
  }

  const purpose = resolvePurpose(device.purpose)
  if (purpose.needsCaptureRegion && !device.captureRegion) {
    return { label: 'Setup needed', detail: 'Select the desktop area to mirror before Sprint starts output.', tone: 'warning' }
  }

  return describeScreenStatus(screen?.hardware?.status ?? NO_ACTIVE_OUTPUT_STATUS)
}

export const formatFramesPerSecond = (performance: ScreenHardwarePerformance): string =>
  performance.hasSamples ? `${performance.framesPerSecond.toFixed(1)} fps` : '—'

export const formatDurationMs = (ms: number | null): string => (ms === null ? '—' : `${ms.toFixed(ms < 10 ? 2 : 1)} ms`)

// ── Live dash preview (device detail + gallery card) ────────────────────────

export type DevicePreviewSource = { layout: DashLayout; pageId?: string; idle: boolean }

/**
 * The dash a device's live preview should render, matching what the hardware actually shows
 * when known. `screens[]` publishes the host's already-resolved layout/page/idle for an active
 * dash output; a device with no active output (disabled, not yet reconciled) falls back to the
 * locally-assigned dash so the preview still has something to show. Returns `null` only when
 * there is no dash to render at all (an empty runtime).
 */
export const resolveDevicePreview = (
  device: Device,
  screen: ScreenOutput | undefined,
  dashLayouts: readonly DashLayout[],
): DevicePreviewSource | null => {
  if (screen?.layout) {
    return { layout: screen.layout, pageId: screen.pageId.length > 0 ? screen.pageId : undefined, idle: screen.idle }
  }

  const assigned = dashLayouts.find((layout) => layout.id === device.dashId)
  const fallback = assigned ?? dashLayouts.find((layout) => layout.default) ?? dashLayouts[0]
  return fallback ? { layout: fallback, idle: false } : null
}

// ── Gallery / list view mode (Settings.DevicesUI.ViewMode) ──────────────────
//
// `settings.update` (RuntimeCoordinator.cs) has no field to persist this choice — it only
// accepts sidebarCollapsed/updateChannel/driverName/driverNumber — so the view mode is read
// once from the published settings snapshot as the initial value and then kept in local state
// only. See the DevicesView report for the missing command field this would need.

export type DevicesViewMode = 'gallery' | 'list'

export const parseDevicesViewMode = (settings: Record<string, unknown>): DevicesViewMode => {
  const devicesUI = settings.devicesUI
  return isRecord(devicesUI) && devicesUI.viewMode === 'list' ? 'list' : 'gallery'
}

// ── Custom wheel ("Generic" tab) ─────────────────────────────────────────────
//
// Hand-mirrored from app/Sprint.Desktop.Core/Features/Devices/CustomWheelBuilder.cs, the same
// convention as the hardware catalogs above. `devices.addCustom` (RuntimeCoordinator.cs) builds
// the catalog entry server-side and reports validation failures as a command error.

export type CustomWheelScreenDriver = 'vocore' | 'usbd480'

export const CUSTOM_WHEEL_SCREEN_DRIVERS: ReadonlyArray<{ value: CustomWheelScreenDriver; label: string }> = [
  { value: 'vocore', label: 'VoCore' },
  { value: 'usbd480', label: 'USBD480' },
]

export const isCustomWheelScreenDriver = (value: string): value is CustomWheelScreenDriver =>
  CUSTOM_WHEEL_SCREEN_DRIVERS.some((option) => option.value === value)

/** `CustomWheelBuilder.MaxDimension`. */
export const CUSTOM_WHEEL_MAX_DIMENSION = 4096

export type CustomWheelFields = {
  name: string
  hasScreen: boolean
  driver: CustomWheelScreenDriver
  /** 0 means auto-detect. */
  width: number
  height: number
}

export const buildAddCustomDevice = (fields: CustomWheelFields): SprintCommand => ({
  type: 'devices.addCustom',
  name: fields.name.trim(),
  hasScreen: fields.hasScreen,
  driver: fields.hasScreen ? fields.driver : '',
  width: fields.hasScreen ? fields.width : 0,
  height: fields.hasScreen ? fields.height : 0,
})

// ── Command error text ───────────────────────────────────────────────────────

/**
 * `native-host.ts` throws `Error("Runtime ${status}: ${body}")` for a rejected command, where
 * `body` is the host's `{ error }` JSON (see RuntimeCoordinator's callers in Program.cs),
 * truncated to 500 characters. Unwraps that down to the host's own message so a validation
 * failure like "Enter a name for the wheel." shows inline instead of the raw HTTP wrapper.
 */
export const commandErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) return fallback
  const wrapped = /^Runtime \d+: ([\s\S]+)$/.exec(error.message)
  if (!wrapped) return error.message || fallback
  try {
    const body: unknown = JSON.parse(wrapped[1])
    if (isRecord(body) && typeof body.error === 'string' && body.error.length > 0) return body.error
  } catch {
    // Truncated or non-JSON body — fall through to the raw text below.
  }
  return wrapped[1] || fallback
}
