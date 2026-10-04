import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildShellCommands, filterCommands } from './commands'
import { primaryNav } from './nav'

const noopContext = () => ({
  platform: 'windows' as const,
  navigate: () => undefined,
  send: async () => undefined,
  toggleSidebar: () => undefined,
  checkForUpdates: () => undefined,
})

test('the first seven commands are navigation, one per primaryNav entry in order, with Alt+1..7 shortcuts', () => {
  const commands = buildShellCommands(noopContext())
  const navCommands = commands.slice(0, primaryNav.length)
  assert.deepEqual(
    navCommands.map((command) => command.shortcut),
    primaryNav.map((_, index) => `Alt+${index + 1}`),
  )
  assert.deepEqual(
    navCommands.map((command) => command.label),
    primaryNav.map((item) => `Go to ${item.label}`),
  )
})

test('on mac the navigation shortcuts read ⌘1..7', () => {
  const commands = buildShellCommands({ ...noopContext(), platform: 'mac' })
  assert.deepEqual(
    commands.slice(0, primaryNav.length).map((command) => command.shortcut),
    primaryNav.map((_, index) => `⌘${index + 1}`),
  )
})

test('running a nav command navigates to its view', () => {
  const navigated: string[] = []
  const commands = buildShellCommands({ ...noopContext(), navigate: (view) => navigated.push(view) })
  const analysis = commands.find((command) => command.id === 'nav.analysis')
  analysis?.run()
  assert.deepEqual(navigated, ['Analysis'])
})

test('dash.create sends the command and navigates to Dashes', () => {
  const sent: unknown[] = []
  const navigated: string[] = []
  const commands = buildShellCommands({
    ...noopContext(),
    send: async (command) => {
      sent.push(command)
    },
    navigate: (view) => navigated.push(view),
  })
  commands.find((command) => command.id === 'dash.create')?.run()
  assert.deepEqual(sent, [{ type: 'dash.create' }])
  assert.deepEqual(navigated, ['Dashes'])
})

test('filterCommands matches on label and keywords, case-insensitively', () => {
  const commands = buildShellCommands(noopContext())
  assert.ok(filterCommands(commands, 'DASH').some((command) => command.id === 'nav.dashes'))
  assert.ok(filterCommands(commands, 'preferences').some((command) => command.id === 'nav.settings'))
  assert.equal(filterCommands(commands, 'no such command').length, 0)
})

test('filterCommands returns everything for an empty/whitespace query', () => {
  const commands = buildShellCommands(noopContext())
  assert.equal(filterCommands(commands, '   ').length, commands.length)
})

test('results.import is listed only when the game has a results archive', () => {
  assert.equal(buildShellCommands(noopContext()).some((command) => command.id === 'results.import'), false)
  let opened = 0
  const commands = buildShellCommands({ ...noopContext(), importResults: () => (opened += 1) })
  commands.find((command) => command.id === 'results.import')?.run()
  assert.equal(opened, 1)
})
