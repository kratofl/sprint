import test from 'node:test'
import assert from 'node:assert/strict'

import { formatCommandIdForDisplay } from './commandIdDisplay.ts'

test('formatCommandIdForDisplay compacts wrapper command ids with readable prefixes', () => {
  const formatted = formatCommandIdForDisplay(
    'dash.wrapper.550e8400-e29b-41d4-a716-446655440000.7cc3a8fc-6b94-4b3d-9a37-a11e2a6b6d8f.8fd34892-6a74-4ba7-9aa1-6f616c67a25c.next',
  )

  assert.equal(
    formatted,
    'dash.wrapper.lay_550e8400.page_7cc3a8fc.mfw_8fd34892.next',
  )
})

test('formatCommandIdForDisplay leaves already-compact command ids unchanged', () => {
  assert.equal(
    formatCommandIdForDisplay('dash.wrapper.lay_1a2b3c4d.page_4d3c2b1a.mfw_ab12cd34.next'),
    'dash.wrapper.lay_1a2b3c4d.page_4d3c2b1a.mfw_ab12cd34.next',
  )
})
