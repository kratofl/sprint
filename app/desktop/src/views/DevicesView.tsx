import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Cpu, LayoutGrid, List, Plus } from 'lucide-react'
import type { SprintCommand, SprintState } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import {
  buildDevicesViewMode,
  deviceHasScreen,
  deviceImageKey,
  deviceKind,
  deviceSummary,
  findScreen,
  formatFramesPerSecond,
  foundEntries,
  matchesDevicesFilter,
  parseCatalog,
  parseDashOptions,
  parseDevices,
  parseDevicesViewMode,
  parseScreens,
  toRecordArray,
} from './DevicesDomain'
import type { CatalogEntry, DashOption, Device, DeviceKind, DevicesFilter, DevicesViewMode, ScreenOutput } from './DevicesDomain'
import { DeviceDetail } from './DeviceDetail'
import { DeviceImage } from './DeviceImage'
import { DeviceStatusLabel } from './DevicesStatus'
import { DevicesAddDialog } from './DevicesAddDialog'
import './DevicesView.css'

type LoadedState = {
  devices: Device[]
  catalog: CatalogEntry[]
  /** Plugged in and not added yet, once per device. */
  found: CatalogEntry[]
  dashOptions: DashOption[]
  screens: ScreenOutput[]
  viewMode: DevicesViewMode
}

const toLoadedState = (sprint: SprintState): LoadedState => {
  const catalog = parseCatalog(toRecordArray(sprint.catalog))
  return {
    devices: parseDevices(sprint.devices),
    catalog,
    found: foundEntries(sprint.foundDevices, catalog),
    dashOptions: parseDashOptions(sprint.dashLayouts),
    screens: parseScreens(sprint.screens),
    viewMode: parseDevicesViewMode(sprint.settings),
  }
}

const KIND_GROUPS: ReadonlyArray<{ kind: DeviceKind; title: string }> = [
  { kind: 'wheel', title: 'Wheels' },
  { kind: 'screen', title: 'Screens' },
]

/**
 * Devices: an overview of every wheel and screen as tiles or a list — pictures and status
 * only, nothing to edit — filtered by kind or state. Opening one shows its page
 * (DeviceDetail.tsx), one level down: the toolbar's back and "All devices" return here.
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
  const [filter, setFilter] = useState<DevicesFilter>('all')
  // The saved layout arrives with the next state poll; this shows a click at once meanwhile.
  const [pendingViewMode, setPendingViewMode] = useState<DevicesViewMode | null>(null)
  const state = runtime.kind === 'ready' ? toLoadedState(runtime.sprint) : null
  const selected = state?.devices.find((device) => device.id === selectedId) ?? null

  usePageUp(selected ? 'All devices' : null, () => setSelectedId(null))

  // `focusDeviceId` only ever names a live device for one render (the shell clears it right
  // after handing it off — see App.tsx), so this opens the device page once; a request for a
  // device that no longer exists is ignored.
  useEffect(() => {
    if (focusDeviceId && state?.devices.some((device) => device.id === focusDeviceId)) setSelectedId(focusDeviceId)
  }, [focusDeviceId, state])

  // Set right before a successful add; the effect below watches for a device id it does not
  // recognize and opens it once the poll loop delivers the updated list (the command response
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
        <div className="devices-grid">
          <div className="card skeleton devices-tile-skeleton" />
          <div className="card skeleton devices-tile-skeleton" />
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <DeviceDetail
        key={selected.id}
        device={selected}
        image={deviceImageKey(selected, state.catalog)}
        dashOptions={state.dashOptions}
        screen={findScreen(state.screens, selected.id)}
        send={send}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  const viewMode = pendingViewMode ?? state.viewMode
  const chooseViewMode = (mode: DevicesViewMode) => {
    setPendingViewMode(mode)
    void send(buildDevicesViewMode(mode)).catch(() => setPendingViewMode(null))
  }

  const addDevice = async (command: SprintCommand) => {
    const idsBefore = new Set(state.devices.map((device) => device.id))
    await send(command)
    pendingAddIds.current = idsBefore
    setShowCatalog(false)
  }

  const visible = state.devices.filter((device) => matchesDevicesFilter(filter, device, findScreen(state.screens, device.id)))
  const groups = KIND_GROUPS.map((group) => ({ ...group, devices: visible.filter((device) => deviceKind(device) === group.kind) })).filter(
    (group) => group.devices.length > 0,
  )

  return (
    <div className="devices">
      <PageHeader title="Devices">
        <button type="button" className="button primary" onClick={() => setShowCatalog(true)}>
          <Plus /> Add device
        </button>
        {state.devices.length > 0 && (
          <>
            <CommandDivider />
            <div className="segmented devices-layout" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" className="segmented-item" aria-checked={viewMode === 'gallery'} aria-label="Tiles" title="Tiles" onClick={() => chooseViewMode('gallery')}>
                <LayoutGrid size={14} />
              </button>
              <button type="button" role="radio" className="segmented-item" aria-checked={viewMode === 'list'} aria-label="List" title="List" onClick={() => chooseViewMode('list')}>
                <List size={14} />
              </button>
            </div>
          </>
        )}
      </PageHeader>

      {state.devices.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Cpu size={28} strokeWidth={1.5} />
            <h2>No devices yet</h2>
            <p>Add your wheel or screen to put a dash on it.</p>
          </div>
        </div>
      ) : (
        <>
          <DevicesFilterBar devices={state.devices} screens={state.screens} filter={filter} onFilter={setFilter} />
          {groups.length === 0 && <p className="muted devices-none">No devices match this filter.</p>}
          {groups.map((group) => (
            <section key={group.kind} className="devices-group" aria-label={group.title}>
              {groups.length > 1 && (
                <h2 className="devices-group-title">
                  {group.title} <span className="muted tabular">{group.devices.length}</span>
                </h2>
              )}
              {viewMode === 'gallery' ? (
                <div className="devices-grid">
                  {group.devices.map((device) => (
                    <DeviceTile
                      key={device.id}
                      device={device}
                      screen={findScreen(state.screens, device.id)}
                      catalog={state.catalog}
                      onOpen={() => setSelectedId(device.id)}
                    />
                  ))}
                </div>
              ) : (
                <DeviceRows devices={group.devices} screens={state.screens} catalog={state.catalog} onOpen={setSelectedId} />
              )}
            </section>
          ))}
        </>
      )}

      {showCatalog && (
        <DevicesAddDialog
          catalog={state.catalog}
          found={state.found}
          onClose={() => setShowCatalog(false)}
          onAdd={(entry) => {
            // Catalog entries are always valid ids from live state; a rejection here has no
            // dedicated error UI, so the dialog just stays open with nothing added.
            void addDevice({ type: 'devices.add', catalogId: entry.id }).catch(() => undefined)
          }}
          onAddCustom={addDevice}
        />
      )}
    </div>
  )
}

const FILTERS: ReadonlyArray<{ id: DevicesFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'wheel', label: 'Wheels' },
  { id: 'screen', label: 'Screens' },
  { id: 'connected', label: 'Connected' },
  { id: 'attention', label: 'Needs attention' },
]

/**
 * One filter at a time, each with its count. A filter that would show nothing is left out
 * (unless it is the current one), and so are Wheels / Screens while every device is one kind.
 */
