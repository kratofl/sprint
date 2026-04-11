import { useCallback, useRef } from 'react'
import { Button, cn } from '@sprint/ui'
import { type DashTheme, type DomainPalette, type RGBAColor } from '@/lib/dash'

// Color conversion helpers
export function rgbaToHex(c: RGBAColor): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(c.R)}${hex(c.G)}${hex(c.B)}`
}

export function hexToRgba(hex: string, alpha = 255): RGBAColor {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  return {
    R: parseInt(full.slice(0, 2), 16) || 0,
    G: parseInt(full.slice(2, 4), 16) || 0,
    B: parseInt(full.slice(4, 6), 16) || 0,
    A: alpha,
  }
}

interface AdditionalSettingsPanelProps {
  theme: Partial<DashTheme>
  domainPalette: Partial<DomainPalette>
  hardcodedDefaults: { theme: DashTheme; domain: DomainPalette }
  globalDefaults?: { theme: DashTheme; domain: DomainPalette }
  onChange: (theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => void
}

const THEME_ROWS: { key: keyof DashTheme; label: string }[] = [
  { key: 'primary', label: 'Primary (Driver)' },
  { key: 'accent',  label: 'Accent (Engineer)' },
  { key: 'fg',      label: 'Foreground' },
  { key: 'muted',   label: 'Muted' },
  { key: 'muted2',  label: 'Muted 2' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'danger',  label: 'Danger' },
  { key: 'surface', label: 'Surface' },
  { key: 'bg',      label: 'Background' },
  { key: 'border',  label: 'Border' },
  { key: 'rpmRed',  label: 'RPM Red Zone' },
]

const DOMAIN_ROWS: { key: keyof DomainPalette; label: string }[] = [
  { key: 'abs',      label: 'ABS' },
  { key: 'tc',       label: 'TC' },
  { key: 'brakeBias', label: 'Brake Bias' },
  { key: 'energy',   label: 'Energy' },
  { key: 'motor',    label: 'Motor' },
  { key: 'brakeMig', label: 'Brake Migration' },
]

export function AdditionalSettingsPanel({
  theme,
  domainPalette,
  hardcodedDefaults,
  globalDefaults,
  onChange,
}: AdditionalSettingsPanelProps) {
  const handleThemeChange = (key: keyof DashTheme, value: RGBAColor) => {
    onChange({ ...theme, [key]: value }, domainPalette)
  }

  const handleDomainChange = (key: keyof DomainPalette, value: RGBAColor) => {
    onChange(theme, { ...domainPalette, [key]: value })
  }

  const handleResetAllToHardcoded = () => {
    onChange({ ...hardcodedDefaults.theme }, { ...hardcodedDefaults.domain })
  }

  const handleResetAllToGlobal = () => {
    if (!globalDefaults) return
    onChange({ ...globalDefaults.theme }, { ...globalDefaults.domain })
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-6 py-3 flex-shrink-0">
        <h4 className="terminal-header text-[10px] font-bold text-text-muted">ADDITIONAL_SETTINGS</h4>
        <div className="flex items-center gap-2">
          {globalDefaults && (
            <Button size="xs" variant="neutral" onClick={handleResetAllToGlobal}>
              RESET TO GLOBAL
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={handleResetAllToHardcoded}>
            RESET ALL
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <Section label="THEME_COLORS">
          {THEME_ROWS.map(({ key, label }) => {
            const current = theme[key] ?? hardcodedDefaults.theme[key]
            const defaultVal = hardcodedDefaults.theme[key]
            return (
              <ColorRow
                key={key}
                label={label}
                value={current}
                defaultValue={defaultVal}
                onChange={v => handleThemeChange(key, v)}
                onReset={() => handleThemeChange(key, defaultVal)}
              />
            )
          })}
        </Section>

        <Section label="DOMAIN_COLORS">
          {DOMAIN_ROWS.map(({ key, label }) => {
            const current = domainPalette[key] ?? hardcodedDefaults.domain[key]
            const defaultVal = hardcodedDefaults.domain[key]
            if (!current || !defaultVal) return null
            return (
              <ColorRow
                key={key}
                label={label}
                value={current}
                defaultValue={defaultVal}
                onChange={v => handleDomainChange(key, v)}
                onReset={() => handleDomainChange(key, defaultVal)}
              />
            )
          })}
        </Section>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="terminal-header text-[9px] font-bold text-text-disabled uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

interface ColorRowProps {
  label: string
  value: RGBAColor
  defaultValue: RGBAColor
  onChange: (v: RGBAColor) => void
  onReset: () => void
}

function ColorRow({ label, value, defaultValue, onChange, onReset }: ColorRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hex = rgbaToHex(value)
  const isDefault = hex === rgbaToHex(defaultValue)

  const handleHexInput = useCallback((raw: string) => {
    const clean = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(hexToRgba(clean, value.A))
    }
  }, [onChange, value.A])

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="font-mono text-[10px] text-text-muted flex-1 min-w-0 truncate">{label}</span>

      {/* Color swatch — opens native color picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-6 h-6 flex-shrink-0 border border-border rounded-sm overflow-hidden focus:outline-none focus:ring-1 focus:ring-accent"
        style={{ backgroundColor: hex }}
        title={hex}
      >
        <input
          ref={inputRef}
          type="color"
          value={hex}
          className="sr-only"
          onChange={e => onChange(hexToRgba(e.target.value, value.A))}
        />
      </button>

      {/* Hex input */}
      <input
        type="text"
        maxLength={7}
        defaultValue={hex}
        key={hex}
        onBlur={e => handleHexInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleHexInput(e.currentTarget.value) }}
        className={cn(
          'w-20 bg-background border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground',
          'focus:outline-none focus:border-accent',
        )}
      />

      {/* Reset button */}
      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        className="text-text-disabled hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
        title="Reset to default"
      >
        <ResetIcon />
      </button>
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
