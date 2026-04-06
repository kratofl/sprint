import { cn } from '@sprint/ui'
import type { DashWidget, WidgetCatalogEntry, ConfigDef } from '../lib/dash'

interface WidgetPropertiesProps {
  widget: DashWidget | null
  catalog: WidgetCatalogEntry[]
  onUpdate: (updated: DashWidget) => void
}

export function WidgetProperties({ widget, catalog, onUpdate }: WidgetPropertiesProps) {
  if (!widget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted font-mono text-[10px] p-4">
        <span>SELECT A WIDGET</span>
        <span className="text-[9px] mt-1 text-text-disabled">to view properties</span>
      </div>
    )
  }

  const meta = catalog.find(c => c.type === widget.type)

  const updateConfig = (key: string, value: unknown) => {
    onUpdate({
      ...widget,
      config: { ...(widget.config ?? {}), [key]: value }
    })
  }

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-wider">{meta?.label ?? widget.type}</p>
        <p className="font-mono text-[9px] text-text-muted mt-0.5">
          {widget.col},{widget.row} · {widget.colSpan}×{widget.rowSpan}
        </p>
      </div>

      {meta?.configDefs && meta.configDefs.length > 0 ? (
        <div className="flex flex-col gap-px">
          {meta.configDefs.map(def => (
            <ConfigField
              key={def.key}
              def={def}
              value={widget.config?.[def.key]}
              onChange={value => updateConfig(def.key, value)}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 font-mono text-[9px] text-text-disabled">No configurable options</div>
      )}
    </div>
  )
}

function ConfigField({ def, value, onChange }: { def: ConfigDef; value: unknown; onChange: (v: unknown) => void }) {
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
