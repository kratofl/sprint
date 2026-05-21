import test from 'node:test'
import assert from 'node:assert/strict'

import {
  overlayBackdropClassName,
  overlayPanelClassName,
  overlayPopoverContentClassName,
  overlaySheetContentClassName,
} from './panelClasses.ts'

test('overlay backdrop uses one dimmed blur treatment across dialogs and sheets', () => {
  assert.match(overlayBackdropClassName, /\bbg-black\/72\b/)
  assert.match(overlayBackdropClassName, /\bbackdrop-blur-sm\b/)
})

test('overlay panel class keeps the shared terminal chrome', () => {
  assert.match(overlayPanelClassName, /\bsurface-overlay-panel\b/)
  assert.match(overlayPanelClassName, /\bborder-border\b/)
  assert.doesNotMatch(overlayPanelClassName, /\bborder-border-strong\b/)
  assert.match(overlayPanelClassName, /\bshadow-overlay\b/)
})

test('popover and sheet content build on the same overlay panel contract', () => {
  assert.match(overlayPopoverContentClassName, /origin-\(--radix-popover-content-transform-origin\)/)
  assert.match(overlayPopoverContentClassName, /\bsurface-overlay-panel\b/)
  assert.match(overlaySheetContentClassName, /\bsurface-overlay-panel\b/)
  assert.match(overlaySheetContentClassName, /\btext-xs\/relaxed\b/)
})
