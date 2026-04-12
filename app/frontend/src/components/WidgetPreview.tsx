import type { ReactNode, CSSProperties } from 'react'
import type {
  DashWidget, DashTheme, DomainPalette, WidgetCatalogEntry,
  ColorRef, RGBAColor, ColorExpr, WidgetElement, FontStyle, HAlign,
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
  overrides?: Partial<Record<ColorRef, RGBAColor>>,
): string {
  if (!ref) return 'rgba(255,255,255,0.5)'
  const ovr = overrides?.[ref]
  if (ovr) return toCSS(ovr)
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
  overrides?: Partial<Record<ColorRef, RGBAColor>>,
): string {
  return resolveRef(expr?.ref ?? 'fg', theme, dp, overrides)
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

// Flex margin style that positions a span within a flex row by hAlign.
function hAlignStyle(hAlign?: HAlign): CSSProperties {
  switch (hAlign) {
    case 2: return { marginLeft: 'auto' }
    case 1: return { margin: '0 auto' }
    default: return { marginRight: 'auto' }
  }
}

// Render a single text element inside a zone row.
function ZoneTextItem({
  elem, theme, dp, overrides, fontScaleMul,
}: {
  elem: WidgetElement
  theme: DashTheme
  dp?: DomainPalette
  overrides?: Partial<Record<ColorRef, RGBAColor>>
  fontScaleMul: number
}): ReactNode {
  const color  = resolveExpr(elem.color, theme, dp, overrides)
  const text   = placeholder(elem.binding, elem.format, elem.text)
  const fs     = (elem.fontScale ?? 0.1) * fontScaleMul
  const style: CSSProperties = {
    fontSize:   `${fs * 100}cqh`,
    fontFamily: fontFamily(elem.font),
    fontWeight: fontWeight(elem.font),
    color,
    whiteSpace: 'nowrap',
    lineHeight: 1,
  }

  // Explicit X → absolute positioning within the zone row.
  if (elem.x && elem.x > 0) {
    const tx = elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0'
    return (
      <span style={{
        ...style,
        position:  'absolute',
        left:      `${elem.x * 100}%`,
        top:       '50%',
        transform: `translate(${tx}, -50%)`,
      }}>
        {text}
      </span>
    )
  }

  // No explicit X → flex margin alignment.
  return (
    <span style={{ ...style, ...hAlignStyle(elem.hAlign), flexShrink: 0 }}>
      {text}
    </span>
  )
}

// One horizontal zone row (header / fill:N / footer).
function ZoneRow({
  elems, style, theme, dp, overrides, fontScaleMul,
}: {
  elems: WidgetElement[]
  style?: CSSProperties
  theme: DashTheme
  dp?: DomainPalette
  overrides?: Partial<Record<ColorRef, RGBAColor>>
  fontScaleMul: number
}): ReactNode {
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      paddingLeft: '3%',
      paddingRight: '3%',
      boxSizing: 'border-box',
      overflow: 'hidden',
      ...style,
    }}>
      {elems.map((e, i) => (
        <ZoneTextItem key={i} elem={e} theme={theme} dp={dp} overrides={overrides} fontScaleMul={fontScaleMul} />
      ))}
    </div>
  )
}

// Full zone flex overlay for all text elements that have a zone.
function ZoneLayer({
  elems, theme, dp, overrides, fontScaleMul,
}: {
  elems: WidgetElement[]
  theme: DashTheme
  dp?: DomainPalette
  overrides?: Partial<Record<ColorRef, RGBAColor>>
  fontScaleMul: number
}): ReactNode {
  const flat = flattenElements(elems)
  const zoneText = flat.filter(e => e.kind === 'text' && !!e.zone)

  const header  = zoneText.filter(e => e.zone === 'header')
  const footer  = zoneText.filter(e => e.zone === 'footer')
  const fillMap = new Map<number, WidgetElement[]>()
  for (const e of zoneText) {
    if (e.zone === 'fill') {
      if (!fillMap.has(0)) fillMap.set(0, [])
      fillMap.get(0)!.push(e)
    } else if (e.zone?.startsWith('fill:')) {
      const n = parseInt(e.zone.slice(5))
      if (!fillMap.has(n)) fillMap.set(n, [])
      fillMap.get(n)!.push(e)
    }
  }
  const fillRows = [...fillMap.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)

  if (zoneText.length === 0) return null

  const shared = { theme, dp, overrides, fontScaleMul }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
      {header.length > 0 && (
        <ZoneRow elems={header} style={{ height: '22%', flexShrink: 0 }} {...shared} />
      )}
      {fillRows.length > 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {fillRows.map((row, i) => (
            <ZoneRow key={i} elems={row} style={{ flex: 1 }} {...shared} />
          ))}
        </div>
      )}
      {footer.length > 0 && (
        <ZoneRow elems={footer} style={{ height: '18%', flexShrink: 0 }} {...shared} />
      )}
    </div>
  )
}

// ── Absolute-layer element renderers ──────────────────────────────────────────

function renderAbsElem(
  elem: WidgetElement,
  theme: DashTheme,
  dp: DomainPalette | undefined,
  overrides: Partial<Record<ColorRef, RGBAColor>> | undefined,
  fontScaleMul: number,
  key: number,
): ReactNode {
  const r = (ref?: ColorRef) => resolveRef(ref, theme, dp, overrides)
  const x = (expr?: ColorExpr) => resolveExpr(expr, theme, dp, overrides)

  switch (elem.kind) {

    case 'panel': {
      const bg     = resolveRef('surface', theme, dp, overrides)
      const border = resolveRef('border', theme, dp, overrides)
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
      const tx     = elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0'
      const ty     = elem.vAlign === 1 ? '-50%' : elem.vAlign === 2 ? '-100%' : '0'
      return (
        <div key={key} style={{
          position:   'absolute',
          left:       `${(elem.x ?? 0) * 100}%`,
          top:        `${(elem.y ?? 0) * 100}%`,
          transform:  `translate(${tx}, ${ty})`,
          fontSize:   `${fs * 100}cqh`,
          fontFamily: fontFamily(elem.font),
          fontWeight: fontWeight(elem.font),
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
      return <>{flattenElements(elem.then ?? []).map((e, i) => renderAbsElem(e, theme, dp, overrides, fontScaleMul, i))}</>

    default:
      return null
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WidgetPreview({ widget, theme, domainPalette, catalog = [] }: Props) {
  const entry     = catalog.find(e => e.type === widget.type)
  const elements  = entry?.defaultDefinition ?? []
  const fontScale = Math.max(0.5, Number(widget.config?.font_scale ?? 1) || 1)
  const overrides = widget.styleOverrides

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ containerType: 'size' } as CSSProperties}
    >
      {elements.length > 0 ? (
        <>
          {elements.map((e, i) => renderAbsElem(e, theme, domainPalette, overrides, fontScale, i))}
          <ZoneLayer elems={elements} theme={theme} dp={domainPalette} overrides={overrides} fontScaleMul={fontScale} />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: resolveRef('surface', theme, domainPalette, overrides) }}>
          <span style={{ fontSize: '0.7em', color: resolveRef('muted', theme, domainPalette), fontFamily: 'JetBrains Mono, monospace' }}>
            {entry?.label ?? widget.type}
          </span>
        </div>
      )}
    </div>
  )
}

