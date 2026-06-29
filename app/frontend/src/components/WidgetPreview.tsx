import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import type {
  DashWidget, DashTheme, DomainPalette, WidgetCatalogEntry,
  ColorRef, ColorExpr, WidgetElement, WidgetStyle,
} from '@/lib/dash'
import {
  FONT_MAP,
  fontFamily,
  fontWeight,
  placeholder,
  resolveExpr,
  resolveFont,
  resolveRef,
} from './widgetPreview/colorResolution'
import {
  countAutoStackTexts,
  countFillRows,
  defaultTextLeft,
  flattenElements,
  stackYs,
  translateX,
  translateY,
  zoneYFrac,
} from './widgetPreview/zoneLayout'

interface Props {
  widget:         DashWidget
  theme:          DashTheme
  domainPalette?: DomainPalette
  catalog?:       WidgetCatalogEntry[]
}

// ── Optical-center text measurement (DOM-bound) ─────────────────────────────────

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
  ctx.fillStyle = 'white'
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

// ── Zone layout rendering ───────────────────────────────────────────────────────

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
  const fillRows = stackYs(countFillRows(zoneText))

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

    case 'badge': {
      const color = x(elem.badgeColor)
      const frac = (elem.badgeR && elem.badgeR > 0 ? elem.badgeR : 0.82) * 100
      return (
        <div key={key} style={{
          position:     'absolute',
          left:         '50%',
          top:          '50%',
          width:        `${frac}cqmin`,
          height:       `${frac}cqmin`,
          transform:    'translate(-50%, -50%)',
          borderRadius: '50%',
          border:       `2px solid ${color}`,
          background:   elem.badgeFill ? `color-mix(in srgb, ${color} ${Math.round((elem.badgeFill ?? 0) * 100)}%, transparent)` : 'transparent',
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
  const textYs      = stackYs(countAutoStackTexts(elements))
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
