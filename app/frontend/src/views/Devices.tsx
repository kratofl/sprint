import { useState, useEffect, useCallback, useRef } from 'react'
import { type DetectedScreen, type SavedScreen, type LayoutMeta, type DeviceBinding, deviceScreenAPI, deviceBindingsAPI, dashAPI } from '@/lib/dash'
import { type CommandMeta, controlsAPI } from '@/lib/controls'
import { onEvent } from '@/lib/wails'
import { Badge, Button, Skeleton, cn } from '@sprint/ui'

// Devices view — master-detail layout.

export default function Devices() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <h2 className="terminal-header text-sm font-bold tracking-[0.2em]">DEVICE_CONFIG</h2>
      </div>
      <div className="flex flex-1 overflow-hidden min-h-0">
        <VoCoreScreenSection />
      </div>
    </div>
  )
}

const ROTATION_OPTIONS = [0, 90, 180, 270] as const
type Rotation = (typeof ROTATION_OPTIONS)[number]

function screenKey(s: SavedScreen | DetectedScreen) {
  return `${s.vid}-${s.pid}-${'serial' in s ? s.serial : ''}`
}

// VoCoreScreenSection — list + detail panel.

function VoCoreScreenSection() {
  const [saved, setSaved]                   = useState<SavedScreen[]>([])
  const [detected, setDetected]             = useState<DetectedScreen[]>([])
  const [scanning, setScanning]             = useState(false)
  const [selecting, setSelecting]           = useState<string | null>(null)
  const [error, setError]                   = useState<string | null>(null)
  const [screenStatus, setScreenStatus]     = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
  const [screenError, setScreenError]       = useState<string | null>(null)
  const [screenPaused, setScreenPaused]     = useState(false)
  const [activeScreenKey, setActiveScreenKey] = useState<string | null>(null)
  const [selectedKey, setSelectedKey]       = useState<string | null>(null)
  const [layouts, setLayouts]               = useState<LayoutMeta[]>([])
  const [deviceOnlyCmds, setDeviceOnlyCmds] = useState<CommandMeta[]>([])

  const loadSaved = useCallback(async () => {
    try {
      const screens = await deviceScreenAPI.getSavedScreens()
      setSaved(screens)
      return screens
    } catch (e) {
      setError(String(e))
      return []
    }
  }, [])

  const loadLayouts = useCallback(async () => {
    try {
      const metas = await dashAPI.listLayouts()
      setLayouts(metas)
    } catch {
      // non-critical
    }
  }, [])

  const scan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const [found, screens] = await Promise.all([
        deviceScreenAPI.scanScreens(),
        deviceScreenAPI.getSavedScreens(),
      ])
      setDetected(found)
      setSaved(screens)

      if (screens.length === 0 && found.length === 1) {
        const s = found[0]
        await deviceScreenAPI.selectScreen(s.vid, s.pid, s.serial, s.width, s.height, s.driver)
        const updated = await deviceScreenAPI.getSavedScreens()
        setSaved(updated)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    scan()
    loadLayouts()
    deviceScreenAPI.getScreenPaused().then(setScreenPaused)
    deviceScreenAPI.getScreen().then(active => {
      if (active) setActiveScreenKey(screenKey(active))
    })
    controlsAPI.getCommandCatalog()
      .then(cmds => setDeviceOnlyCmds(cmds.filter(c => c.deviceOnly)))
      .catch(() => {})
  }, [scan, loadLayouts])

  useEffect(() => {
    deviceScreenAPI.getScreenStatus().then(setScreenStatus)
    const unsubs = [
      onEvent('screen:connected',    () => { setScreenStatus('connected'); setScreenError(null) }),
      onEvent('screen:disconnected', () => setScreenStatus('disconnected')),
      onEvent('screen:error',        (msg: string) => { setScreenStatus('disconnected'); setScreenError(msg) }),
      onEvent('screen:paused',       () => setScreenPaused(true)),
      onEvent('screen:resumed',      () => setScreenPaused(false)),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  const isOnline = (s: SavedScreen) =>
    detected.some(d => d.vid === s.vid && d.pid === s.pid && d.serial === s.serial)

  const handleSelect = async (s: SavedScreen) => {
    const key = screenKey(s)
    setSelecting(key)
    setError(null)
    try {
      await deviceScreenAPI.selectScreen(s.vid, s.pid, s.serial, s.width, s.height, s.driver)
      setActiveScreenKey(key)
      await loadSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSelecting(null)
    }
  }

  const handleScanAndRegister = async () => {
    setScanning(true)
    setError(null)
    try {
      const found = await deviceScreenAPI.scanScreens()
      setDetected(found)
      for (const s of found) {
        const alreadySaved = saved.some(x => screenKey(x) === screenKey(s))
        if (!alreadySaved) {
          await deviceScreenAPI.selectScreen(s.vid, s.pid, s.serial, s.width, s.height, s.driver)
        }
      }
      await loadSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }

  const handleTogglePause = async () => {
    const next = !screenPaused
    setScreenPaused(next)
    try {
      await deviceScreenAPI.setScreenPaused(next)
    } catch (e) {
      setError(String(e))
      setScreenPaused(screenPaused)
    }
  }

  const selectedScreen = saved.find(s => screenKey(s) === selectedKey) ?? null

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* List panel */}
      <div className="flex w-56 flex-shrink-0 flex-col border-r border-border overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="terminal-header text-[10px] font-bold text-text-muted">SCREENS</h4>
          <Button
            onClick={handleScanAndRegister}
            disabled={scanning}
            variant="neutral"
            size="sm"
            className="terminal-header h-6 px-2 text-[9px]"
          >
            {scanning ? '…' : '↻'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {error && <p className="mb-2 font-mono text-[9px] text-destructive">{error}</p>}

          {scanning && saved.length === 0 ? (
            <div className="space-y-1.5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : saved.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <p className="terminal-header text-[9px] text-text-muted">NO_SCREENS</p>
              <p className="font-mono text-[8px] text-text-muted">Connect via USB · press ↻</p>
            </div>
          ) : (
            saved.map(s => {
              const key = screenKey(s)
              const online = isOnline(s)
              const panelSelected = selectedKey === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'w-full rounded border px-3 py-2 text-left transition-colors',
                    panelSelected
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-card hover:border-border-strong hover:bg-card/80',
                  )}
                >
                  <p className="truncate font-mono text-[10px] font-bold">{s.name}</p>
                  <p className="font-mono text-[8px] text-text-muted uppercase">
                    {s.driver}
                    <span className={cn('ml-1.5', online ? 'text-success' : 'text-text-disabled')}>
                      · {online ? 'CONNECTED' : 'OFFLINE'}
                    </span>
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {selectedScreen ? (
          <ScreenDetail
            screen={selectedScreen}
            online={isOnline(selectedScreen)}
            screenStatus={isOnline(selectedScreen) ? screenStatus : 'disconnected'}
            screenError={screenError}
            screenPaused={screenPaused}
            isActive={screenKey(selectedScreen) === activeScreenKey}
            selecting={selecting === screenKey(selectedScreen)}
            layouts={layouts}
            deviceOnlyCmds={deviceOnlyCmds}
            onActivate={() => handleSelect(selectedScreen)}
            onTogglePause={handleTogglePause}
            onSaved={loadSaved}
            onError={setError}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="terminal-header text-[10px] text-text-muted">SELECT_A_SCREEN</p>
            <p className="font-mono text-[9px] text-text-muted">Choose a screen from the list to configure it</p>
            {screenError && (
              <div className="mt-2 max-w-xs space-y-1">
                <p className="font-mono text-[9px] text-destructive">SCREEN_ERR: {screenError}</p>
                {screenError.toLowerCase().includes('access denied') && (
                  <p className="font-mono text-[8px] text-text-muted">
                    Close SimHub or other USB tools — Sprint will reconnect automatically.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ScreenDetail — right panel shown when a screen is selected.

interface ScreenDetailProps {
  screen: SavedScreen
  online: boolean
  screenStatus: 'connected' | 'disconnected' | 'unknown'
  screenError: string | null
  screenPaused: boolean
  isActive: boolean
  selecting: boolean
  layouts: LayoutMeta[]
  deviceOnlyCmds: CommandMeta[]
  onActivate: () => void
  onTogglePause: () => void
  onSaved: () => Promise<SavedScreen[]>
  onError: (msg: string) => void
}

function ScreenDetail({
  screen, online, screenStatus, screenError, screenPaused, isActive, selecting, layouts,
  deviceOnlyCmds, onActivate, onTogglePause, onSaved, onError,
}: ScreenDetailProps) {
  const [draft, setDraft]           = useState(screen.name)
  const [renaming, setRenaming]     = useState(false)
  const [rotation, setRotation]     = useState<Rotation>(screen.rotation as Rotation)
  const [dashId, setDashId]         = useState(screen.dashId)
  const [savingDash, setSavingDash] = useState(false)
  const [bindings, setBindings]     = useState<DeviceBinding[]>([])
  const [savingBindings, setSavingBindings] = useState(false)
  const [bindingsSaved, setBindingsSaved]   = useState(false)

  useEffect(() => {
    setDraft(screen.name)
    setRotation(screen.rotation as Rotation)
    setDashId(screen.dashId)
    setRenaming(false)
    deviceBindingsAPI.getDeviceBindings(screen.vid, screen.pid, screen.serial)
      .then(setBindings)
      .catch(() => setBindings([]))
  }, [screen.vid, screen.pid, screen.serial, screen.name, screen.rotation, screen.dashId])

  const getDeviceButton = (commandId: string) =>
    bindings.find(b => b.command === commandId)?.button ?? 0

  const setDeviceButton = (commandId: string, button: number) => {
    setBindings(prev => {
      const rest = prev.filter(b => b.command !== commandId)
      if (button > 0) rest.push({ command: commandId, button })
      return rest
    })
  }

  const handleSaveBindings = async () => {
    setSavingBindings(true)
    try {
      await deviceBindingsAPI.saveDeviceBindings(screen.vid, screen.pid, screen.serial, bindings)
      setBindingsSaved(true)
      setTimeout(() => setBindingsSaved(false), 2000)
    } catch (e) {
      onError(String(e))
    } finally {
      setSavingBindings(false)
    }
  }

  const commitRename = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === screen.name) {
      setDraft(screen.name)
      setRenaming(false)
      return
    }
    try {
      await deviceScreenAPI.renameScreen(screen.vid, screen.pid, screen.serial, trimmed)
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
      await deviceScreenAPI.setScreenRotation(screen.vid, screen.pid, screen.serial, r)
    } catch (e) {
      onError(String(e))
      setRotation(screen.rotation as Rotation)
    }
  }

  const handleDashChange = async (id: string) => {
    setDashId(id)
    setSavingDash(true)
    try {
      await deviceScreenAPI.setDashLayout(screen.vid, screen.pid, screen.serial, id)
      await onSaved()
    } catch (e) {
      onError(String(e))
      setDashId(screen.dashId)
    } finally {
      setSavingDash(false)
    }
  }

  const activeDashId = dashId || layouts[0]?.id || ''

  // Derive screen control state.
  const controlState: 'not-active' | 'rendering' | 'paused' =
    !isActive ? 'not-active' : screenPaused ? 'paused' : 'rendering'

  const controlLabel = {
    'not-active': 'USE THIS SCREEN',
    'rendering':  'PAUSE SPRINT',
    'paused':     'RESUME SPRINT',
  }[controlState]

  const controlDescription = {
    'not-active': 'Sprint is not using this screen',
    'rendering':  'Sprint is sending frames — click to release so another app can use the screen',
    'paused':     'USB released — SimHub or another app can control this screen',
  }[controlState]

  const controlVariant: 'primary' | 'neutral' | 'outline' =
    controlState === 'paused' ? 'primary' : controlState === 'rendering' ? 'neutral' : 'outline'

  const handleControlAction = () => {
    if (controlState === 'not-active') onActivate()
    else onTogglePause()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Name row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setDraft(screen.name); setRenaming(false) }
              }}
              onBlur={commitRename}
              className="rounded bg-background px-1 font-mono text-sm font-bold outline outline-1 outline-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex items-center gap-1.5 text-left"
            >
              <span className="font-mono text-sm font-bold group-hover:text-primary transition-colors">
                {screen.name}
              </span>
              <PencilIcon className="text-text-disabled group-hover:text-primary transition-colors flex-shrink-0" />
            </button>
          )}
          <span className="font-mono text-[9px] text-text-muted">
            {screen.width}×{screen.height}
            {screen.serial && <span className="ml-2">S/N: {screen.serial}</span>}
            <span className="ml-2 uppercase">{screen.driver}</span>
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {online && screenStatus === 'connected' ? (
            <Badge variant="connected" className="terminal-header">CONNECTED</Badge>
          ) : !online ? (
            <Badge variant="neutral" className="terminal-header">OFFLINE</Badge>
          ) : null}
        </div>
      </div>

      {/* Screen control — combined activate + pause card */}
      <div className="flex items-center justify-between rounded border border-border bg-card px-4 py-3 gap-3">
        <div className="min-w-0">
          <p className={cn(
            'font-mono text-[10px] font-bold',
            controlState === 'rendering' && 'text-success',
            controlState === 'paused'    && 'text-text-muted',
          )}>
            {controlState === 'not-active' && 'NOT IN USE'}
            {controlState === 'rendering'  && 'RENDERING'}
            {controlState === 'paused'     && 'PAUSED'}
          </p>
          <p className="font-mono text-[9px] text-text-muted leading-snug">
            {controlDescription}
          </p>
          {selecting && (
            <p className="font-mono text-[9px] text-text-muted mt-0.5">Activating…</p>
          )}
          {screenError && controlState !== 'rendering' && (
            <div className="mt-1 space-y-0.5">
              <p className="font-mono text-[9px] text-destructive">{screenError}</p>
              {screenError.toLowerCase().includes('access denied') && (
                <p className="font-mono text-[8px] text-text-muted">
                  Close SimHub or other USB tools — Sprint will reconnect automatically.
                </p>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant={controlVariant}
          className="terminal-header h-7 flex-shrink-0 px-3 text-[9px]"
          onClick={handleControlAction}
          disabled={selecting}
        >
          {controlLabel}
        </Button>
      </div>

      {/* Rotation */}
      <div className="space-y-1.5">
        <p className="font-mono text-[9px] font-bold text-text-muted">ROTATION</p>
        <div className="flex gap-1.5">
          {ROTATION_OPTIONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => handleRotation(r)}
              className={cn(
                'rounded px-3 py-1 font-mono text-[10px] transition-colors border',
                rotation === r
                  ? 'bg-primary text-background border-primary'
                  : 'bg-background text-text-muted border-border hover:text-foreground',
              )}
            >
              {r}°
            </button>
          ))}
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
              'w-full rounded border border-border bg-background px-3 py-1.5',
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

      {/* Button bindings — device-only commands assigned per screen */}
      {deviceOnlyCmds.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9px] font-bold text-text-muted">BUTTON_BINDINGS</p>
            <div className="flex items-center gap-2">
              {bindingsSaved && (
                <span className="terminal-header font-mono text-[9px] text-success">SAVED</span>
              )}
              <Button
                size="sm"
                variant="primary"
                className="terminal-header h-6 px-2 text-[9px]"
                disabled={savingBindings}
                onClick={handleSaveBindings}
              >
                {savingBindings ? 'SAVING…' : 'SAVE'}
              </Button>
            </div>
          </div>
          <p className="font-mono text-[8px] text-text-muted">
            Click CAPTURE then press the physical button on this screen's wheel.
          </p>
          <div className="space-y-1">
            {deviceOnlyCmds.map(cmd => {
              const btn = getDeviceButton(cmd.id)
              const bound = btn > 0
              return (
                <DeviceCommandRow
                  key={cmd.id}
                  cmd={cmd}
                  button={btn}
                  bound={bound}
                  onButtonChange={b => setDeviceButton(cmd.id, b)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// DeviceCommandRow — a single device-only command with CAPTURE button.

type DeviceCaptureState = 'idle' | 'capturing' | 'timeout'

function DeviceCommandRow({
  cmd,
  button,
  bound,
  onButtonChange,
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
      'flex items-center justify-between rounded border px-4 py-2.5',
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
            className="flex h-5 w-5 items-center justify-center rounded text-[13px] text-text-muted transition-colors hover:text-destructive focus:outline-none"
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
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      className={className}
    >
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
