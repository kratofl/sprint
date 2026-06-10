import test from 'node:test'
import assert from 'node:assert/strict'

import {
  windowControlCloseButtonClassName,
  windowControlMaximiseButtonClassName,
  windowControlMinimiseButtonClassName,
  windowControlsRailClassName,
} from './windowControls.ts'

test('window controls rail stretches across the full header height', () => {
  assert.match(windowControlsRailClassName, /\bh-full\b/)
  assert.match(windowControlsRailClassName, /\bitems-stretch\b/)
})

test('neutral window controls keep a full-height button contract', () => {
  assert.match(windowControlMinimiseButtonClassName, /\bh-full\b/)
  assert.match(windowControlMinimiseButtonClassName, /\bw-10\b/)
  assert.match(windowControlMinimiseButtonClassName, /hover:bg-\[var\(--panel-2\)\]/)
  assert.match(windowControlMaximiseButtonClassName, /\bh-full\b/)
})

test('close control uses the Figma red hover treatment', () => {
  assert.match(windowControlCloseButtonClassName, /hover:bg-\[var\(--red\)\]/)
  assert.match(windowControlCloseButtonClassName, /hover:text-white/)
})
