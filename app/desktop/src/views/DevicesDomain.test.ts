import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandErrorMessage } from './DevicesDomain'

test('a refused command shows the host reason, also with the prefix Electron adds crossing IPC', () => {
  const body = '{"error":"That is not a Sprint link code."}'
  assert.equal(commandErrorMessage(new Error(`Runtime 400: ${body}`), 'fallback'), 'That is not a Sprint link code.')
  assert.equal(
    commandErrorMessage(new Error(`Error invoking remote method 'sprint:send-command': Error: Runtime 400: ${body}`), 'fallback'),
    'That is not a Sprint link code.',
  )
})
