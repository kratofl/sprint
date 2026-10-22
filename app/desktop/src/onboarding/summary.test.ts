import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localSummary, syncReportText } from './summary'

test('localSummary names what this PC holds, singular or plural, skipping what it has none of', () => {
  assert.equal(localSummary({ sessions: 3, setups: 1, dashes: 2 }), '3 sessions, 1 setup and 2 dashes')
  assert.equal(localSummary({ sessions: 0, setups: 0, dashes: 1 }), '1 dash')
  assert.equal(localSummary({ sessions: 12, setups: 0, dashes: 2 }), '12 sessions and 2 dashes')
  assert.equal(localSummary({ sessions: 0, setups: 0, dashes: 0 }), 'nothing to move yet')
})

test('syncReportText says what a sync moved, what it kept, and why it stopped', () => {
  const counts = { uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0 }
  assert.equal(syncReportText('upload', { ...counts, uploaded: 5, ok: true }), 'Uploaded 5 items.')
  assert.equal(syncReportText('upload', { ...counts, ok: true }), 'Everything was already on the web.')
  assert.equal(syncReportText('download', { ...counts, downloaded: 1, conflicts: 2, ok: true }), 'Downloaded 1 item. Kept this PC’s version of 2 changed on both sides.')
  assert.equal(syncReportText('download', { ...counts, ok: true }), 'This PC already had everything.')
  assert.equal(syncReportText('upload', { ...counts, uploaded: 3, removedLocally: 2, ok: true }), 'Uploaded 3 items. 2 finished sessions now live only on the web.')
  assert.equal(syncReportText('upload', { ...counts, uploaded: 2, ok: false, error: 'Could not reach Sprint cloud.' }), 'Could not reach Sprint cloud. 2 uploaded before it stopped.')
})
