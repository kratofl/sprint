// Low-level presentational pieces shared by every widget: text, a horizontal bar, a vertical
// segment bar, a delta bar, a dot, and the instrument-frame panel border. Each takes explicit
// pixel geometry — no widget-specific telemetry knowledge lives here.

import React from 'react'
import { dimColor, type DashPaletteColors } from './palette'
import { LABEL_FONT_STACK, VALUE_FONT_STACK } from './fonts'
import type { PixelRect } from './grid'

export type TextAlign = 'start' | 'center' | 'end'
export type TextWeight = 'label' | 'labelBold' | 'value' | 'valueRegular'

// "stable" keeps the authored font size and clips overflow (used for dynamic values, so a
// changing readout never pulses as it resizes); "fit" shrinks the font size until static text
// fits `maxWidth` exactly, so labels never truncate. Default is "stable".
export type TextSizing = 'stable' | 'fit'

const WEIGHT_TO_FONT: Record<TextWeight, string> = {
  label: LABEL_FONT_STACK,
  labelBold: LABEL_FONT_STACK,
  value: VALUE_FONT_STACK,
  valueRegular: VALUE_FONT_STACK,
}

// Matches the desktop client's bundled weights (`DashFonts.cs`): Label = Inter Regular,
// LabelBold = Inter Bold, Value = Saira SemiCondensed Bold, ValueRegular = Saira SemiCondensed Medium.
const WEIGHT_TO_CSS_WEIGHT: Record<TextWeight, number> = {
  label: 400,
  labelBold: 700,
  value: 700,
  valueRegular: 500,
}

// Average glyph advance width, as a fraction of font size, for each bundled weight. Used only to
// decide whether `sizing="fit"` text would overflow `maxWidth` before it is painted — never for
// exact layout, since `FitTextLine` below sizes the actual glyphs precisely via SVG `textLength`.
//
// Measured directly from the bundled font files' `hmtx` advance widths (resolved through each
// font's Windows/Unicode `cmap` subtable), averaged unweighted across the full printable ASCII
// range (0x20-0x7E). Unweighted on purpose: the font's own OS/2.xAvgCharWidth is frequency-weighted
// toward common English lowercase prose, which underestimates dash text — short, mostly uppercase
// labels, digits, and symbols ("SECTORS", "S1", "1:32.456").
//
// Source files (measured 2026-09-20):
//   label       -> Inter-Regular.ttf                 ratio 0.562
//   labelBold   -> Inter-Bold.ttf                     ratio 0.587
//   value       -> SairaSemiCondensed-Bold.ttf        ratio 0.483
//   valueRegular-> SairaSemiCondensed-Medium.ttf      ratio 0.471
// `value` is never used with sizing="fit" today (dynamic numeric readouts always stay
// "stable"), but is measured anyway so this map stays total over TextWeight.
const AVG_ADVANCE_RATIO: Record<TextWeight, number> = {
  label: 0.562,
  labelBold: 0.587,
  value: 0.483,
  valueRegular: 0.471,
}

/** A conservative, deterministic width estimate — no DOM measurement, so it is identical in SSR and a live browser. */
function estimateTextWidth(text: string, weight: TextWeight, size: number): number {
  return text.length * size * AVG_ADVANCE_RATIO[weight]
}

export interface TextLineProps {
  text: string
  left: number
  top: number
  size: number
  color: string
  align?: TextAlign
  maxWidth?: number
  weight?: TextWeight
  sizing?: TextSizing
}

/**
 * The `sizing="fit"` path for text that is estimated to overflow `maxWidth`: an SVG `<text>` with
 * `textLength`/`lengthAdjust="spacingAndGlyphs"`, which forces the glyphs to span exactly
 * `maxWidth` — shrinking (or, in principle, stretching) with no measurement pass, so it renders
 * identically whether painted server-side (`renderToStaticMarkup`) or in a live DOM, and
 * regardless of whether the intended font is actually installed.
 */
function FitTextLine({ text, left, top, size, color, align, maxWidth, weight }: Required<Omit<TextLineProps, 'sizing'>>): React.ReactElement {
  const translateX = align === 'start' ? '0%' : align === 'end' ? '-100%' : '-50%'
  const textAnchor = align === 'start' ? 'start' : align === 'end' ? 'end' : 'middle'
  const x = align === 'start' ? 0 : align === 'end' ? maxWidth : maxWidth / 2
  const svgHeight = size * 1.4 // generous enough that ascenders/descenders never clip against the SVG viewport itself
  return (
    <svg
      width={maxWidth}
      height={svgHeight}
      style={{ position: 'absolute', left, top, transform: `translate(${translateX}, -50%)`, overflow: 'visible' }}
    >
      <text
        x={x}
        y={svgHeight / 2}
        textAnchor={textAnchor}
        dominantBaseline="central"
        textLength={maxWidth}
        lengthAdjust="spacingAndGlyphs"
        fontFamily={WEIGHT_TO_FONT[weight]}
        fontWeight={WEIGHT_TO_CSS_WEIGHT[weight]}
        fontSize={Math.max(0, size)}
        fill={color}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {text}
      </text>
    </svg>
  )
}

