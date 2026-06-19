import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconDeviceMobile, IconPencil } from '@tabler/icons-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsRow,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sprint/ui'
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
import { controlsAPI, type CommandMeta } from '@/lib/controls'
import { DeviceCommandRow } from './DeviceCommandRow'
import { resolveBindingDashContext } from './bindingDashContext'
import { buildDeviceBindingsViewModel } from './deviceBindingsViewModel'
import {
  buttonNumberFromKeyboardKey,
  cancelDeviceBindingListen,
  reduceDeviceBindingKey,
  startDeviceBindingListen,
} from './deviceBindingListenState'

const ORIENTATION_OPTIONS = [
  { degrees: 0 as const, label: 'Portrait', iconRotation: 'rotate-0' },
  { degrees: 90 as const, label: 'Landscape', iconRotation: 'rotate-90' },
  { degrees: 180 as const, label: 'Portrait Rev.', iconRotation: 'rotate-180' },
  { degrees: 270 as const, label: 'Landscape Rev.', iconRotation: '-rotate-90' },
] as const

type Rotation = (typeof ORIENTATION_OPTIONS)[number]['degrees']

const PURPOSE_OPTIONS: Array<{ value: DevicePurpose; label: string }> = [
  { value: 'dash', label: 'Dash' },
  { value: 'rear_view', label: 'Rear View Mirror' },
]

const IDLE_MODE_OPTIONS: Array<{ value: RearViewIdleMode; label: string }> = [
  { value: 'black', label: 'BLACK - screen off' },
  { value: 'clock', label: 'CLOCK - digital HH:MM:SS' },
]

const ORIENTATION_SEGMENT_OPTIONS = ORIENTATION_OPTIONS.map(({ degrees, label, iconRotation }) => ({
  value: String(degrees),
  label: (
    <span className="flex items-center gap-1.5">
      <IconDeviceMobile size={12} className={iconRotation} />
      {label}
    </span>
  ),
}))

