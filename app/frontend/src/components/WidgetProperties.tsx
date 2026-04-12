import { useCallback, useRef, useState } from 'react'
import { cn } from '@sprint/ui'
import type { DashWidget, WidgetCatalogEntry, ConfigDef, ColorRef, RGBAColor } from '../lib/dash'
import { rgbaToHex, hexToRgba } from '@/lib/color'

interface WidgetPropertiesProps {
  widget: DashWidget | null
  catalog: WidgetCatalogEntry[]
  onUpdate: (updated: DashWidget) => void
}

const STYLE_COLOR_ROWS: { key: ColorRef; label: string }[] = [
  { key: 'fg',      label: 'Value / Text' },
  { key: 'primary', label: 'Primary (Driver)' },
  { key: 'accent',  label: 'Accent (Engineer)' },
  { key: 'muted',   label: 'Label / Muted' },
  { key: 'surface', label: 'Background' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'danger',  label: 'Danger' },
]

const FONT_SCALE_OPTIONS = [
  { value: '0.7',  label: '0.7× (small)' },
  { value: '0.85', label: '0.85×' },
  { value: '1',    label: '1× (default)' },
  { value: '1.2',  label: '1.2×' },
  { value: '1.5',  label: '1.5× (large)' },
  { value: '2',    label: '2× (xlarge)' },
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

  const setColorOverride = (ref: ColorRef, rgba: RGBAColor) => {
    onUpdate({
      ...widget,
      styleOverrides: { ...(widget.styleOverrides ?? {}), [ref]: rgba },
    })
  }

  const clearColorOverride = (ref: ColorRef) => {
    const next = { ...(widget.styleOverrides ?? {}) }
    delete next[ref]
    onUpdate({ ...widget, styleOverrides: Object.keys(next).length > 0 ? next : undefined })
  }

  const fontScaleCurrent = widget.config?.['font_scale'] !== undefined
    ? String(widget.config['font_scale'])
    : '1'

  const activeOverrideCount = STYLE_COLOR_ROWS.filter(r => widget.styleOverrides?.[r.key] !== undefined).length
  const [styleOpen, setStyleOpen] = useState(activeOverrideCount > 0)

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

      <div className="border-t border-border mt-1 pt-1">
        <button
          onClick={() => setStyleOpen(o => !o)}
          className="flex items-center gap-1.5 w-full font-mono text-[9px] font-bold text-text-disabled uppercase tracking-wider px-4 py-2 hover:text-foreground transition-colors text-left"
        >
          <span>{styleOpen ? '▼' : '▶'}</span>
          <span>STYLE</span>
          {activeOverrideCount > 0 && (
            <span className="ml-auto text-accent font-normal">
              {activeOverrideCount} override{activeOverrideCount !== 1 ? 's' : ''}
            </span>
          )}
        </button>

        {/* Font scale — always visible */}
        <div className="flex flex-col gap-1 px-4 py-2.5 border-b border-border/50">
          <label className="font-mono text-[9px] text-text-muted uppercase tracking-wide">Font Scale</label>
          <select
            value={fontScaleCurrent}
            onChange={e => {
              const v = e.target.value
              if (v === '1') {
                const next = { ...(widget.config ?? {}) }
                delete next['font_scale']
                onUpdate({ ...widget, config: Object.keys(next).length > 0 ? next : undefined })
              } else {
                updateConfig('font_scale', parseFloat(v))
              }
            }}
            className="bg-[#141414] border border-border px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent w-full"
          >
            {FONT_SCALE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Color overrides — collapsible */}
        {styleOpen && STYLE_COLOR_ROWS.map(({ key, label }) => (
          <ColorOverrideRow
            key={key}
            label={label}
            value={widget.styleOverrides?.[key]}
            onChange={rgba => setColorOverride(key, rgba)}
            onReset={() => clearColorOverride(key)}
          />
        ))}
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

interface ColorOverrideRowProps {
  label: string
  value: RGBAColor | undefined
  onChange: (v: RGBAColor) => void
  onReset: () => void
}

function ColorOverrideRow({ label, value, onChange, onReset }: ColorOverrideRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hex = value ? rgbaToHex(value) : null
  const isOverridden = hex !== null

  const handleHexInput = useCallback((raw: string) => {
    const clean = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(hexToRgba(clean, value?.A ?? 255))
    }
  }, [onChange, value?.A])

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50">
      <span className={cn('font-mono text-[10px] flex-1 min-w-0 truncate', isOverridden ? 'text-foreground' : 'text-text-disabled')}>
        {label}
      </span>

      {isOverridden ? (
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
            className="w-16 bg-background border border-border px-1 py-0.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
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
          className="font-mono text-[9px] text-text-disabled hover:text-foreground border border-dashed border-border hover:border-border-strong px-2 py-0.5 transition-colors"
          title="Set override"
        >
          <input
            ref={inputRef}
            type="color"
            defaultValue="#ffffff"
            className="sr-only"
            onChange={e => onChange(hexToRgba(e.target.value, 255))}
          />
          override
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
