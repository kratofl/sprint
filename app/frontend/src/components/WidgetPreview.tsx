import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import type {
  DashWidget, DashTheme, DomainPalette, WidgetCatalogEntry,
  ColorRef, RGBAColor, ColorExpr, WidgetElement, FontStyle, WidgetStyle, HAlign, VAlign,
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
  'tires.fl.avgTemp':      '93.0',
  'tires.fr.avgTemp':      '94.0',
  'tires.rl.avgTemp':      '90.0',
  'tires.rr.avgTemp':      '91.0',
  'tires.fl.coreTemp':     '95.0',
  'tires.fr.coreTemp':     '96.0',
  'tires.rl.coreTemp':     '92.0',
  'tires.rr.coreTemp':     '93.0',
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
  label:  'Bahnschrift, IBM Plex Sans Condensed, IBM Plex Sans, sans-serif',
  bold:   'Bahnschrift, IBM Plex Sans Condensed, IBM Plex Sans, sans-serif',
  number: 'Bahnschrift, IBM Plex Mono, ui-monospace, monospace',
  mono:   'Bahnschrift, IBM Plex Mono, ui-monospace, monospace',
}

function fontFamily(f?: FontStyle): string { return FONT_MAP[f ?? 'label'] }
function fontWeight(f?: FontStyle): number  { return f === 'bold' || f === 'number' ? 700 : 400 }

function resolveFont(elemFont: FontStyle | undefined, style?: WidgetStyle): FontStyle {
  const f = elemFont ?? 'label'
  if ((f === 'number' || f === 'bold') && style?.font)      return style.font
  if ((f === 'label'  || f === 'mono') && style?.labelFont) return style.labelFont
  return f
}

const opticalCenterCache = new Map<string, number>()

function canvasFont(style: CSSStyleDeclaration): string {
  const fontStyle = style.fontStyle || 'normal'
  const fontWeight = style.fontWeight || '400'
  const fontSize = style.fontSize || '16px'
  const fontFamily = style.fontFamily || 'sans-serif'
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

function measureOpticalCenterOffset(text: string, font: string): number {
  if (typeof document === 'undefined' || text === '' || font === '') return 0

  const cacheKey = `${font}\n${text}`
  const cached = opticalCenterCache.get(cacheKey)
  if (cached !== undefined) return cached

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const metrics = ctx.measureText(text)
  const padding = 8
  const width = Math.max(1, Math.ceil(metrics.width + metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + padding * 2))
  const height = Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + padding * 2))
  canvas.width = width
  canvas.height = height

  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  const baselineX = padding + metrics.actualBoundingBoxLeft
  const baselineY = padding + metrics.actualBoundingBoxAscent
  ctx.fillText(text, baselineX, baselineY)

  const { data } = ctx.getImageData(0, 0, width, height)
  let weightedX = 0
  let total = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha === 0) continue
      weightedX += (x + 0.5) * alpha
      total += alpha
    }
  }
  if (total === 0) return 0

  const offset = baselineX + metrics.width / 2 - weightedX / total
  opticalCenterCache.set(cacheKey, offset)
  return offset
}

function transformWithOpticalOffset(translateXValue: string, translateYValue: string, offsetPx: number): string {
  if (offsetPx === 0) return `translate(${translateXValue}, ${translateYValue})`
  return `translate(calc(${translateXValue} + ${offsetPx.toFixed(2)}px), ${translateYValue})`
}

