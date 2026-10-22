// Widget chrome: the frame and title a widget wears, drawn per dash style. Widgets render
// only their values; the frame, the title and the knob color come from here, so switching a
// layout's `dashStyle` restyles every widget without touching its content or its cell.
//
// Geometry is cell-local (0,0 is the widget's cell top-left) and scales with the grid cell,
// so a 40px cell on an 800x480 panel draws at the authored pixel sizes.

import React from 'react'
import type { DashStyle } from './index'
import type { PixelRect } from './grid'
import { withAlpha, type DashPaletteColors } from './palette'
import { TextLine } from './primitives'

/** What every frame on a dash shares: its style and the scale of one grid cell. */
export interface ChromeContext {
  style: DashStyle
  scale: number
}

/** The grid cell size the chrome's pixel sizes are authored at (an 800x480 panel on a 20x12 grid). */
export const CHROME_CELL_PX = 40

const BORDER = 2

/** The space between neighbouring frames, split across both. Grid frames grow 1px instead so neighbouring lines overlap into one. */
function frameInset(ctx: ChromeContext): number {
  switch (ctx.style) {
    case 'panels': return 4 * ctx.scale
    case 'bars': return 3 * ctx.scale
    case 'grid': return -1
  }
}

function frameRadius(ctx: ChromeContext): number {
  switch (ctx.style) {
    case 'panels': return 10 * ctx.scale
    case 'bars': return 8 * ctx.scale
    case 'grid': return 0
  }
}

export interface FrameGeometry {
  /** The frame's outer box, border included. */
  box: PixelRect
  /** The title band (the bar itself in the bars style), or null for an untitled frame. */
  title: PixelRect | null
  /** Where the widget's values go. */
  content: PixelRect
}

/** A framed widget's geometry inside a `width` x `height` cell. */
export function frameGeometry(ctx: ChromeContext, width: number, height: number, titled: boolean): FrameGeometry {
  const inset = frameInset(ctx)
  const box = { left: inset, top: inset, width: Math.max(0, width - inset * 2), height: Math.max(0, height - inset * 2) }
  const inner = { left: box.left + BORDER, top: box.top + BORDER, width: Math.max(0, box.width - BORDER * 2), height: Math.max(0, box.height - BORDER * 2) }
  // Grid cells pad a little more: cells on the canvas edge sit under the 4px outer frame.
  const pad = (ctx.style === 'grid' ? 10 : 8) * ctx.scale
  const titleHeight = titled ? (ctx.style === 'bars' ? 22 : 20) * ctx.scale : 0
  const titleTop = inner.top + (ctx.style === 'bars' ? 0 : ctx.style === 'grid' ? 4 : 2) * ctx.scale
  const title = titled ? { left: inner.left, top: titleTop, width: inner.width, height: titleHeight } : null
  const top = title ? title.top + title.height + (ctx.style === 'bars' ? 4 * ctx.scale : 0) : inner.top + pad / 2
  const bottom = inner.top + inner.height - pad / 2
  return {
    box,
    title,
    content: { left: inner.left + pad, top, width: Math.max(0, inner.width - pad * 2), height: Math.max(0, bottom - top) },
  }
}

/** Where an unframed widget's content goes: the same margin a frame keeps, so bare and framed widgets line up. */
export function bareContent(ctx: ChromeContext, width: number, height: number): PixelRect {
  const inset = Math.max(frameInset(ctx), 0) + BORDER
  return { left: inset, top: inset, width: Math.max(0, width - inset * 2), height: Math.max(0, height - inset * 2) }
}

/**
 * The palette for values drawn on a color fill: every text slot turns to the dark canvas
 * color, so a value on a green, blue or orange fill stays legible.
 */
export function inkPalette(palette: DashPaletteColors): DashPaletteColors {
  const ink = palette.background
  return { ...palette, foreground: ink, neutral: ink, primary: ink, secondary: withAlpha(ink, 0.78), muted: withAlpha(ink, 0.7), assistActive: ink }
}

