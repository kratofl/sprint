import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const deviceSectionSource = readFileSync(
  new URL('./DeviceSection.tsx', import.meta.url),
  'utf8',
)

test('DeviceSection reloads binding reference data when dash layouts change', () => {
  assert.match(deviceSectionSource, /\bDASH_EVENTS\b/)
  assert.match(deviceSectionSource, /onEvent\(DASH_EVENTS\.layoutsUpdated/)
  assert.match(deviceSectionSource, /\bloadDeviceBindingReferenceData\b/)
})
