import { useState } from 'react'
import { cn } from '@sprint/ui'
import { type AlertInstance, type AlertMeta, type DomainPalette, type ConfigDef } from '@/lib/dash'

const DOMAIN_COLOR_MAP: Record<string, string> = {
  tc:        '#5af8fb',
  abs:       '#fbbf24',
  motor:     '#ff906c',
  primary:   '#ff906c',
  accent:    '#5af8fb',
  success:   '#34d399',
  warning:   '#fbbf24',
  danger:    '#f87171',
}

function resolveSwatchColor(colorRef: string, domain?: Partial<DomainPalette>): string {
  if (domain) {
    const key = colorRef as keyof DomainPalette
    const val = domain[key]
    if (val && typeof val === 'object' && 'R' in val) {
      const { R, G, B } = val as { R: number; G: number; B: number }
      return `rgb(${R},${G},${B})`
    }
  }
  return DOMAIN_COLOR_MAP[colorRef] ?? '#808080'
}

interface AlertsEditorProps {
  instances: AlertInstance[]
  catalog: AlertMeta[]
  domainPalette?: Partial<DomainPalette>
  onChange: (instances: AlertInstance[]) => void
}

export function AlertsEditor({ instances, catalog, domainPalette, onChange }: AlertsEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const addedTypes = new Set(instances.map(i => i.type))
  const selectedInstance = instances.find(i => i.id === selectedId) ?? null
  const selectedMeta = selectedInstance
    ? catalog.find(m => m.type === selectedInstance.type) ?? null
    : null

  const handleAdd = (meta: AlertMeta) => {
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    const next: AlertInstance = { id, type: meta.type }
    onChange([...instances, next])
    setSelectedId(id)
  }

  const handleRemove = (id: string) => {
    onChange(instances.filter(i => i.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleConfigChange = (key: string, value: unknown) => {
    if (!selectedInstance) return
    onChange(instances.map(i =>
      i.id === selectedInstance.id
        ? { ...i, config: { ...(i.config ?? {}), [key]: value } }
        : i
    ))
  }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Left: alert type palette */}
      <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h4 className="terminal-header text-[10px] font-bold text-text-muted">ALERT_TYPES</h4>
        </div>
        <div className="flex-1 overflow-y-auto">
          {catalog.length === 0 ? (
            <div className="p-4 text-center font-mono text-[10px] text-text-muted">LOADING…</div>
          ) : (
            catalog.map(meta => {
              const alreadyAdded = addedTypes.has(meta.type)
              return (
                <div
                  key={meta.type}
                  className={cn(
                    'flex flex-col gap-0.5 px-3 py-2.5 border-b border-border/40',
                    alreadyAdded
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-white/[0.03] cursor-pointer'
                  )}
                  onClick={() => { if (!alreadyAdded) handleAdd(meta) }}
                  title={alreadyAdded ? 'Already added' : `Add ${meta.label}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: resolveSwatchColor(meta.defaultColor, domainPalette) }}
                    />
                    <span className="font-mono text-[10px] text-foreground truncate">{meta.label}</span>
                  </div>
                  <p className="font-mono text-[9px] text-text-muted leading-tight pl-4">{meta.description}</p>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Center: configured instance list */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <div className="border-b border-border px-4 py-3">
          <h4 className="terminal-header text-[10px] font-bold text-text-muted">CONFIGURED_ALERTS</h4>
        </div>
        <div className="flex-1 overflow-y-auto">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted font-mono text-[10px] p-6">
              <span>NO_ALERTS_CONFIGURED</span>
              <span className="text-[9px] text-text-disabled text-center">Click an alert type on the left to add it</span>
            </div>
          ) : (
            instances.map(inst => {
              const meta = catalog.find(m => m.type === inst.type)
              const isSelected = inst.id === selectedId
              return (
                <div
                  key={inst.id}
                  onClick={() => setSelectedId(isSelected ? null : inst.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 border-b border-border/40 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-white/[0.05] border-l-2 border-l-warning'
                      : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: resolveSwatchColor(meta?.defaultColor ?? '', domainPalette) }}
                  />
                  <span className="font-mono text-[10px] text-foreground flex-1 truncate">
                    {meta?.label ?? inst.type}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleRemove(inst.id) }}
                    className="text-text-disabled hover:text-destructive transition-colors flex-shrink-0"
                    title="Remove alert"
                  >
                    <RemoveIcon />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right: instance config panel */}
      <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-l border-border">
        <div className="border-b border-border px-4 py-3">
          <h4 className="terminal-header text-[10px] font-bold text-text-muted">PROPERTIES</h4>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedInstance || !selectedMeta ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted font-mono text-[10px] p-4">
              <span>SELECT AN ALERT</span>
              <span className="text-[9px] mt-1 text-text-disabled">to view properties</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              <div className="border-b border-border px-4 py-3">
                <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-wider">
                  {selectedMeta.label}
                </p>
              </div>
              {selectedMeta.configDefs && selectedMeta.configDefs.length > 0 ? (
                <div className="flex flex-col gap-px">
                  {selectedMeta.configDefs.map(def => (
                    <AlertConfigField
                      key={def.key}
                      def={def}
                      value={selectedInstance.config?.[def.key]}
                      onChange={value => handleConfigChange(def.key, value)}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 font-mono text-[9px] text-text-disabled">No configurable options</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AlertConfigField({
  def,
  value,
  onChange,
}: {
  def: ConfigDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const current = value !== undefined ? String(value) : def.default

  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 border-b border-border/50">
      <label className="font-mono text-[9px] text-text-muted uppercase tracking-wide">{def.label}</label>
      {def.type === 'select' && def.options && (
        <select
          value={current}
          onChange={e => onChange(e.target.value)}
          className="bg-[#141414] border border-border px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent w-full"
        >
          {def.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {def.type === 'number' && (
        <input
          type="number"
          value={current}
          step="0.5"
          min="0.5"
          onChange={e => onChange(Number(e.target.value))}
          className="bg-[#141414] border border-border px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent w-full"
        />
      )}
      {def.type === 'boolean' && (
        <button
          onClick={() => onChange(current !== 'true')}
          className={cn(
            'flex items-center gap-2 px-2 py-1 border font-mono text-[10px] transition-colors w-full text-left',
            current === 'true'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-text-muted hover:border-border-strong'
          )}
        >
          <span className={cn('w-3 h-3 border flex-shrink-0', current === 'true' ? 'bg-accent border-accent' : 'border-border')} />
          {current === 'true' ? 'Enabled' : 'Disabled'}
        </button>
      )}
      {def.type === 'text' && (
        <input
          type="text"
          value={current}
          onChange={e => onChange(e.target.value)}
          className="bg-[#141414] border border-border px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent w-full"
        />
      )}
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="9" y2="9" />
      <line x1="9" y1="2" x2="2" y2="9" />
    </svg>
  )
}
