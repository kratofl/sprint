import { Button, Stepper, cn } from '@sprint/ui'
import {
  type AlertColorMode,
  type AlertConfig,
  type AlertDisplayMode,
  type AlertMeta,
  type DomainPalette,
} from '@/lib/dash'

const DOMAIN_COLOR_MAP: Record<string, string> = {
  tc:      'var(--green)',
  abs:     'var(--amber)',
  motor:   'var(--orange)',
  primary: 'var(--orange)',
  accent:  'var(--orange)',
  success: 'var(--green)',
  warning: 'var(--amber)',
  danger:  'var(--red)',
}

function resolveSwatchColor(colorRef: string, domain?: Partial<DomainPalette>): string {
  if (domain) {
    const val = domain[colorRef as keyof DomainPalette]
    if (val && typeof val === 'object' && 'R' in val) {
      const { R, G, B } = val as { R: number; G: number; B: number }
      return `rgb(${R},${G},${B})`
    }
  }
  return DOMAIN_COLOR_MAP[colorRef] ?? 'var(--text3)'
}

interface AlertsEditorProps {
  config: AlertConfig
  catalog: AlertMeta[]
  domainPalette?: Partial<DomainPalette>
  onChange: (config: AlertConfig) => void
}

// AlertsEditor presents one shared set of alert display controls above a catalog
// of alert tiles with on/off toggles. There is no per-instance placement or
// configuration — enabling an alert is a single toggle, and disabling it is
// non-destructive (the shared settings are untouched).
export function AlertsEditor({ config, catalog, domainPalette, onChange }: AlertsEditorProps) {
  const enabled = new Set(config.enabledTypes ?? [])
  const displayMode: AlertDisplayMode = config.displayMode ?? 'full'
  const colorMode: AlertColorMode = config.colorMode ?? 'normal'
  const duration = config.duration ?? 1.5

  const patch = (next: Partial<AlertConfig>) => {
    onChange({ displayMode, colorMode, duration, enabledTypes: [...enabled], ...next })
  }

  const toggleType = (type: string) => {
    const next = new Set(enabled)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    patch({ enabledTypes: [...next].sort() })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-deep)]">
      {/* Shared alert settings — configured once for the whole dashboard. */}
      <section className="flex flex-col gap-[14px] border-b border-[var(--border)] bg-[var(--panel)] px-[16px] py-[14px]">
        <h4 className="ui-label text-[11px] font-semibold text-[var(--text2)]">Alert settings</h4>

        <SegmentedRow
          label="Display"
          options={[
            { value: 'full', label: 'Full' },
            { value: 'middle', label: 'Middle' },
          ]}
          value={displayMode}
          onChange={value => patch({ displayMode: value as AlertDisplayMode })}
        />

        <SegmentedRow
          label="Color"
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'inverted', label: 'Inverted' },
          ]}
          value={colorMode}
          onChange={value => patch({ colorMode: value as AlertColorMode })}
        />

        <div className="flex items-center justify-between gap-[10px]">
          <span className="ui-label text-[11px] text-[var(--muted)]">Duration (s)</span>
          <div className="w-[140px]">
            <Stepper
              inputLabel="Alert duration"
              value={duration}
              step={0.5}
              min={0.5}
              onChange={value => patch({ duration: value })}
            />
          </div>
        </div>
      </section>

      {/* Alert catalog — each type is a toggle tile. */}
      <div className="flex flex-col gap-[10px] p-[12px]">
        {catalog.length === 0 ? (
          <div className="p-[10px] text-center font-sans text-[12px] tabular-nums text-[var(--muted)]">Loading…</div>
        ) : (
          catalog.map(meta => {
            const isOn = enabled.has(meta.type)
            return (
              <div
                key={meta.type}
                className={cn(
                  'flex items-center gap-[10px] rounded-alert border p-[10px] transition-colors',
                  isOn
                    ? 'border-[var(--orange)] bg-[color-mix(in_srgb,var(--orange)_8%,transparent)]'
                    : 'border-[var(--border)] bg-[var(--panel)]',
                )}
              >
                <div className="flex size-[28px] flex-shrink-0 items-center justify-center rounded-tile border border-[var(--amber-ring)] bg-[var(--amber-tint)]">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: resolveSwatchColor(meta.defaultColor, domainPalette) }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[13px] font-bold text-[var(--text)]">{meta.label}</span>
                  <p className="font-sans text-[10px] leading-tight tabular-nums text-[var(--muted)]">{meta.description}</p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant={isOn ? 'active' : 'neutral'}
                  aria-pressed={isOn}
                  aria-label={`Toggle ${meta.label}`}
                  onClick={() => toggleType(meta.type)}
                >
                  {isOn ? 'On' : 'Off'}
                </Button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SegmentedRow({ label, options, value, onChange }: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-[10px]">
      <span className="ui-label text-[11px] text-[var(--muted)]">{label}</span>
      <div className="flex items-center gap-[2px]">
        {options.map(opt => (
          <Button
            key={opt.value}
            type="button"
            size="xs"
            variant={value === opt.value ? 'active' : 'neutral'}
            aria-pressed={value === opt.value}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
