import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronLeft, Copy, Layers, LayoutDashboard, Link, Monitor, Move, Power, Ratio, RotateCw, ScanLine, Square, Trash2 } from 'lucide-react'
import type { MultiDial, SprintCommand } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { PageHeader } from '../shell/PageHeader'
import { InlineName } from '../shell/InlineName'
import { Switch } from '../shell/Switch'
import { SettingRow, SettingsGroup, blurOnEnter } from './SettingsLayout'
import {
  BROWSER_DISPLAY_MAX_HEIGHT,
  BROWSER_DISPLAY_MAX_WIDTH,
  BROWSER_DISPLAY_MIN_SIZE,
  MARGIN_MAX,
  MARGIN_MIN,
  OFFSET_MAX,
  OFFSET_MIN,
  ORIENTATIONS,
  REFRESH_RATES,
  browserDisplayAddress,
  buildBrowserDisplayBackground,
  buildBrowserDisplaySize,
  buildDeviceUpdate,
  deviceHasScreen,
  deviceKind,
  deviceSummary,
  formatDurationMs,
  formatFramesPerSecond,
  isBrowserDisplay,
  logicalSize,
  purposesFor,
  resolvePurpose,
  screenSettings,
  viewerCount,
} from './DevicesDomain'
import type { Device, DashOption, DeviceImageKey, ScreenOutput, ScreenSetting } from './DevicesDomain'
import { DeviceControls } from './DeviceControls'
import { DeviceImage } from './DeviceImage'
import { DeviceStatusInfoBar, DeviceStatusLabel } from './DevicesStatus'

type DetailTab = 'screen' | 'output' | 'controls'

const TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: 'screen', label: 'Screen' },
  { id: 'output', label: 'Output' },
  { id: 'controls', label: 'Controls' },
]

/**
 * One device, a level below the overview: its picture and status, Turn off / Remove in the
 * toolbar, then the Screen (how the panel is driven and mounted, or a browser display's address and
 * picture) and Output (what it shows) tabs, and Controls (its picture with the controls Sprint
 * knows) for a wheel whose preset has a dial.
 * The name is the heading itself, renamed in place (InlineName). A device without a screen has
 * no tabs.
 */
