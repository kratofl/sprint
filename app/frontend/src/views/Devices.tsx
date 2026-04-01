import { useState, useEffect, useCallback } from 'react'
import { type DetectedScreen, type ScreenConfig, deviceScreenAPI } from '@/lib/dash'
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

// VoCoreScreenSection.

function VoCoreScreenSection() {
  const [screens, setScreens]           = useState<DetectedScreen[]>([])
  const [selected, setSelected]         = useState<ScreenConfig | null>(null)
  const [scanning, setScanning]         = useState(false)
  const [selecting, setSelecting]       = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [autoSelected, setAutoSelected] = useState(false)

  const screenKey = (s: DetectedScreen) => `${s.vid}-${s.pid}-${s.serial}`

  const scan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const [found, cfg] = await Promise.all([
        deviceScreenAPI.scanScreens(),
        deviceScreenAPI.getScreen(),
      ])
      setScreens(found)
      setSelected(cfg)

      if (!cfg && found.length === 1) {
        const s = found[0]
        await deviceScreenAPI.selectScreen(s.vid, s.pid, s.width, s.height)
        setSelected({ vid: s.vid, pid: s.pid, width: s.width, height: s.height })
        setAutoSelected(true)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  const handleSelect = async (screen: DetectedScreen) => {
    const key = screenKey(screen)
    setSelecting(key)
    setError(null)
    try {
      await deviceScreenAPI.selectScreen(screen.vid, screen.pid, screen.width, screen.height)
      setSelected({ vid: screen.vid, pid: screen.pid, width: screen.width, height: screen.height })
      setAutoSelected(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSelecting(null)
    }
  }

  const isSelected = (s: DetectedScreen) =>
    selected?.vid === s.vid && selected?.pid === s.pid

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h4 className="terminal-header text-[10px] font-bold text-text-muted">VOCORE_SCREEN</h4>
        <Button
          onClick={scan}
          disabled={scanning}
          variant="neutral"
          size="sm"
          className="terminal-header"
        >
          {scanning ? 'SCANNING…' : '↻ SCAN'}
        </Button>
      </div>

      <div className="px-6 py-4">
        {error && <p className="mb-3 font-mono text-[10px] text-destructive">{error}</p>}

        {scanning && screens.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : screens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="terminal-header text-[10px] text-text-muted">NO_SCREENS_DETECTED</p>
            <p className="font-mono text-[9px] text-text-muted">
              Connect steering wheel via USB and press SCAN
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {screens.map(s => {
              const key = screenKey(s)
              const active = isSelected(s)
              return (
                <Button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(s)}
                  disabled={selecting === key}
                  variant={active ? 'active' : 'outline'}
                  className={cn(
                    'h-auto w-full justify-between px-4 py-3 text-left font-normal',
                    !active && 'hover:bg-card',
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="font-mono text-[11px] font-bold">
                      {s.description || `VoCore Screen (PID 0x${s.pid.toString(16).toUpperCase()})`}                    </span>
                    <span className="font-mono text-[9px] text-text-muted">
                      {s.width}×{s.height}
                      {s.serial && <span className="ml-2">S/N: {s.serial}</span>}
                    </span>
                  </div>
                  <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                    {active && autoSelected && (
                      <Badge variant="connected" className="terminal-header">AUTO-DETECTED</Badge>
                    )}
                    {active && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                    {selecting === key && (
                      <span className="font-mono text-[9px] text-text-muted">CONNECTING…</span>
                    )}
                  </div>
                </Button>
              )
            })}
          </div>
        )}

        {selected && (
          <p className="mt-3 font-mono text-[9px] text-text-muted">
            ACTIVE: {selected.width}×{selected.height} · VID 0x{selected.vid.toString(16).toUpperCase()} PID 0x{selected.pid.toString(16).toUpperCase()}
          </p>
        )}
      </div>
    </div>
  )
}
