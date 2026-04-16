import { useEffect, useState } from 'react'
import { IconDeviceMobile } from '@tabler/icons-react'
import { Badge, Button, Switch, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@sprint/ui'
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
  const [dashId, setDashId] = useState(device.dashId)
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
    setDashId(device.dashId)
    setPurpose(device.purpose ?? 'dash')
    setRenaming(false)
    deviceBindingsAPI
      .getDeviceBindings(device.vid, device.pid, device.serial)
      .then(setBindings)
      .catch(() => setBindings([]))
  }, [device, id])

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

  const handleOffsetChange = async (axis: 'x' | 'y', value: number) => {
    const nextX = axis === 'x' ? value : offsetX
    const nextY = axis === 'y' ? value : offsetY
    if (axis === 'x') setOffsetX(nextX)
    else setOffsetY(nextY)
    try {
      await deviceAPI.setScreenOffset(device.vid, device.pid, device.serial, nextX, nextY)
    } catch (error) {
      onError(String(error))
      if (axis === 'x') setOffsetX(device.offsetX ?? 0)
      else setOffsetY(device.offsetY ?? 0)
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
      idle_mode: mode,
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

  const getDeviceButton = (commandId: string) =>
    bindings.find(binding => binding.command === commandId)?.button ?? 0

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

  const activeDashId = dashId || layouts[0]?.id || ''
  const typeLabel =
    device.type === 'wheel' ? 'WHEEL' :
      device.type === 'buttonbox' ? 'BUTTON_BOX' :
        'SCREEN'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1.5">
          {renaming ? (
            <input
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
              className="bg-background px-1 font-mono text-sm font-bold outline outline-1 outline-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80"
              aria-label="Rename device"
            >
              <span className="font-mono text-sm font-bold transition-colors group-hover:text-primary">
                {device.name}
              </span>
              <PencilIcon className="flex-shrink-0 text-text-disabled transition-colors group-hover:text-primary" />
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="terminal-header">{typeLabel}</Badge>
            {isScreen && device.driver ? (
              <span className="font-mono text-[9px] uppercase text-text-muted">{device.driver}</span>
            ) : null}
            {isScreen && device.width > 0 ? (
              <span className="font-mono text-[9px] text-text-muted">{device.width}×{device.height}</span>
            ) : null}
            {device.serial ? (
              <span className="font-mono text-[9px] text-text-muted">S/N: {device.serial}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isScreen && screenStatus === 'connected' ? (
            <Badge variant="connected" className="terminal-header">CONNECTED</Badge>
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

      {isScreen ? (
        <>
          {isScreenOnly && import.meta.env.DEV ? (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] font-bold text-text-muted">PURPOSE</p>
              <select
                value={purpose}
                onChange={event => handlePurposeChange(event.target.value as DevicePurpose)}
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
          ) : null}

          <div className="space-y-1.5">
            <p className="font-mono text-[9px] font-bold text-text-muted">ORIENTATION</p>
            <div className="flex flex-wrap gap-1.5">
              {ORIENTATION_OPTIONS.map(({ degrees, label, iconRotation }) => (
                <button
                  key={degrees}
                  type="button"
                  onClick={() => handleRotation(degrees)}
                  className={cn(
                    'flex items-center gap-1.5 border px-3 py-1 font-mono text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
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
                  onChange={event => handleOffsetChange('x', Math.max(0, parseInt(event.target.value, 10) || 0))}
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
                  onChange={event => handleOffsetChange('y', Math.max(0, parseInt(event.target.value, 10) || 0))}
                  className="w-16 border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
          </div>

          {isScreenOnly && import.meta.env.DEV && purpose === 'rear_view' ? (() => {
            const config = device.purposeConfig
            const captureX = config?.capture_x ?? 0
            const captureY = config?.capture_y ?? 0
            const captureW = config?.capture_w ?? 0
            const captureH = config?.capture_h ?? 0
            const idleMode = config?.idle_mode ?? 'black'
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
                    {captureW > 0 && captureH > 0 ? (
                      <p className="font-mono text-[9px] text-text-muted">
                        X: {captureX}  Y: {captureY}  W: {captureW}  H: {captureH}
                      </p>
                    ) : (
                      <p className="font-mono text-[9px] text-text-muted">
                        No region set — click Set Bounds
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="idle" className="space-y-2 pt-2">
                    <p className="font-mono text-[9px] font-bold text-text-muted">IDLE_MODE</p>
                    <select
                      value={idleMode}
                      onChange={event => handleIdleModeChange(event.target.value as RearViewIdleMode)}
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
          })() : null}

          {!import.meta.env.DEV || purpose === 'dash' ? (
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
                  onChange={event => handleDashChange(event.target.value)}
                  disabled={savingDash}
                  className={cn(
                    'w-full border border-border bg-background px-3 py-1.5',
                    'font-mono text-[10px] text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-primary',
                    'disabled:opacity-50',
                  )}
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

      {deviceOnlyCmds.length > 0 ? (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] font-bold text-text-muted">BUTTON_BINDINGS</p>
          <p className="font-mono text-[8px] text-text-muted">
            Click CAPTURE then press the physical button on this device.
          </p>
          <div className="space-y-1">
            {deviceOnlyCmds.map(command => {
              const button = getDeviceButton(command.id)
              return (
                <DeviceCommandRow
                  key={command.id}
                  cmd={command}
                  button={button}
                  bound={button > 0}
                  onButtonChange={nextButton => setDeviceButton(command.id, nextButton)}
                />
              )
            })}
          </div>
        </div>
      ) : null}

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
