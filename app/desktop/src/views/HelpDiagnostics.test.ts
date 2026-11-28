import assert from 'node:assert/strict'
import { test } from 'node:test'
import { screenHint } from './HelpDiagnostics'

test('screenHint says what to do: plain words when unplugged, the host’s reason for other problems, nothing while fine', () => {
  const unplugged = 'Not on USB. Plug it in, or turn it off on its device page so Sprint stops looking.'

  assert.equal(screenHint(null), unplugged, 'a screen that never reported reads as unplugged')
  assert.equal(screenHint({ state: 'Disconnected', detail: 'No USB interface matched VID=0x0000 PID=0x0000.' }), unplugged)
  assert.equal(screenHint({ state: 'DeviceBusy', detail: 'Opened by another app' }), 'Opened by another app')
  assert.match(screenHint({ state: 'PermissionDenied', detail: 'WinUsb_Initialize failed with Win32 error 1' }) ?? '', /^It needs the WinUSB driver/)
  assert.equal(screenHint({ state: 'Faulted', detail: null }), 'It stopped answering. Unplug it and plug it back in.')
  assert.equal(screenHint({ state: 'Connected', detail: null }), null)
  assert.equal(screenHint({ state: 'Connecting', detail: 'Opening' }), null)
})