export interface WidgetFrameProps {
  ctx: ChromeContext
  /** The cell this frame fills, cell-local or canvas-positioned. */
  rect: PixelRect
  title: string | null
  /** The knob identity color (`dashSettingColors`), or null for an ordinary widget. */
  accent: string | null
  /** A condition color filling the frame, or null to keep it black. */
  fill: string | null
  /** A widget's own label color override, if any. */
  titleColor?: string
  palette: DashPaletteColors
  /** Renders the values into the content box, with the palette to draw them in (ink on a fill). */
  children: (content: { width: number; height: number }, palette: DashPaletteColors) => React.ReactNode
}

/**
 * One widget frame in the layout's dash style:
 * - panels: a separate rounded box; a knob's color is its border.
 * - grid: ruled cells that share their lines; a knob's color is a small tab before the title.
 * - bars: a rounded box with a title bar; a knob's color fills the bar.
 * A fill color covers the box and turns the title and values to ink in every style.
 */
export function WidgetFrame({ ctx, rect, title, accent, fill, titleColor, palette, children }: WidgetFrameProps): React.ReactElement {
  const geometry = frameGeometry(ctx, rect.width, rect.height, title !== null)
  const edge = ctx.style === 'grid' ? palette.border : fill ?? (ctx.style === 'panels' ? accent : null) ?? palette.border
  const barColor = fill ?? accent ?? palette.border
  const onColor = fill !== null || (ctx.style === 'bars' && accent !== null)
  const resolvedTitleColor = onColor ? withAlpha(palette.background, 0.78) : ctx.style === 'bars' ? palette.foreground : titleColor ?? palette.secondary
  const contentPalette = fill !== null ? inkPalette(palette) : palette
  const tab = ctx.style === 'grid' && accent !== null && fill === null
  const titleSize = 12 * ctx.scale
  const titlePad = (ctx.style === 'grid' ? 10 : 8) * ctx.scale
  const titleLeft = (geometry.title?.left ?? 0) + titlePad + (tab ? 10 * ctx.scale : 0)

  return (
    <div style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <div
        style={{
          position: 'absolute',
          left: geometry.box.left,
          top: geometry.box.top,
          width: geometry.box.width,
          height: geometry.box.height,
          border: `${BORDER}px solid ${edge}`,
          borderRadius: frameRadius(ctx),
          background: fill ?? 'transparent',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {ctx.style === 'bars' && geometry.title && <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: geometry.title.height, background: barColor }} />}
      </div>
      {geometry.title && title !== null && (
        <>
          {tab && accent && (
            <span style={{ position: 'absolute', left: geometry.title.left + titlePad, top: geometry.title.top + geometry.title.height / 2 - 6.5 * ctx.scale, width: 5 * ctx.scale, height: 13 * ctx.scale, borderRadius: 2.5 * ctx.scale, background: accent }} />
          )}
          <TextLine
            text={title}
            left={titleLeft}
            top={geometry.title.top + geometry.title.height / 2}
            size={titleSize}
            color={resolvedTitleColor}
            align="start"
            maxWidth={Math.max(0, geometry.title.left + geometry.title.width - titleLeft - titlePad)}
            weight="labelBold"
            sizing="fit"
          />
        </>
      )}
      <div style={{ position: 'absolute', left: geometry.content.left, top: geometry.content.top, width: geometry.content.width, height: geometry.content.height }}>
        {children({ width: geometry.content.width, height: geometry.content.height }, contentPalette)}
      </div>
    </div>
  )
}

/** The grid style's outer frame: one rounded edge around the whole canvas, drawn over the cells' own lines. */
export function GridOuterFrame({ ctx, width, height, palette }: { ctx: ChromeContext; width: number; height: number; palette: DashPaletteColors }): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        border: `${4 * ctx.scale}px solid ${palette.border}`,
        borderRadius: 14 * ctx.scale,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    />
  )
}
