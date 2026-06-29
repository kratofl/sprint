import test from 'node:test'
import assert from 'node:assert/strict'

import type { AlertInstance } from './types.ts'
import { migrateAlertConfig, DEFAULT_ALERT_DURATION } from './alertConfig.ts'

test('folds legacy alert instances into enabled types and a shared duration', () => {
  const legacy: AlertInstance[] = [
    { id: '1', type: 'tc_change', config: { duration: '2.5' } },
    { id: '2', type: 'abs_change', config: { duration: 1.0 } },
    { id: '3', type: 'tc_change' }, // duplicate collapses
  ]

  const cfg = migrateAlertConfig(legacy, undefined)

  assert.deepEqual([...(cfg.enabledTypes ?? [])].sort(), ['abs_change', 'tc_change'])
  assert.equal(cfg.duration, 2.5)
  assert.equal(cfg.displayMode, 'full')
  assert.equal(cfg.colorMode, 'normal')
})

test('uses the default duration when no legacy duration is meaningful', () => {
  const cfg = migrateAlertConfig([{ id: '1', type: 'tc_change' }], undefined)
  assert.equal(cfg.duration, DEFAULT_ALERT_DURATION)
})

test('is idempotent once the shared config is already populated', () => {
  const existing = {
    displayMode: 'middle' as const,
    colorMode: 'inverted' as const,
    duration: 3,
    enabledTypes: ['tc_change'],
  }

  const cfg = migrateAlertConfig([{ id: 'x', type: 'abs_change' }], existing)

  assert.deepEqual(cfg.enabledTypes, ['tc_change'])
  assert.equal(cfg.displayMode, 'middle')
  assert.equal(cfg.colorMode, 'inverted')
  assert.equal(cfg.duration, 3)
})
