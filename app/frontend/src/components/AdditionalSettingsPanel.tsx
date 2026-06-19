import { useCallback, useRef } from 'react'
import { IconRotate } from '@tabler/icons-react'
import { Button, IconButton, Input, SegmentedControl, Stepper, cn } from '@sprint/ui'
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
  { value: 'label', label: 'Bahnschrift / IBM Plex' },
  { value: 'bold', label: 'Bahnschrift Semibold' },
  { value: 'number', label: 'Bahnschrift Numbers' },
  { value: 'mono', label: 'IBM Plex Mono' },
]

type FormatOption = { value: string; label: string }

function withInheritedMarker(options: FormatOption[], inherited?: string) {
  return options.map(option => ({
    ...option,
    label: option.value === inherited
      ? (
        <span className="inline-flex items-center gap-1" title="Inherited from global">
          {option.label}
          <span className="text-[8px] text-[var(--text3)]">↑</span>
        </span>
      )
      : option.label,
  }))
}

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
        <h4 className="ui-label text-[11px] font-semibold text-[var(--text2)]">Additional settings</h4>
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
            label="Base and highlights"
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
            label="Semantic states"
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
            label="Domain signals"
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
          <Section label="Typography defaults">
            <TypographySection
              typography={typography ?? {}}
              globalTypography={globalTypography}
              onChange={onTypographyChange}
            />
          </Section>
        )}

        {onFormatPreferencesChange && (
          <Section label="Format preferences">
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
      <p className="ui-label text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">
        {label}
      </p>
      {description && (
        <p className="mb-3 font-sans tabular-nums text-[9px] leading-relaxed text-[var(--text2)]">
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
      <span className="font-sans tabular-nums text-[10px] text-[var(--text2)] flex-1 min-w-0 truncate">{label}</span>

      {/* Color swatch — opens native color picker */}
      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        variant="neutral"
        size="icon-xs"
        className="flex-shrink-0 overflow-hidden p-0"
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
      </Button>

      {/* Hex input */}
      <Input
        type="text"
        maxLength={7}
        defaultValue={hex}
        key={hex}
        onBlur={e => handleHexInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleHexInput(e.currentTarget.value) }}
        className="h-8 w-20 font-sans tabular-nums text-[10px]"
      />

      {/* Reset button */}
      <IconButton
        label={`Reset ${label}`}
        icon={<IconRotate size={11} />}
        onClick={onReset}
        disabled={!isOverridden}
        title={`${resetTitle} (${resetHex})`}
        size="icon-xs"
        variant="ghost"
      />
    </div>
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
        <SegmentedControl
          label="Lap format"
          options={withInheritedMarker([
            { value: 'M:SS.mmm', label: 'M:SS.mmm' },
            { value: 'M:SS.mm',  label: 'M:SS.mm' },
            { value: 'SS.mmm',   label: 'SS.mmm' },
          ], prefs.lapFormat === undefined ? globalEffective.lapFormat : undefined)}
          value={effective.lapFormat!}
          onChange={v => set('lapFormat', v as FormatPreferences['lapFormat'])}
        />
      </FormatRow>

      <FormatRow
        label="Speed"
        isOverridden={prefs.speedUnit !== undefined}
        onReset={() => reset('speedUnit')}
        showReset={globalPrefs !== undefined}
      >
        <SegmentedControl
          label="Speed"
          options={withInheritedMarker([
            { value: 'kph', label: 'KPH' },
            { value: 'mph', label: 'MPH' },
          ], prefs.speedUnit === undefined ? globalEffective.speedUnit : undefined)}
          value={effective.speedUnit!}
          onChange={v => set('speedUnit', v as FormatPreferences['speedUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Temperature"
        isOverridden={prefs.tempUnit !== undefined}
        onReset={() => reset('tempUnit')}
        showReset={globalPrefs !== undefined}
      >
        <SegmentedControl
          label="Temperature"
          options={withInheritedMarker([
            { value: 'c', label: '°C' },
            { value: 'f', label: '°F' },
          ], prefs.tempUnit === undefined ? globalEffective.tempUnit : undefined)}
          value={effective.tempUnit!}
          onChange={v => set('tempUnit', v as FormatPreferences['tempUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Pressure"
        isOverridden={prefs.pressureUnit !== undefined}
        onReset={() => reset('pressureUnit')}
        showReset={globalPrefs !== undefined}
      >
        <SegmentedControl
          label="Pressure"
          options={withInheritedMarker([
            { value: 'kpa', label: 'kPa' },
            { value: 'psi', label: 'PSI' },
            { value: 'bar', label: 'bar' },
          ], prefs.pressureUnit === undefined ? globalEffective.pressureUnit : undefined)}
          value={effective.pressureUnit!}
          onChange={v => set('pressureUnit', v as FormatPreferences['pressureUnit'])}
        />
      </FormatRow>

      <FormatRow
        label="Delta precision"
        isOverridden={prefs.deltaPrecision !== undefined}
        onReset={() => reset('deltaPrecision')}
        showReset={globalPrefs !== undefined}
      >
        <SegmentedControl
          label="Delta precision"
          options={withInheritedMarker([
            { value: '3', label: '0.123' },
            { value: '2', label: '0.12' },
          ], prefs.deltaPrecision === undefined ? globalEffective.deltaPrecision : undefined)}
          value={effective.deltaPrecision!}
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
        <SegmentedControl
          label="Value font"
          options={withInheritedMarker(TYPOGRAPHY_FONT_OPTIONS, typography.font === undefined ? globalTypography?.font : undefined)}
          value={effective.font ?? 'number'}
          onChange={value => set('font', value as TypographySettings['font'])}
        />
      </FormatRow>

      <FormatRow
        label="Label font"
        isOverridden={typography.labelFont !== undefined}
        onReset={() => reset('labelFont')}
        showReset={globalTypography !== undefined}
      >
        <SegmentedControl
          label="Label font"
          options={withInheritedMarker(TYPOGRAPHY_FONT_OPTIONS, typography.labelFont === undefined ? globalTypography?.labelFont : undefined)}
          value={effective.labelFont ?? 'label'}
          onChange={value => set('labelFont', value as TypographySettings['labelFont'])}
        />
      </FormatRow>

      <FormatRow
        label="Font scale"
        isOverridden={typography.fontScale !== undefined}
        onReset={() => reset('fontScale')}
        showReset={globalTypography !== undefined}
      >
        <Stepper
          inputLabel="Font scale"
          step={0.05}
          min={0.5}
          max={3}
          value={effective.fontScale ?? 1}
          onChange={next => set('fontScale', next)}
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
        <span className={cn('font-sans tabular-nums text-[10px] flex-1', isOverridden ? 'text-[var(--text)]' : 'text-[var(--text2)]')}>
          {label}
        </span>
        {showReset && (
          <IconButton
            label={`Reset ${label}`}
            icon={<IconRotate size={11} />}
            onClick={onReset}
            disabled={!isOverridden}
            title="Reset to global default"
            size="icon-xs"
            variant="ghost"
          />
        )}
      </div>
      {children}
    </div>
  )
}
