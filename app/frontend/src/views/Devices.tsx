import { useState, useEffect, useCallback, useRef } from 'react'
import { IconDeviceMobile, IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'
import {
  type SavedDevice, type CatalogEntry, type DetectedScreen, type DeviceType,
  type DevicePurpose, type RearViewConfig, type RearViewIdleMode, type LayoutMeta, type DeviceBinding,
  deviceAPI, deviceBindingsAPI, dashAPI, deviceHasScreen, deviceID,
} from '@/lib/dash'
import { type CommandMeta, controlsAPI } from '@/lib/controls'
import { call, onEvent } from '@/lib/wails'
import { Badge, Button, Switch, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent, cn } from '@sprint/ui'

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
  const [disabledMap, setDisabledMap]   = useState<Record<string, boolean>>({})
  const [loading, setLoading]           = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [panel, setPanel]             = useState<PanelView>({ tag: 'empty' })
  const [driverMissingType, setDriverMissingType] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    try {
      const devs = await deviceAPI.getSavedDevices()
      setDevices(devs)
      const screens = devs.filter(d => deviceHasScreen(d.type))
      const entries = await Promise.all(
        screens.map(async d => {
          const id = deviceID(d.vid, d.pid, d.serial)
          const val = await deviceAPI.getDeviceDisabled(id).catch(() => false)
          return [id, val] as [string, boolean]
        }),
      )
      setDisabledMap(Object.fromEntries(entries))
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
      onEvent('screen:connected',    () => { setScreenStatus('connected'); setDriverMissingType(null) }),
      onEvent('screen:disconnected', () => setScreenStatus('disconnected')),
      onEvent('screen:driver_missing', (data: { driver: string; error: string }) => {
        setDriverMissingType(data?.driver ?? 'unknown')
      }),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  const handleAddForType = (type: DeviceType) => {
    setPanel({ tag: 'catalog', filterType: type })
  }

  const handleDeviceClick = (d: SavedDevice) => {
    setPanel({ tag: 'detail', key: deviceKey(d) })
  }

  const autoSelectAfterAdd = useCallback(async (catalogID: string, prevDevices: SavedDevice[]) => {
    const updated = await loadDevices()
    const entry = catalog.find(c => c.id === catalogID)
    const prevKeys = new Set(prevDevices.map(deviceKey))
    const newDev = entry
      ? updated.find(d =>
          entry.vid === 0 && entry.pid === 0
            ? !prevKeys.has(deviceKey(d))
            : d.vid === entry.vid && d.pid === entry.pid,
        )
      : undefined
    const target = newDev ?? updated[updated.length - 1]
    if (target) setPanel({ tag: 'detail', key: deviceKey(target) })
    else setPanel({ tag: 'empty' })
  }, [catalog, loadDevices])

  const handleCatalogAdd = async (catalogID: string) => {
    const entry = catalog.find(c => c.id === catalogID)
    if (entry && entry.vid === 0 && entry.pid === 0) {
      // Generic entry: scan first so the user can pick when multiple screens are found.
      // CatalogPanel handles the scanning/picker flow and calls back with the resolved result.
      await deviceAPI.addDevice(catalogID)
    } else {
      await deviceAPI.addDevice(catalogID)
    }
    await autoSelectAfterAdd(catalogID, devices)
  }

  const handleCatalogAddScanned = async (catalogID: string, screen: DetectedScreen) => {
    await deviceAPI.addScanned(catalogID, screen.vid, screen.pid, screen.serial)
    await autoSelectAfterAdd(catalogID, devices)
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
                      const isScr = deviceHasScreen(d.type)
                      const did = deviceID(d.vid, d.pid, d.serial)
                      const dotColor = !isScr ? null
                        : screenStatus === 'connected' && !disabledMap[did] ? 'bg-success'
                        : screenStatus === 'connected'                       ? 'bg-warning'
                        : 'bg-text-disabled'
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            {dotColor && (
                              <span className={cn('size-1.5 rounded-full flex-shrink-0', dotColor)} />
                            )}
                            <p className="truncate font-mono text-[10px] font-bold">{d.name}</p>
                          </div>
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
        {driverMissingType && (
          <DriverMissingBanner
            driverType={driverMissingType}
            onDismiss={() => setDriverMissingType(null)}
          />
        )}

        {panel.tag === 'catalog' && (
          <CatalogPanel
            entries={catalogForType}
            deviceType={panel.filterType}
            onAdd={handleCatalogAdd}
            onAddScanned={handleCatalogAddScanned}
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
            disabledMap={disabledMap}
            setDisabledMap={setDisabledMap}
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

// DriverMissingBanner is shown when the WinUSB driver is not bound to a screen
// device. It offers a one-click install via pnputil (requires UAC elevation).
interface DriverMissingBannerProps {
  driverType: string
  onDismiss: () => void
}

function DriverMissingBanner({ driverType, onDismiss }: DriverMissingBannerProps) {
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const handleInstall = async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      await call<void>('InstallScreenDriver', driverType)
      // Driver installed — the retry loop will reconnect automatically.
      // The banner will auto-hide when screen:connected fires.
    } catch (e) {
      setInstallError(String(e))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-2 border border-warning/40 bg-warning/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-warning" />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] font-bold text-warning uppercase tracking-wide">
            DRIVER_NOT_INSTALLED
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-text-muted">
            The WinUSB driver is not bound to this {driverType.toUpperCase()} device.
            Click <span className="text-foreground">Install Driver</span> to install it automatically
            (requires administrator approval).
          </p>
          {installError && (
            <p className="mt-1 font-mono text-[9px] text-destructive">{installError}</p>
          )}
        </div>
        <button
          type="button"
          className="font-mono text-[9px] text-text-muted hover:text-foreground"
          onClick={onDismiss}
        >✕</button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-3 font-mono text-[9px] border-warning/40 text-warning hover:bg-warning/10 disabled:opacity-50"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <span className="flex items-center gap-1">
              <IconLoader2 className="size-3 animate-spin" />
              INSTALLING…
            </span>
          ) : (
            'INSTALL_DRIVER'
          )}
        </Button>
        <span className="font-mono text-[8px] text-text-disabled">
          Alternatively, use Zadig or SimHub's VOCOREScreenSetup
        </span>
      </div>
    </div>
  )
}

// CatalogPanel — right panel showing available catalog entries to add.

interface CatalogPanelProps {
  entries: CatalogEntry[]
  deviceType: DeviceType
  onAdd: (catalogID: string) => Promise<void>
  onAddScanned: (catalogID: string, screen: DetectedScreen) => Promise<void>
  onClose: () => void
  onError: (msg: string) => void
}

function CatalogPanel({ entries, deviceType, onAdd, onAddScanned, onClose, onError }: CatalogPanelProps) {
  const [scanning, setScanning] = useState<string | null>(null)
  const [adding, setAdding]     = useState<string | null>(null)
  const [candidates, setCandidates] = useState<{ catalogID: string; screens: DetectedScreen[] } | null>(null)

  const handleAdd = async (entry: CatalogEntry) => {
    if (entry.vid !== 0 || entry.pid !== 0) {
      // Non-generic: add directly, no scan needed.
      setAdding(entry.id)
      try {
        await onAdd(entry.id)
      } catch (e) {
        onError(String(e))
        setAdding(null)
      }
      return
    }

    // Generic entry: scan first to find all unregistered devices.
    setScanning(entry.id)
    try {
      const found = await deviceAPI.scanUnregistered(entry.id)
      if (found.length === 0) {
        onError(`No unregistered ${entry.driver.toUpperCase()} device found. Make sure the device is connected.`)
        setScanning(null)
        return
      }
      if (found.length === 1) {
        // Single result — add immediately without showing a picker.
        setAdding(entry.id)
        setScanning(null)
        try {
          await onAddScanned(entry.id, found[0])
        } catch (e) {
          onError(String(e))
          setAdding(null)
        }
        return
      }
      // Multiple results — show inline picker.
      setCandidates({ catalogID: entry.id, screens: found })
      setScanning(null)
    } catch (e) {
      onError(String(e))
      setScanning(null)
    }
  }

  const handlePickScanned = async (screen: DetectedScreen) => {
    if (!candidates) return
    setAdding(candidates.catalogID)
    setCandidates(null)
    try {
      await onAddScanned(candidates.catalogID, screen)
    } catch (e) {
      onError(String(e))
      setAdding(null)
    }
  }

  if (candidates) {
    return (
      <ScanPickerPanel
        catalogID={candidates.catalogID}
        screens={candidates.screens}
        deviceType={deviceType}
        onPick={handlePickScanned}
        onBack={() => setCandidates(null)}
      />
    )
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
          {entries.map(e => {
            const isGeneric = e.vid === 0 && e.pid === 0
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-bold">{e.name}</p>
                  <p className="mt-0.5 font-mono text-[8px] text-text-muted">{e.description}</p>
                  {isGeneric ? (
                    <p className="mt-0.5 font-mono text-[8px] text-text-disabled">
                      Scans USB for {e.driver.toUpperCase()} devices
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
                  disabled={scanning !== null || adding !== null}
                  onClick={() => handleAdd(e)}
                >
                  {scanning === e.id ? 'SCANNING…' : adding === e.id ? 'ADDING…' : 'ADD'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ScanPickerPanel — inline picker shown when a scan finds multiple unregistered devices.

interface ScanPickerPanelProps {
  catalogID: string
  screens: DetectedScreen[]
  deviceType: DeviceType
  onPick: (screen: DetectedScreen) => Promise<void>
  onBack: () => void
}

function ScanPickerPanel({ screens, deviceType, onPick, onBack }: ScanPickerPanelProps) {
  const [picking, setPicking] = useState<string | null>(null)

  const screenKey = (s: DetectedScreen) =>
    `${s.vid.toString(16).padStart(4, '0')}-${s.pid.toString(16).padStart(4, '0')}${s.serial ? `-${s.serial}` : ''}`

  const handlePick = async (s: DetectedScreen) => {
    const key = screenKey(s)
    setPicking(key)
    try {
      await onPick(s)
    } catch {
      setPicking(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="terminal-header text-[10px] font-bold">
          SELECT_{SECTION_LABELS[deviceType]}
        </h3>
        <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px]" onClick={onBack}>
          ← BACK
        </Button>
      </div>
      <p className="font-mono text-[8px] text-text-muted">
        {screens.length} {deviceType} devices found. Select the one to register.
      </p>
      <div className="space-y-2">
        {screens.map(s => {
          const key = screenKey(s)
          const vidHex = s.vid.toString(16).padStart(4, '0').toUpperCase()
          const pidHex = s.pid.toString(16).padStart(4, '0').toUpperCase()
          return (
            <div
              key={key}
              className="flex items-start justify-between gap-3 border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold">{s.description || s.driver.toUpperCase()}</p>
                <p className="mt-0.5 font-mono text-[8px] text-text-muted uppercase">
                  {s.width}×{s.height} · {vidHex}:{pidHex}
                </p>
                {s.serial && (
                  <p className="mt-0.5 font-mono text-[8px] text-text-disabled">S/N {s.serial}</p>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
                disabled={picking !== null}
                onClick={() => handlePick(s)}
              >
                {picking === key ? 'ADDING…' : 'SELECT'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}



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
  disabledMap: Record<string, boolean>
  setDisabledMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onSaved: () => Promise<SavedDevice[]>
  onRemove: () => Promise<void>
  onError: (msg: string) => void
}

function DeviceDetail({
  device, screenStatus, layouts, deviceOnlyCmds, disabledMap, setDisabledMap, onSaved, onRemove, onError,
}: DeviceDetailProps) {
  const isScreen = deviceHasScreen(device.type)
  const isScreenOnly = device.type === 'screen'
  const id = deviceID(device.vid, device.pid, device.serial)

  const [draft, setDraft]                       = useState(device.name)
  const [renaming, setRenaming]                 = useState(false)
  const [rotation, setRotation]                 = useState<Rotation>(device.rotation as Rotation)
  const [offsetX, setOffsetX]                   = useState(device.offsetX ?? 0)
  const [offsetY, setOffsetY]                   = useState(device.offsetY ?? 0)
  const [dashId, setDashId]                     = useState(device.dashId)
  const [savingDash, setSavingDash]             = useState(false)
  const [purpose, setPurpose]                   = useState<DevicePurpose>(device.purpose ?? 'dash')
  const [selectingBounds, setSelectingBounds]   = useState(false)
  const [bindings, setBindings]                 = useState<DeviceBinding[]>([])
  const [removing, setRemoving]                 = useState(false)

  const disabled = disabledMap[id] ?? false

  useEffect(() => {
    setDraft(device.name)
    setRotation(device.rotation as Rotation)
    setOffsetX(device.offsetX ?? 0)
    setOffsetY(device.offsetY ?? 0)
    setDashId(device.dashId)
    setPurpose(device.purpose ?? 'dash')
    setRenaming(false)
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

  const handlePurposeChange = async (newPurpose: DevicePurpose) => {
    setPurpose(newPurpose)
    try {
      await deviceAPI.setDevicePurpose(device.vid, device.pid, device.serial, newPurpose)
      await onSaved()
    } catch (e) {
      onError(String(e))
      setPurpose(device.purpose ?? 'dash')
    }
  }

  const handleSelectBounds = async () => {
    setSelectingBounds(true)
    try {
      await deviceAPI.selectCaptureRegion(device.vid, device.pid, device.serial)
      await onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setSelectingBounds(false)
    }
  }

  const handleIdleModeChange = async (mode: RearViewIdleMode) => {
    const next: Partial<RearViewConfig> = {
      ...(device.purposeConfig ?? {}),
      idle_mode: mode,
    }
    try {
      await deviceAPI.setDevicePurposeConfig(device.vid, device.pid, device.serial, next)
      await onSaved()
    } catch (e) {
      onError(String(e))
    }
  }

  const handleToggleDisabled = async () => {
    const next = !disabled
    setDisabledMap(prev => ({ ...prev, [id]: next }))
    try {
      await deviceAPI.setDeviceDisabled(id, next)
    } catch (e) {
      onError(String(e))
      setDisabledMap(prev => ({ ...prev, [id]: disabled }))
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
          {isScreen && (
            <Switch
              size="sm"
              checked={!disabled}
              onCheckedChange={() => handleToggleDisabled()}
              aria-label={disabled ? 'Enable screen' : 'Disable screen'}
            />
          )}
        </div>
      </div>

      {/* Screen-specific controls */}
      {isScreen && (
        <>
          {/* Purpose — screen-only devices, dev builds only */}
          {isScreenOnly && import.meta.env.DEV && (
          <div className="space-y-1.5">
            <p className="font-mono text-[9px] font-bold text-text-muted">PURPOSE</p>
            <select
              value={purpose}
              onChange={e => handlePurposeChange(e.target.value as DevicePurpose)}
              className={cn(
                'w-full border border-border bg-background px-3 py-1.5',
                'font-mono text-[10px] text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-primary',
              )}
            >
              <option value="dash">Dash</option>
              <option value="rear_view">Rear View Mirror</option>
            </select>
          </div>
          )}

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

          {/* Rear view capture region — screen-only, dev builds, rear_view purpose */}
          {isScreenOnly && import.meta.env.DEV && purpose === 'rear_view' && (() => {
            const cfg = device.purposeConfig
            const cx = cfg?.capture_x ?? 0
            const cy = cfg?.capture_y ?? 0
            const cw = cfg?.capture_w ?? 0
            const ch = cfg?.capture_h ?? 0
            const idleMode = cfg?.idle_mode ?? 'black'
            return (
              <div className="space-y-2">
                <Tabs defaultValue="capture">
                  <TabsList className="w-full font-mono text-[9px]">
                    <TabsTrigger value="capture" className="flex-1 font-mono text-[9px]">CAPTURE</TabsTrigger>
                    <TabsTrigger value="idle" className="flex-1 font-mono text-[9px]">IDLE SCREEN</TabsTrigger>
                  </TabsList>

                  <TabsContent value="capture" className="space-y-2 pt-2">
                    <Button
                      variant="active"
                      size="sm"
                      className="w-full font-mono text-[10px]"
                      onClick={handleSelectBounds}
                      disabled={selectingBounds}
                    >
                      {selectingBounds ? 'SELECTING… (Enter to confirm, Esc to cancel)' : 'SET BOUNDS'}
                    </Button>
                    {cw > 0 && ch > 0 ? (
                      <p className="font-mono text-[9px] text-text-muted">
                        X: {cx}  Y: {cy}  W: {cw}  H: {ch}
                      </p>
                    ) : (
                      <p className="font-mono text-[9px] text-text-muted">No region set — click Set Bounds</p>
                    )}
                  </TabsContent>

                  <TabsContent value="idle" className="space-y-2 pt-2">
                    <p className="font-mono text-[9px] font-bold text-text-muted">IDLE_MODE</p>
                    <select
                      value={idleMode}
                      onChange={e => handleIdleModeChange(e.target.value as RearViewIdleMode)}
                      className={cn(
                        'w-full border border-border bg-background px-3 py-1.5',
                        'font-mono text-[10px] text-foreground',
                        'focus:outline-none focus:ring-1 focus:ring-primary',
                      )}
                    >
                      <option value="black">BLACK — screen off</option>
                      <option value="clock">CLOCK — digital HH:MM:SS</option>
                    </select>
                  </TabsContent>
                </Tabs>
              </div>
            )
          })()}

          {/* Dash layout assignment — shown when purpose is dash, or in production (rear_view gated to DEV) */}
          {(!import.meta.env.DEV || purpose === 'dash') && (
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
          )}
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