// How long (seconds) the input detector stays armed for a physical button press
// per listening session. CaptureNextButton is global and cannot be aborted from
// the frontend, so we keep this short enough that a stale capture clears quickly.
const CAPTURE_TIMEOUT_SECS = 8

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
  const [listeningCommandId, setListeningCommandId] = useState<string | null>(null)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
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
    setListeningCommandId(null)
    setConfirmRemoveOpen(false)
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

  const setDeviceButton = useCallback(async (commandId: string, button: number) => {
    const updated = bindings.filter(binding => binding.command !== commandId)
    if (button > 0) updated.push({ command: commandId, button })
    setBindings(updated)
    try {
      await deviceBindingsAPI.saveDeviceBindings(device.vid, device.pid, device.serial, updated)
    } catch (error) {
      onError(String(error))
    }
  }, [bindings, device.pid, device.serial, device.vid, onError])

  useEffect(() => {
    if (!listeningCommandId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const isAssignmentKey = buttonNumberFromKeyboardKey(event.key) !== null
      const result = reduceDeviceBindingKey({ listeningCommandId }, event.key)
      if (result.state.listeningCommandId !== listeningCommandId) {
        setListeningCommandId(result.state.listeningCommandId)
      }
      if (result.assignment) {
        event.preventDefault()
        void setDeviceButton(result.assignment.commandId, result.assignment.button)
      } else if (event.key === 'Escape' || isAssignmentKey) {
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [listeningCommandId, setDeviceButton])

  // Physical button capture: while a row is listening, arm the input detector so a
  // real wheel/button press (or encoder tick) binds the command — the full HID
  // range, not just keyboard digits 1-9/0. The keyboard path above remains as a
  // fallback. CaptureNextButton is global and cannot be aborted from the frontend,
  // so we arm once per listening session and drop a stale result via the guard.
  useEffect(() => {
    if (!listeningCommandId) return
    const commandId = listeningCommandId
    let cancelled = false
    controlsAPI
      .captureButton(CAPTURE_TIMEOUT_SECS)
      .then(button => {
        if (cancelled || button <= 0) return
        setListeningCommandId(null)
        void setDeviceButton(commandId, button)
      })
      .catch(() => {
        // Timeout, no input service, or browser (non-desktop): keyboard fallback remains.
      })
    return () => {
      cancelled = true
    }
  }, [listeningCommandId, setDeviceButton])

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

  return (
    <div className="ds-bindwrap">
      <div className="ds-dev-head">
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
              className="h-8 w-72 rounded-control font-sans text-[13px] font-bold"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]"
              aria-label="Rename device"
            >
              <span className="font-sans text-[13px] font-bold transition-colors group-hover:text-[var(--orange)]">
                {device.name}
              </span>
              <IconPencil size={12} className="flex-shrink-0 text-[var(--muted-2)] transition-colors group-hover:text-[var(--orange)]" />
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="ui-label">{typeLabel}</Badge>
            {isScreen && device.driver ? (
              <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">{device.driver}</span>
            ) : null}
            {isScreen && device.width > 0 ? (
              <span className="font-sans text-[11px] tabular-nums text-[var(--muted)]">{device.width}×{device.height}</span>
            ) : null}
            {device.serial ? (
              <span className="font-sans text-[11px] tabular-nums text-[var(--muted)]">S/N: {device.serial}</span>
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

      <Tabs key={id} defaultValue={isScreen ? 'settings' : 'bindings'} className="min-h-0 flex-1 space-y-[14px] overflow-y-auto p-[14px]">
        <TabsList
          variant="top"
          className="font-sans text-[11px]"
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
                  <Select
                    value={purpose}
                    onValueChange={value => { void handlePurposeChange(value as DevicePurpose) }}
                  >
                    <SelectTrigger aria-label="Device purpose" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PURPOSE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="ui-label text-[11px] font-semibold text-[var(--muted)]">Orientation</p>
                <SegmentedControl
                  label="Screen orientation"
                  value={String(rotation)}
                  options={ORIENTATION_SEGMENT_OPTIONS}
                  onChange={value => { void handleRotation(Number(value) as Rotation) }}
                  className="flex-wrap"
                />
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
                      className="h-8 w-16 rounded-control text-right font-sans text-[12px]"
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
                      className="h-8 w-16 rounded-control text-right font-sans text-[12px]"
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
                      className="h-8 w-16 rounded-control text-right font-sans text-[12px]"
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
                      <TabsList variant="compact" className="w-full font-sans text-[11px]">
                        <TabsTrigger value="capture" className="flex-1">Capture</TabsTrigger>
                        <TabsTrigger value="idle" className="flex-1">Idle screen</TabsTrigger>
                      </TabsList>

                      <TabsContent value="capture" className="space-y-2 pt-2">
                        <Button
                          variant="active"
                          size="sm"
                          className="h-8 w-full rounded-control font-sans text-[12px]"
                          onClick={handleSelectBounds}
                          disabled={selectingBounds}
                        >
                          {selectingBounds ? 'Selecting… (Enter to confirm, Esc to cancel)' : 'Set bounds'}
                        </Button>
                        {captureW > 0 && captureH > 0 ? (
                          <p className="font-sans text-[10px] text-[var(--muted)]">
                            X: {captureX}  Y: {captureY}  W: {captureW}  H: {captureH}
                          </p>
                        ) : (
                          <p className="font-sans text-[10px] text-[var(--muted)]">
                            No region set — click Set Bounds
                          </p>
                        )}
                      </TabsContent>

                      <TabsContent value="idle" className="space-y-2 pt-2">
                        <p className="ui-label text-[11px] font-semibold text-[var(--muted)]">Idle mode</p>
                        <Select
                          value={idleMode}
                          onValueChange={value => { void handleIdleModeChange(value as RearViewIdleMode) }}
                        >
                          <SelectTrigger aria-label="Rear view idle mode" size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IDLE_MODE_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    <p className="font-sans text-[10px] text-[var(--muted)]">
                      No dashboards saved yet. Create one in Dashboards.
                    </p>
                  ) : (
                    <Select
                      value={activeDashId}
                      disabled={savingDash}
                      onValueChange={value => { void handleDashChange(value) }}
                    >
                      <SelectTrigger aria-label="Assigned dash layout" size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {layouts.map(layout => (
                          <SelectItem key={layout.id} value={layout.id}>{layout.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="bindings" className="space-y-[10px] pt-1">
          {bindingDashContext.showDashPicker && layouts.length > 0 ? (
            <SettingsRow>
              <div>
                <span className="font-medium text-[var(--text)]">Assigned dash</span>
                <p className="mt-1 text-[11px] text-[var(--text3)]">Select the dash whose stack actions should be exposed.</p>
              </div>
              <Select
                value={activeDashId}
                onValueChange={setSelectedBindingDashId}
              >
                <SelectTrigger aria-label="Binding dash context" size="sm" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map(layout => (
                    <SelectItem key={layout.id} value={layout.id}>{layout.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ui-label text-[11px] text-[var(--muted)]">Active dash only</p>
            {bindingView.hiddenBindingCount > 0 ? (
              <Badge variant="outline" className="font-sans text-[10px]">
                {bindingView.hiddenBindingCount}_HIDDEN
              </Badge>
            ) : null}
          </div>

          {bindingView.cards.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {bindingView.cards.map(card => (
                <div key={card.key} className="ds-bindgrp space-y-[10px] rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)]">
                  <div className="min-w-0">
                    <p className="font-sans text-[12px] font-bold text-[var(--text)]">{card.title}</p>
                    {card.subtitle ? (
                      <p className="truncate font-sans text-[10px] text-[var(--muted)]">{card.subtitle}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    {card.rows.map(row => (
                      <DeviceCommandRow
                        key={row.command.id}
                        cmd={row.command}
                        button={row.button}
                        bound={row.button > 0}
                        listening={listeningCommandId === row.command.id}
                        onListenToggle={() => setListeningCommandId(current =>
                          startDeviceBindingListen({ listeningCommandId: current }, row.command.id).listeningCommandId,
                        )}
                        onCancelListen={() => setListeningCommandId(current =>
                          cancelDeviceBindingListen({ listeningCommandId: current }).listeningCommandId,
                        )}
                        onButtonChange={nextButton => {
                          setListeningCommandId(null)
                          void setDeviceButton(row.command.id, nextButton)
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ds-wheel-hint">
              <p className="ui-label text-[11px] text-[var(--muted)]">No active dash bindings</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="border-t border-[var(--line)] p-[14px]">
        <Button
          variant="destructive"
          size="sm"
          className="ui-label h-8 rounded-control px-[10px] text-[11px]"
          disabled={removing}
          onClick={() => setConfirmRemoveOpen(true)}
        >
          {removing ? 'Removing…' : 'Remove device'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove device?"
        message={`${device.name} will be removed from Sprint. Saved dash layouts are not deleted.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmRemoveOpen(false)
          void handleRemove()
        }}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </div>
  )
}
