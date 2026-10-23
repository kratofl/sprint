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
  /** The catalog entry it was added from; '' for devices saved before the host recorded it. */
  presetId: string
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
  /** Who makes it ("BavarianSimTec", "VoCore"), for the Add device dialog's brand filter. */
  brand: string
  type: string
  driver: string
  vid: number
  pid: number
  width: number
  height: number
}

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
    presetId: str(row, 'presetId'),
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
    brand: str(row, 'brand'),
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

// Offsets are signed: negative moves the image left or up (Rgb565.ComposeFromBgra).
export const OFFSET_MIN = -2000
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
    return { label: 'Off', detail: "Sprint isn't sending anything to this screen.", tone: 'neutral' }
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

// ── Tiles / list (Settings.DevicesUI.ViewMode) ──────────────────────────────
//
// Persisted through `settings.update`'s `devicesUiViewMode`; the wire name of tiles is "gallery".

export type DevicesViewMode = 'gallery' | 'list'

export const parseDevicesViewMode = (settings: Record<string, unknown>): DevicesViewMode => {
  const devicesUI = settings.devicesUI
  return isRecord(devicesUI) && devicesUI.viewMode === 'list' ? 'list' : 'gallery'
}

export const buildDevicesViewMode = (mode: DevicesViewMode): SprintCommand => ({ type: 'settings.update', devicesUiViewMode: mode })

// ── Kinds, pictures and the overview filter ─────────────────────────────────

/** How the overview groups devices: anything sold as a wheel (custom wheels too), or a screen. */
export type DeviceKind = 'wheel' | 'screen'

export const deviceKind = (device: Pick<Device, 'type'>): DeviceKind => (device.type.toLowerCase() === 'wheel' ? 'wheel' : 'screen')

/** The pictures the app ships (src/assets/devices), named after the preset id they belong to. */
export type DeviceImageKey = 'bavarian-omega-v2-pro' | 'generic-vocore' | 'generic-usbd480' | 'generic-wheel'

const PRESET_IMAGES: readonly DeviceImageKey[] = ['bavarian-omega-v2-pro']
const isPresetImage = (id: string): id is DeviceImageKey => PRESET_IMAGES.some((key) => key === id)

/**
 * The picture a device shows: its preset's own, else the generic one for a wheel or for its
 * screen driver. A device saved before the host recorded `presetId` counts as its preset while
 * it still carries the preset's name, type and driver. Null when nothing fits.
 */
export const deviceImageKey = (device: Device, catalog: readonly CatalogEntry[]): DeviceImageKey | null =>
  imageKey(
    device.presetId ||
      (catalog.find((entry) => entry.name === device.name && entry.type === device.type && entry.driver === device.driver)?.id ?? ''),
    device,
  )

/** The picture a catalog entry shows in the Add device dialog — the one the device gets once added. */
export const catalogImageKey = (entry: CatalogEntry): DeviceImageKey | null => imageKey(entry.id, entry)

const imageKey = (presetId: string, hardware: Pick<Device, 'type' | 'driver'>): DeviceImageKey | null => {
  if (isPresetImage(presetId)) return presetId
  if (deviceKind(hardware) === 'wheel') return 'generic-wheel'
  const driver = hardware.driver.toLowerCase()
  if (driver === 'vocore') return 'generic-vocore'
  if (driver.includes('usbd')) return 'generic-usbd480'
  return null
}

/** The overview's filter chips, one at a time. */
export type DevicesFilter = 'all' | 'wheel' | 'screen' | 'connected' | 'attention'

/**
 * A screen that should be working and is not (not found, in use, failing, needs setup). A
 * device turned off, or one without a screen, never needs attention.
 */
export const needsAttention = (device: Device, screen: ScreenOutput | undefined): boolean => {
  if (device.disabled || !deviceHasScreen(device)) return false
  const tone = describeDeviceStatus(device, screen).tone
  return tone !== 'success' && tone !== 'info'
}

