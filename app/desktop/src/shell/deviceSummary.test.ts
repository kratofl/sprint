import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeDevices, type CountedDevice } from './deviceSummary'

const device = (name: string, connected: boolean, label: string, tone: CountedDevice['status']['tone']): CountedDevice => ({
  name,
  connected,
  status: { label, tone },
})

test('the status bar counts devices by state instead of listing them', () => {
  const summary = summarizeDevices([
    device('Wheel A', true, 'Connected', 'success'),
    device('Wheel B', true, 'Connected', 'success'),
    device('Screen', false, 'Not found', 'neutral'),
    device('Wheel C', false, 'Not found', 'neutral'),
  ])
  assert.deepEqual(summary?.parts, ['2 connected', '2 not found'])
  assert.equal(summary?.tone, 'neutral')
  assert.equal(summary?.detail, 'Wheel A: Connected\nWheel B: Connected\nScreen: Not found\nWheel C: Not found')
})

test('the dot takes the state that needs the most attention, and every device connected is success', () => {
  assert.equal(summarizeDevices([device('A', false, 'Not found', 'neutral'), device('B', false, 'USB busy', 'danger')])?.tone, 'danger')
  assert.deepEqual(summarizeDevices([device('A', false, 'USB busy', 'danger')])?.parts, ['1 USB busy'])
  assert.equal(summarizeDevices([device('A', true, 'Connected', 'success')])?.tone, 'success')
  assert.equal(summarizeDevices([]), null)
})
