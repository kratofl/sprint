import test from 'node:test'
import assert from 'node:assert/strict'
import { MultiDialPopupWatcher, multiDialInk, type MultiDialReading } from './multiDial'
import { dashColor } from './palette'

const reading = (position: number | null, changes: number, invertPopup = false): MultiDialReading => ({
  caption: 'MULTI',
  position,
  changes,
  positions: [{ label: 'DASH', color: '#1F7FE6' }, { label: 'TC2', color: '#E0A30C' }],
  invertPopup,
})

test('the first reading is where counting starts, not a turn', () => {
  const watcher = new MultiDialPopupWatcher()
  assert.equal(watcher.observe(reading(1, 4), 0, 1.5), null)
  assert.equal(watcher.observe(reading(1, 4), 100, 1.5), null)
})

test('a turn shows the new position for the duration, then it runs out', () => {
  const watcher = new MultiDialPopupWatcher()
  watcher.observe(reading(0, 0), 0, 1.5)

  const popup = watcher.observe(reading(1, 1, true), 1000, 1.5)

  assert.deepEqual(popup, { kind: 'multiDial', caption: 'MULTI', label: 'TC2', color: '#E0A30C', inverted: true })
  assert.equal(watcher.remaining(2000), 500)
  assert.equal(watcher.observe(reading(1, 1, true), 2500, 1.5), null)
})

test('losing the dial forgets the count, so its return is not a turn', () => {
  const watcher = new MultiDialPopupWatcher()
  watcher.observe(reading(0, 3), 0, 1.5)
  watcher.observe(null, 100, 1.5)

  assert.equal(watcher.observe(reading(1, 0), 200, 1.5), null)
})

test('lettering on a position colour is black on light colours and white on dark ones', () => {
  assert.equal(multiDialInk('#E0A30C'), dashColor.background)
  assert.equal(multiDialInk('#F5F5F7'), dashColor.background)
  assert.equal(multiDialInk('#7C3AED'), dashColor.text)
})
