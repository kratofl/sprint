import { useCallback, useRef } from 'react'
import { Button, cn } from '@sprint/ui'
import {
  type DashTheme,
  type DomainPalette,
  type RGBAColor,
  type FormatPreferences,
  type TypographySettings,
  type FontStyle,
  clearDomainColorOverride,
  clearThemeColorOverride,
  setDomainColorOverride,
  setThemeColorOverride,
} from '@/lib/dash'
import { DEFAULT_FORMAT_PREFERENCES } from '@/lib/format'
import { rgbaToHex, hexToRgba } from '@/lib/color'
import { getDomainColorRowState, getThemeColorRowState } from './additionalSettingsPanelState'

export { rgbaToHex, hexToRgba }

interface AdditionalSettingsPanelProps {
  theme: Partial<DashTheme>
  domainPalette: Partial<DomainPalette>
  hardcodedDefaults: { theme: DashTheme; domain: DomainPalette }
  globalDefaults?: { theme: DashTheme; domain: DomainPalette }
  typography?: Partial<TypographySettings>
  globalTypography?: Partial<TypographySettings>
  formatPreferences?: Partial<FormatPreferences>
  globalFormatPreferences?: Partial<FormatPreferences>
  onChange: (theme: Partial<DashTheme>, domain: Partial<DomainPalette>) => void
  onTypographyChange?: (typography: Partial<TypographySettings>) => void
  onFormatPreferencesChange?: (prefs: Partial<FormatPreferences>) => void
}

const BASE_THEME_ROWS: { key: keyof DashTheme; label: string }[] = [
  { key: 'primary', label: 'Primary (Driver)' },
  { key: 'accent',  label: 'Accent (Engineer)' },
  { key: 'fg',      label: 'Foreground' },
  { key: 'muted',   label: 'Muted' },
  { key: 'muted2',  label: 'Muted 2' },
  { key: 'surface', label: 'Surface' },
  { key: 'bg',      label: 'Background' },
  { key: 'border',  label: 'Border' },
]

const SEMANTIC_THEME_ROWS: { key: keyof DashTheme; label: string }[] = [
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'danger',  label: 'Danger' },
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

const TYPOGRAPHY_FONT_OPTIONS: { value: FontStyle; label: string }[] = [
  { value: 'label', label: 'Space Grotesk' },
  { value: 'bold', label: 'Space Grotesk Bold' },
  { value: 'number', label: 'JetBrains Mono Bold' },
  { value: 'mono', label: 'JetBrains Mono' },
]

