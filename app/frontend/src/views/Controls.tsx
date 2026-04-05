import { useState, useEffect, useRef } from 'react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, cn } from '@sprint/ui'
import { type CommandMeta, type ControlsConfig, controlsAPI } from '@/lib/controls'

// Category display order.
const CATEGORY_ORDER = ['dash', 'lap']
const CATEGORY_LABEL: Record<string, string> = {
  dash: 'DASH',
  lap:  'LAP',
}

// Controls.

export default function Controls() {
  const [catalog,     setCatalog]     = useState<CommandMeta[]>([])
  const [config,      setConfig]      = useState<ControlsConfig>({ bindings: [] })
  const [saving,      setSaving]      = useState(false)
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError,   setLoadError]   = useState<string | null>(null)

  // Load catalog + current bindings on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([controlsAPI.getCommandCatalog(), controlsAPI.getBindings()])
      .then(([cat, cfg]) => {
        if (cancelled) return
        setCatalog(cat)
        setConfig(cfg)
      })
      .catch(e => { if (!cancelled) setLoadError(String(e)) })
    return () => { cancelled = true }
  }, [])

  const getButton = (commandId: string): number => {
    return config.bindings.find(b => b.command === commandId)?.button ?? 0
  }

  const setButton = (commandId: string, button: number) => {
    setConfig(prev => {
      const bindings = prev.bindings.filter(b => b.command !== commandId)
      if (button > 0) bindings.push({ command: commandId, button })
      return { bindings }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      await controlsAPI.saveBindings(config)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Derive ordered categories from catalog.
  const knownCategories  = CATEGORY_ORDER.filter(c => catalog.some(cmd => cmd.category === c))
  const extraCategories  = [...new Set(catalog.map(cmd => cmd.category))].filter(c => !CATEGORY_ORDER.includes(c))
  const categories       = [...knownCategories, ...extraCategories]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">CONTROLS</h2>
          <p className="font-mono text-[10px] text-text-muted">
            Assign wheel buttons to commands
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <Badge variant="success" className="terminal-header">SAVED</Badge>
          )}
          {saveStatus === 'error' && (
            <Badge variant="destructive" className="terminal-header">SAVE_FAILED</Badge>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || catalog.length === 0}
            variant="primary"
            className="terminal-header font-bold"
          >
            {saving ? 'SAVING…' : 'SAVE_BINDINGS'}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-border px-6 py-2 font-mono text-[10px] text-destructive">
          {loadError}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {catalog.length === 0 && !loadError ? (
          <div className="flex items-center justify-center py-12 font-mono text-[10px] text-text-muted">
            LOADING_COMMANDS…
          </div>
        ) : (
          <div className="space-y-6 px-6 py-4">
            {/* How-to note */}
            <Card size="sm" className="gap-0 py-0">
              <CardHeader className="border-b border-border px-4 py-2.5">
                <CardTitle className="text-foreground">HOW_TO_USE</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4 py-3 font-mono text-[10px] text-text-muted">
                <p>Click <span className="text-foreground">[ CAPTURE ]</span> next to a command, then press the physical button on your wheel.</p>
                <p>The channel is detected automatically. Leave a command unbound to disable it.</p>
                <p>Commands marked <span className="text-text-muted opacity-80">DEVICE ONLY</span> must be triggered from a hardware button.</p>
              </CardContent>
            </Card>

            {/* Command groups */}
            {categories.map(cat => (
              <CommandGroup
                key={cat}
                label={CATEGORY_LABEL[cat] ?? cat.toUpperCase()}
                commands={catalog.filter(c => c.category === cat)}
                getButton={getButton}
                setButton={setButton}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// CommandGroup.

function CommandGroup({
  label,
  commands,
  getButton,
  setButton,
}: {
  label: string
  commands: CommandMeta[]
  getButton: (id: string) => number
  setButton: (id: string, button: number) => void
}) {
  return (
    <div>
      <h4 className="terminal-header mb-2 text-[10px] font-bold text-text-muted">{label}</h4>
      <div className="space-y-1">
        {commands.map(cmd => (
          <CommandRow
            key={cmd.id}
            cmd={cmd}
            button={getButton(cmd.id)}
            onButtonChange={btn => setButton(cmd.id, btn)}
          />
        ))}
      </div>
    </div>
  )
}

// CommandRow.

type CaptureState = 'idle' | 'capturing' | 'timeout'

function CommandRow({
  cmd,
  button,
  onButtonChange,
}: {
  cmd: CommandMeta
  button: number
  onButtonChange: (button: number) => void
}) {
  const bound = button > 0
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [countdown, setCountdown] = useState(3)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleCapture = async () => {
    if (captureState === 'capturing') return
    setCaptureState('capturing')
    setCountdown(3)

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearTimer(); return 0 }
        return prev - 1
      })
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

  // Clean up interval on unmount.
  useEffect(() => () => clearTimer(), [])

  return (
    <Card
      size="sm"
      variant={bound ? 'selected' : 'default'}
      className="gap-0 py-0"
    >
      <CardContent className="flex items-center justify-between px-4 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className={cn(
            'font-mono text-[11px] font-bold',
            bound ? 'text-white' : 'text-text-muted',
          )}>
            {cmd.label}
          </span>
          <span className="font-mono text-[9px] text-text-muted opacity-60">{cmd.id}</span>
        </div>

        <div className="ml-4 flex flex-shrink-0 items-center gap-2">
          {bound && (
            <Badge variant="active" className="terminal-header">BTN_{button}</Badge>
          )}

          {cmd.deviceOnly ? (
            <Badge variant="default" className="terminal-header text-text-muted">DEVICE_ONLY</Badge>
          ) : (
            <Input
              type="number"
              min={0}
              max={255}
              value={button === 0 ? '' : button}
              placeholder="—"
              data-readout="true"
              data-status={bound ? 'accent' : 'neutral'}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                onButtonChange(isNaN(v) ? 0 : Math.max(0, Math.min(255, v)))
              }}
              className="w-14 text-center font-mono text-[10px] tabular-nums"
            />
          )}

          {cmd.capturable && (
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
          )}
        </div>
      </CardContent>
    </Card>
  )
}
