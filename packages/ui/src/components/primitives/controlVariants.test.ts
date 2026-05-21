import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buttonPrimaryClassName,
  buttonDestructiveClassName,
  cardElevatedClassName,
  cardDestructiveClassName,
} from './controlClasses.ts'

test('primary button gets a tinted terminal surface instead of a plain transparent outline', () => {
  const className = buttonPrimaryClassName

  assert.match(className, /\bbg-accent\/10\b/)
  assert.match(className, /\bborder-primary\b/)
  assert.match(className, /\bhover:bg-primary\b/)
})

test('destructive button is visibly destructive before hover', () => {
  const className = buttonDestructiveClassName

  assert.match(className, /\bbg-destructive\/10\b/)
  assert.match(className, /\bborder-destructive\/60\b/)
  assert.match(className, /\btext-destructive\b/)
  assert.match(className, /\bhover:bg-destructive\b/)
})

test('elevated and destructive card variants stay on the shared surface ladder', () => {
  assert.match(cardElevatedClassName, /\bsurface-panel\b/)
  assert.match(cardDestructiveClassName, /\bsurface-destructive\b/)
})