export function DeviceDetail({
  device,
  image,
  dashOptions,
  screen,
  dial,
  send,
  onBack,
}: {
  device: Device
  image: DeviceImageKey | null
  dashOptions: DashOption[]
  screen: ScreenOutput | undefined
  /** The wheel's multi-dial, when its preset has one; it brings the Controls tab. */
  dial: MultiDial | null
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
          <InlineName key={device.id} name={device.name} label="Device name" onRename={(name) => void send(buildDeviceUpdate(device, { name }))} />
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
            {TABS.filter((option) => option.id !== 'controls' || dial !== null).map((option) => (
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
          <div className={tab === 'controls' ? 'device-tab wide' : 'device-tab'} role="tabpanel">
            {tab === 'screen' ? (
              <ScreenTab key={device.id} device={device} screen={screen} send={send} />
            ) : tab === 'controls' && dial ? (
              <DeviceControls dial={dial} image={image} screenSize={logicalSize(device)} send={send} />
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
  const viewers = screen?.hardware?.viewers ?? 0
  return (
    <span className="device-head-line">
      <DeviceStatusLabel device={device} screen={screen} />
      {device.disabled && <span className="muted">· Sprint isn't sending anything to this screen</span>}
      {!device.disabled && screen?.hardware?.status.isConnected && performance?.hasSamples && (
        <span className="muted tabular">· {formatFramesPerSecond(performance)}</span>
      )}
      {!device.disabled && isBrowserDisplay(device) && screen?.hardware?.status.isConnected && viewers > 0 && (
        <span className="muted tabular">· {viewerCount(viewers)}</span>
      )}
    </span>
  )
}

/** The Screen tab: only the settings that apply to this device (`screenSettings`), never dead ones. */
function ScreenTab({ device, screen, send }: { device: Device; screen: ScreenOutput | undefined; send: (command: SprintCommand) => Promise<void> }) {
  const settings = screenSettings(device)
  const has = (setting: ScreenSetting) => settings.includes(setting)
  const performance = screen?.hardware?.performance
  const running =
    performance?.hasSamples && !device.disabled
      ? ` Running at ${formatFramesPerSecond(performance)}, ${formatDurationMs(performance.totalFrameTimeMs)} a frame.`
      : ''

  return (
    <>
      {has('address') && (
        <SettingsGroup title="Address">
          <AddressRow address={browserDisplayAddress(device.id)} />
        </SettingsGroup>
      )}

      <SettingsGroup title="Display">
        {has('resolution') && (
          <SettingRow
            id="device-resolution"
            icon={Ratio}
            title="Resolution"
            description={`The size the dash is drawn at, up to ${BROWSER_DISPLAY_MAX_WIDTH} × ${BROWSER_DISPLAY_MAX_HEIGHT}.`}
          >
            {(labels) => (
              <span role="group" {...labels}>
                <ResolutionField key={`${device.width}x${device.height}`} width={device.width} height={device.height} onCommit={(width, height) => void send(buildBrowserDisplaySize(device, width, height))} />
              </span>
            )}
          </SettingRow>
        )}
        {has('background') && (
          <SettingRow id="device-background" icon={Layers} title="Transparent background" description="Shows only the dash, for an overlay. Off draws it on black.">
            {(labels) => <Switch {...labels} checked={device.transparent} onChange={(transparent) => void send(buildBrowserDisplayBackground(device, transparent))} />}
          </SettingRow>
        )}
        {has('frameRate') && (
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
        )}
        {has('orientation') && (
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
        )}
      </SettingsGroup>

      {(has('offset') || has('margin')) && (
        <SettingsGroup title="Alignment">
          {has('offset') && (
            <SettingRow id="device-offset" icon={Move} title="Offset" description="Shift the image if the bezel cuts an edge off. Negative moves it left or up.">
              {(labels) => (
                <span className="device-pair" role="group" {...labels}>
                  <PixelField key={`x${device.offsetX}`} label="X" value={device.offsetX} min={OFFSET_MIN} max={OFFSET_MAX} onCommit={(offsetX) => void send(buildDeviceUpdate(device, { offsetX }))} />
                  <PixelField key={`y${device.offsetY}`} label="Y" value={device.offsetY} min={OFFSET_MIN} max={OFFSET_MAX} onCommit={(offsetY) => void send(buildDeviceUpdate(device, { offsetY }))} />
                </span>
              )}
            </SettingRow>
          )}
          {has('margin') && (
            <SettingRow id="device-margin" icon={Square} title="Margin" description="Keep the dash clear of a curved or covered edge.">
              {(labels) => (
                <span role="group" {...labels}>
                  <PixelField key={device.margin} value={device.margin} min={MARGIN_MIN} max={MARGIN_MAX} onCommit={(margin) => void send(buildDeviceUpdate(device, { margin }))} />
                </span>
              )}
            </SettingRow>
          )}
        </SettingsGroup>
      )}
    </>
  )
}

/**
 * A browser display's address with a Copy button, and how to use it. If the clipboard refuses,
 * the address is selected for Ctrl+C.
 */
function AddressRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = () => {
    navigator.clipboard.writeText(address).then(
      () => setCopied(true),
      () => field.current?.select(),
    )
  }

  return (
    <>
      <SettingRow
        id="device-address"
        icon={Link}
        title="Address"
        description={
          <input ref={field} className="mono device-address" readOnly value={address} aria-label="Address" onFocus={(event) => event.currentTarget.select()} />
        }
      >
        {(labels) => (
          <button type="button" className="button" onClick={copy} {...labels}>
            <Copy /> {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </SettingRow>
      <p className="muted device-note">
        Paste it into your VR tool as a web source, or open it in any browser on this PC. Set that source to this display’s resolution, and to 30 Hz if the
        tool allows it.
      </p>
    </>
  )
}

/**
 * Width × height in pixels, committed together on blur or Enter and clamped to what a browser
 * display takes; anything that is not a number snaps back. Keyed by the saved size at the call site.
 */
function ResolutionField({ width, height, onCommit }: { width: number; height: number; onCommit: (width: number, height: number) => void }) {
  const [draftWidth, setDraftWidth] = useState(String(width))
  const [draftHeight, setDraftHeight] = useState(String(height))

  const commit = () => {
    const parsedWidth = Math.round(Number(draftWidth))
    const parsedHeight = Math.round(Number(draftHeight))
    if (draftWidth.trim() === '' || draftHeight.trim() === '' || !Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
      setDraftWidth(String(width))
      setDraftHeight(String(height))
      return
    }
    const nextWidth = Math.min(BROWSER_DISPLAY_MAX_WIDTH, Math.max(BROWSER_DISPLAY_MIN_SIZE, parsedWidth))
    const nextHeight = Math.min(BROWSER_DISPLAY_MAX_HEIGHT, Math.max(BROWSER_DISPLAY_MIN_SIZE, parsedHeight))
    setDraftWidth(String(nextWidth))
    setDraftHeight(String(nextHeight))
    if (nextWidth !== width || nextHeight !== height) onCommit(nextWidth, nextHeight)
  }

  return (
    <span className="device-pixel device-resolution">
      <input
        type="number"
        className="tabular"
        aria-label="Width in pixels"
        value={draftWidth}
        min={BROWSER_DISPLAY_MIN_SIZE}
        max={BROWSER_DISPLAY_MAX_WIDTH}
        onChange={(event) => setDraftWidth(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
      <span className="muted">×</span>
      <input
        type="number"
        className="tabular"
        aria-label="Height in pixels"
        value={draftHeight}
        min={BROWSER_DISPLAY_MIN_SIZE}
        max={BROWSER_DISPLAY_MAX_HEIGHT}
        onChange={(event) => setDraftHeight(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
      <span className="muted">px</span>
    </span>
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
            {purposesFor(device).map((option) => (
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