/**
 * A single line of text, vertically centered on `top` and horizontally anchored at `left` per
 * `align`. Values render in tabular figures so a changing readout never reflows its neighbors.
 *
 * `sizing="fit"` (the default is "stable") shrinks the text to fit `maxWidth` exactly instead of
 * clipping it — see `FitTextLine`. That only engages once `estimateTextWidth` says the text would
 * actually overflow, so short "fit" text is never stretched to fill its box.
 */
export function TextLine({ text, left, top, size, color, align = 'center', maxWidth, weight = 'value', sizing = 'stable' }: TextLineProps): React.ReactElement | null {
  if (!text || size <= 0) {
    return null
  }

  if (sizing === 'fit' && maxWidth !== undefined && maxWidth > 0 && estimateTextWidth(text, weight, size) > maxWidth) {
    return <FitTextLine text={text} left={left} top={top} size={size} color={color} align={align} maxWidth={maxWidth} weight={weight} />
  }

  const glyphStyle: React.CSSProperties = {
    fontFamily: WEIGHT_TO_FONT[weight],
    fontWeight: WEIGHT_TO_CSS_WEIGHT[weight],
    fontSize: Math.max(0, size),
    lineHeight: 1,
    color,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  }

  // No bound to clip against (or a non-positive one, matching `DrawTextLine`'s own
  // `if (maxWidth > 0)` clip guard) — render unclipped, anchored at `left` per `align`.
  if (maxWidth === undefined || maxWidth <= 0) {
    const translateX = align === 'start' ? '0%' : align === 'end' ? '-100%' : '-50%'
    return (
      <span style={{ position: 'absolute', left, top, transform: `translate(${translateX}, -50%)`, ...glyphStyle }}>
        {text}
      </span>
    )
  }

  // `DrawTextLine`'s Stable path clips overflow instead of shrinking it, so a changing readout
  // never pulses in size — but the clip must fall on the same side the text is anchored away
  // from, not always on the right. Skia does this with an `SKRect` clip positioned per `align`
  // (`left`, `left - maxWidth/2`, or `left - maxWidth`) plus a `textX` anchored the same way, so
  // overflow spills toward — and is cut on — the side opposite the anchor.
  //
  // A single `<span>` with `text-align` + `overflow: hidden` can't reproduce this: browsers anchor
  // an unbreakable (`white-space: nowrap`) overflowing run at the line's start edge and let it spill
  // off the end, regardless of `text-align` — confirmed empirically, it clips on the right even with
  // `text-align: right`. So instead this ports the clip rect and the anchor as two separate boxes:
  // an outer box that IS the fixed-width clip rect (`overflow: hidden`, positioned like Skia's
  // `SKRect`), and an inner span anchored inside it exactly like Skia's `textX` formula. Overflow
  // then naturally spills past the outer box on whichever side the anchor points away from, and
  // gets clipped there — left for `end`, right for `start`, both sides evenly for `center`.
  const clipLeft = align === 'start' ? left : align === 'end' ? left - maxWidth : left - maxWidth / 2
  const innerLeft = align === 'start' ? 0 : align === 'end' ? maxWidth : maxWidth / 2
  const innerTranslateX = align === 'start' ? '0%' : align === 'end' ? '-100%' : '-50%'
  const boxHeight = size * 1.4 // generous enough that ascenders/descenders never clip vertically

  return (
    <span style={{ position: 'absolute', left: clipLeft, top, width: maxWidth, height: boxHeight, overflow: 'hidden', transform: 'translateY(-50%)' }}>
      <span style={{ position: 'absolute', left: innerLeft, top: '50%', transform: `translate(${innerTranslateX}, -50%)`, ...glyphStyle }}>
        {text}
      </span>
    </span>
  )
}

