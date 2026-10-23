import { useState } from 'react'
import { Activity, Check, ChevronLeft, LayoutDashboard, Monitor, Move, Pencil, Power, RotateCw, ScanLine, Square, Trash2 } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { PageHeader } from '../shell/PageHeader'
import { SettingRow, SettingsGroup, blurOnEnter } from './SettingsLayout'
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
  deviceKind,
  deviceSummary,
  formatDurationMs,
  formatFramesPerSecond,
  logicalSize,
  resolvePurpose,
} from './DevicesDomain'
import type { Device, DashOption, DeviceImageKey, ScreenOutput } from './DevicesDomain'
import { DeviceImage } from './DeviceImage'
import { DeviceStatusInfoBar, DeviceStatusLabel } from './DevicesStatus'

type DetailTab = 'screen' | 'output'

const TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: 'screen', label: 'Screen' },
  { id: 'output', label: 'Output' },
]

/**
 * One device, a level below the overview: its picture and status, Turn off / Remove in the
 * toolbar, then the Screen (how the panel is driven and mounted) and Output (what it shows) tabs.
 * The name is the heading itself, renamed in place (DeviceName). A device without a screen has
 * no tabs.
 */
export function DeviceDetail({
  device,
  image,
  dashOptions,
  screen,
  send,
  onBack,
}: {
  device: Device
  image: DeviceImageKey | null
  dashOptions: DashOption[]
  screen: ScreenOutput | undefined
  send: (command: SprintCommand) => Promise<void>
  onBack: () => void
}) {
  const [tab, setTab] = useState<DetailTab>('screen')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const hasScreen = deviceHasScreen(device)
  const setDisabled = (disabled: boolean) => void send({ type: 'devices.save', deviceId: device.id, disabled })

  return (
    <div className="device-detail">
      <PageHeader title="Devices">
        {device.disabled ? (
          <button type="button" className="button primary" onClick={() => setDisabled(false)}>
            <Power /> Turn on
          </button>
        ) : (
          <button type="button" className="button" onClick={() => setDisabled(true)}>
            <Power /> Turn off
          </button>
        )}
        <button type="button" className="button destructive" onClick={() => setConfirmRemove(true)}>
          <Trash2 /> Remove
        </button>
      </PageHeader>

      <button type="button" className="button subtle device-back" onClick={onBack}>
        <ChevronLeft /> All devices
      </button>
      <header className="device-head">
        <DeviceImage image={image} dim={device.disabled} className="device-head-image" />
        <div className="device-head-text">
          <DeviceName key={device.id} device={device} send={send} />
          <DeviceStatusLine device={device} screen={screen} />
          <span className="muted device-head-line">
            {deviceSummary(device)} · {deviceKind(device) === 'wheel' ? 'Wheel' : 'Screen'}
          </span>
        </div>
      </header>
      <DeviceStatusInfoBar device={device} screen={screen} />

      {hasScreen && (
        <>
          <div className="tabs device-tabs" role="tablist" aria-label="Device settings">
            {TABS.map((option) => (
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
          <div className="device-tab" role="tabpanel">
            {tab === 'screen' ? (
              <ScreenTab key={device.id} device={device} screen={screen} send={send} />
            ) : (
              <OutputTab key={device.id} device={device} dashOptions={dashOptions} send={send} />
            )}
          </div>
        </>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${device.name}?`}
          message="Its settings go with it. This cannot be undone."
          confirmLabel="Remove device"
          destructive
          onConfirm={() => {
            void send({ type: 'devices.remove', deviceId: device.id })
            setConfirmRemove(false)
            onBack()
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  )
}

/** Status beside the name: "Connected · 30.0 fps", "Off · Sprint isn't sending…", or the problem's word. */
function DeviceStatusLine({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  if (!deviceHasScreen(device)) {
    return device.disabled ? <span className="device-head-line">Off</span> : null
  }

  const performance = screen?.hardware?.performance
  return (
    <span className="device-head-line">
      <DeviceStatusLabel device={device} screen={screen} />
      {device.disabled && <span className="muted">· Sprint isn't sending anything to this screen</span>}
      {!device.disabled && screen?.hardware?.status.isConnected && performance?.hasSamples && (
        <span className="muted tabular">· {formatFramesPerSecond(performance)}</span>
      )}
    </span>
  )
}

function ScreenTab({ device, screen, send }: { device: Device; screen: ScreenOutput | undefined; send: (command: SprintCommand) => Promise<void> }) {
  const performance = screen?.hardware?.performance
  const running =
    performance?.hasSamples && !device.disabled
      ? ` Running at ${formatFramesPerSecond(performance)}, ${formatDurationMs(performance.totalFrameTimeMs)} a frame.`
      : ''

  return (
    <>
      <SettingsGroup title="Display">
        <SettingRow id="device-rate" icon={Activity} title="Frame rate" description={`Higher is smoother and costs more CPU.${running}`}>
          {(labels) => (
            <select
              {...labels}
              className="settings-input-wide"
              value={device.refreshHz}
              onChange={(event) => void send({ type: 'devices.refreshHz', deviceId: device.id, refreshHz: Number(event.target.value) })}
            >
              {REFRESH_RATES.map((hz) => (
                <option key={hz} value={hz}>
                  {hz} fps
                </option>
              ))}
            </select>
          )}
        </SettingRow>
        <SettingRow id="device-orientation" icon={RotateCw} title="Orientation" description="How the screen is mounted.">
          {(labels) => (
            <select
              {...labels}
              className="settings-input-wide"
              value={device.rotation}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (value === 0 || value === 90 || value === 180 || value === 270) void send(buildDeviceUpdate(device, { rotation: value }))
              }}
            >
              {ORIENTATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Alignment">
        <SettingRow id="device-offset" icon={Move} title="Offset" description="Shift the image if the bezel cuts an edge off. Negative moves it left or up.">
          {(labels) => (
            <span className="device-pair" role="group" {...labels}>
              <PixelField key={`x${device.offsetX}`} label="X" value={device.offsetX} min={OFFSET_MIN} max={OFFSET_MAX} onCommit={(offsetX) => void send(buildDeviceUpdate(device, { offsetX }))} />
              <PixelField key={`y${device.offsetY}`} label="Y" value={device.offsetY} min={OFFSET_MIN} max={OFFSET_MAX} onCommit={(offsetY) => void send(buildDeviceUpdate(device, { offsetY }))} />
            </span>
          )}
        </SettingRow>
        <SettingRow id="device-margin" icon={Square} title="Margin" description="Keep the dash clear of a curved or covered edge.">
          {(labels) => (
            <span role="group" {...labels}>
              <PixelField key={device.margin} value={device.margin} min={MARGIN_MIN} max={MARGIN_MAX} onCommit={(margin) => void send(buildDeviceUpdate(device, { margin }))} />
            </span>
          )}
        </SettingRow>
      </SettingsGroup>
    </>
  )
}

function OutputTab({ device, dashOptions, send }: { device: Device; dashOptions: DashOption[]; send: (command: SprintCommand) => Promise<void> }) {
  const purpose = resolvePurpose(device.purpose)
  return (
    <>
      <SettingRow id="device-purpose" icon={Monitor} title="Used for" description={purpose.description}>
        {(labels) => (
          <select
            {...labels}
            className="settings-input-wide"
            value={purpose.id}
            onChange={(event) => void send({ type: 'devices.purpose', deviceId: device.id, purpose: event.target.value })}
          >
            {PURPOSES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </SettingRow>
      {purpose.id === 'dash' && (
        <SettingsGroup title="Dashboards">
          <SettingRow
            id="device-dash"
            icon={LayoutDashboard}
            title="Dashboard"
            description={dashOptions.length === 0 ? 'No dashes yet. Create one on the Dashes page.' : 'Edit dashes on the Dashes page.'}
          >
            {(labels) =>
              dashOptions.length > 0 && (
                <select {...labels} className="settings-input-wide" value={device.dashId} onChange={(event) => void send(buildDeviceUpdate(device, { dashId: event.target.value }))}>
                  {dashOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )
            }
          </SettingRow>
        </SettingsGroup>
      )}
      {purpose.needsCaptureRegion && <CaptureAreaRow key={device.id} device={device} send={send} />}
    </>
  )
}

/**
 * The name as the page's heading. The pen swaps it for an input in the same type with a save
 * button beside it: Enter or the button saves, Escape puts the name back, and so does saving it
 * empty or unchanged.
 */
function DeviceName({ device, send }: { device: Device; send: (command: SprintCommand) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return (
      <div className="device-name">
        <h2 className="device-head-name">{device.name}</h2>
        <button type="button" className="icon-button device-name-button" aria-label="Rename" title="Rename" onClick={() => setDraft(device.name)}>
          <Pencil size={16} />
        </button>
      </div>
    )
  }

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== device.name) void send(buildDeviceUpdate(device, { name: trimmed }))
    setDraft(null)
  }

  return (
    <form
      className="device-name"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <input
        className="device-name-input"
        aria-label="Device name"
        value={draft}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
          }
        }}
      />
      <button type="submit" className="icon-button device-name-button" aria-label="Save name" title="Save">
        <Check size={16} />
      </button>
    </form>
  )
}

/**
 * A whole number of pixels, typed or stepped with the arrow keys. Commits on blur or Enter,
 * clamped to the host's range; anything that is not a number snaps back. Keyed by the saved
 * value at the call site, so a value saved elsewhere replaces the draft.
 */
function PixelField({ label, value, min, max, onCommit }: { label?: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))

  const commit = () => {
    const parsed = Math.round(Number(draft))
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <label className="device-pixel">
      {label && <span className="muted">{label}</span>}
      <input
        type="number"
        className="tabular"
        aria-label={label ? `${label} in pixels` : 'Pixels'}
        value={draft}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
      <span className="muted">px</span>
    </label>
  )
}

/**
 * `devices.captureRegion` only takes an already-known rectangle — there is no drag-select overlay
 * yet — so the region is typed. Width and height stay locked to the panel's aspect ratio so the
 * mirrored image never distorts.
 */
function CaptureAreaRow({ device, send }: { device: Device; send: (command: SprintCommand) => Promise<void> }) {
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
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) || !(parsed.width > 0) || !(parsed.height > 0)) return
    void send({ type: 'devices.captureRegion', deviceId: device.id, ...parsed })
  }

  return (
    <SettingRow
      id="device-capture"
      icon={ScanLine}
      title="Capture area"
      description={
        region
          ? `Mirrors ${region.width} × ${region.height} desktop pixels at (${region.x}, ${region.y}).`
          : 'Not set — enter the desktop area this screen mirrors.'
      }
    >
      {(labels) => (
        <span className="device-capture" role="group" {...labels}>
          <input type="number" aria-label="X" placeholder="X" value={x} onChange={(event) => setX(event.target.value)} />
          <input type="number" aria-label="Y" placeholder="Y" value={y} onChange={(event) => setY(event.target.value)} />
          <input type="number" aria-label="Width" placeholder="Width" min={1} value={width} onChange={(event) => onWidthChange(event.target.value)} />
          <input type="number" aria-label="Height" placeholder="Height" min={1} value={height} onChange={(event) => onHeightChange(event.target.value)} />
          <button type="button" className="button" onClick={save}>
            Save
          </button>
        </span>
      )}
    </SettingRow>
  )
}
