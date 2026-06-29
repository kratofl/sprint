// Pure zone-layout math extracted from WidgetPreview.tsx.
//
// Computes vertical fractions for zoned/auto-stacked text and the alignment
// anchors used to position elements inside a widget. No DOM/React — only type
// imports from @/lib/dash (erased at runtime), so this module loads under
// `node --test` without resolving the @ alias.
import type { WidgetElement, HAlign, VAlign } from '@/lib/dash'

const defaultFillYFrac = 0.5

// Flatten conditions to their then-branch for preview purposes.
export function flattenElements(elems: WidgetElement[]): WidgetElement[] {
  const out: WidgetElement[] = []
  for (const e of elems) {
    if (e.kind === 'condition') out.push(...flattenElements(e.then ?? []))
    else out.push(e)
  }
  return out
}

/**
 * Even vertical distribution for `n` stacked text rows, as fractions of widget
 * height. Shared by the zoned "fill:" rows and auto-stacked text (previously
 * duplicated as fillZoneYs/autoStackYs). Returns [] for n <= 0.
 */
export function stackYs(n: number): number[] {
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

export function countFillRows(elems: WidgetElement[]): number {
  let max = -1
  for (const e of elems) {
    if (e.kind !== 'text' || !e.zone?.startsWith('fill:')) continue
    const n = Number.parseInt(e.zone.slice(5), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return max + 1
}

export function zoneYFrac(zone: string | undefined, fillRows: number[]): number {
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

export function countAutoStackTexts(elems: WidgetElement[]): number {
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

export function defaultTextLeft(hAlign: HAlign | undefined): string {
  switch (hAlign) {
    case 1:
      return '50%'
    case 2:
      return '97.5%'
    default:
      return '2.5%'
  }
}

export function translateX(hAlign: HAlign | undefined): string {
  switch (hAlign) {
    case 1:
      return '-50%'
    case 2:
      return '-100%'
    default:
      return '0px'
  }
}

export function translateY(vAlign: VAlign | undefined, explicitY: boolean): string {
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
