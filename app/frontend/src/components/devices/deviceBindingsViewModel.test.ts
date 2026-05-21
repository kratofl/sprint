import test from 'node:test'
import assert from 'node:assert/strict'

import type { DeviceBinding } from '@/lib/dash'
import type { CommandMeta } from '@/lib/controls'
import { buildDeviceBindingsViewModel } from './deviceBindingsViewModel.ts'

function createCommand(id: string, label: string): CommandMeta {
  return {
    id,
    label,
    category: 'Dashboard',
    capturable: true,
    deviceOnly: true,
  }
}

function createBinding(command: string, button: number): DeviceBinding {
  return { command, button }
}

test('buildDeviceBindingsViewModel keeps global commands visible and groups active-dash MFW commands into cards', () => {
  const commands = [
    createCommand('dash.page.next', 'Next Page'),
    createCommand('dash.page.prev', 'Previous Page'),
    createCommand(
      'dash.wrapper.lay_alpha.page_main.mfw_speed.next',
      'Race Dash / Main Page / Speed MFW / Next Layer',
    ),
    createCommand(
      'dash.wrapper.lay_alpha.page_main.mfw_speed.prev',
      'Race Dash / Main Page / Speed MFW / Previous Layer',
    ),
    createCommand(
      'dash.wrapper.lay_alpha.page_main.mfw_fuel.next',
      'Race Dash / Main Page / Fuel MFW / Next Layer',
    ),
    createCommand(
      'dash.wrapper.lay_alpha.page_main.mfw_fuel.prev',
      'Race Dash / Main Page / Fuel MFW / Previous Layer',
    ),
    createCommand(
      'dash.wrapper.lay_beta.page_main.mfw_speed.next',
      'Alt Dash / Main Page / Speed MFW / Next Layer',
    ),
  ]
  const bindings = [
    createBinding('dash.page.next', 1),
    createBinding('dash.wrapper.lay_alpha.page_main.mfw_speed.prev', 2),
    createBinding('dash.wrapper.lay_beta.page_main.mfw_speed.next', 7),
  ]

  const viewModel = buildDeviceBindingsViewModel({
    commands,
    bindings,
    activeDashId: 'lay_alpha',
  })

  assert.equal(viewModel.hiddenBindingCount, 1)
  assert.equal(viewModel.cards.length, 3)
  assert.deepEqual(viewModel.cards.map(card => card.title), [
    'DEVICE_COMMANDS',
    'Fuel MFW',
    'Speed MFW',
  ])
  assert.equal(viewModel.cards[0]?.kind, 'global')
  assert.deepEqual(
    viewModel.cards[0]?.rows.map(row => ({ id: row.command.id, button: row.button })),
    [
      { id: 'dash.page.next', button: 1 },
      { id: 'dash.page.prev', button: 0 },
    ],
  )
  assert.equal(viewModel.cards[1]?.subtitle, 'Race Dash / Main Page')
  assert.deepEqual(
    viewModel.cards[2]?.rows.map(row => row.command.id),
    [
      'dash.wrapper.lay_alpha.page_main.mfw_speed.next',
      'dash.wrapper.lay_alpha.page_main.mfw_speed.prev',
    ],
  )
})

test('buildDeviceBindingsViewModel switches visible MFW cards with the active dash without mutating stored bindings', () => {
  const commands = [
    createCommand(
      'dash.wrapper.lay_alpha.page_main.mfw_speed.next',
      'Race Dash / Main Page / Speed MFW / Next Layer',
    ),
    createCommand(
      'dash.wrapper.lay_beta.page_main.mfw_radio.next',
      'Alt Dash / Main Page / Radio MFW / Next Layer',
    ),
    createCommand('dash.page.next', 'Next Page'),
  ]
  const bindings = [
    createBinding('dash.wrapper.lay_alpha.page_main.mfw_speed.next', 3),
    createBinding('dash.wrapper.lay_beta.page_main.mfw_radio.next', 4),
  ]

  const originalBindings = structuredClone(bindings)
  const alphaView = buildDeviceBindingsViewModel({
    commands,
    bindings,
    activeDashId: 'lay_alpha',
  })
  const betaView = buildDeviceBindingsViewModel({
    commands,
    bindings,
    activeDashId: 'lay_beta',
  })

  assert.deepEqual(
    alphaView.cards.map(card => card.title),
    ['DEVICE_COMMANDS', 'Speed MFW'],
  )
  assert.deepEqual(
    betaView.cards.map(card => card.title),
    ['DEVICE_COMMANDS', 'Radio MFW'],
  )
  assert.equal(alphaView.hiddenBindingCount, 1)
  assert.equal(betaView.hiddenBindingCount, 1)
  assert.deepEqual(bindings, originalBindings)
})
