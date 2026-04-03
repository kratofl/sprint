import { useState, useEffect, useCallback, useRef } from 'react'
import { type DetectedScreen, type SavedScreen, deviceScreenAPI } from '@/lib/dash'
import { onEvent } from '@/lib/wails'
import { Badge, Button, Skeleton, cn } from '@sprint/ui'

// Devices view.

export default function Devices() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <h2 className="terminal-header text-sm font-bold tracking-[0.2em]">DEVICE_CONFIG</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
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

// VoCoreScreenSection.

function VoCoreScreenSection() {
  const [saved, setSaved]               = useState<SavedScreen[]>([])
  const [detected, setDetected]         = useState<DetectedScreen[]>([])
  const [scanning, setScanning]         = useState(false)
  const [selecting, setSelecting]       = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [screenStatus, setScreenStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
  const [screenError, setScreenError]   = useState<string | null>(null)
  const [renamingId, setRenamingId]     = useState<string | null>(null)

  const loadSaved = useCallback(async () => {
    try {
      const screens = await deviceScreenAPI.getSavedScreens()
      setSaved(screens)
    } catch (e) {
      setError(String(e))
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

      // Auto-select if exactly one screen found and none saved yet.
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

  useEffect(() => { scan() }, [scan])

  useEffect(() => {
    deviceScreenAPI.getScreenStatus().then(setScreenStatus)
    const unsubs = [
      onEvent('screen:connected',    () => { setScreenStatus('connected'); setScreenError(null) }),
      onEvent('screen:disconnected', () => setScreenStatus('disconnected')),
      onEvent('screen:error',        (msg: string) => { setScreenStatus('disconnected'); setScreenError(msg) }),
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
      const updated = await deviceScreenAPI.getSavedScreens()
      setSaved(updated)
    } catch (e) {
      setError(String(e))
    } finally {
      setSelecting(null)
    }
  }

  const handleRotation = async (s: SavedScreen, rotation: Rotation) => {
    try {
      await deviceScreenAPI.setScreenRotation(s.vid, s.pid, s.serial, rotation)
      setSaved(prev => prev.map(x =>
        screenKey(x) === screenKey(s) ? { ...x, rotation } : x
      ))
    } catch (e) {
      setError(String(e))
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
      const updated = await deviceScreenAPI.getSavedScreens()
      setSaved(updated)
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h4 className="terminal-header text-[10px] font-bold text-text-muted">SCREENS</h4>
        <Button
          onClick={handleScanAndRegister}
          disabled={scanning}
          variant="neutral"
          size="sm"
          className="terminal-header"
        >
          {scanning ? 'SCANNING…' : '↻ SCAN'}
        </Button>
      </div>

      <div className="px-6 py-4 space-y-2">
        {error && <p className="mb-3 font-mono text-[10px] text-destructive">{error}</p>}

        {scanning && saved.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : saved.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="terminal-header text-[10px] text-text-muted">NO_SCREENS_SAVED</p>
            <p className="font-mono text-[9px] text-text-muted">
              Connect a screen via USB and press SCAN
            </p>
          </div>
        ) : (
          saved.map(s => {
            const key = screenKey(s)
            const online = isOnline(s)
            return (
              <ScreenRow
                key={key}
                screen={s}
                online={online}
                screenStatus={online ? screenStatus : 'disconnected'}
                selecting={selecting === key}
                renaming={renamingId === key}
                onSelect={() => handleSelect(s)}
                onRename={async (name) => {
                  try {
                    await deviceScreenAPI.renameScreen(s.vid, s.pid, s.serial, name)
                    await loadSaved()
                  } catch (e) {
                    setError(String(e))
                  } finally {
                    setRenamingId(null)
                  }
                }}
                onStartRename={() => setRenamingId(key)}
                onCancelRename={() => setRenamingId(null)}
                onRotation={(r) => handleRotation(s, r)}
              />
            )
          })
        )}

        {screenError && (
          <p className="mt-1 font-mono text-[9px] text-destructive">
            SCREEN_ERR: {screenError}
          </p>
        )}
      </div>
    </div>
  )
}

// ScreenRow.

interface ScreenRowProps {
  screen: SavedScreen
  online: boolean
  screenStatus: 'connected' | 'disconnected' | 'unknown'
  selecting: boolean
  renaming: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onStartRename: () => void
  onCancelRename: () => void
  onRotation: (r: Rotation) => void
}

function ScreenRow({
  screen, online, screenStatus, selecting,
  renaming, onSelect, onRename, onStartRename, onCancelRename, onRotation,
}: ScreenRowProps) {
  const [draft, setDraft] = useState(screen.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) {
      setDraft(screen.name)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [renaming, screen.name])

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== screen.name) onRename(trimmed)
    else onCancelRename()
  }

  return (
    <div className={cn(
      'rounded border border-border bg-card px-4 py-3 space-y-2',
      online && 'border-primary/40',
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {renaming ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') onCancelRename()
              }}
              onBlur={commitRename}
              className="w-full rounded bg-background px-1 font-mono text-[11px] font-bold outline outline-1 outline-primary"
            />
          ) : (
            <button
              type="button"
              onClick={onStartRename}
              className="truncate text-left font-mono text-[11px] font-bold hover:text-primary"
              title="Click to rename"
            >
              {screen.name}
            </button>
          )}
          <span className="font-mono text-[9px] text-text-muted">
            {screen.width}×{screen.height}
            {screen.serial && <span className="ml-2">S/N: {screen.serial}</span>}
            <span className="ml-2 uppercase">{screen.driver}</span>
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {online && screenStatus === 'connected' && (
            <Badge variant="connected" className="terminal-header">CONNECTED</Badge>
          )}
          {!online && (
            <Badge variant="neutral" className="terminal-header">OFFLINE</Badge>
          )}
          {selecting && (
            <span className="font-mono text-[9px] text-text-muted">CONNECTING…</span>
          )}
          <Button
            size="sm"
            variant={online ? 'active' : 'outline'}
            className="terminal-header h-6 px-2 text-[9px]"
            onClick={onSelect}
            disabled={selecting}
          >
            {online ? 'ACTIVE' : 'SELECT'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] text-text-muted">ROTATION</span>
        <div className="flex gap-1">
          {ROTATION_OPTIONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onRotation(r)}
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[9px] transition-colors',
                screen.rotation === r
                  ? 'bg-primary text-background'
                  : 'bg-background text-text-muted hover:text-foreground border border-border',
              )}
            >
              {r}°
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

