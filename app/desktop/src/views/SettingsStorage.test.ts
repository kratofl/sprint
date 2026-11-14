import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lapsText, parseStorageInfo, sizeText } from './SettingsStorage'

test('parseStorageInfo reads the host’s numbers, keeps every lap when no limit is said, and refuses anything else', () => {
  assert.deepEqual(parseStorageInfo({ storage: { traceBytes: 2048, traceLaps: 3, traceExpiryDays: 90 } }), { traceBytes: 2048, traceLaps: 3, expiryDays: 90 })
  assert.deepEqual(parseStorageInfo({ storage: { traceBytes: 0, traceLaps: 0 } }), { traceBytes: 0, traceLaps: 0, expiryDays: 0 })
  assert.equal(parseStorageInfo({ storage: { traceBytes: '2048', traceLaps: 3 } }), null)
  assert.equal(parseStorageInfo({ storage: { traceBytes: -1, traceLaps: 3 } }), null)
  assert.equal(parseStorageInfo({}), null, 'a host from before storage was reported')
})

test('sizeText reads like a file size: megabytes below a gigabyte, a decimal only while it says something', () => {
  assert.equal(sizeText(0), '0 MB')
  assert.equal(sizeText(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(sizeText(412 * 1024 * 1024), '412 MB')
  assert.equal(sizeText(2.44 * 1024 ** 3), '2.4 GB')
  assert.equal(sizeText(137.2 * 1024 ** 3), '137 GB')
})

test('lapsText counts the laps and says what an empty store is for', () => {
  assert.equal(lapsText(0), 'Laps you drive are saved here')
  assert.equal(lapsText(1), '1 lap')
  assert.equal(lapsText(1284), '1,284 laps')
})
