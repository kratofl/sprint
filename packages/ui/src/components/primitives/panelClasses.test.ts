import test from 'node:test'
import assert from 'node:assert/strict'

import {
  overlayBackdropClassName,
  overlayPanelClassName,
  overlayPopoverContentClassName,
  overlaySheetContentClassName,
} from './panelClasses.ts'

test('overlay backdrop is dimmed without blur', () => {
  assert.match(overlayBackdropClassName, /\bbg-black\/72\b/)
  assert.doesNotMatch(overlayBackdropClassName, /backdrop-blur/)
})

test('overlay panel class keeps the shared flat chrome', () => {
  assert.match(overlayPanelClassName, /bg-\[var\(--panel\)\]/)
  assert.match(overlayPanelClassName, /border-\[var\(--border\)\]/)
  assert.doesNotMatch(overlayPanelClassName, /\bborder-border-strong\b/)
  assert.match(overlayPanelClassName, /\bshadow-none\b/)
})

test('popover and sheet content build on the same overlay panel contract', () => {
  assert.match(overlayPopoverContentClassName, /origin-\(--radix-popover-content-transform-origin\)/)
  assert.match(overlayPopoverContentClassName, /bg-\[var\(--panel\)\]/)
  assert.match(overlaySheetContentClassName, /bg-\[var\(--panel\)\]/)
  assert.match(overlaySheetContentClassName, /\btext-xs\/relaxed\b/)
})