export function AdditionalSettingsPanel({
  theme,
  domainPalette,
  hardcodedDefaults,
  globalDefaults,
  typography,
  globalTypography,
  formatPreferences,
  globalFormatPreferences,
  onChange,
  onTypographyChange,
  onFormatPreferencesChange,
}: AdditionalSettingsPanelProps) {
  const inheritsGlobalColors = globalDefaults !== undefined
  const inheritedTheme = globalDefaults?.theme ?? hardcodedDefaults.theme
  const inheritedDomain = globalDefaults?.domain ?? hardcodedDefaults.domain

  const handleThemeChange = (key: keyof DashTheme, value: RGBAColor) => {
    onChange(setThemeColorOverride(theme, key, value), domainPalette)
  }

  const handleDomainChange = (key: keyof DomainPalette, value: RGBAColor) => {
    onChange(theme, setDomainColorOverride(domainPalette, key, value))
  }

  const handleResetAllToHardcoded = () => {
    onChange({ ...hardcodedDefaults.theme }, { ...hardcodedDefaults.domain })
    onTypographyChange?.({})
    onFormatPreferencesChange?.({})
  }

  const handleResetAllToGlobal = () => {
    if (!globalDefaults) return
    onChange({}, {})
    onTypographyChange?.({})
    onFormatPreferencesChange?.({})
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-6 py-3 flex-shrink-0">
        <h4 className="terminal-header text-[10px] font-bold text-text-muted">ADDITIONAL_SETTINGS</h4>
        <div className="flex items-center gap-2">
          {inheritsGlobalColors && (
            <Button size="xs" variant="neutral" onClick={handleResetAllToGlobal}>
              INHERIT_GLOBALS
            </Button>
          )}
          {!inheritsGlobalColors && (
            <Button size="xs" variant="ghost" onClick={handleResetAllToHardcoded}>
              RESET ALL
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <div className="grid gap-6 xl:grid-cols-3">
          <Section
            label="BASE_AND_HIGHLIGHTS"
            description="Neutral surfaces, text, and the two general-purpose highlight colors."
          >
            {BASE_THEME_ROWS.map(({ key, label }) => {
              const state = getThemeColorRowState({
                key,
                theme,
                inheritedTheme,
                hardcodedTheme: hardcodedDefaults.theme,
                inheritsGlobalColors,
              })
              return (
                <ColorRow
                  key={key}
                  label={label}
                  value={state.value}
                  defaultValue={state.defaultValue}
                  isOverridden={state.isOverridden}
                  onChange={v => handleThemeChange(key, v)}
                  onReset={() => inheritsGlobalColors
                    ? onChange(clearThemeColorOverride(theme, key) ?? {}, domainPalette)
                    : handleThemeChange(key, hardcodedDefaults.theme[key])}
                  resetTitle={inheritsGlobalColors ? 'Clear override and inherit global' : 'Reset to default'}
                />
              )
            })}
          </Section>

          <Section
            label="SEMANTIC_STATES"
            description="Reserve these for state meaning so alerts and thresholds stay readable."
          >
            {SEMANTIC_THEME_ROWS.map(({ key, label }) => {
              const state = getThemeColorRowState({
                key,
                theme,
                inheritedTheme,
                hardcodedTheme: hardcodedDefaults.theme,
                inheritsGlobalColors,
              })
              return (
                <ColorRow
                  key={key}
                  label={label}
                  value={state.value}
                  defaultValue={state.defaultValue}
                  isOverridden={state.isOverridden}
                  onChange={v => handleThemeChange(key, v)}
                  onReset={() => inheritsGlobalColors
                    ? onChange(clearThemeColorOverride(theme, key) ?? {}, domainPalette)
                    : handleThemeChange(key, hardcodedDefaults.theme[key])}
                  resetTitle={inheritsGlobalColors ? 'Clear override and inherit global' : 'Reset to default'}
                />
              )
            })}
          </Section>

          <Section
            label="DOMAIN_SIGNALS"
            description="Racing-system colors that widgets should use only for their matching domains."
          >
            {DOMAIN_ROWS.map(({ key, label }) => {
              const state = getDomainColorRowState({
                key,
                domainPalette,
                inheritedDomain,
                hardcodedDomain: hardcodedDefaults.domain,
                inheritsGlobalColors,
              })
              if (!state) return null
              return (
                <ColorRow
                  key={key}
                  label={label}
                  value={state.value}
                  defaultValue={state.defaultValue}
                  isOverridden={state.isOverridden}
                  onChange={v => handleDomainChange(key, v)}
                  onReset={() => inheritsGlobalColors
                    ? onChange(theme, clearDomainColorOverride(domainPalette, key) ?? {})
                    : handleDomainChange(key, hardcodedDefaults.domain[key]!)}
                  resetTitle={inheritsGlobalColors ? 'Clear override and inherit global' : 'Reset to default'}
                />
              )
            })}
          </Section>
        </div>

        {onTypographyChange && (
          <Section label="TYPOGRAPHY_DEFAULTS">
            <TypographySection
              typography={typography ?? {}}
              globalTypography={globalTypography}
              onChange={onTypographyChange}
            />
          </Section>
        )}

        {onFormatPreferencesChange && (
          <Section label="FORMAT_PREFERENCES">
            <FormatPreferencesSection
              prefs={formatPreferences ?? {}}
              globalPrefs={globalFormatPreferences}
              onChange={onFormatPreferencesChange}
            />
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="terminal-header text-[9px] font-bold text-text-disabled uppercase tracking-wider mb-2">
        {label}
      </p>
      {description && (
        <p className="mb-3 font-mono text-[9px] leading-relaxed text-text-muted">
          {description}
        </p>
      )}
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
  isOverridden: boolean
  onChange: (v: RGBAColor) => void
  onReset: () => void
  resetTitle: string
}

function ColorRow({ label, value, defaultValue, isOverridden, onChange, onReset, resetTitle }: ColorRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hex = rgbaToHex(value)
  const resetHex = rgbaToHex(defaultValue)

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
          'w-20 border border-border bg-bg-shell px-1.5 py-0.5 font-mono text-[10px] text-foreground',
          'focus:outline-none focus:border-accent',
        )}
      />

      {/* Reset button */}
      <button
        type="button"
        onClick={onReset}
        disabled={!isOverridden}
        className="text-text-disabled hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
        title={`${resetTitle} (${resetHex})`}
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

interface FormatPrefsSectionProps {
  prefs: Partial<FormatPreferences>
  globalPrefs?: Partial<FormatPreferences>
  onChange: (prefs: Partial<FormatPreferences>) => void
}

function FormatPreferencesSection({ prefs, globalPrefs, onChange }: FormatPrefsSectionProps) {
  const effective = { ...DEFAULT_FORMAT_PREFERENCES, ...globalPrefs, ...prefs }
  const globalEffective = { ...DEFAULT_FORMAT_PREFERENCES, ...globalPrefs }

  const set = <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) =>
    onChange({ ...prefs, [key]: value })

  const reset = <K extends keyof FormatPreferences>(key: K) => {
    const next = { ...prefs }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <FormatRow
        label="Lap format"
        isOverridden={prefs.lapFormat !== undefined}
        onReset={() => reset('lapFormat')}
        showReset={globalPrefs !== undefined}
      >
        <ToggleGroup
          options={[
            { value: 'M:SS.mmm', label: 'M:SS.mmm' },
            { value: 'M:SS.mm',  label: 'M:SS.mm' },
            { value: 'SS.mmm',   label: 'SS.mmm' },
          ]}
          value={effective.lapFormat!}
          inherited={prefs.lapFormat === undefined ? globalEffective.lapFormat : undefined}
          onChange={v => set('lapFormat', v as FormatPreferences['lapFormat'])}
        />
      </FormatRow>

      <FormatRow
        label="Speed"
        isOverridden={prefs.speedUnit !== undefined}
        onReset={() => reset('speedUnit')}
        showReset={globalPrefs !== undefined}
      >
        <ToggleGroup
          options={[
            { value: 'kph', label: 'KPH' },
            { value: 'mph', label: 'MPH' },
          ]}
          value={effective.speedUnit!}
          inherited={prefs.speedUnit === undefined ? globalEffective.speedUnit : undefined}
          onChange={v => set('speedUnit', v as FormatPreferences['speedUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Temperature"
        isOverridden={prefs.tempUnit !== undefined}
        onReset={() => reset('tempUnit')}
        showReset={globalPrefs !== undefined}
      >
        <ToggleGroup
          options={[
            { value: 'c', label: '°C' },
            { value: 'f', label: '°F' },
          ]}
          value={effective.tempUnit!}
          inherited={prefs.tempUnit === undefined ? globalEffective.tempUnit : undefined}
          onChange={v => set('tempUnit', v as FormatPreferences['tempUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Pressure"
        isOverridden={prefs.pressureUnit !== undefined}
        onReset={() => reset('pressureUnit')}
        showReset={globalPrefs !== undefined}
      >
        <ToggleGroup
          options={[
            { value: 'kpa', label: 'kPa' },
            { value: 'psi', label: 'PSI' },
            { value: 'bar', label: 'bar' },
          ]}
          value={effective.pressureUnit!}
          inherited={prefs.pressureUnit === undefined ? globalEffective.pressureUnit : undefined}
          onChange={v => set('pressureUnit', v as FormatPreferences['pressureUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Delta precision"
        isOverridden={prefs.deltaPrecision !== undefined}
        onReset={() => reset('deltaPrecision')}
        showReset={globalPrefs !== undefined}
      >
        <ToggleGroup
          options={[
            { value: '3', label: '0.123' },
            { value: '2', label: '0.12' },
          ]}
          value={effective.deltaPrecision!}
          inherited={prefs.deltaPrecision === undefined ? globalEffective.deltaPrecision : undefined}
          onChange={v => set('deltaPrecision', v as FormatPreferences['deltaPrecision'])}
        />
      </FormatRow>
    </div>
  )
}

function TypographySection({
  typography,
  globalTypography,
  onChange,
}: {
  typography: Partial<TypographySettings>
  globalTypography?: Partial<TypographySettings>
  onChange: (typography: Partial<TypographySettings>) => void
}) {
  const effective = { ...globalTypography, ...typography }

  const set = <K extends keyof TypographySettings>(key: K, value: TypographySettings[K]) =>
    onChange({ ...typography, [key]: value })

  const reset = <K extends keyof TypographySettings>(key: K) => {
    const next = { ...typography }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <FormatRow
        label="Value font"
        isOverridden={typography.font !== undefined}
        onReset={() => reset('font')}
        showReset={globalTypography !== undefined}
      >
        <ToggleGroup
          options={TYPOGRAPHY_FONT_OPTIONS}
          value={effective.font ?? 'number'}
          inherited={typography.font === undefined ? globalTypography?.font : undefined}
          onChange={value => set('font', value as TypographySettings['font'])}
        />
      </FormatRow>

      <FormatRow
        label="Label font"
        isOverridden={typography.labelFont !== undefined}
        onReset={() => reset('labelFont')}
        showReset={globalTypography !== undefined}
      >
        <ToggleGroup
          options={TYPOGRAPHY_FONT_OPTIONS}
          value={effective.labelFont ?? 'label'}
          inherited={typography.labelFont === undefined ? globalTypography?.labelFont : undefined}
          onChange={value => set('labelFont', value as TypographySettings['labelFont'])}
        />
      </FormatRow>

      <FormatRow
        label="Font scale"
        isOverridden={typography.fontScale !== undefined}
        onReset={() => reset('fontScale')}
        showReset={globalTypography !== undefined}
      >
        <input
          type="number"
          step="0.05"
          min="0.5"
          max="3"
          value={effective.fontScale ?? 1}
          onChange={event => {
            const next = parseFloat(event.target.value)
            if (!Number.isNaN(next) && next > 0) set('fontScale', next)
          }}
          className="w-24 border border-border bg-bg-shell px-2 py-1 font-mono text-[10px] text-foreground focus:outline-none focus:border-accent"
        />
      </FormatRow>
    </div>
  )
}

function FormatRow({
  label,
  isOverridden,
  showReset,
  onReset,
  children,
}: {
  label: string
  isOverridden: boolean
  showReset: boolean
  onReset: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-[10px] flex-1', isOverridden ? 'text-foreground' : 'text-text-muted')}>
          {label}
        </span>
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={!isOverridden}
            className="text-text-disabled hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Reset to global default"
          >
            <ResetIcon />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function ToggleGroup({
  options,
  value,
  inherited,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  inherited?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(opt => {
        const isActive = opt.value === value
        const isInherited = opt.value === inherited
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] transition-colors',
              isActive && !isInherited
                ? 'border-primary text-primary bg-primary/5'
                : isActive && isInherited
                  ? 'border-border text-text-muted border-dashed'
                  : 'border-border text-text-disabled hover:border-border hover:text-foreground',
            )}
            title={isInherited ? 'Inherited from global' : undefined}
          >
            {opt.label}
            {isInherited && isActive && (
              <span className="text-[8px] text-text-disabled">↑</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
