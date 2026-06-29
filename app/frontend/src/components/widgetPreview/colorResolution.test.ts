import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RGBAColor, WidgetStyle, DomainPalette } from '@/lib/dash'
import { DEFAULT_DASH_THEME } from '../../lib/dash/defaults.ts'
import {
  toCSS,
  resolveRef,
  placeholder,
  fontFamily,
  fontWeight,
  resolveFont,
  FONT_MAP,
} from './colorResolution.ts'

const color = (R: number, G: number, B: number, A: number): RGBAColor => ({ R, G, B, A })

test('toCSS: RGBA → css rgba() with 3-decimal alpha', () => {
  assert.equal(toCSS(color(255, 128, 0, 255)), 'rgba(255,128,0,1.000)')
  assert.equal(toCSS(color(0, 0, 0, 0)), 'rgba(0,0,0,0.000)')
})

test('resolveRef: undefined ref → neutral fallback', () => {
  assert.equal(resolveRef(undefined, DEFAULT_DASH_THEME), 'rgba(255,255,255,0.5)')
})

test('resolveRef: theme ref routes to the matching theme color', () => {
  assert.equal(resolveRef('primary', DEFAULT_DASH_THEME), toCSS(DEFAULT_DASH_THEME.primary))
})

test('resolveRef: per-widget style overrides win for fg/muted/surface', () => {
  const c = color(10, 20, 30, 200)
  assert.equal(resolveRef('fg', DEFAULT_DASH_THEME, undefined, { textColor: c } as unknown as WidgetStyle), toCSS(c))
})

test('resolveRef: domain palette overrides, with theme fallback', () => {
  const c = color(1, 2, 3, 255)
  assert.equal(resolveRef('abs', DEFAULT_DASH_THEME, { abs: c } as unknown as DomainPalette), toCSS(c))
  assert.equal(resolveRef('abs', DEFAULT_DASH_THEME), toCSS(DEFAULT_DASH_THEME.warning))
})

test('placeholder: text > binding map > format default > dash', () => {
  assert.equal(placeholder(undefined, undefined, 'hi'), 'hi')
  assert.equal(placeholder('car.rpm'), '8 543')
  assert.equal(placeholder('unknown.path', 'delta'), '+0.234')
  assert.equal(placeholder('unknown.path', 'int'), '0')
  assert.equal(placeholder(undefined), '—')
})

test('font helpers map FontStyle to family/weight', () => {
  assert.equal(fontFamily('number'), FONT_MAP.number)
  assert.equal(fontFamily(), FONT_MAP.label)
  assert.equal(fontWeight('bold'), 700)
  assert.equal(fontWeight('number'), 700)
  assert.equal(fontWeight('label'), 400)
  assert.equal(fontWeight('mono'), 400)
})

test('resolveFont: element font with style overrides', () => {
  assert.equal(resolveFont('number', undefined), 'number')
  assert.equal(resolveFont(undefined, undefined), 'label')
  assert.equal(resolveFont('number', { font: 'mono' } as unknown as WidgetStyle), 'mono')
  assert.equal(resolveFont('label', { labelFont: 'mono' } as unknown as WidgetStyle), 'mono')
})
