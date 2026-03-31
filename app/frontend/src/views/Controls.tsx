import { useState, useEffect } from 'react'
import { cn } from '@sprint/ui'
import { type CommandMeta, type ControlsConfig, controlsAPI } from '@/lib/controls'

// Category display order.
const CATEGORY_ORDER = ['dash', 'lap']
const CATEGORY_LABEL: Record<string, string> = {
  dash: 'DASH',
  lap:  'LAP',
}

// ── Controls ──────────────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-4 flex-shrink-0">
        <div>
          <h2 className="terminal-header mb-0.5 text-sm font-bold tracking-[0.2em]">CONTROLS</h2>
          <p className="font-mono text-[10px] text-[#808080]">
            Assign wheel buttons to commands
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="terminal-header text-[10px] text-[#34D399]">SAVED</span>
          )}
          {saveStatus === 'error' && (
            <span className="terminal-header text-[10px] text-[#F87171]">SAVE_FAILED</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || catalog.length === 0}
            className="terminal-header border border-[#ff906c] px-3 py-1.5 text-[10px] text-[#ff906c] transition-colors hover:bg-[#ff906c] hover:text-[#0a0a0a] disabled:opacity-50"
          >
            {saving ? 'SAVING…' : 'SAVE_BINDINGS'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-[#2a2a2a] px-6 py-2 font-mono text-[10px] text-[#F87171]">
          {loadError}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {catalog.length === 0 && !loadError ? (
          <div className="flex items-center justify-center py-12 font-mono text-[10px] text-[#808080]">
            LOADING_COMMANDS…
          </div>
        ) : (
          <div className="px-6 py-4 space-y-6">

            {/* How-to note */}
            <div className="border border-[#2a2a2a] bg-[#141414] px-4 py-3 font-mono text-[10px] text-[#808080] space-y-1">
              <p className="text-white font-bold terminal-header">HOW_TO_USE</p>
              <p>Enter the wheel button channel number next to each command.</p>
              <p>Leave at 0 (or blank) to leave a command unbound.</p>
              <p>Button numbers are game-specific — check your telemetry stream for channel IDs.</p>
            </div>

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

// ── CommandGroup ──────────────────────────────────────────────────────────────

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
      <h4 className="terminal-header mb-2 text-[10px] font-bold text-[#808080]">{label}</h4>
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

// ── CommandRow ────────────────────────────────────────────────────────────────

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

  return (
    <div className={cn(
      'flex items-center justify-between border px-4 py-2.5 transition-colors',
      bound ? 'border-[#ff906c]/40 bg-[#ff906c]/[0.03]' : 'border-[#2a2a2a]',
    )}>
      <div className="flex flex-col gap-0.5">
        <span className={cn(
          'font-mono text-[11px] font-bold',
          bound ? 'text-white' : 'text-[#808080]',
        )}>
          {cmd.label}
        </span>
        <span className="font-mono text-[9px] text-[#808080] opacity-60">{cmd.id}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {bound && (
          <span className="terminal-header text-[9px] text-[#ff906c]">BTN_{button}</span>
        )}
        <input
          type="number"
          min={0}
          max={255}
          value={button === 0 ? '' : button}
          placeholder="—"
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            onButtonChange(isNaN(v) ? 0 : Math.max(0, Math.min(255, v)))
          }}
          className={cn(
            'w-14 border bg-transparent px-2 py-1 text-center font-mono text-[10px] outline-none transition-colors',
            'placeholder:text-[#808080]',
            bound
              ? 'border-[#ff906c]/50 text-[#ff906c] focus:border-[#ff906c]'
              : 'border-[#2a2a2a] text-[#808080] focus:border-[#3a3a3a] focus:text-white',
          )}
        />
      </div>
    </div>
  )
}
