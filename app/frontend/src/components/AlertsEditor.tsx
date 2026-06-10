import { useState } from 'react'
import { cn } from '@sprint/ui'
import { type AlertInstance, type AlertMeta, type DomainPalette, type ConfigDef } from '@/lib/dash'

const DOMAIN_COLOR_MAP: Record<string, string> = {
  tc:        '#33D27E',
  abs:       '#fbbf24',
  motor:     '#FF6A00',
  primary:   '#FF6A00',
  accent:    '#FF6A00',
  success:   '#33D27E',
  warning:   '#fbbf24',
  danger:    '#FF4D63',
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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-deep)]">
      {/* Left: alert type palette */}
      <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-[14px] py-[10px]">
          <h4 className="ui-label text-[11px] font-semibold text-text-muted">Alert types</h4>
        </div>
        <div className="flex flex-1 flex-col gap-[10px] overflow-y-auto p-[10px]">
          {catalog.length === 0 ? (
            <div className="p-[10px] text-center font-saira text-[12px] tabular-nums text-[var(--muted)]">LOADING...</div>
          ) : (
            catalog.map(meta => {
              const alreadyAdded = addedTypes.has(meta.type)
              return (
                <div
                  key={meta.type}
                  className={cn(
                    'flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px] transition-colors',
                    alreadyAdded
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer hover:border-[var(--border-2)] hover:bg-[var(--panel-2)]'
                  )}
                  onClick={() => { if (!alreadyAdded) handleAdd(meta) }}
                  title={alreadyAdded ? 'Already added' : `Add ${meta.label}`}
                >
                  <div className="flex size-[28px] flex-shrink-0 items-center justify-center rounded-tile border border-[var(--amber-ring)] bg-[var(--amber-tint)] text-[var(--amber)]">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: resolveSwatchColor(meta.defaultColor, domainPalette) }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-[13px] font-bold text-[var(--text)]">{meta.label}</span>
                    <p className="font-saira text-[10px] leading-tight tabular-nums text-[var(--muted)]">{meta.description}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Center: configured instance list */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--panel)] px-[14px] py-[10px]">
          <h4 className="ui-label text-[11px] font-semibold text-text-muted">Configured alerts</h4>
        </div>
        <div className="flex flex-1 flex-col gap-[10px] overflow-y-auto p-[10px]">
          {instances.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 font-saira text-[12px] tabular-nums text-[var(--muted)]">
              <span>No alerts configured</span>
              <span className="text-center text-[10px] text-[var(--muted-2)]">Click an alert type on the left to add it</span>
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
                    'flex gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px] cursor-pointer transition-colors',
                    isSelected
                      ? 'border-[var(--orange)]'
                      : 'hover:border-[var(--border-2)] hover:bg-[var(--panel-2)]'
                  )}
                >
                  <div className="flex size-[28px] flex-shrink-0 items-center justify-center rounded-tile border border-[var(--amber-ring)] bg-[var(--amber-tint)] text-[var(--amber)]">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: resolveSwatchColor(meta?.defaultColor ?? '', domainPalette) }}
                    />
                  </div>
                  <span className="flex-1 truncate text-[13px] font-bold text-[var(--text)]">{meta?.label ?? inst.type}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleRemove(inst.id) }}
                    className="text-destructive/80 hover:text-destructive transition-colors flex-shrink-0"
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
      <div className="flex w-52 flex-shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-[14px] py-[10px]">
          <h4 className="ui-label text-[11px] font-semibold text-text-muted">Properties</h4>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedInstance || !selectedMeta ? (
            <div className="flex h-full flex-col items-center justify-center p-4 font-saira text-[12px] tabular-nums text-[var(--muted)]">
              <span>Select an alert</span>
              <span className="mt-1 text-[10px] text-[var(--muted-2)]">to view properties</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              <div className="border-b border-[var(--border)] px-[14px] py-[10px]">
                <p className="ui-label text-[11px] font-bold text-[var(--text)]">
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
                <div className="px-[14px] py-[10px] font-saira text-[12px] text-[var(--muted-2)]">No configurable options</div>
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
    <div className="flex flex-col gap-[6px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <label className="ui-label text-[11px] text-[var(--muted)]">{def.label}</label>
      {def.type === 'select' && def.options && (
        <select
          value={current}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)] focus:border-[var(--orange)] focus:outline-none"
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
          className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)] focus:border-[var(--orange)] focus:outline-none"
        />
      )}
      {def.type === 'boolean' && (
        <button
          onClick={() => onChange(current !== 'true')}
          className={cn(
            'flex h-8 w-full items-center gap-[8px] rounded-[8px] border px-[10px] text-left font-saira text-[12px] transition-colors',
            current === 'true'
              ? 'border-[var(--orange-ring)] bg-[var(--orange-tint)] text-[var(--orange)]'
              : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:border-[var(--border-2)]'
          )}
        >
          <span className={cn('h-3 w-3 flex-shrink-0 rounded-[3px] border', current === 'true' ? 'border-[var(--orange)] bg-[var(--orange)]' : 'border-[var(--border-2)]')} />
          {current === 'true' ? 'Enabled' : 'Disabled'}
        </button>
      )}
      {def.type === 'text' && (
        <input
          type="text"
          value={current}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)] focus:border-[var(--orange)] focus:outline-none"
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
