// Pure color + font resolution extracted from WidgetPreview.tsx.
//
// These map a widget's ColorRef/ColorExpr and FontStyle onto concrete CSS,
// using the active theme, domain palette, and per-widget style overrides. No
// DOM/React — only type imports from @/lib/dash (erased at runtime, so this
// module loads under `node --test` without resolving the @ alias).
import type {
  ColorRef,
  RGBAColor,
  ColorExpr,
  DashTheme,
  DomainPalette,
  WidgetStyle,
  FontStyle,
} from '@/lib/dash'
// Relative (not '@/') so this module still loads under `node --test`, which
// does not resolve the @ alias. lib/color.ts is the canonical RGBA→CSS home.
import { rgbaToCss } from '../../lib/color.ts'

export function toCSS(c: RGBAColor): string {
  return rgbaToCss(c)
}

export function resolveRef(
  ref: ColorRef | undefined,
  theme: DashTheme,
  dp?: DomainPalette,
  style?: WidgetStyle,
): string {
  if (!ref) return 'rgba(255,255,255,0.5)'
  if (ref === 'fg'      && style?.textColor)  return toCSS(style.textColor)
  if (ref === 'muted'   && style?.labelColor) return toCSS(style.labelColor)
  if (ref === 'surface' && style?.background) return toCSS(style.background)
  switch (ref) {
    case 'primary':   return toCSS(theme.primary)
    case 'accent':    return toCSS(theme.accent)
    case 'fg':        return toCSS(theme.fg)
    case 'muted':     return toCSS(theme.muted)
    case 'muted2':    return toCSS(theme.muted2)
    case 'success':   return toCSS(theme.success)
    case 'warning':   return toCSS(theme.warning)
    case 'danger':    return toCSS(theme.danger)
    case 'surface':   return toCSS(theme.surface)
    case 'bg':        return toCSS(theme.bg)
    case 'border':    return toCSS(theme.border)
    case 'rpmred':    return toCSS(theme.rpmRed)
    case 'abs':       return toCSS(dp?.abs       ?? theme.warning)
    case 'tc':        return toCSS(dp?.tc        ?? theme.accent)
    case 'brakeBias': return toCSS(dp?.brakeBias ?? theme.warning)
    case 'energy':    return toCSS(dp?.energy    ?? theme.success)
    case 'motor':     return toCSS(dp?.motor     ?? theme.primary)
    case 'brakeMig':  return toCSS(dp?.brakeMig  ?? theme.accent)
    default:          return 'rgba(255,255,255,0.5)'
  }
}

export function resolveExpr(
  expr: ColorExpr | undefined,
  theme: DashTheme,
  dp?: DomainPalette,
  style?: WidgetStyle,
): string {
  return resolveRef(expr?.ref ?? 'fg', theme, dp, style)
}

// ── Static placeholder values per binding path ────────────────────────────────

export const PLACEHOLDERS: Record<string, string> = {
  'car.gearStr':           '3',
  'car.speedMS':           '247',
  'car.speedKPH':          '247',
  'car.rpm':               '8 543',
  'car.rpmPct':            '0.7',
  'car.throttle':          '0.85',
  'car.brake':             '0.2',
  'car.fuel':              '32.5',
  'car.fuelLapsRemaining': '5.2',
  'car.fuelPerLap':        '3.1',
  'car.brakeBiasPct':      '57.3',
  'car.brakeBiasRear':     '0.57',
  'car.brakeMigration':    '2',
  'lap.currentLapTime':    '1:34.567',
  'lap.lastLapTime':       '1:34.123',
  'lap.bestLapTime':       '1:33.892',
  'lap.targetLapTime':     '1:33.500',
  'lap.delta':             '+0.234',
  'lap.counterStr':        '5 / 20',
  'lap.currentLap':        '5',
  'lap.sector1Time':       '34.1',
  'lap.sector2Time':       '21.4',
  'lap.sector':            '2',
  'race.positionStr':      'P3',
  'race.gapAhead':         '+1.234',
  'race.gapBehind':        '-2.456',
  'electronics.tc':        '2',
  'electronics.tcCut':     '3',
  'electronics.tcSlip':    '4',
  'electronics.abs':       '3',
  'electronics.motorMap':  '5',
  'session.sessionTime':   '12:34',
  'session.track':         'Silverstone',
  'session.car':           'GT3 #42',
  'session.sessionType':   'Race',
  'penalties.incidents':   '3',
  'energy.virtualEnergy':  '4.2',
  'flags.activeText':      'GREEN',
  'tires.fl.avgTemp':      '93.0',
  'tires.fr.avgTemp':      '94.0',
  'tires.rl.avgTemp':      '90.0',
  'tires.rr.avgTemp':      '91.0',
  'tires.fl.coreTemp':     '95.0',
  'tires.fr.coreTemp':     '96.0',
  'tires.rl.coreTemp':     '92.0',
  'tires.rr.coreTemp':     '93.0',
}

export function placeholder(binding?: string, format?: string, text?: string): string {
  if (text) return text
  if (!binding) return '—'
  if (PLACEHOLDERS[binding]) return PLACEHOLDERS[binding]
  if (format === 'lap' || format === 'sector') return '1:34.567'
  if (format === 'delta') return '+0.234'
  if (format === 'speed') return '247'
  if (format === 'int')   return '0'
  if (format === 'gap')   return '+1.2'
  return '—'
}

// ── Font helpers ──────────────────────────────────────────────────────────────

export const FONT_MAP: Record<FontStyle, string> = {
  label:  'Bahnschrift, IBM Plex Sans Condensed, IBM Plex Sans, sans-serif',
  bold:   'Bahnschrift, IBM Plex Sans Condensed, IBM Plex Sans, sans-serif',
  number: 'Bahnschrift, IBM Plex Mono, ui-monospace, monospace',
  mono:   'Bahnschrift, IBM Plex Mono, ui-monospace, monospace',
}

export function fontFamily(f?: FontStyle): string { return FONT_MAP[f ?? 'label'] }
export function fontWeight(f?: FontStyle): number  { return f === 'bold' || f === 'number' ? 700 : 400 }

export function resolveFont(elemFont: FontStyle | undefined, style?: WidgetStyle): FontStyle {
  const f = elemFont ?? 'label'
  if ((f === 'number' || f === 'bold') && style?.font)      return style.font
  if ((f === 'label'  || f === 'mono') && style?.labelFont) return style.labelFont
  return f
}