function PreviewTextNode({
  text,
  css,
  left,
  top,
  translateXValue,
  translateYValue,
  opticalCenter,
}: {
  text: string
  css: CSSProperties
  left: string
  top: string
  translateXValue: string
  translateYValue: string
  opticalCenter: boolean
}): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  const [offsetPx, setOffsetPx] = useState(0)
  const fontKey = `${css.fontStyle ?? ''}|${css.fontWeight ?? ''}|${css.fontSize ?? ''}|${css.fontFamily ?? ''}`

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !opticalCenter) {
      setOffsetPx(0)
      return
    }

    const measure = () => {
      const current = ref.current
      if (!current) return
      const next = measureOpticalCenterOffset(text, canvasFont(window.getComputedStyle(current)))
      setOffsetPx(prev => Math.abs(prev - next) < 0.01 ? prev : next)
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => measure())
    resizeObserver?.observe(element)

    let cancelled = false
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    fonts?.ready.then(() => {
      if (!cancelled) measure()
    }).catch(() => {})

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
    }
  }, [fontKey, opticalCenter, text])

  return (
    <div
      ref={ref}
      style={{
        ...css,
        position: 'absolute',
        left,
        top,
        transform: transformWithOpticalOffset(translateXValue, translateYValue, opticalCenter ? offsetPx : 0),
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
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

function autoStackYs(n: number): number[] {
  switch (n) {
    case 0:
      return []
    case 1:
      return [0.5]
    case 2:
      return [0.38, 0.72]
    case 3:
      return [0.30, 0.52, 0.74]
    case 4:
      return [0.20, 0.40, 0.60, 0.80]
    default: {
      const ys: number[] = []
      for (let i = 0; i < n; i += 1) ys.push(0.18 + (0.64 * i) / (n - 1))
      return ys
    }
  }
}

function countAutoStackTexts(elems: WidgetElement[]): number {
  let count = 0
  for (const elem of elems) {
    if (elem.kind === 'condition') {
      count += countAutoStackTexts(flattenElements(elem.then ?? []))
      continue
    }
    if (elem.kind === 'text' && !elem.zone && typeof elem.y !== 'number') count += 1
  }
  return count
}

function defaultTextLeft(hAlign: HAlign | undefined): string {
  switch (hAlign) {
    case 1:
      return '50%'
    case 2:
      return '97.5%'
    default:
      return '2.5%'
  }
}

function translateX(hAlign: HAlign | undefined): string {
  switch (hAlign) {
    case 1:
      return '-50%'
    case 2:
      return '-100%'
    default:
      return '0px'
  }
}

function translateY(vAlign: VAlign | undefined, explicitY: boolean): string {
  if (!explicitY) return '-50%'
  switch (vAlign) {
    case 1:
      return '-50%'
    case 2:
      return '-100%'
    default:
      return '0px'
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
  if (typeof elem.x === 'number') {
    const tx = elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0px'
    return (
      <PreviewTextNode
        text={text}
        css={css}
        left={`${elem.x * 100}%`}
        top={`${yFrac * 100}%`}
        translateXValue={tx}
        translateYValue="-50%"
        opticalCenter={elem.opticalCenter === true && elem.hAlign === 1}
      />
    )
  }

  // No explicit X → use backend-style zone alignment anchors.
  return (
    <PreviewTextNode
      text={text}
      css={css}
      left={elem.hAlign === 1 ? '50%' : elem.hAlign === 2 ? '97.5%' : '2.5%'}
      top={`${yFrac * 100}%`}
      translateXValue={elem.hAlign === 1 ? '-50%' : elem.hAlign === 2 ? '-100%' : '0px'}
      translateYValue="-50%"
      opticalCenter={elem.opticalCenter === true && elem.hAlign === 1}
    />
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
  textYs: number[],
  textState: { nextIndex: number },
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
      const hasExplicitX = typeof elem.x === 'number'
      const hasExplicitY = typeof elem.y === 'number'
      const autoY = hasExplicitY ? 0.5 : (textYs[textState.nextIndex++] ?? 0.5)
      return (
        <PreviewTextNode
          key={key}
          text={text}
          css={{
            fontSize: `${fs * 100}cqh`,
            fontFamily: fontFamily(ef),
            fontWeight: fontWeight(ef),
            color,
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
          left={hasExplicitX ? `${elem.x! * 100}%` : defaultTextLeft(elem.hAlign)}
          top={hasExplicitY ? `${elem.y! * 100}%` : `${autoY * 100}%`}
          translateXValue={translateX(elem.hAlign)}
          translateYValue={translateY(elem.vAlign, hasExplicitY)}
          opticalCenter={elem.opticalCenter === true && elem.hAlign === 1}
        />
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

    case 'grid': {
      const rows = elem.gridRows ?? 2
      const cols = elem.gridCols ?? 2
      const cells = elem.gridCells ?? []
      return (
        <div key={key} style={{
          position: 'absolute',
          left: '5%', top: '25%', right: '5%', bottom: '5%',
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: 3,
        }}>
          {cells.map((cell, i) => (
            <div key={cell.label ?? i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 4px',
            }}>
              {cell.label && (
                <span style={{ fontSize: '0.8cqh', color: r('muted'), fontFamily: FONT_MAP.label }}>
                  {cell.label}
                </span>
              )}
              <span style={{ fontSize: '1cqh', color: r('fg'), fontFamily: FONT_MAP.number, fontWeight: 700 }}>
                —
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
      return (
        <Fragment key={key}>
          {flattenElements(elem.then ?? []).map((e, i) => renderAbsElem(e, theme, dp, widgetStyle, fontScaleMul, textYs, textState, i))}
        </Fragment>
      )

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
  const textYs      = autoStackYs(countAutoStackTexts(elements))
  const textState   = { nextIndex: 0 }

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-alert border border-[var(--border)] bg-[var(--panel-2)]"
      style={{ containerType: 'size' } as CSSProperties}
    >
      {elements.length > 0 ? (
        <>
          {elements.map((e, i) => renderAbsElem(e, theme, domainPalette, widgetStyle, fontScale, textYs, textState, i))}
          <ZoneLayer elems={elements} theme={theme} dp={domainPalette} widgetStyle={widgetStyle} fontScaleMul={fontScale} />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-saira text-[10px] tabular-nums text-[var(--muted-2)]"
            style={{ color: resolveRef('muted', theme, domainPalette, widgetStyle) }}
          >
            {entry?.name ?? widget.type}
          </span>
        </div>
      )}
    </div>
  )
}
