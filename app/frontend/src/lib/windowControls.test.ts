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
  assert.match(windowControlMinimiseButtonClassName, /\bw-11\b/)
  assert.match(windowControlMinimiseButtonClassName, /hover:bg-white\/\[0\.08\]/)
  assert.match(windowControlMaximiseButtonClassName, /\bh-full\b/)
})

test('close control keeps the Windows destructive hover treatment', () => {
  assert.match(windowControlCloseButtonClassName, /hover:bg-\[#c42b1c\]/)
  assert.match(windowControlCloseButtonClassName, /hover:text-white/)
})
