import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Cpu, Minus, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import type { SprintCommand, SprintState } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog, ContentDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { parseDashLayouts, toTelemetryFrame } from './DashesDomain'
import {
  MARGIN_MAX,
  MARGIN_MIN,
  OFFSET_MAX,
  OFFSET_MIN,
  ORIENTATIONS,
  PURPOSES,
  REFRESH_RATES,
  buildDeviceUpdate,
  deviceHasScreen,
  findScreen,
  isGenericCatalogEntry,
  logicalSize,
  orientationLabel,
  parseCatalog,
  parseDashOptions,
  parseDevices,
  parseDevicesViewMode,
  parseScreens,
  resolvePurpose,
  toRecordArray,
} from './DevicesDomain'
import type { CatalogEntry, DashOption, Device, DevicesViewMode, ScreenOutput } from './DevicesDomain'
import { DeviceStatusDetail, DeviceStatusInfoBar, DeviceStatusLabel, ScreenPerformanceMetrics } from './DevicesStatus'
import { DevicePreview } from './DevicesPreview'
import { CUSTOM_WHEEL_FORM_ID, DevicesCustomWheelForm } from './DevicesCustomWheelForm'
import './DevicesView.css'

type LoadedState = {
  devices: Device[]
  catalog: CatalogEntry[]
  dashOptions: DashOption[]
  dashLayouts: DashLayout[]
  screens: ScreenOutput[]
  frame: TelemetryFrame | null
}

const toLoadedState = (sprint: SprintState): LoadedState => ({
  devices: parseDevices(sprint.devices),
  catalog: parseCatalog(toRecordArray(sprint.catalog)),
  dashOptions: parseDashOptions(sprint.dashLayouts),
  dashLayouts: parseDashLayouts(sprint.dashLayouts),
  screens: parseScreens(sprint.screens),
  frame: toTelemetryFrame(sprint.telemetry.frame),
})

/**
 * Devices: PageHeader + CommandBar (add, enable/disable, remove, layout), then a
 * list/detail split — the device list card on the left, the selected device's cards
 * on the right. Every control maps to a real `RuntimeCoordinator` command — see
 * DevicesDomain.ts for the fixed hardware catalogs it mirrors. Some fields fall back
 * to a plainer control than their ideal interaction (see `CaptureRegionField` below);
 * those gaps are called out where they apply.
 */
