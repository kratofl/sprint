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
import { DASH_EVENTS, DEVICE_EVENTS, SCREEN_EVENTS } from '@/lib/desktopEvents'
import { onEvent } from '@/lib/wails'
import { CatalogPanel } from './CatalogPanel'
import { DeviceDetail } from './DeviceDetail'
import { DriverMissingBanner } from './DriverMissingBanner'
import { loadDeviceBindingReferenceData } from './deviceBindingReferenceData'
import { DEVICE_TYPES, type PanelView, SECTION_LABELS, deviceKey } from './shared'

const EMPTY_ACTIONS = {
  wheel: { label: 'Add wheel', icon: IconCpu },
  screen: { label: 'Add screen', icon: IconUsb },
  buttonbox: { label: 'Add button box', icon: IconKeyboard },
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

  const loadBindingReferenceData = useCallback(async () => {
    const referenceData = await loadDeviceBindingReferenceData({
      listLayouts: dashAPI.listLayouts,
      getCommandCatalog: controlsAPI.getCommandCatalog,
    })
    setLayouts(referenceData.layouts)
    setDeviceOnlyCmds(referenceData.deviceOnlyCmds)
  }, [])

  useEffect(() => {
    Promise.all([
      loadDevices(),
      deviceAPI.getCatalog().then(setCatalog).catch(() => {}),
      deviceAPI.getScreenStatus().then(setScreenStatus),
      loadBindingReferenceData(),
    ]).finally(() => setLoading(false))
  }, [loadBindingReferenceData, loadDevices])

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
      onEvent(DASH_EVENTS.layoutsUpdated, () => { void loadBindingReferenceData() }),
    ]
    return () => unsubs.forEach(unsub => unsub())
  }, [loadBindingReferenceData, loadDevices])

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
      <aside className="flex w-[286px] flex-shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] bg-[var(--panel)] px-[14px] py-[10px]">
          <h3 className="ui-label text-[11px] font-semibold text-[var(--muted)]">Device library</h3>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Registered hardware and quick-add actions.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-[10px]">
          {error ? (
            <p className="mx-[10px] mb-[10px] rounded-alert border border-[var(--red-ring)] bg-[var(--red-tint)] p-[10px] font-saira text-[12px] text-[var(--red)]">{error}</p>
          ) : null}

          {DEVICE_TYPES.map(type => {
            const group = devices.filter(device =>
              device.type === type || (type === 'screen' && (device.type === '' || device.type === undefined))
            )

            return (
              <div key={type} className="mb-3">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="ui-label text-[10px] font-bold text-[var(--muted)]">
                      {SECTION_LABELS[type]}
                    </span>
                    <Badge variant="outline" className="font-saira text-[10px]">
                      {deviceCounts[type]}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-control px-[10px] text-[11px]"
                    onClick={() => handleAddForType(type)}
                  >
                    + ADD
                  </Button>
                </div>

                <div className="space-y-[8px] px-[10px]">
                  {loading && group.length === 0 ? (
                    <Skeleton className="h-9 w-full" />
                  ) : group.length === 0 ? (
                    <p className="px-1 font-saira text-[10px] text-[var(--muted-2)]">None added yet</p>
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
                            'w-full rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px] text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]',
                            selected
                              ? 'border-[var(--orange)] text-[var(--orange)]'
                              : 'hover:border-[var(--border-2)] hover:bg-[var(--panel-2)]',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {dotColor ? (
                              <span className={cn('size-1.5 flex-shrink-0 rounded-full', dotColor)} />
                            ) : null}
                            <p className="truncate font-saira text-[12px] font-bold">{device.name}</p>
                          </div>
                          <p className="font-saira text-[10px] uppercase text-[var(--muted)]">
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

      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-deep)]">
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
              <p className="ui-label text-[11px] text-[var(--muted)]">Select or add a device</p>
              <p className="max-w-sm text-[13px] text-[var(--muted)]">
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
