import { useState, useEffect, useCallback, useRef } from 'react'
import { IconDeviceMobile } from '@tabler/icons-react'
import {
  type SavedDevice, type CatalogEntry, type DeviceType, type LayoutMeta, type DeviceBinding,
  deviceAPI, deviceBindingsAPI, dashAPI, deviceHasScreen, deviceID,
} from '@/lib/dash'
import { type CommandMeta, controlsAPI } from '@/lib/controls'
import { onEvent } from '@/lib/wails'
import { Badge, Button, Skeleton, cn } from '@sprint/ui'

const DEVICE_TYPES: DeviceType[] = ['wheel', 'screen', 'buttonbox']
const SECTION_LABELS: Record<DeviceType, string> = {
  wheel:     'WHEELS',
  screen:    'SCREENS',
  buttonbox: 'BUTTON_BOXES',
}

function deviceKey(d: SavedDevice) {
  return `${d.vid}-${d.pid}-${d.serial}`
}

type PanelView =
  | { tag: 'empty' }
  | { tag: 'catalog'; filterType: DeviceType }
  | { tag: 'detail'; key: string }

export default function Devices() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <h2 className="terminal-header text-sm font-bold tracking-[0.2em]">DEVICE_CONFIG</h2>
      </div>
      <div className="flex flex-1 overflow-hidden min-h-0">
        <DeviceSection />
      </div>
    </div>
  )
}