export function DevicesView({
  runtime,
  send,
  focusDeviceId,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  /** A device to open on mount (Home's device row), applied once — see the effect below. */
  focusDeviceId?: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCatalog, setShowCatalog] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [viewMode, setViewMode] = useState<DevicesViewMode>('gallery')
  const [viewModeSeeded, setViewModeSeeded] = useState(false)
  const state = runtime.kind === 'ready' ? toLoadedState(runtime.sprint) : null

  // `settings.update` has no field to persist this choice (see DevicesDomain.ts), so the
  // published snapshot only seeds the initial value; toggling afterward stays session-local.
  useEffect(() => {
    if (viewModeSeeded || runtime.kind !== 'ready') return
    setViewModeSeeded(true)
    setViewMode(parseDevicesViewMode(runtime.sprint.settings))
  }, [runtime, viewModeSeeded])

  // `focusDeviceId` only ever names a live device for one render (the shell clears it right
  // after handing it off — see App.tsx), so this only ever opens the detail pane once; the
  // guard also means a request for a device that no longer exists is silently ignored.
  useEffect(() => {
    if (focusDeviceId && state?.devices.some((device) => device.id === focusDeviceId)) setSelectedId(focusDeviceId)
  }, [focusDeviceId, state])

  // Set right before a successful add; the effect below watches for a device id it doesn't
  // recognize and selects it once the poll loop delivers the updated list (the command response
  // carries no id of its own — see DevicesDomain.ts's `buildAddCustomDevice` comment).
  const pendingAddIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    const pending = pendingAddIds.current
    if (!pending || state === null) return
    const added = state.devices.find((device) => !pending.has(device.id))
    if (added) {
      pendingAddIds.current = null
      setSelectedId(added.id)
    }
  }, [runtime, state])

  if (state === null) {
    return (
      <div className="devices">
        <PageHeader title="Devices" />
        <div className="devices-split">
          <div className="card skeleton devices-list" />
          <div className="card skeleton devices-detail-skeleton" />
        </div>
      </div>
    )
  }

  const selected = state.devices.find((device) => device.id === selectedId) ?? null

  const addDevice = async (command: SprintCommand) => {
    const idsBefore = new Set(state.devices.map((device) => device.id))
    await send(command)
    pendingAddIds.current = idsBefore
    setShowCatalog(false)
  }

  return (
    <div className="devices">
      <PageHeader title="Devices">
        <button type="button" className="button primary" onClick={() => setShowCatalog(true)}>
          <Plus /> Add device
        </button>
        <CommandDivider />
        <button
          type="button"
          className="button subtle"
          disabled={selected === null}
          onClick={() => {
            if (selected) void send({ type: 'devices.save', deviceId: selected.id, disabled: !selected.disabled })
          }}
        >
          {selected?.disabled ? <Power /> : <PowerOff />}
          {selected?.disabled ? 'Enable' : 'Disable'}
        </button>
        <button type="button" className="button subtle destructive" disabled={selected === null} onClick={() => setConfirmRemove(true)}>
          <Trash2 /> Remove
        </button>
        {state.devices.length > 0 && (
          <>
            <span className="command-spacer" />
            <select
              aria-label="Device list layout"
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value === 'list' ? 'list' : 'gallery')}
            >
              <option value="gallery">Gallery</option>
              <option value="list">List</option>
            </select>
          </>
        )}
      </PageHeader>

      <div className="devices-split">
        <DeviceList
          devices={state.devices}
          screens={state.screens}
          dashLayouts={state.dashLayouts}
          frame={state.frame}
          selectedId={selected?.id ?? null}
          viewMode={viewMode}
          onSelect={setSelectedId}
        />
        {selected ? (
          <DeviceDetail
            key={selected.id}
            device={selected}
            dashOptions={state.dashOptions}
            dashLayouts={state.dashLayouts}
            screen={findScreen(state.screens, selected.id)}
            frame={state.frame}
            send={send}
          />
        ) : (
          <div className="card devices-detail-empty">
            <div className="empty-state">
              <Cpu size={28} strokeWidth={1.5} />
              <h2>No device selected</h2>
              <p>Choose a device on the left, or add one to get started.</p>
            </div>
          </div>
        )}
      </div>

      {showCatalog && (
        <CatalogDialog
          catalog={state.catalog}
          onClose={() => setShowCatalog(false)}
          onAdd={(entry) => {
            // Catalog entries are always valid ids from live state; a rejection here has no
            // dedicated error UI, so the dialog just stays open with nothing added.
            void addDevice({ type: 'devices.add', catalogId: entry.id }).catch(() => undefined)
          }}
          onAddCustom={addDevice}
        />
      )}

      {confirmRemove && selected && (
        <ConfirmDialog
          title={`Remove ${selected.name}?`}
          message="Its command bindings will be removed too. This cannot be undone."
          confirmLabel="Remove device"
          destructive
          onConfirm={() => {
            void send({ type: 'devices.remove', deviceId: selected.id })
            setConfirmRemove(false)
            setSelectedId(null)
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  )
}

function deviceSubtitle(device: Device): string {
  if (!deviceHasScreen(device)) return device.driver ? `${device.driver} · controller` : 'controller'
  const size = logicalSize(device)
  return `${device.driver} · ${size.width} × ${size.height}`
}

function DeviceList({
  devices,
  screens,
  dashLayouts,
  frame,
  selectedId,
  viewMode,
  onSelect,
}: {
  devices: Device[]
  screens: ScreenOutput[]
  dashLayouts: DashLayout[]
  frame: TelemetryFrame | null
  selectedId: string | null
  viewMode: DevicesViewMode
  onSelect: (id: string) => void
}) {
  const isGallery = viewMode === 'gallery'
  return (
    <section className="card list-card devices-list" aria-label="Devices">
      <div className="card-header">
        <h2 className="card-title">Your devices</h2>
        <span className="muted tabular">{devices.length}</span>
      </div>
      {devices.length === 0 ? (
        <p className="muted list-card-empty">No devices yet. Add a wheel or screen to assign a dash, tune its display, and bind its buttons.</p>
      ) : (
        <>
          {!isGallery && (
            <div className="list-header devices-list-columns" aria-hidden="true">
              <span>Name</span>
              <span>Status</span>
            </div>
          )}
          <ul className={isGallery ? 'list-rows devices-gallery' : 'list-rows'}>
            {devices.map((device) => {
              const screen = findScreen(screens, device.id)
              const isSelected = device.id === selectedId
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    className={[
                      'list-row',
                      isGallery ? 'devices-tile' : 'devices-list-columns',
                      isSelected ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelect(device.id)}
                  >
                    {isGallery && (
                      <span className="devices-tile-preview">
                        <DevicePreview device={device} screen={screen} dashLayouts={dashLayouts} frame={frame} maxWidth={252} maxHeight={120} />
                      </span>
                    )}
                    <span className="devices-row-text">
                      <span className="devices-row-name">{device.name}</span>
                      {isGallery && <span className="muted devices-row-sub">{deviceSubtitle(device)}</span>}
                    </span>
                    <span className="devices-row-status">
                      {deviceHasScreen(device) ? (
                        <DeviceStatusLabel device={device} screen={screen} />
                      ) : (
                        <span className="muted">{device.disabled ? 'Disabled' : 'Controller'}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

function DeviceDetail({
  device,
  dashOptions,
  dashLayouts,
  screen,
  frame,
  send,
}: {
  device: Device
  dashOptions: DashOption[]
  dashLayouts: DashLayout[]
  screen: ScreenOutput | undefined
  frame: TelemetryFrame | null
  send: (command: SprintCommand) => Promise<void>
}) {
  const [name, setName] = useState(device.name)
  const hasScreen = deviceHasScreen(device)
  const purpose = resolvePurpose(device.purpose)
  const size = logicalSize(device)

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed === device.name) {
      setName(device.name)
      return
    }

    void send(buildDeviceUpdate(device, { name: trimmed }))
  }

  const deviceCard = (
    <section className="card devices-card">
      <h2 className="card-title">Device</h2>
      <div className="devices-settings">
        <SettingRow label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            aria-label="Device name"
          />
        </SettingRow>
        <SettingRow label="Driver">
          <span>{device.driver || '—'}</span>
        </SettingRow>
        <SettingRow label="Resolution">
          <span className="tabular">{hasScreen ? `${size.width} × ${size.height}` : 'Controller (no screen)'}</span>
        </SettingRow>
        {hasScreen ? (
          <SettingRow label="Status">
            <span className="devices-status-cell">
              <DeviceStatusLabel device={device} screen={screen} />
              <DeviceStatusDetail device={device} screen={screen} />
            </span>
          </SettingRow>
        ) : (
          device.disabled && (
            <SettingRow label="Status">
              <span>Disabled</span>
            </SettingRow>
          )
        )}
      </div>
    </section>
  )

  if (!hasScreen) {
    return (
      <div className="devices-detail">
        <div className="devices-cards">{deviceCard}</div>
        <p className="muted">This device has no screen — there is nothing to align or assign a dash to.</p>
      </div>
    )
  }

  return (
    <div className="devices-detail">
      <DeviceStatusInfoBar device={device} screen={screen} />
      <div className="devices-cards">
        <section className="card devices-card">
          <div className="devices-card-title-row">
            <h2 className="card-title">Preview</h2>
            <span className="muted tabular">
              {orientationLabel(device.rotation)} · {size.width} × {size.height}
            </span>
          </div>
          <div className="devices-preview-stage">
            <DevicePreview device={device} screen={screen} dashLayouts={dashLayouts} frame={frame} maxWidth={400} maxHeight={220} />
          </div>
        </section>

        {deviceCard}

        <section className="card devices-card">
          <h2 className="card-title">Output</h2>
          <div className="devices-settings">
            <SettingRow label="Used for">
              <span className="devices-control-stack">
                <select
                  value={purpose.id}
                  aria-label="Used for"
                  onChange={(event) => void send({ type: 'devices.purpose', deviceId: device.id, purpose: event.target.value })}
                >
                  {PURPOSES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{purpose.description}</span>
              </span>
            </SettingRow>
            {purpose.id === 'dash' && (
              <SettingRow label="Dash">
                {dashOptions.length === 0 ? (
                  <span className="muted">No dashes yet. Create one on the Dashes page.</span>
                ) : (
                  <select value={device.dashId} aria-label="Dash" onChange={(event) => void send(buildDeviceUpdate(device, { dashId: event.target.value }))}>
                    {dashOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                )}
              </SettingRow>
            )}
            {purpose.needsCaptureRegion && <CaptureRegionField device={device} send={send} />}
          </div>
        </section>

        <section className="card devices-card">
          <h2 className="card-title">Screen alignment</h2>
          <div className="devices-settings">
            <SettingRow label="Orientation">
              <select
                value={device.rotation}
                aria-label="Orientation"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (value === 0 || value === 90 || value === 180 || value === 270) {
                    void send(buildDeviceUpdate(device, { rotation: value }))
                  }
                }}
              >
                {ORIENTATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Refresh rate">
              <select
                value={device.refreshHz}
                aria-label="Refresh rate"
                onChange={(event) => void send({ type: 'devices.refreshHz', deviceId: device.id, refreshHz: Number(event.target.value) })}
              >
                {REFRESH_RATES.map((hz) => (
                  <option key={hz} value={hz}>
                    {hz} Hz
                  </option>
                ))}
              </select>
            </SettingRow>
            <Stepper
              label="Offset X"
              unit="px"
              value={device.offsetX}
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              onChange={(value) => void send(buildDeviceUpdate(device, { offsetX: value }))}
            />
            <Stepper
              label="Offset Y"
              unit="px"
              value={device.offsetY}
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              onChange={(value) => void send(buildDeviceUpdate(device, { offsetY: value }))}
            />
            <Stepper
              label="Margin"
              unit="px"
              value={device.margin}
              min={MARGIN_MIN}
              max={MARGIN_MAX}
              onChange={(value) => void send(buildDeviceUpdate(device, { margin: value }))}
            />
          </div>
        </section>

        <ScreenPerformanceMetrics screen={screen} />
      </div>
    </div>
  )
}

/** One label/control row of a detail card, separated from the next by a divider rule. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="devices-setting">
      <span className="ui-label devices-setting-label">{label}</span>
      <div className="devices-setting-control">{children}</div>
    </div>
  )
}

/**
 * `devices.captureRegion` only takes an already-known rectangle — there is no drag-select
 * overlay in this renderer (the old Avalonia client's transparent selector window is not built
 * here), so this is a direct numeric entry of the same rectangle instead. Width and height stay
 * locked to the device's own panel aspect ratio (old `CaptureSelectionGeometry.AspectRatio`) so
 * the region can never be set to a shape that distorts once mirrored.
 */
function CaptureRegionField({ device, send }: { device: Device; send: (command: SprintCommand) => Promise<void> }) {
  const region = device.captureRegion
  const [x, setX] = useState(String(region?.x ?? 0))
  const [y, setY] = useState(String(region?.y ?? 0))
  const [width, setWidth] = useState(String(region?.width ?? ''))
  const [height, setHeight] = useState(String(region?.height ?? ''))

  const panel = logicalSize(device)
  const aspect = panel.width / panel.height

  const onWidthChange = (value: string) => {
    setWidth(value)
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) setHeight(String(Math.max(1, Math.round(parsed / aspect))))
  }

  const onHeightChange = (value: string) => {
    setHeight(value)
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) setWidth(String(Math.max(1, Math.round(parsed * aspect))))
  }

  const save = () => {
    const parsed = { x: Number(x), y: Number(y), width: Number(width), height: Number(height) }
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) || !(parsed.width > 0) || !(parsed.height > 0)) {
      return
    }

    void send({ type: 'devices.captureRegion', deviceId: device.id, ...parsed })
  }

  return (
    <SettingRow label="Capture area">
      <span className="devices-control-stack">
        <span className="field-hint">
          Desktop pixels to mirror on this screen. Width and height stay locked to the screen's aspect ratio. There is no
          on-screen area picker yet — enter the rectangle directly.
        </span>
        <span className="devices-capture-grid">
          <label className="field">
            <span>X</span>
            <input type="number" value={x} onChange={(event) => setX(event.target.value)} />
          </label>
          <label className="field">
            <span>Y</span>
            <input type="number" value={y} onChange={(event) => setY(event.target.value)} />
          </label>
          <label className="field">
            <span>Width</span>
            <input type="number" min={1} value={width} onChange={(event) => onWidthChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Height</span>
            <input type="number" min={1} value={height} onChange={(event) => onHeightChange(event.target.value)} />
          </label>
        </span>
        <span className="devices-capture-footer">
          <button type="button" className="button small" onClick={save}>
            Save capture area
          </button>
          <span className="muted tabular">
            {region ? `Current: ${region.width} × ${region.height} at (${region.x}, ${region.y})` : 'Not set — this screen has nothing to mirror yet.'}
          </span>
        </span>
      </span>
    </SettingRow>
  )
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <SettingRow label={label}>
      <span className="devices-stepper">
        <button
          type="button"
          className="icon-button"
          aria-label={`Decrease ${label}`}
          title={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={14} />
        </button>
        <span className="devices-stepper-value tabular">
          {value} {unit}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={`Increase ${label}`}
          title={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={14} />
        </button>
      </span>
    </SettingRow>
  )
}

type CatalogTab = 'preset' | 'generic' | 'custom'

const CATALOG_TABS: ReadonlyArray<{ id: CatalogTab; label: string }> = [
  { id: 'preset', label: 'Preset' },
  { id: 'generic', label: 'Generic' },
  { id: 'custom', label: 'Custom wheel' },
]

/**
 * "Add device" ContentDialog: Preset and Generic list the host catalog (a click adds the
 * entry), Custom wheel is the build-your-own form whose footer carries the one primary
 * button. Esc closes; the smoke does not, so a half-filled custom wheel is never lost to a
 * stray click.
 */
function CatalogDialog({
  catalog,
  onClose,
  onAdd,
  onAddCustom,
}: {
  catalog: CatalogEntry[]
  onClose: () => void
  onAdd: (entry: CatalogEntry) => void
  onAddCustom: (command: SprintCommand) => Promise<void>
}) {
  const [tab, setTab] = useState<CatalogTab>('preset')
  const entries = catalog.filter((entry) => isGenericCatalogEntry(entry) === (tab === 'generic'))

  return (
    <ContentDialog
      title="Add device"
      className="devices-catalog-dialog"
      onCancel={onClose}
      footer={
        <>
          {tab === 'custom' && (
            <button type="submit" form={CUSTOM_WHEEL_FORM_ID} className="button primary">
              Add wheel
            </button>
          )}
          <button type="button" className="button devices-dialog-close" onClick={onClose}>
            {tab === 'custom' ? 'Cancel' : 'Close'}
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist" aria-label="Device source">
        {CATALOG_TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {tab === 'custom' ? (
        <DevicesCustomWheelForm onAdd={onAddCustom} />
      ) : entries.length === 0 ? (
        <p className="muted">No devices are available in this category.</p>
      ) : (
        <ul className="devices-catalog-list" role="tabpanel">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="list-row devices-catalog-row" onClick={() => onAdd(entry)}>
                <span className="devices-row-text">
                  <span className="devices-row-name">{entry.name}</span>
                  {entry.description && <span className="muted devices-row-sub">{entry.description}</span>}
                </span>
                {entry.width > 0 && entry.height > 0 && (
                  <span className="muted tabular">
                    {entry.width} × {entry.height}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ContentDialog>
  )
}