export const matchesDevicesFilter = (filter: DevicesFilter, device: Device, screen: ScreenOutput | undefined): boolean => {
  switch (filter) {
    case 'all':
      return true
    case 'wheel':
    case 'screen':
      return deviceKind(device) === filter
    case 'connected':
      return screen?.hardware?.status.isConnected === true && !device.disabled
    case 'attention':
      return needsAttention(device, screen)
  }
}

/** One quiet line about the hardware: "VoCore · 800 × 480 landscape", or "Buttons only". */
export const deviceSummary = (device: Device): string => {
  if (!deviceHasScreen(device)) return 'Buttons only'
  const size = logicalSize(device)
  return `${driverLabel(device.driver)} · ${size.width} × ${size.height} ${orientationLabel(device.rotation).toLowerCase()}`
}

const driverLabel = (driver: string): string => (driver.toLowerCase() === 'vocore' ? 'VoCore' : driver.toUpperCase())

// ── Add device dialog ────────────────────────────────────────────────────────

/** The dialog's filters, all applied together. `brand` null means any brand. */
export type CatalogFilter = { query: string; kind: 'all' | DeviceKind; brand: string | null }

export const NO_CATALOG_FILTER: CatalogFilter = { query: '', kind: 'all', brand: null }

/** The brands the catalog offers, in catalog order. */
export const catalogBrands = (catalog: readonly CatalogEntry[]): string[] => [...new Set(catalog.map((entry) => entry.brand).filter((brand) => brand !== ''))]

const matchesQuery = (query: string, fields: readonly string[]): boolean => {
  const needle = query.trim().toLowerCase()
  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle))
}

export const matchesCatalogFilter = (filter: CatalogFilter, entry: CatalogEntry): boolean =>
  (filter.kind === 'all' || deviceKind(entry) === filter.kind) &&
  (filter.brand === null || entry.brand === filter.brand) &&
  matchesQuery(filter.query, [entry.name, entry.brand, entry.description])

/** "Your own wheel" is a wheel of no brand, so a brand filter hides it. */
export const ownWheelMatchesFilter = (filter: CatalogFilter): boolean =>
  filter.kind !== 'screen' && filter.brand === null && matchesQuery(filter.query, ['Your own wheel', 'custom'])

/** The quiet line under a catalog entry: "VoCore screen · buttons", a screen's size, or that it is read on connect. */
export const catalogLine = (entry: CatalogEntry): string => {
  if (deviceKind(entry) === 'wheel') return entry.driver ? `${driverLabel(entry.driver)} screen · buttons` : 'Buttons'
  return entry.width > 0 && entry.height > 0 ? `${entry.width} × ${entry.height}` : 'Any size, read when it connects'
}

/** The catalog entries `SprintState.foundDevices` names, once per device plugged in; unknown ids are dropped. */
export const foundEntries = (found: readonly string[], catalog: readonly CatalogEntry[]): CatalogEntry[] =>
  found.flatMap((id) => catalog.find((entry) => entry.id === id) ?? [])

// ── Custom wheel ("Your own wheel" in the Add device dialog) ────────────────
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
 * truncated to 500 characters. Crossing IPC, Electron prefixes it with "Error invoking remote
 * method '…': Error: ", so the wrapper is looked for anywhere in the message. Unwraps that down
 * to the host's own message so a validation failure like "Enter a name for the wheel." shows
 * inline instead of the raw HTTP wrapper.
 */
export const commandErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) return fallback
  const wrapped = /Runtime \d+: ([\s\S]+)$/.exec(error.message)
  if (!wrapped) return error.message || fallback
  try {
    const body: unknown = JSON.parse(wrapped[1])
    if (isRecord(body) && typeof body.error === 'string' && body.error.length > 0) return body.error
  } catch {
    // Truncated or non-JSON body — fall through to the raw text below.
  }
  return wrapped[1] || fallback
}