/** A filled circle, centered on `(cx, cy)`. */
export function Dot({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }): React.ReactElement {
  return <span style={{ position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', background: color }} />
}

/**
 * A horizontal value bar: a dimmed track with a solid fill. `centered` bars (e.g. steering)
 * fill outward from the midpoint in either direction; others fill left-to-right from 0.
 */
export function HBar({ x, y, w, h, pct, color, centered }: { x: number; y: number; w: number; h: number; pct: number; color: string; centered: boolean }): React.ReactElement {
  const clamped = Math.max(centered ? -1 : 0, Math.min(1, pct))
  const track = dimColor(color, 0.15)
  const radius = Math.min(3, h / 2)
  const pieces: React.ReactElement[] = [<div key="track" style={{ position: 'absolute', left: x, top: y, width: Math.max(0, w), height: Math.max(0, h), borderRadius: radius, background: track }} />]

  if (centered) {
    pieces.push(<div key="mid" style={{ position: 'absolute', left: x + w / 2 - 0.5, top: y, width: 1, height: h, background: dimColor(color, 0.4) }} />)
    const frac = clamped / 2
    if (frac > 0) {
      pieces.push(<div key="fill" style={{ position: 'absolute', left: x + w / 2, top: y, width: frac * w, height: h, borderRadius: radius, background: color }} />)
    } else if (frac < 0) {
      pieces.push(<div key="fill" style={{ position: 'absolute', left: x + w / 2 + frac * w, top: y, width: -frac * w, height: h, borderRadius: radius, background: color }} />)
    }
  } else if (clamped > 0) {
    pieces.push(<div key="fill" style={{ position: 'absolute', left: x, top: y, width: clamped * w, height: h, borderRadius: radius, background: color }} />)
  }

  return <>{pieces}</>
}

/**
 * A 20-segment vertical RPM ladder, filled bottom-up: lit segments use `stageColor`'s phase
 * gradient, unlit segments are a dimmed version of the same color.
 */
export function VerticalSegBar({ rect, pct, stageColor }: { rect: PixelRect; pct: number; stageColor: (phase: number) => string }): React.ReactElement | null {
  const clamped = Math.max(0, Math.min(1, pct))
  const segments = 20
  const innerX = rect.left + 3
  const innerW = rect.width - 6
  const top = rect.top + 6
  const usableH = rect.height - 12
  if (innerW <= 0 || usableH <= 0) {
    return null
  }

  const segH = usableH / segments
  const filled = Math.floor(segments * clamped)
  const bars: React.ReactElement[] = []
  for (let i = 0; i < segments; i++) {
    const segPct = i / segments
    const base = stageColor(segPct)
    const color = i < filled ? base : dimColor(base, 0.15)
    const sy = top + usableH - (i + 1) * segH
    bars.push(<div key={i} style={{ position: 'absolute', left: innerX, top: sy + 1, width: innerW, height: Math.max(0, segH - 2), borderRadius: 2, background: color }} />)
  }

  return <>{bars}</>
}

/**
 * A bidirectional delta bar: a neutral track, filled from the midpoint toward whichever side
 * the sign points, or left bare when the delta rounds to zero.
 */
export function DeltaBar({ x, y, w, h, delta, palette, maxDelta = 2.0 }: { x: number; y: number; w: number; h: number; delta: number; palette: DashPaletteColors; maxDelta?: number }): React.ReactElement {
  const pct = Math.max(-1, Math.min(1, delta / maxDelta))
  const mid = x + w / 2
  const fillW = (Math.abs(pct) * w) / 2
  const radius = Math.min(3, h / 2)
  const track = <div key="track" style={{ position: 'absolute', left: x, top: y, width: Math.max(0, w), height: Math.max(0, h), borderRadius: radius, background: palette.surface }} />
  if (Math.abs(delta) < 0.001) {
    return track
  }

  const color = delta > 0 ? palette.neutral : palette.timingPersonalBest
  const fill = delta > 0
    ? <div key="fill" style={{ position: 'absolute', left: mid, top: y + 1, width: fillW, height: Math.max(0, h - 2), borderRadius: 2, background: color }} />
    : <div key="fill" style={{ position: 'absolute', left: mid - fillW, top: y + 1, width: fillW, height: Math.max(0, h - 2), borderRadius: 2, background: color }} />
  return <>{track}{fill}</>
}

/** The rounded-rect instrument outline drawn around a widget's assigned cell. */
export function PanelBorder({ width, height, color }: { width: number; height: number; color: string }): React.ReactElement {
  const radius = Math.max(6, Math.min(10, Math.min(width, height) * 0.08))
  return (
    <div
      style={{
        position: 'absolute',
        left: 2.5,
        top: 2.5,
        width: Math.max(0, width - 5),
        height: Math.max(0, height - 5),
        border: '1.5px solid',
        borderColor: color,
        borderRadius: radius,
        boxSizing: 'border-box',
      }}
    />
  )
}

/** A muted label over a large centered value, filling the widget. */
export function SimpleValue({ width, height, label, value, palette }: { width: number; height: number; label: string; value: string; palette: DashPaletteColors }): React.ReactElement {
  return (
    <>
      <TextLine text={label} left={8} top={height * 0.2} size={height * 0.14} color={palette.muted} align="start" maxWidth={width * 0.8} weight="label" sizing="fit" />
      <TextLine text={value} left={width / 2} top={height * 0.58} size={height * 0.42} color={palette.foreground} align="center" maxWidth={width * 0.92} weight="value" />
    </>
  )
}
