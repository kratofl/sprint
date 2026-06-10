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
  { value: 'label',  label: 'Bahnschrift / IBM Plex' },
  { value: 'bold',   label: 'Bahnschrift Semibold' },
  { value: 'number', label: 'Bahnschrift Numbers' },
  { value: 'mono',   label: 'IBM Plex Mono' },
]

const inspectorInputClassName = 'h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)] focus:border-[var(--orange)] focus:outline-none'
const inspectorLabelClassName = 'ui-label text-[11px] text-[var(--muted)]'

export function WidgetProperties({ widget, catalog, onUpdate }: WidgetPropertiesProps) {
  if (!widget) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-[12px] text-text-muted">
        <span>Select a widget</span>
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
        <div className="px-1 py-0.5 text-[12px] text-text-disabled">No configurable options</div>
      )}
    </div>
  )
}

interface WidgetStylePropertiesProps {
  widget: DashWidget
  onUpdate: (updated: DashWidget) => void
}

export function WidgetStyleProperties({ widget, onUpdate }: WidgetStylePropertiesProps) {
  const updateStyle = (patch: Partial<WidgetStyle>) => {
    onUpdate({ ...widget, style: { ...(widget.style ?? {}), ...patch } })
  }

  const clearStyleField = (key: keyof WidgetStyle) => {
    const next = { ...(widget.style ?? {}) }
    delete next[key]
    onUpdate({ ...widget, style: Object.keys(next).length > 0 ? next : undefined })
  }

  return (
    <div>
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
  )
}

function ConfigField({ def, value, onChange }: { def: ConfigDef; value: unknown; onChange: (v: unknown) => void }) {
  const current = value !== undefined ? String(value) : def.default

  return (
    <div className="flex flex-col gap-[6px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <label className={inspectorLabelClassName}>{def.label}</label>
      {def.type === 'select' && def.options && (
        <select
          value={current}
          onChange={e => onChange(e.target.value)}
          className={inspectorInputClassName}
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
          className={inspectorInputClassName}
        />
      )}
      {def.type === 'boolean' && (
        <button
          onClick={() => onChange(current !== 'true')}
          className={cn(
            'flex h-8 w-full items-center gap-[8px] rounded-[8px] border px-[10px] text-left text-[12px] transition-colors',
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
          className={inspectorInputClassName}
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
    <div className="flex flex-col gap-[6px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <div className="flex items-center justify-between">
        <label className={cn(inspectorLabelClassName, isSet && 'text-[var(--text)]')}>
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
        className={inspectorInputClassName}
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
    <div className="flex flex-col gap-[6px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <div className="flex items-center justify-between">
        <label className={cn(inspectorLabelClassName, isSet && 'text-[var(--text)]')}>
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
        className={inspectorInputClassName}
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
    <div className="flex items-center gap-[8px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <span className={cn(inspectorLabelClassName, 'min-w-0 flex-1 truncate', isSet && 'text-[var(--text)]')}>
        {label}
      </span>

      {isSet ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--orange)]"
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
            className="h-8 w-20 rounded-[8px] border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-saira text-[12px] text-[var(--text)] focus:border-[var(--orange)] focus:outline-none"
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
          className="h-8 rounded-[8px] border border-dashed border-[var(--border)] px-[10px] text-[11px] text-[var(--muted-2)] transition-colors hover:border-[var(--border-2)] hover:text-[var(--text)]"
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
