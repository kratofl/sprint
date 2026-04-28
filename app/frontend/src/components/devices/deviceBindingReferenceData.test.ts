import test from 'node:test'
import assert from 'node:assert/strict'

import type { CommandMeta } from '@/lib/controls'
import { selectDeviceBindingCommands } from './deviceBindingReferenceData.ts'

function createCommand(overrides: Partial<CommandMeta>): CommandMeta {
  return {
    id: 'dash.page.next',
    label: 'Next Page',
    category: 'Dashboard',
    capturable: true,
    deviceOnly: false,
    ...overrides,
  }
}

test('selectDeviceBindingCommands keeps device-only commands and dynamic MFW wrapper commands visible', () => {
  const commands = [
    createCommand({ id: 'dash.page.next', label: 'Next Page', deviceOnly: true }),
    createCommand({
      id: 'dash.wrapper.layout_a.page_main.mfw_speed.next',
      label: 'Race Dash / Main / Speed / Next Layer',
      deviceOnly: false,
    }),
    createCommand({ id: 'dash.page.prev', label: 'Previous Page', deviceOnly: false }),
  ]

  assert.deepEqual(
    selectDeviceBindingCommands(commands).map(command => command.id),
    [
      'dash.page.next',
      'dash.wrapper.layout_a.page_main.mfw_speed.next',
    ],
  )
})