function DevicesFilterBar({
  devices,
  screens,
  filter,
  onFilter,
}: {
  devices: Device[]
  screens: ScreenOutput[]
  filter: DevicesFilter
  onFilter: (filter: DevicesFilter) => void
}) {
  if (devices.length < 2) return null
  const mixedKinds = new Set(devices.map(deviceKind)).size > 1
  const options = FILTERS.map((option) => ({
    ...option,
    count: devices.filter((device) => matchesDevicesFilter(option.id, device, findScreen(screens, device.id))).length,
  })).filter(
    (option) =>
      option.id === 'all' || option.id === filter || (option.count > 0 && (mixedKinds || (option.id !== 'wheel' && option.id !== 'screen'))),
  )

  return (
    <div className="segmented devices-filter" role="radiogroup" aria-label="Show">
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" className="segmented-item" aria-checked={filter === option.id} onClick={() => onFilter(option.id)}>
          {option.label} <span className="devices-filter-count tabular">{option.count}</span>
        </button>
      ))}
    </div>
  )
}

/** Dimmed when it should be showing something and is not: turned off, or a screen that is not connected. */
const isDimmed = (device: Device, screen: ScreenOutput | undefined): boolean =>
  device.disabled || (deviceHasScreen(device) && screen?.hardware?.status.isConnected !== true)

function DeviceStatus({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  if (deviceHasScreen(device)) return <DeviceStatusLabel device={device} screen={screen} />
  return device.disabled ? <span className="muted">Off</span> : null
}

/** The quiet line under a name: the hardware, plus the frame rate while it is running. */
function DeviceLine({ device, screen }: { device: Device; screen: ScreenOutput | undefined }) {
  const performance = screen?.hardware?.performance
  const running = !device.disabled && screen?.hardware?.status.isConnected === true && performance?.hasSamples === true
  return (
    <span className="muted devices-line">
      {deviceSummary(device)}
      {running && performance && <span className="tabular"> · {formatFramesPerSecond(performance)}</span>}
    </span>
  )
}

function DeviceTile({ device, screen, catalog, onOpen }: { device: Device; screen: ScreenOutput | undefined; catalog: CatalogEntry[]; onOpen: () => void }) {
  return (
    <button type="button" className="card devices-tile" onClick={onOpen}>
      <DeviceImage image={deviceImageKey(device, catalog)} dim={isDimmed(device, screen)} className="devices-tile-image" />
      <span className="devices-tile-text">
        <span className="devices-tile-head">
          <span className="devices-name">{device.name}</span>
          <DeviceStatus device={device} screen={screen} />
        </span>
        <DeviceLine device={device} screen={screen} />
      </span>
    </button>
  )
}

function DeviceRows({
  devices,
  screens,
  catalog,
  onOpen,
}: {
  devices: Device[]
  screens: ScreenOutput[]
  catalog: CatalogEntry[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="card list-card">
      <div className="list-header devices-columns" aria-hidden="true">
        <span />
        <span>Device</span>
        <span>Screen</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="list-rows">
        {devices.map((device) => {
          const screen = findScreen(screens, device.id)
          return (
            <li key={device.id}>
              <button type="button" className="list-row devices-columns devices-row" onClick={() => onOpen(device.id)}>
                <DeviceImage image={deviceImageKey(device, catalog)} dim={isDimmed(device, screen)} className="devices-thumb" />
                <span className="devices-name">{device.name}</span>
                <DeviceLine device={device} screen={screen} />
                <DeviceStatus device={device} screen={screen} />
                <ChevronRight size={14} className="devices-chevron" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
