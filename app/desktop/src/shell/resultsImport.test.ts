import assert from 'node:assert/strict'
import { test } from 'node:test'
import { afterImport, afterSearch, canClose, declinedOnClose, initialImportState, offeredSessions } from './resultsImport'
import type { ResultsImportOffer } from '../bridge'

const offer: ResultsImportOffer = {
  entries: ['practice.xml', 'race.xml', 'race-2.xml'],
  counts: [
    { kind: 'Practice', count: 1 },
    { kind: 'Race', count: 2 },
  ],
}

test('the startup prompt opens on its offer; the manual action searches first', () => {
  assert.deepEqual(initialImportState(offer), { phase: 'ready', offer })
  assert.deepEqual(initialImportState(null), { phase: 'searching' })
  assert.equal(offeredSessions(offer), 3)
})

test('a search answers inside the dialog, including when there is nothing new', () => {
  assert.deepEqual(afterSearch({ entries: [], counts: [] }), { phase: 'nothingNew' })
  assert.deepEqual(afterSearch(offer), { phase: 'ready', offer })
})

test('an import resolves to its count or its reason', () => {
  assert.deepEqual(afterImport({ outcome: 'imported', importedCount: 0 }), { phase: 'imported', importedCount: 0 })
  assert.deepEqual(afterImport({ outcome: 'failed', error: 'disk full' }), { phase: 'failed', error: 'disk full' })
})

test('only closing an unanswered offer declines it, and an import in flight cannot be closed', () => {
  assert.deepEqual(declinedOnClose({ phase: 'ready', offer }), offer.entries)
  assert.deepEqual(declinedOnClose({ phase: 'imported', importedCount: 3 }), [])
  assert.deepEqual(declinedOnClose({ phase: 'searching' }), [])
  assert.equal(canClose({ phase: 'importing', offer }), false)
  assert.equal(canClose({ phase: 'failed', error: 'x' }), true)
})
