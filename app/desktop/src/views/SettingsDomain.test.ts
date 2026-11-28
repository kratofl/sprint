import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sectionMatches } from './SettingsDomain'

const general = { label: 'General', group: 'Dash & wheel', keywords: 'units metric imperial delta session best' }

test('the settings search finds a section by its name, its group or a keyword, in any case', () => {
  assert.ok(sectionMatches(general, 'gen'))
  assert.ok(sectionMatches(general, 'WHEEL'))
  assert.ok(sectionMatches(general, 'imperial'))
})

test('every word of the search has to match', () => {
  assert.ok(sectionMatches(general, 'delta  best'))
  assert.ok(!sectionMatches(general, 'delta storage'))
})
