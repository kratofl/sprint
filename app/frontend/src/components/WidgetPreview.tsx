import type { ReactNode, CSSProperties } from 'react'
import type {
  DashWidget, DashTheme, DomainPalette, WidgetCatalogEntry,
  ColorRef, RGBAColor, ColorExpr, WidgetElement, FontStyle, WidgetStyle,
} from '@/lib/dash'

interface Props {
  widget:         DashWidget
  theme:          DashTheme
  domainPalette?: DomainPalette
  catalog?:       WidgetCatalogEntry[]
}

// ── Color resolution ──────────────────────────────────────────────────────────

function toCSS(c: RGBAColor): string {
  return `rgba(${c.R},${c.G},${c.B},${(c.A / 255).toFixed(3)})`
}

function resolveRef(
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

function resolveExpr(
  expr: ColorExpr | undefined,
  theme: DashTheme,
  dp?: DomainPalette,
  style?: WidgetStyle,
): string {
  return resolveRef(expr?.ref ?? 'fg', theme, dp, style)
}

// ── Static placeholder values per binding path ────────────────────────────────

const PLACEHOLDERS: Record<string, string> = {
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
}

function placeholder(binding?: string, format?: string, text?: string): string {
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

const FONT_MAP: Record<FontStyle, string> = {
  label:  'Space Grotesk, sans-serif',
  bold:   'Space Grotesk, sans-serif',
  number: 'JetBrains Mono, monospace',
  mono:   'JetBrains Mono, monospace',
}

function fontFamily(f?: FontStyle): string { return FONT_MAP[f ?? 'label'] }
function fontWeight(f?: FontStyle): number  { return f === 'bold' || f === 'number' ? 700 : 400 }

function resolveFont(elemFont: FontStyle | undefined, style?: WidgetStyle): FontStyle {
  const f = elemFont ?? 'label'
  if ((f === 'number' || f === 'bold') && style?.font)      return style.font
  if ((f === 'label'  || f === 'mono') && style?.labelFont) return style.labelFont
  return f
}

// ── Zone layout helpers ───────────────────────────────────────────────────────

// Flatten conditions to their then-branch for preview purposes.
function flattenElements(elems: WidgetElement[]): WidgetElement[] {
  const out: WidgetElement[] = []
  for (const e of elems) {
    if (e.kind === 'condition') out.push(...flattenElements(e.then ?? []))
    else out.push(e)
  }
  return out
}

const defaultFillYFrac = 0.5

function fillZoneYs(n: number): number[] {
  switch (n) {
    case 1:
      return [defaultFillYFrac]
    case 2:
      return [0.38, 0.72]
    case 3:
      return [0.30, 0.52, 0.74]
    case 4:
      return [0.20, 0.40, 0.60, 0.80]
    default: {
      if (n <= 0) return []
      const ys: number[] = []
      for (let i = 0; i < n; i += 1) ys.push(0.18 + (0.64 * i) / (n - 1))
      return ys
    }
  }
}

function countFillRows(elems: WidgetElement[]): number {
  let max = -1
  for (const e of elems) {
    if (e.kind !== 'text' || !e.zone?.startsWith('fill:')) continue
    const n = Number.parseInt(e.zone.slice(5), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return max + 1
}

function zoneYFrac(zone: string | undefined, fillRows: number[]): number {
  switch (zone) {
    case 'header':
      return 0.20
    case 'fill':
      return defaultFillYFrac
    case 'footer':
      return 0.84
    default:
      if (zone?.startsWith('fill:')) {
        const idx = Number.parseInt(zone.slice(5), 10)
        if (!Number.isNaN(idx) && idx >= 0 && idx < fillRows.length) return fillRows[idx]
      }
      return defaultFillYFrac
  }
}

// Render a single text element in a zone.
function ZoneTextItem({
  elem, theme, dp, style, fontScaleMul, yFrac,
}: {
  elem: WidgetElement
  theme: DashTheme
  dp?: DomainPalette
  style?: WidgetStyle
  fontScaleMul: number
  yFrac: number
}): ReactNode {
  const color  = resolveExpr(elem.color, theme, dp, style)
  const text   = placeholder(elem.binding, elem.format, elem.text)
  const fs     = (elem.fontScale ?? 0.1) * fontScaleMul
  const ef     = resolveFont(elem.font, style)
  const css: CSSProperties = {
    fontSize:   `${fs * 100}cqh`,
    fontFamily: fontFamily(ef),
    fontWeight: fontWeight(ef),
    color,
    whiteSpace: 'nowrap',
    lineHeight: 1,
  }

  // Explicit X → absolute positioning within the zone row.
  if (elem.x && elem.x > 0) {
    const tx = elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0'
    return (
      <span style={{
        ...css,
        position:  'absolute',
        left:      `${elem.x * 100}%`,
        top:       `${yFrac * 100}%`,
        transform: `translate(${tx}, -50%)`,
      }}>
        {text}
      </span>
    )
  }

  // No explicit X → use backend-style zone alignment anchors.
  return (
    <span style={{
      ...css,
      position: 'absolute',
      left: elem.hAlign === 1 ? '50%' : elem.hAlign === 2 ? '97.5%' : '2.5%',
      top: `${yFrac * 100}%`,
      transform: `translate(${elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0'}, -50%)`,
    }}>
      {text}
    </span>
  )
}

// Full zone overlay for all text elements that have a zone.
function ZoneLayer({
  elems, theme, dp, widgetStyle, fontScaleMul,
}: {
  elems: WidgetElement[]
  theme: DashTheme
  dp?: DomainPalette
  widgetStyle?: WidgetStyle
  fontScaleMul: number
}): ReactNode {
  const flat = flattenElements(elems)
  const zoneText = flat.filter(e => e.kind === 'text' && !!e.zone)
  if (zoneText.length === 0) return null
  const fillRows = fillZoneYs(countFillRows(zoneText))

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {zoneText.map((e, i) => (
        <ZoneTextItem
          key={i}
          elem={e}
          theme={theme}
          dp={dp}
          style={widgetStyle}
          fontScaleMul={fontScaleMul}
          yFrac={zoneYFrac(e.zone, fillRows)}
        />
      ))}
    </div>
  )
}

// ── Absolute-layer element renderers ──────────────────────────────────────────

function renderAbsElem(
  elem: WidgetElement,
  theme: DashTheme,
  dp: DomainPalette | undefined,
  widgetStyle: WidgetStyle | undefined,
  fontScaleMul: number,
  key: number,
): ReactNode {
  const r = (ref?: ColorRef) => resolveRef(ref, theme, dp, widgetStyle)
  const x = (expr?: ColorExpr) => resolveExpr(expr, theme, dp, widgetStyle)

  switch (elem.kind) {

    case 'panel': {
      const bg     = resolveRef('surface', theme, dp, widgetStyle)
      const border = resolveRef('border',  theme, dp, widgetStyle)
      return (
        <div key={key} style={{
          position: 'absolute', inset: 0,
          background:   bg,
          border:       elem.noBorder ? 'none' : `1px solid ${border}`,
          borderRadius: elem.cornerR ?? 0,
          boxSizing:    'border-box',
        }} />
      )
    }

    case 'text': {
      // Zone text is handled by ZoneLayer — skip here.
      if (elem.zone) return null
      const text   = placeholder(elem.binding, elem.format, elem.text)
      const fs     = (elem.fontScale ?? 0.1) * fontScaleMul
      const color  = x(elem.color)
      const ef     = resolveFont(elem.font, widgetStyle)
      const tx     = elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0'
      const ty     = elem.vAlign === 1 ? '-50%' : elem.vAlign === 2 ? '-100%' : '0'
      return (
        <div key={key} style={{
          position:   'absolute',
          left:       `${(elem.x ?? 0) * 100}%`,
          top:        `${(elem.y ?? 0) * 100}%`,
          transform:  `translate(${tx}, ${ty})`,
          fontSize:   `${fs * 100}cqh`,
          fontFamily: fontFamily(ef),
          fontWeight: fontWeight(ef),
          color,
          whiteSpace: 'nowrap',
          lineHeight: 1,
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )
    }

    case 'hbar': {
      const bg      = r(elem.bgColor ?? 'border')
      const fill    = r(elem.barColor?.ref ?? 'primary')
      const fillPct = 65
      return (
        <div key={key} style={{
          position:     'absolute',
          left:         `${(elem.barX ?? 0) * 100}%`,
          top:          `${(elem.barY ?? 0) * 100}%`,
          width:        `${(elem.barW ?? 1) * 100}%`,
          height:       `${(elem.barH ?? 0.1) * 100}%`,
          background:   bg,
          borderRadius: 3,
          overflow:     'hidden',
        }}>
          <div style={{
            position:   'absolute',
            left:       elem.barCentered ? `${50 - fillPct / 2}%` : 0,
            top:        0,
            width:      `${fillPct}%`,
            height:     '100%',
            background: fill,
          }} />
        </div>
      )
    }

    case 'deltabar': {
      const bg       = r(elem.bgColor ?? 'border')
      const posColor = x(elem.posColor)
      const negColor = x(elem.negColor)
      return (
        <div key={key} style={{
          position:     'absolute',
          left:         `${(elem.barX ?? 0) * 100}%`,
          top:          `${(elem.barY ?? 0) * 100}%`,
          width:        `${(elem.barW ?? 1) * 100}%`,
          height:       `${(elem.barH ?? 0.1) * 100}%`,
          background:   bg,
          borderRadius: 3,
          overflow:     'hidden',
        }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, width: '15%', height: '100%', background: posColor }} />
          <div style={{ position: 'absolute', right: '50%', top: 0, width: '0%', height: '100%', background: negColor }} />
        </div>
      )
    }

    case 'segbar': {
      const segs = elem.segments ?? 20
      const fill = Math.round(segs * 0.68)
      const stops = elem.segStops ?? []
      return (
        <div key={key} style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'flex-end',
          padding: '10% 5% 8%', gap: 2, boxSizing: 'border-box',
        }}>
          {Array.from({ length: segs }, (_, i) => {
            const frac = i / (segs - 1)
            let color = r('primary')
            for (const stop of stops) {
              if (frac >= stop.at) color = r(stop.color)
            }
            const lit = i < fill
            return (
              <div key={i} style={{
                flex:         1,
                height:       `${50 + (i / segs) * 50}%`,
                background:   lit ? color : r('border'),
                opacity:      lit ? 1 : 0.35,
                borderRadius: 1,
              }} />
            )
          })}
        </div>
      )
    }

    case 'tyre_grid': {
      const tileColors = [r('success'), r('warning'), r('success'), r('success')]
      const labels = ['FL', 'FR', 'RL', 'RR']
      return (
        <div key={key} style={{
          position: 'absolute',
          left: '5%', top: '25%', right: '5%', bottom: '5%',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 3,
        }}>
          {labels.map((label, i) => (
            <div key={label} style={{
              background:   tileColors[i],
              borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1cqh', color: '#000', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )
    }

    case 'dot': {
      const color = x(elem.color)
      return (
        <div key={key} style={{
          position:     'absolute',
          left:         `${(elem.dotX ?? 0.5) * 100}%`,
          top:          `${(elem.dotY ?? 0.5) * 100}%`,
          width:        `${(elem.dotR ?? 0.05) * 2 * 100}cqh`,
          height:       `${(elem.dotR ?? 0.05) * 2 * 100}cqh`,
          background:   color,
          borderRadius: '50%',
          transform:    'translate(-50%, -50%)',
        }} />
      )
    }

    case 'condition':
      return <>{flattenElements(elem.then ?? []).map((e, i) => renderAbsElem(e, theme, dp, widgetStyle, fontScaleMul, i))}</>

    default:
      return null
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WidgetPreview({ widget, theme, domainPalette, catalog = [] }: Props) {
  const entry       = catalog.find(e => e.type === widget.type)
  const elements    = entry?.defaultDefinition ?? []
  const widgetStyle = widget.style
  const fontScale   = Math.max(0.5, widgetStyle?.fontSize ?? 1)

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ containerType: 'size' } as CSSProperties}
    >
      {elements.length > 0 ? (
        <>
          {elements.map((e, i) => renderAbsElem(e, theme, domainPalette, widgetStyle, fontScale, i))}
          <ZoneLayer elems={elements} theme={theme} dp={domainPalette} widgetStyle={widgetStyle} fontScaleMul={fontScale} />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: resolveRef('surface', theme, domainPalette, widgetStyle) }}>
          <span style={{ fontSize: '0.7em', color: resolveRef('muted', theme, domainPalette, widgetStyle), fontFamily: 'JetBrains Mono, monospace' }}>
            {entry?.label ?? widget.type}
          </span>
        </div>
      )}
    </div>
  )
}