function DeviceSection() {
  const [devices, setDevices]         = useState<SavedDevice[]>([])
  const [catalog, setCatalog]         = useState<CatalogEntry[]>([])
  const [layouts, setLayouts]         = useState<LayoutMeta[]>([])
  const [deviceOnlyCmds, setDeviceOnlyCmds] = useState<CommandMeta[]>([])
  const [screenStatus, setScreenStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [panel, setPanel]             = useState<PanelView>({ tag: 'empty' })

  const loadDevices = useCallback(async () => {
    try {
      const devs = await deviceAPI.getSavedDevices()
      setDevices(devs)
      return devs
    } catch (e) {
      setError(String(e))
      return []
    }
  }, [])

  useEffect(() => {
    Promise.all([
      loadDevices(),
      deviceAPI.getCatalog().then(setCatalog).catch(() => {}),
      dashAPI.listLayouts().then(setLayouts).catch(() => {}),
      deviceAPI.getScreenStatus().then(setScreenStatus),
      controlsAPI.getCommandCatalog()
        .then(cmds => setDeviceOnlyCmds(cmds.filter(c => c.deviceOnly)))
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [loadDevices])

  useEffect(() => {
    const unsubs = [
      onEvent('screen:connected',    () => setScreenStatus('connected')),
      onEvent('screen:disconnected', () => setScreenStatus('disconnected')),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  const handleAddForType = (type: DeviceType) => {
    setPanel({ tag: 'catalog', filterType: type })
  }

  const handleDeviceClick = (d: SavedDevice) => {
    setPanel({ tag: 'detail', key: deviceKey(d) })
  }

  const handleCatalogAdd = async (catalogID: string) => {
    await deviceAPI.addDevice(catalogID)
    const updated = await loadDevices()
    const entry = catalog.find(c => c.id === catalogID)
    // Auto-select the newly added device in the detail panel.
    const newDev = entry
      ? updated.find(d =>
          entry.vid === 0 && entry.pid === 0
            ? deviceKey(d) !== deviceKey(devices.find(x => deviceKey(x) === deviceKey(d)) ?? d) // new entry
            : d.vid === entry.vid && d.pid === entry.pid,
        )
      : undefined
    const target = newDev ?? updated[updated.length - 1]
    if (target) setPanel({ tag: 'detail', key: deviceKey(target) })
    else setPanel({ tag: 'empty' })
  }

  const handleRemove = async (d: SavedDevice) => {
    await deviceAPI.removeDevice(d.vid, d.pid, d.serial)
    await loadDevices()
    setPanel({ tag: 'empty' })
  }

  const selectedDevice =
    panel.tag === 'detail' ? devices.find(d => deviceKey(d) === panel.key) ?? null : null

  const catalogForType =
    panel.tag === 'catalog' ? catalog.filter(e => e.type === panel.filterType) : []

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* List panel */}
      <div className="flex w-60 flex-shrink-0 flex-col border-r border-border overflow-hidden">
        <div className="flex-1 overflow-y-auto py-2">
          {error && (
            <p className="mx-3 mb-2 font-mono text-[9px] text-destructive">{error}</p>
          )}

          {DEVICE_TYPES.map(type => {
            const group = devices.filter(d =>
              d.type === type || (type === 'screen' && (d.type === '' || d.type === undefined)),
            )
            return (
              <div key={type} className="mb-3">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="terminal-header text-[9px] font-bold text-text-muted">
                    {SECTION_LABELS[type]}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 font-mono text-[9px]"
                    onClick={() => handleAddForType(type)}
                  >
                    + ADD
                  </Button>
                </div>

                <div className="px-3 space-y-1">
                  {loading && group.length === 0 ? (
                    <Skeleton className="h-9 w-full" />
                  ) : group.length === 0 ? (
                    <p className="px-1 font-mono text-[8px] text-text-disabled">None added yet</p>
                  ) : (
                    group.map(d => {
                      const key = deviceKey(d)
                      const selected = panel.tag === 'detail' && panel.key === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleDeviceClick(d)}
                          className={cn(
                            'w-full border px-3 py-2 text-left transition-colors',
                            selected
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-border bg-card hover:border-border-strong hover:bg-card/80',
                          )}
                        >
                          <p className="truncate font-mono text-[10px] font-bold">{d.name}</p>
                          <p className="font-mono text-[8px] uppercase text-text-muted">
                            {d.driver || d.type || 'unknown'}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {panel.tag === 'catalog' && (
          <CatalogPanel
            entries={catalogForType}
            deviceType={panel.filterType}
            onAdd={handleCatalogAdd}
            onClose={() => setPanel({ tag: 'empty' })}
            onError={setError}
          />
        )}

        {panel.tag === 'detail' && selectedDevice && (
          <DeviceDetail
            device={selectedDevice}
            screenStatus={screenStatus}
            layouts={layouts}
            deviceOnlyCmds={deviceOnlyCmds}
            onSaved={loadDevices}
            onRemove={() => handleRemove(selectedDevice)}
            onError={setError}
          />
        )}

        {panel.tag === 'empty' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="terminal-header text-[10px] text-text-muted">SELECT_OR_ADD</p>
            <p className="font-mono text-[9px] text-text-muted">
              Pick a device from the list, or click + ADD to register a new one
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// CatalogPanel — right panel showing available catalog entries to add.

interface CatalogPanelProps {
  entries: CatalogEntry[]
  deviceType: DeviceType
  onAdd: (catalogID: string) => Promise<void>
  onClose: () => void
  onError: (msg: string) => void
}

function CatalogPanel({ entries, deviceType, onAdd, onClose, onError }: CatalogPanelProps) {
  const [adding, setAdding] = useState<string | null>(null)

  const handleAdd = async (id: string) => {
    setAdding(id)
    try {
      await onAdd(id)
    } catch (e) {
      onError(String(e))
      setAdding(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="terminal-header text-[10px] font-bold">
          ADD_{SECTION_LABELS[deviceType]}
        </h3>
        <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px]" onClick={onClose}>
          ✕ CANCEL
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="terminal-header text-[9px] text-text-muted">NO_CATALOG_ENTRIES</p>
          <p className="font-mono text-[8px] text-text-muted max-w-xs">
            No {deviceType} devices in the catalog yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold">{e.name}</p>
                <p className="mt-0.5 font-mono text-[8px] text-text-muted">{e.description}</p>
                {e.vid === 0 && e.pid === 0 ? (
                  <p className="mt-0.5 font-mono text-[8px] text-text-disabled">
                    Scans USB for first detected {e.driver} device
                  </p>
                ) : (
                  <p className="mt-0.5 font-mono text-[8px] text-text-disabled uppercase">
                    {e.driver} · {e.width}×{e.height}
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
                disabled={adding !== null}
                onClick={() => handleAdd(e.id)}
              >
                {adding === e.id ? 'ADDING…' : 'ADD'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// DeviceDetail — right panel shown when a device is selected.

const ORIENTATION_OPTIONS = [
  { degrees: 0   as const, label: 'Portrait',       iconRotation: 'rotate-0'    },
  { degrees: 90  as const, label: 'Landscape',      iconRotation: 'rotate-90'   },
  { degrees: 180 as const, label: 'Portrait Rev.',  iconRotation: 'rotate-180'  },
  { degrees: 270 as const, label: 'Landscape Rev.', iconRotation: '-rotate-90'  },
] as const
type Rotation = (typeof ORIENTATION_OPTIONS)[number]['degrees']

interface DeviceDetailProps {
  device: SavedDevice
  screenStatus: 'connected' | 'disconnected' | 'unknown'
  layouts: LayoutMeta[]
  deviceOnlyCmds: CommandMeta[]
  onSaved: () => Promise<SavedDevice[]>
  onRemove: () => Promise<void>
  onError: (msg: string) => void
}

function DeviceDetail({
  device, screenStatus, layouts, deviceOnlyCmds, onSaved, onRemove, onError,
}: DeviceDetailProps) {
  const isScreen = deviceHasScreen(device.type)
  const id = deviceID(device.vid, device.pid, device.serial)

  const [draft, setDraft]                       = useState(device.name)
  const [renaming, setRenaming]                 = useState(false)
  const [rotation, setRotation]                 = useState<Rotation>(device.rotation as Rotation)
  const [offsetX, setOffsetX]                   = useState(device.offsetX ?? 0)
  const [offsetY, setOffsetY]                   = useState(device.offsetY ?? 0)
  const [dashId, setDashId]                     = useState(device.dashId)
  const [savingDash, setSavingDash]             = useState(false)
  const [paused, setPaused]                     = useState(false)
  const [bindings, setBindings]                 = useState<DeviceBinding[]>([])
  const [removing, setRemoving]                 = useState(false)

  useEffect(() => {
    setDraft(device.name)
    setRotation(device.rotation as Rotation)
    setOffsetX(device.offsetX ?? 0)
    setOffsetY(device.offsetY ?? 0)
    setDashId(device.dashId)
    setRenaming(false)
    if (isScreen) {
      deviceAPI.getDevicePaused(id).then(setPaused).catch(() => {})
    }
    deviceBindingsAPI
      .getDeviceBindings(device.vid, device.pid, device.serial)
      .then(setBindings)
      .catch(() => setBindings([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const commitRename = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === device.name) {
      setDraft(device.name)
      setRenaming(false)
      return
    }
    try {
      await deviceAPI.renameDevice(device.vid, device.pid, device.serial, trimmed)
      await onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setRenaming(false)
    }
  }

  const handleRotation = async (r: Rotation) => {
    setRotation(r)
    try {
      await deviceAPI.setScreenRotation(device.vid, device.pid, device.serial, r)
    } catch (e) {
      onError(String(e))
      setRotation(device.rotation as Rotation)
    }
  }

  const handleOffsetChange = async (axis: 'x' | 'y', value: number) => {
    const nx = axis === 'x' ? value : offsetX
    const ny = axis === 'y' ? value : offsetY
    if (axis === 'x') setOffsetX(nx)
    else setOffsetY(ny)
    try {
      await deviceAPI.setScreenOffset(device.vid, device.pid, device.serial, nx, ny)
    } catch (e) {
      onError(String(e))
      if (axis === 'x') setOffsetX(device.offsetX ?? 0)
      else setOffsetY(device.offsetY ?? 0)
    }
  }

  const handleDashChange = async (newId: string) => {
    setDashId(newId)
    setSavingDash(true)
    try {
      await deviceAPI.setDashLayout(device.vid, device.pid, device.serial, newId)
      await onSaved()
    } catch (e) {
      onError(String(e))
      setDashId(device.dashId)
    } finally {
      setSavingDash(false)
    }
  }

  const handleTogglePause = async () => {
    const next = !paused
    setPaused(next)
    try {
      await deviceAPI.setDevicePaused(id, next)
    } catch (e) {
      onError(String(e))
      setPaused(paused)
    }
  }

  const getDeviceButton = (commandId: string) =>
    bindings.find(b => b.command === commandId)?.button ?? 0

  const setDeviceButton = async (commandId: string, button: number) => {
    const updated = bindings.filter(b => b.command !== commandId)
    if (button > 0) updated.push({ command: commandId, button })
    setBindings(updated)
    try {
      await deviceBindingsAPI.saveDeviceBindings(device.vid, device.pid, device.serial, updated)
    } catch (e) {
      onError(String(e))
    }
  }


  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove()
    } catch (e) {
      onError(String(e))
      setRemoving(false)
    }
  }

  const activeDashId = dashId || layouts[0]?.id || ''

  const typeLabel =
    device.type === 'wheel' ? 'WHEEL' :
    device.type === 'buttonbox' ? 'BUTTON_BOX' : 'SCREEN'

  return (
    <div className="p-6 space-y-6">
      {/* Name row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitRename()
                if (e.key === 'Escape') { setDraft(device.name); setRenaming(false) }
              }}
              onBlur={commitRename}
              className="bg-background px-1 font-mono text-sm font-bold outline outline-1 outline-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex items-center gap-1.5 text-left"
            >
              <span className="font-mono text-sm font-bold group-hover:text-primary transition-colors">
                {device.name}
              </span>
              <PencilIcon className="text-text-disabled group-hover:text-primary transition-colors flex-shrink-0" />
            </button>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="neutral" className="terminal-header">{typeLabel}</Badge>
            {isScreen && device.driver && (
              <span className="font-mono text-[9px] text-text-muted uppercase">{device.driver}</span>
            )}
            {isScreen && device.width > 0 && (
              <span className="font-mono text-[9px] text-text-muted">
                {device.width}×{device.height}
              </span>
            )}
            {device.serial && (
              <span className="font-mono text-[9px] text-text-muted">S/N: {device.serial}</span>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isScreen && screenStatus === 'connected' && (
            <Badge variant="connected" className="terminal-header">CONNECTED</Badge>
          )}
        </div>
      </div>

      {/* Screen-specific controls */}
      {isScreen && (
        <>
          {/* Pause/Resume */}
          <div className="flex items-center justify-between border border-border bg-card px-4 py-3 gap-3">
            <div className="min-w-0">
              <p className={cn(
                'font-mono text-[10px] font-bold',
                !paused ? 'text-success' : 'text-text-muted',
              )}>
                {paused ? 'PAUSED' : 'RENDERING'}
              </p>
              <p className="font-mono text-[9px] text-text-muted leading-snug">
                {paused
                  ? 'USB released — another app can control this screen'
                  : 'Sprint is actively sending frames to this screen'}
              </p>
            </div>
            <Button
              size="sm"
              variant={paused ? 'primary' : 'neutral'}
              className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
              onClick={handleTogglePause}
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </Button>
          </div>

          {/* Orientation */}
          <div className="space-y-1.5">
            <p className="font-mono text-[9px] font-bold text-text-muted">ORIENTATION</p>
            <div className="flex gap-1.5">
              {ORIENTATION_OPTIONS.map(({ degrees, label, iconRotation }) => (
                <button
                  key={degrees}
                  type="button"
                  onClick={() => handleRotation(degrees)}
                  className={cn(
                    'flex items-center gap-1.5 border px-3 py-1 font-mono text-[10px] transition-colors',
                    rotation === degrees
                      ? 'border-primary bg-primary text-background'
                      : 'border-border bg-background text-text-muted hover:text-foreground',
                  )}
                >
                  <IconDeviceMobile size={12} className={iconRotation} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Screen offset */}
          <div className="space-y-1.5">
            <p className="font-mono text-[9px] font-bold text-text-muted">SCREEN_OFFSET (px)</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-text-muted">LEFT</span>
                <input
                  type="number"
                  min={0}
                  max={512}
                  value={offsetX}
                  onChange={e => handleOffsetChange('x', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-16 border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-text-muted">TOP</span>
                <input
                  type="number"
                  min={0}
                  max={512}
                  value={offsetY}
                  onChange={e => handleOffsetChange('y', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-16 border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
          </div>

          {/* Dash layout assignment */}
          <div className="space-y-1.5">
            <p className="font-mono text-[9px] font-bold text-text-muted">
              DASH_LAYOUT{savingDash ? ' SAVING…' : ''}
            </p>
            {layouts.length === 0 ? (
              <p className="font-mono text-[9px] text-text-muted">
                No layouts saved yet — create one in DASH_STUDIO
              </p>
            ) : (
              <select
                value={activeDashId}
                onChange={e => handleDashChange(e.target.value)}
                disabled={savingDash}
                className={cn(
                  'w-full border border-border bg-background px-3 py-1.5',
                  'font-mono text-[10px] text-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-primary',
                  'disabled:opacity-50',
                )}
              >
                {layouts.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>
        </>
      )}

      {/* Button bindings */}
      {deviceOnlyCmds.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] font-bold text-text-muted">BUTTON_BINDINGS</p>
          <p className="font-mono text-[8px] text-text-muted">
            Click CAPTURE then press the physical button on this device.
          </p>
          <div className="space-y-1">
            {deviceOnlyCmds.map(cmd => {
              const btn = getDeviceButton(cmd.id)
              return (
                <DeviceCommandRow
                  key={cmd.id}
                  cmd={cmd}
                  button={btn}
                  bound={btn > 0}
                  onButtonChange={b => setDeviceButton(cmd.id, b)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Remove device */}
      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          size="sm"
          className="terminal-header h-7 px-3 text-[9px] text-destructive hover:border-destructive hover:bg-destructive/10"
          disabled={removing}
          onClick={handleRemove}
        >
          {removing ? 'REMOVING…' : 'REMOVE_DEVICE'}
        </Button>
      </div>
    </div>
  )
}

// DeviceCommandRow — a single device-only command with CAPTURE button.

type DeviceCaptureState = 'idle' | 'capturing' | 'timeout'

function DeviceCommandRow({
  cmd, button, bound, onButtonChange,
}: {
  cmd: CommandMeta
  button: number
  bound: boolean
  onButtonChange: (b: number) => void
}) {
  const [captureState, setCaptureState] = useState<DeviceCaptureState>('idle')
  const [countdown, setCountdown]       = useState(3)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const handleCapture = async () => {
    if (captureState === 'capturing') return
    setCaptureState('capturing')
    setCountdown(3)
    timerRef.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearTimer(); return 0 } return p - 1 })
    }, 1000)
    try {
      const btn = await controlsAPI.captureButton(3)
      clearTimer()
      onButtonChange(btn)
      setCaptureState('idle')
    } catch {
      clearTimer()
      setCaptureState('timeout')
      setTimeout(() => setCaptureState('idle'), 1200)
    }
  }

  useEffect(() => () => clearTimer(), [])

  return (
    <div className={cn(
      'flex items-center justify-between border px-4 py-2.5',
      bound ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
    )}>
      <div className="flex flex-col gap-0.5">
        <span className={cn('font-mono text-[11px] font-bold', bound ? 'text-white' : 'text-text-muted')}>
          {cmd.label}
        </span>
        <span className="font-mono text-[9px] text-text-muted opacity-60">{cmd.id}</span>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {bound && (
          <Badge variant="active" className="terminal-header">BTN_{button}</Badge>
        )}
        {bound && (
          <button
            onClick={() => onButtonChange(0)}
            className="flex h-5 w-5 items-center justify-center text-[13px] text-text-muted transition-colors hover:text-destructive focus:outline-none"
            title="Clear binding"
          >
            ×
          </button>
        )}
        <Button
          variant={captureState === 'capturing' ? 'ghost' : 'secondary'}
          size="sm"
          disabled={captureState === 'capturing'}
          onClick={handleCapture}
          className={cn(
            'terminal-header w-24 font-bold text-[9px]',
            captureState === 'timeout' && 'text-destructive',
          )}
        >
          {captureState === 'capturing'
            ? `LISTENING_${countdown}`
            : captureState === 'timeout'
              ? 'NO_INPUT'
              : 'CAPTURE'}
        </Button>
      </div>
    </div>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={className}>
      <path
        d="M7.5 1.5 L9.5 3.5 L3.5 9.5 L1 10 L1.5 7.5 Z"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M6.5 2.5 L8.5 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
