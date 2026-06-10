import { useEffect, useMemo, useState } from 'react'
import { IconDeviceMobile } from '@tabler/icons-react'
import { Badge, Button, Input, Switch, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@sprint/ui'
import {
  type DeviceBinding,
  type DevicePurpose,
  type LayoutMeta,
  type RearViewConfig,
  type RearViewIdleMode,
  type SavedDevice,
  deviceAPI,
  deviceBindingsAPI,
  deviceHasScreen,
  deviceID,
} from '@/lib/dash'
import type { CommandMeta } from '@/lib/controls'
import { DeviceCommandRow } from './DeviceCommandRow'
import { resolveBindingDashContext } from './bindingDashContext'
import { buildDeviceBindingsViewModel } from './deviceBindingsViewModel'

const ORIENTATION_OPTIONS = [
  { degrees: 0 as const, label: 'Portrait', iconRotation: 'rotate-0' },
  { degrees: 90 as const, label: 'Landscape', iconRotation: 'rotate-90' },
  { degrees: 180 as const, label: 'Portrait Rev.', iconRotation: 'rotate-180' },
  { degrees: 270 as const, label: 'Landscape Rev.', iconRotation: '-rotate-90' },
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
  onError: (message: string) => void
}

export function DeviceDetail({
  device,
  screenStatus,
  layouts,
  deviceOnlyCmds,
  disabledMap,
  setDisabledMap,
  onSaved,
  onRemove,
  onError,
}: DeviceDetailProps) {
  const isScreen = deviceHasScreen(device.type)
  const isScreenOnly = device.type === 'screen'
  const id = deviceID(device.vid, device.pid, device.serial)

  const [draft, setDraft] = useState(device.name)
  const [renaming, setRenaming] = useState(false)
  const [rotation, setRotation] = useState<Rotation>(device.rotation as Rotation)
  const [offsetX, setOffsetX] = useState(device.offsetX ?? 0)
  const [offsetY, setOffsetY] = useState(device.offsetY ?? 0)
  const [margin, setMargin] = useState(device.margin ?? 0)
  const [dashId, setDashId] = useState(device.dashId)
  const [selectedBindingDashId, setSelectedBindingDashId] = useState(device.dashId || layouts[0]?.id || '')
  const [savingDash, setSavingDash] = useState(false)
  const [purpose, setPurpose] = useState<DevicePurpose>(device.purpose ?? 'dash')
  const [selectingBounds, setSelectingBounds] = useState(false)
  const [bindings, setBindings] = useState<DeviceBinding[]>([])
  const [removing, setRemoving] = useState(false)

  const disabled = disabledMap[id] ?? false

  useEffect(() => {
    setDraft(device.name)
    setRotation(device.rotation as Rotation)
    setOffsetX(device.offsetX ?? 0)
    setOffsetY(device.offsetY ?? 0)
    setMargin(device.margin ?? 0)
    setDashId(device.dashId)
    setSelectedBindingDashId(device.dashId || layouts[0]?.id || '')
    setPurpose(device.purpose ?? 'dash')
    setRenaming(false)
    deviceBindingsAPI
      .getDeviceBindings(device.vid, device.pid, device.serial)
      .then(setBindings)
      .catch(() => setBindings([]))
  }, [device, id, layouts])

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
    } catch (error) {
      onError(String(error))
    } finally {
      setRenaming(false)
    }
  }

  const handleRotation = async (nextRotation: Rotation) => {
    setRotation(nextRotation)
    try {
      await deviceAPI.setScreenRotation(device.vid, device.pid, device.serial, nextRotation)
    } catch (error) {
      onError(String(error))
      setRotation(device.rotation as Rotation)
    }
  }

  const handleOffsetChange = async (field: 'x' | 'y' | 'margin', value: number) => {
    const nextX = field === 'x' ? value : offsetX
    const nextY = field === 'y' ? value : offsetY
    const nextMargin = field === 'margin' ? value : margin
    if (field === 'x') setOffsetX(nextX)
    else if (field === 'y') setOffsetY(nextY)
    else setMargin(nextMargin)
    try {
      await deviceAPI.setScreenOffset(device.vid, device.pid, device.serial, nextX, nextY, nextMargin)
    } catch (error) {
      onError(String(error))
      if (field === 'x') setOffsetX(device.offsetX ?? 0)
      else if (field === 'y') setOffsetY(device.offsetY ?? 0)
      else setMargin(device.margin ?? 0)
    }
  }

  const handleDashChange = async (newDashId: string) => {
    setDashId(newDashId)
    setSavingDash(true)
    try {
      await deviceAPI.setDashLayout(device.vid, device.pid, device.serial, newDashId)
      await onSaved()
    } catch (error) {
      onError(String(error))
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
    } catch (error) {
      onError(String(error))
      setPurpose(device.purpose ?? 'dash')
    }
  }

  const handleSelectBounds = async () => {
    setSelectingBounds(true)
    try {
      await deviceAPI.selectCaptureRegion(device.vid, device.pid, device.serial)
      await onSaved()
    } catch (error) {
      onError(String(error))
    } finally {
      setSelectingBounds(false)
    }
  }

  const handleIdleModeChange = async (mode: RearViewIdleMode) => {
    const next: Partial<RearViewConfig> = {
      ...(device.purposeConfig ?? {}),
      idleMode: mode,
    }
    try {
      await deviceAPI.setDevicePurposeConfig(device.vid, device.pid, device.serial, next)
      await onSaved()
    } catch (error) {
      onError(String(error))
    }
  }

  const handleToggleDisabled = async () => {
    const next = !disabled
    setDisabledMap(previous => ({ ...previous, [id]: next }))
    try {
      await deviceAPI.setDeviceDisabled(id, next)
    } catch (error) {
      onError(String(error))
      setDisabledMap(previous => ({ ...previous, [id]: disabled }))
    }
  }

  const setDeviceButton = async (commandId: string, button: number) => {
    const updated = bindings.filter(binding => binding.command !== commandId)
    if (button > 0) updated.push({ command: commandId, button })
    setBindings(updated)
    try {
      await deviceBindingsAPI.saveDeviceBindings(device.vid, device.pid, device.serial, updated)
    } catch (error) {
      onError(String(error))
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove()
    } catch (error) {
      onError(String(error))
      setRemoving(false)
    }
  }

  const bindingDashContext = resolveBindingDashContext({
    device: { ...device, dashId },
    layouts,
    selectedDashId: selectedBindingDashId,
  })
  const activeDashId = bindingDashContext.activeDashId
  const typeLabel =
    device.type === 'wheel' ? 'Wheel' :
      device.type === 'buttonbox' ? 'Button box' :
        'Screen'
  const bindingView = useMemo(
    () => buildDeviceBindingsViewModel({
      commands: deviceOnlyCmds,
      bindings,
      activeDashId,
    }),
    [activeDashId, bindings, deviceOnlyCmds],
  )
  const nativeSelectClassName = cn(
    'h-8 w-full rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)]',
    'focus:border-[var(--orange)] focus:outline-none disabled:opacity-50',
  )

  return (
    <div className="space-y-[14px] p-[14px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1.5">
          {renaming ? (
            <Input
              autoFocus
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') {
                  setDraft(device.name)
                  setRenaming(false)
                }
              }}
              onBlur={commitRename}
              className="h-8 w-72 rounded-control font-saira text-[12px] font-bold"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]"
              aria-label="Rename device"
            >
              <span className="font-saira text-[13px] font-bold transition-colors group-hover:text-[var(--orange)]">
                {device.name}
              </span>
              <PencilIcon className="flex-shrink-0 text-[var(--muted-2)] transition-colors group-hover:text-[var(--orange)]" />
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="ui-label">{typeLabel}</Badge>
            {isScreen && device.driver ? (
              <span className="font-saira text-[10px] uppercase text-[var(--muted)]">{device.driver}</span>
            ) : null}
            {isScreen && device.width > 0 ? (
              <span className="font-saira text-[10px] text-[var(--muted)]">{device.width}×{device.height}</span>
            ) : null}
            {device.serial ? (
              <span className="font-saira text-[10px] text-[var(--muted)]">S/N: {device.serial}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isScreen && screenStatus === 'connected' ? (
            <Badge variant="connected" className="ui-label">Connected</Badge>
          ) : null}
          {isScreen ? (
            <Switch
              size="sm"
              checked={!disabled}
              onCheckedChange={() => handleToggleDisabled()}
              aria-label={disabled ? 'Enable screen' : 'Disable screen'}
            />
          ) : null}
        </div>
      </div>

      <Tabs key={id} defaultValue={isScreen ? 'settings' : 'bindings'} className="space-y-[14px]">
        <TabsList
          variant="top"
          className="font-saira text-[11px]"
        >
          <TabsTrigger value="settings" className="px-3">
            SETTINGS
          </TabsTrigger>
          <TabsTrigger value="bindings" className="px-3">
            BINDINGS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-[14px] pt-1">
          {isScreen ? (
            <>
              {isScreenOnly && import.meta.env.DEV ? (
                <div className="space-y-1.5">
                  <p className="ui-label text-[11px] font-semibold text-[var(--muted)]">Purpose</p>
                  <select
                    value={purpose}
                    onChange={event => handlePurposeChange(event.target.value as DevicePurpose)}
                    className={nativeSelectClassName}
                  >
                    <option value="dash">Dash</option>
                    <option value="rear_view">Rear View Mirror</option>
                  </select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="ui-label text-[11px] font-semibold text-[var(--muted)]">Orientation</p>
                <div className="flex flex-wrap gap-1.5">
                  {ORIENTATION_OPTIONS.map(({ degrees, label, iconRotation }) => (
                    <button
                      key={degrees}
                      type="button"
                      onClick={() => handleRotation(degrees)}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-control border px-[10px] font-saira text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]',
                        rotation === degrees
                          ? 'border-[var(--orange-ring)] bg-[var(--orange-tint)] text-[var(--orange)]'
                          : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]',
                      )}
                    >
                      <IconDeviceMobile size={12} className={iconRotation} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="ui-label text-[11px] font-bold text-[var(--muted)]">Screen position (px)</p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <span className="ui-label text-[11px] text-[var(--muted)]">Left</span>
                    <Input
                      type="number"
                      min={0}
                      max={512}
                      value={offsetX}
                      onChange={event => handleOffsetChange('x', Math.max(0, parseInt(event.target.value, 10) || 0))}
                      data-readout="true"
                      className="h-8 w-16 rounded-control text-right font-saira text-[12px]"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="ui-label text-[11px] text-[var(--muted)]">Top</span>
                    <Input
                      type="number"
                      min={0}
                      max={512}
                      value={offsetY}
                      onChange={event => handleOffsetChange('y', Math.max(0, parseInt(event.target.value, 10) || 0))}
                      data-readout="true"
                      className="h-8 w-16 rounded-control text-right font-saira text-[12px]"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="ui-label text-[11px] text-[var(--muted)]">Margin</span>
                    <Input
                      type="number"
                      min={0}
                      max={512}
                      value={margin}
                      onChange={event => handleOffsetChange('margin', Math.max(0, parseInt(event.target.value, 10) || 0))}
                      data-readout="true"
                      className="h-8 w-16 rounded-control text-right font-saira text-[12px]"
                    />
                  </label>
                </div>
              </div>

              {isScreenOnly && import.meta.env.DEV && purpose === 'rear_view' ? (() => {
                const config = device.purposeConfig
                const captureX = config?.captureX ?? 0
                const captureY = config?.captureY ?? 0
                const captureW = config?.captureW ?? 0
                const captureH = config?.captureH ?? 0
                const idleMode = config?.idleMode ?? 'black'
                return (
                  <div className="space-y-2">
                    <Tabs defaultValue="capture">
                      <TabsList variant="compact" className="w-full font-saira text-[11px]">
                        <TabsTrigger value="capture" className="flex-1">Capture</TabsTrigger>
                        <TabsTrigger value="idle" className="flex-1">Idle screen</TabsTrigger>
                      </TabsList>

                      <TabsContent value="capture" className="space-y-2 pt-2">
                        <Button
                          variant="active"
                          size="sm"
                          className="h-8 w-full rounded-control font-saira text-[12px]"
                          onClick={handleSelectBounds}
                          disabled={selectingBounds}
                        >
                          {selectingBounds ? 'SELECTING… (Enter to confirm, Esc to cancel)' : 'SET BOUNDS'}
                        </Button>
                        {captureW > 0 && captureH > 0 ? (
                          <p className="font-saira text-[10px] text-[var(--muted)]">
                            X: {captureX}  Y: {captureY}  W: {captureW}  H: {captureH}
                          </p>
                        ) : (
                          <p className="font-saira text-[10px] text-[var(--muted)]">
                            No region set — click Set Bounds
                          </p>
                        )}
                      </TabsContent>

                      <TabsContent value="idle" className="space-y-2 pt-2">
                        <p className="ui-label text-[11px] font-semibold text-[var(--muted)]">Idle mode</p>
                        <select
                          value={idleMode}
                          onChange={event => handleIdleModeChange(event.target.value as RearViewIdleMode)}
                          className={nativeSelectClassName}
                        >
                          <option value="black">BLACK — screen off</option>
                          <option value="clock">CLOCK — digital HH:MM:SS</option>
                        </select>
                      </TabsContent>
                    </Tabs>
                  </div>
                )
              })() : null}

              {!import.meta.env.DEV || purpose === 'dash' ? (
                <div className="space-y-1.5">
                  <p className="ui-label text-[11px] font-bold text-[var(--muted)]">
                    DASH_LAYOUT{savingDash ? ' SAVING…' : ''}
                  </p>
                  {layouts.length === 0 ? (
                    <p className="font-saira text-[10px] text-[var(--muted)]">
                      No layouts saved yet. Create one in Dash Studio.
                    </p>
                  ) : (
                    <select
                      value={activeDashId}
                      onChange={event => handleDashChange(event.target.value)}
                      disabled={savingDash}
                      className={nativeSelectClassName}
                    >
                      {layouts.map(layout => (
                        <option key={layout.id} value={layout.id}>{layout.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="bindings" className="space-y-[10px] pt-1">
          {bindingDashContext.showDashPicker && layouts.length > 0 ? (
            <div className="space-y-1.5">
              <p className="ui-label text-[11px] text-[var(--muted)]">Binding dash layout</p>
              <select
                value={activeDashId}
                onChange={event => setSelectedBindingDashId(event.target.value)}
                className={nativeSelectClassName}
              >
                {layouts.map(layout => (
                  <option key={layout.id} value={layout.id}>{layout.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ui-label text-[11px] text-[var(--muted)]">Active dash only</p>
            {bindingView.hiddenBindingCount > 0 ? (
              <Badge variant="outline" className="font-saira text-[10px]">
                {bindingView.hiddenBindingCount}_HIDDEN
              </Badge>
            ) : null}
          </div>

          {bindingView.cards.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {bindingView.cards.map(card => (
                <div key={card.key} className="space-y-[10px] rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
                  <div className="min-w-0">
                    <p className="font-saira text-[12px] font-bold uppercase text-[var(--text)]">{card.title}</p>
                    {card.subtitle ? (
                      <p className="truncate font-saira text-[10px] text-[var(--muted)]">{card.subtitle}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    {card.rows.map(row => (
                      <DeviceCommandRow
                        key={row.command.id}
                        cmd={row.command}
                        button={row.button}
                        bound={row.button > 0}
                        onButtonChange={nextButton => setDeviceButton(row.command.id, nextButton)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
              <p className="ui-label text-[11px] text-[var(--muted)]">No active dash bindings</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="border-t border-[var(--border)] pt-[14px]">
        <Button
          variant="destructive"
          size="sm"
          className="ui-label h-8 rounded-control px-[10px] text-[11px]"
          disabled={removing}
          onClick={handleRemove}
        >
          {removing ? 'Removing…' : 'Remove device'}
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
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.5 2.5 L8.5 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
