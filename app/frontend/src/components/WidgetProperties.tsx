import { useCallback, useRef } from 'react'
import { cn } from '@sprint/ui'
import type { DashWidget, WidgetCatalogEntry, ConfigDef, FontStyle, RGBAColor, WidgetStyle } from '../lib/dash'
import { rgbaToHex, hexToRgba } from '@/lib/color'

interface WidgetPropertiesProps {
  widget: DashWidget | null
  catalog: WidgetCatalogEntry[]
  onUpdate: (updated: DashWidget) => void
}

const FONT_OPTIONS: { value: FontStyle; label: string }[] = [
  { value: 'label',  label: 'Space Grotesk (default)' },
  { value: 'bold',   label: 'Space Grotesk Bold' },
  { value: 'number', label: 'JetBrains Mono Bold' },
  { value: 'mono',   label: 'JetBrains Mono' },
]

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

  const updateStyle = (patch: Partial<WidgetStyle>) => {
    onUpdate({ ...widget, style: { ...(widget.style ?? {}), ...patch } })
  }

  const clearStyleField = (key: keyof WidgetStyle) => {
    const next = { ...(widget.style ?? {}) }
    delete next[key]
    onUpdate({ ...widget, style: Object.keys(next).length > 0 ? next : undefined })
  }

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-wider">{meta?.name ?? widget.type}</p>
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

      <div className="border-t border-border mt-1">
        <div className="px-4 py-2">
          <p className="font-mono text-[9px] font-bold text-text-disabled uppercase tracking-wider">Style</p>
        </div>

        <FontSelectRow
          label="Font"
          value={widget.style?.font}
          onChange={v => updateStyle({ font: v })}
          onReset={() => clearStyleField('font')}
        />

        <FontSizeRow
          value={widget.style?.fontSize}
          onChange={v => updateStyle({ fontSize: v })}
          onReset={() => clearStyleField('fontSize')}
        />

        <FontSelectRow
          label="Label Font"
          value={widget.style?.labelFont}
          onChange={v => updateStyle({ labelFont: v })}
          onReset={() => clearStyleField('labelFont')}
        />

        <ColorRow
          label="Text Color"
          value={widget.style?.textColor}
          onChange={v => updateStyle({ textColor: v })}
          onReset={() => clearStyleField('textColor')}
        />

        <ColorRow
          label="Label Color"
          value={widget.style?.labelColor}
          onChange={v => updateStyle({ labelColor: v })}
          onReset={() => clearStyleField('labelColor')}
        />

        <ColorRow
          label="Background"
          value={widget.style?.background}
          onChange={v => updateStyle({ background: v })}
          onReset={() => clearStyleField('background')}
        />
      </div>
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
          className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
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
          className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
        />
      )}
      {def.type === 'boolean' && (
        <button
          onClick={() => onChange(current !== 'true')}
          className={cn(
            'flex items-center gap-2 px-2 py-1 border font-mono text-[10px] transition-colors w-full text-left',
            current === 'true'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-text-muted hover:border-border'
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
          className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
        />
      )}
    </div>
  )
}

function FontSelectRow({ label, value, onChange, onReset }: {
  label: string
  value: FontStyle | undefined
  onChange: (v: FontStyle) => void
  onReset: () => void
}) {
  const isSet = value !== undefined
  return (
    <div className="flex flex-col gap-1 px-4 py-2 border-b border-border/50">
      <div className="flex items-center justify-between">
        <label className={cn('font-mono text-[9px] uppercase tracking-wide', isSet ? 'text-foreground' : 'text-text-muted')}>
          {label}
        </label>
        {isSet && (
          <button type="button" onClick={onReset} className="text-text-disabled hover:text-foreground transition-colors" title="Reset">
            <ResetIcon />
          </button>
        )}
      </div>
      <select
        value={value ?? ''}
        onChange={e => {
          const v = e.target.value as FontStyle
          if (v) onChange(v); else onReset()
        }}
        className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
      >
        <option value="">— default —</option>
        {FONT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

function FontSizeRow({ value, onChange, onReset }: {
  value: number | undefined
  onChange: (v: number) => void
  onReset: () => void
}) {
  const isSet = value !== undefined && value !== 0
  const displayVal = isSet ? value : 1
  return (
    <div className="flex flex-col gap-1 px-4 py-2 border-b border-border/50">
      <div className="flex items-center justify-between">
        <label className={cn('font-mono text-[9px] uppercase tracking-wide', isSet ? 'text-foreground' : 'text-text-muted')}>
          Font Size
        </label>
        {isSet && (
          <button type="button" onClick={onReset} className="text-text-disabled hover:text-foreground transition-colors" title="Reset">
            <ResetIcon />
          </button>
        )}
      </div>
      <input
        type="number"
        step="0.05"
        min="0.5"
        max="3"
        value={displayVal}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v > 0) onChange(v); else onReset()
        }}
        className="w-full border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
      />
    </div>
  )
}

function ColorRow({ label, value, onChange, onReset }: {
  label: string
  value: RGBAColor | undefined
  onChange: (v: RGBAColor) => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hex = value ? rgbaToHex(value) : null
  const isSet = hex !== null

  const handleHexInput = useCallback((raw: string) => {
    const clean = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(hexToRgba(clean, value?.A ?? 255))
    }
  }, [onChange, value?.A])

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
      <span className={cn('font-mono text-[9px] uppercase tracking-wide flex-1 min-w-0 truncate', isSet ? 'text-foreground' : 'text-text-muted')}>
        {label}
      </span>

      {isSet ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-5 h-5 flex-shrink-0 border border-border rounded-sm overflow-hidden focus:outline-none focus:ring-1 focus:ring-accent"
            style={{ backgroundColor: hex! }}
            title={hex!}
          >
            <input
              ref={inputRef}
              type="color"
              value={hex!}
              className="sr-only"
              onChange={e => onChange(hexToRgba(e.target.value, value?.A ?? 255))}
            />
          </button>

          <input
            type="text"
            maxLength={7}
            defaultValue={hex!}
            key={hex!}
            onBlur={e => handleHexInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleHexInput(e.currentTarget.value) }}
            className="w-16 border border-border bg-bg-shell px-1 py-0.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
          />

          <button
            type="button"
            onClick={onReset}
            className="text-text-disabled hover:text-foreground transition-colors flex-shrink-0"
            title="Remove override"
          >
            <ResetIcon />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-mono text-[9px] text-text-disabled hover:text-foreground border border-dashed border-border hover:border-border px-2 py-0.5 transition-colors"
          title="Set color"
        >
          <input
            ref={inputRef}
            type="color"
            defaultValue="#ffffff"
            className="sr-only"
            onChange={e => onChange(hexToRgba(e.target.value, 255))}
          />
          set
        </button>
      )}
    </div>
  )
}

function ResetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5A3.5 3.5 0 1 1 5.5 9" />
      <polyline points="2,3 2,5.5 4.5,5.5" />
    </svg>
  )
}
