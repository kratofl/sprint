import { useCallback, useRef } from 'react'
import { IconRotate } from '@tabler/icons-react'
import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stepper,
  cn,
} from '@sprint/ui'
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

const inspectorLabelClassName = 'ui-label text-[11px] text-[var(--muted)]'
const DEFAULT_FONT_OPTION_VALUE = '__default__'

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

      <BorderRow
        value={widget.style?.border}
        onChange={v => updateStyle({ border: v })}
        onReset={() => clearStyleField('border')}
      />
    </div>
  )
}

// BorderRow is a tri-state override of the widget type's default outline:
// Default (inherit the widget's metadata default), On (force outline), Off (hide it).
function BorderRow({ value, onChange, onReset }: {
  value: boolean | undefined
  onChange: (v: boolean) => void
  onReset: () => void
}) {
  const isSet = value !== undefined
  const options: { key: 'default' | 'on' | 'off'; label: string; active: boolean; apply: () => void }[] = [
    { key: 'default', label: 'Default', active: value === undefined, apply: onReset },
    { key: 'on', label: 'On', active: value === true, apply: () => onChange(true) },
    { key: 'off', label: 'Off', active: value === false, apply: () => onChange(false) },
  ]
  return (
    <div className="flex items-center gap-[8px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <span className={cn(inspectorLabelClassName, 'min-w-0 flex-1 truncate', isSet && 'text-[var(--text)]')}>
        Border
      </span>
      <div className="flex items-center gap-[2px]">
        {options.map(opt => (
          <Button
            key={opt.key}
            type="button"
            size="xs"
            variant={opt.active ? 'active' : 'neutral'}
            aria-pressed={opt.active}
            aria-label={`Border ${opt.key}`}
            onClick={opt.apply}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ConfigField({ def, value, onChange }: { def: ConfigDef; value: unknown; onChange: (v: unknown) => void }) {
  const current = value !== undefined ? String(value) : def.default
  const numericValue = Number(current)

  return (
    <div className="flex flex-col gap-[6px] border-b border-[var(--border)] px-[14px] py-[10px]">
      <label className={inspectorLabelClassName}>{def.label}</label>
      {def.type === 'select' && def.options && (
        <Select
          value={current}
          onValueChange={onChange}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {def.type === 'number' && (
        <Stepper
          inputLabel={def.label}
          value={Number.isFinite(numericValue) ? numericValue : 0}
          onChange={onChange}
        />
      )}
      {def.type === 'boolean' && (
        <Button
          type="button"
          variant={current === 'true' ? 'active' : 'outline'}
          size="sm"
          onClick={() => onChange(current !== 'true')}
          className="w-full justify-start gap-[8px] text-left"
        >
          <span className={cn('h-3 w-3 flex-shrink-0 rounded-[3px] border', current === 'true' ? 'border-[var(--orange)] bg-[var(--orange)]' : 'border-[var(--border-2)]')} />
          {current === 'true' ? 'Enabled' : 'Disabled'}
        </Button>
      )}
      {def.type === 'text' && (
        <Input
          type="text"
          value={current}
          onChange={e => onChange(e.target.value)}
          className="h-8"
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
          <IconButton
            label={`Reset ${label}`}
            icon={<IconRotate size={11} />}
            size="icon-xs"
            variant="ghost"
            onClick={onReset}
          />
        )}
      </div>
      <Select
        value={value ?? DEFAULT_FONT_OPTION_VALUE}
        onValueChange={nextValue => {
          if (nextValue === DEFAULT_FONT_OPTION_VALUE) {
            onReset()
            return
          }
          onChange(nextValue as FontStyle)
        }}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_FONT_OPTION_VALUE}>default</SelectItem>
          {FONT_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
          <IconButton
            label="Reset font size"
            icon={<IconRotate size={11} />}
            size="icon-xs"
            variant="ghost"
            onClick={onReset}
          />
        )}
      </div>
      <Stepper
        inputLabel="Font size"
        step={0.05}
        min={0.5}
        max={3}
        value={displayVal}
        onChange={onChange}
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
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            variant="neutral"
            size="icon-xs"
            className="flex-shrink-0 overflow-hidden p-0"
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
          </Button>

          <Input
            type="text"
            maxLength={7}
            defaultValue={hex!}
            key={hex!}
            onBlur={e => handleHexInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleHexInput(e.currentTarget.value) }}
            className="h-8 w-20"
          />

          <IconButton
            label={`Remove ${label} override`}
            icon={<IconRotate size={11} />}
            onClick={onReset}
            size="icon-xs"
            variant="ghost"
            className="flex-shrink-0"
          />
        </>
      ) : (
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          variant="outline"
          size="sm"
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
        </Button>
      )}
    </div>
  )
}
