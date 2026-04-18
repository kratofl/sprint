import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconCpu, IconKeyboard, IconUsb } from '@tabler/icons-react'
import { Badge, Button, Skeleton, cn } from '@sprint/ui'
import {
  type CatalogEntry,
  type DetectedScreen,
  type LayoutMeta,
  type SavedDevice,
  deviceAPI,
  deviceHasScreen,
  deviceID,
  dashAPI,
} from '@/lib/dash'
import { type CommandMeta, controlsAPI } from '@/lib/controls'
import { DEVICE_EVENTS, SCREEN_EVENTS } from '@/lib/desktopEvents'
import { onEvent } from '@/lib/wails'
import { CatalogPanel } from './CatalogPanel'
import { DeviceDetail } from './DeviceDetail'
import { DriverMissingBanner } from './DriverMissingBanner'
import { DEVICE_TYPES, type PanelView, SECTION_LABELS, deviceKey } from './shared'

const EMPTY_ACTIONS = {
  wheel: { label: 'ADD_WHEEL', icon: IconCpu },
  screen: { label: 'ADD_SCREEN', icon: IconUsb },
  buttonbox: { label: 'ADD_BUTTON_BOX', icon: IconKeyboard },
} as const

export function DeviceSection() {
  const [devices, setDevices] = useState<SavedDevice[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [layouts, setLayouts] = useState<LayoutMeta[]>([])
  const [deviceOnlyCmds, setDeviceOnlyCmds] = useState<CommandMeta[]>([])
  const [screenStatus, setScreenStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
  const [disabledMap, setDisabledMap] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelView>({ tag: 'empty' })
  const [driverMissingType, setDriverMissingType] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    try {
      const savedDevices = await deviceAPI.getSavedDevices()
      setDevices(savedDevices)
      const screens = savedDevices.filter(device => deviceHasScreen(device.type))
      const entries = await Promise.all(
        screens.map(async device => {
          const id = deviceID(device.vid, device.pid, device.serial)
          const value = await deviceAPI.getDeviceDisabled(id).catch(() => false)
          return [id, value] as const
        })
      )
      setDisabledMap(Object.fromEntries(entries))
      return savedDevices
    } catch (error) {
      setError(String(error))
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
        .then(commands => setDeviceOnlyCmds(commands.filter(command => command.deviceOnly)))
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [loadDevices])

  useEffect(() => {
    const unsubs = [
      onEvent(SCREEN_EVENTS.connected, () => {
        setScreenStatus('connected')
        setDriverMissingType(null)
      }),
      onEvent(SCREEN_EVENTS.disconnected, () => setScreenStatus('disconnected')),
      onEvent(SCREEN_EVENTS.driverMissing, (data) => {
        setDriverMissingType(data?.driver ?? 'unknown')
      }),
      onEvent(DEVICE_EVENTS.updated, () => { void loadDevices() }),
    ]
    return () => unsubs.forEach(unsub => unsub())
  }, [loadDevices])

  const handleAddForType = (type: typeof DEVICE_TYPES[number]) => {
    setPanel({ tag: 'catalog', filterType: type })
  }

  const handleDeviceClick = (device: SavedDevice) => {
    setPanel({ tag: 'detail', key: deviceKey(device) })
  }

  const autoSelectAfterAdd = useCallback(async (catalogID: string, previousDevices: SavedDevice[]) => {
    const updatedDevices = await loadDevices()
    const entry = catalog.find(item => item.id === catalogID)
    const previousKeys = new Set(previousDevices.map(deviceKey))
    const newDevice = entry
      ? updatedDevices.find(device =>
        entry.vid === 0 && entry.pid === 0
          ? !previousKeys.has(deviceKey(device))
          : device.vid === entry.vid && device.pid === entry.pid)
      : undefined
    const target = newDevice ?? updatedDevices[updatedDevices.length - 1]
    if (target) setPanel({ tag: 'detail', key: deviceKey(target) })
    else setPanel({ tag: 'empty' })
  }, [catalog, loadDevices])

  const handleCatalogAdd = async (catalogID: string) => {
    await deviceAPI.addDevice(catalogID)
    await autoSelectAfterAdd(catalogID, devices)
  }

  const handleCatalogAddScanned = async (catalogID: string, screen: DetectedScreen) => {
    await deviceAPI.addScanned(catalogID, screen.vid, screen.pid, screen.serial)
    await autoSelectAfterAdd(catalogID, devices)
  }

  const handleRemove = async (device: SavedDevice) => {
    await deviceAPI.removeDevice(device.vid, device.pid, device.serial)
    await loadDevices()
    setPanel({ tag: 'empty' })
  }

  const selectedDevice =
    panel.tag === 'detail' ? devices.find(device => deviceKey(device) === panel.key) ?? null : null

  const catalogForType =
    panel.tag === 'catalog' ? catalog.filter(entry => entry.type === panel.filterType) : []

  const deviceCounts = useMemo(() => Object.fromEntries(
    DEVICE_TYPES.map(type => [
      type,
      devices.filter(device =>
        device.type === type || (type === 'screen' && (device.type === '' || device.type === undefined))
      ).length,
    ])
  ) as Record<typeof DEVICE_TYPES[number], number>, [devices])

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-72 flex-shrink-0 flex-col overflow-hidden border-r border-border bg-background/70">
        <div className="border-b border-border px-4 py-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">DEVICE_LIBRARY</h3>
          <p className="mt-1 font-mono text-[8px] text-text-muted">
            Registered hardware and quick-add actions.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {error ? (
            <p className="mx-3 mb-2 font-mono text-[9px] text-destructive">{error}</p>
          ) : null}

          {DEVICE_TYPES.map(type => {
            const group = devices.filter(device =>
              device.type === type || (type === 'screen' && (device.type === '' || device.type === undefined))
            )

            return (
              <div key={type} className="mb-3">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="terminal-header text-[9px] font-bold text-text-muted">
                      {SECTION_LABELS[type]}
                    </span>
                    <Badge variant="outline" className="font-mono text-[8px]">
                      {deviceCounts[type]}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 font-mono text-[9px]"
                    onClick={() => handleAddForType(type)}
                  >
                    + ADD
                  </Button>
                </div>

                <div className="space-y-1 px-3">
                  {loading && group.length === 0 ? (
                    <Skeleton className="h-9 w-full" />
                  ) : group.length === 0 ? (
                    <p className="px-1 font-mono text-[8px] text-text-disabled">None added yet</p>
                  ) : (
                    group.map(device => {
                      const key = deviceKey(device)
                      const selected = panel.tag === 'detail' && panel.key === key
                      const isScreen = deviceHasScreen(device.type)
                      const deviceId = deviceID(device.vid, device.pid, device.serial)
                      const dotColor = !isScreen
                        ? null
                        : screenStatus === 'connected' && !disabledMap[deviceId]
                          ? 'bg-success'
                          : screenStatus === 'connected'
                            ? 'bg-warning'
                            : 'bg-text-disabled'

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleDeviceClick(device)}
                          className={cn(
                            'w-full border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
                            selected
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-border bg-card hover:border-border-strong hover:bg-card/80',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {dotColor ? (
                              <span className={cn('size-1.5 flex-shrink-0 rounded-full', dotColor)} />
                            ) : null}
                            <p className="truncate font-mono text-[10px] font-bold">{device.name}</p>
                          </div>
                          <p className="font-mono text-[8px] uppercase text-text-muted">
                            {device.driver || device.type || 'unknown'}
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
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {driverMissingType ? (
          <DriverMissingBanner
            driverType={driverMissingType}
            onDismiss={() => setDriverMissingType(null)}
          />
        ) : null}

        {panel.tag === 'catalog' ? (
          <CatalogPanel
            entries={catalogForType}
            deviceType={panel.filterType}
            onAdd={handleCatalogAdd}
            onAddScanned={handleCatalogAddScanned}
            onClose={() => setPanel({ tag: 'empty' })}
            onError={setError}
          />
        ) : null}

        {panel.tag === 'detail' && selectedDevice ? (
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
        ) : null}

        {panel.tag === 'empty' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="space-y-2">
              <p className="terminal-header text-[10px] text-text-muted">SELECT_OR_ADD</p>
              <p className="font-mono text-[9px] text-text-muted">
                Pick a registered device from the left, or start a new registration flow.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {DEVICE_TYPES.map(type => {
                const Icon = EMPTY_ACTIONS[type].icon
                return (
                  <Button
                    key={type}
                    variant={type === 'screen' ? 'primary' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => handleAddForType(type)}
                  >
                    <Icon size={12} />
                    {EMPTY_ACTIONS[type].label}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
