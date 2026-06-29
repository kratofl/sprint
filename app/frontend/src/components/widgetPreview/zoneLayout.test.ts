import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WidgetElement } from '@/lib/dash'
import {
  stackYs,
  countFillRows,
  zoneYFrac,
  countAutoStackTexts,
  defaultTextLeft,
  translateX,
  translateY,
} from './zoneLayout.ts'

const txt = (zone?: string, y?: number): WidgetElement =>
  ({ kind: 'text', zone, y }) as unknown as WidgetElement
const cond = (then: WidgetElement[]): WidgetElement =>
  ({ kind: 'condition', then }) as unknown as WidgetElement

test('stackYs: even vertical distribution, [] for n <= 0', () => {
  assert.deepEqual(stackYs(0), [])
  assert.deepEqual(stackYs(-3), [])
  assert.deepEqual(stackYs(1), [0.5])
  assert.deepEqual(stackYs(2), [0.38, 0.72])
  assert.deepEqual(stackYs(3), [0.30, 0.52, 0.74])
  assert.deepEqual(stackYs(4), [0.20, 0.40, 0.60, 0.80])
  // n >= 5 uses the spread formula 0.18 + 0.64*i/(n-1)
  const expected5 = Array.from({ length: 5 }, (_, i) => 0.18 + (0.64 * i) / 4)
  assert.deepEqual(stackYs(5), expected5)
  assert.equal(expected5[0], 0.18)
})

test('countFillRows: highest fill:N index + 1, else 0', () => {
  assert.equal(countFillRows([]), 0)
  assert.equal(countFillRows([txt('header'), txt('footer')]), 0)
  assert.equal(countFillRows([txt('fill:0'), txt('fill:2')]), 3)
})

test('zoneYFrac: named zones and indexed fill rows', () => {
  const rows = [0.3, 0.52, 0.74]
  assert.equal(zoneYFrac('header', rows), 0.20)
  assert.equal(zoneYFrac('fill', rows), 0.5)
  assert.equal(zoneYFrac('footer', rows), 0.84)
  assert.equal(zoneYFrac('fill:1', rows), 0.52)
  assert.equal(zoneYFrac('fill:9', rows), 0.5) // out of range → default
  assert.equal(zoneYFrac(undefined, rows), 0.5)
})

test('countAutoStackTexts: only zoneless, y-less text; recurses into conditions', () => {
  assert.equal(countAutoStackTexts([txt(), txt()]), 2)
  assert.equal(countAutoStackTexts([txt('header'), txt(undefined, 0.5)]), 0)
  assert.equal(countAutoStackTexts([txt(), cond([txt(), txt('header')])]), 2)
})

test('alignment anchors', () => {
  assert.equal(defaultTextLeft(1), '50%')
  assert.equal(defaultTextLeft(2), '97.5%')
  assert.equal(defaultTextLeft(undefined), '2.5%')
  assert.equal(translateX(1), '-50%')
  assert.equal(translateX(2), '-100%')
  assert.equal(translateX(undefined), '0px')
  assert.equal(translateY(undefined, false), '-50%')
  assert.equal(translateY(1, true), '-50%')
  assert.equal(translateY(2, true), '-100%')
  assert.equal(translateY(undefined, true), '0px')
})
