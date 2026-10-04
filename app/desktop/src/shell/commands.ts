import type { AppView, SprintCommand } from '../bridge'
import type { Platform } from '../platform'
import { primaryNav } from './nav'
import { shortcutLabel } from './shortcuts'

export type ShellCommand = {
  id: string
  label: string
  keywords: string
  /** Display text only (e.g. "Alt+1", "⌘1"). The shared shell keydown handler owns the actual binding. */
  shortcut?: string
  run: () => void
}

export type ShellCommandContext = {
  /** Picks the shortcut notation shown next to each command. */
  platform: Platform
  navigate: (view: AppView) => void
  send: (command: SprintCommand) => Promise<void>
  toggleSidebar: () => void
  checkForUpdates: () => void
  /** Opens the results import dialog; absent when the game has no results archive. */
  importResults?: () => void
}

/**
 * Ported from the old Avalonia app's `CreateShellCommands` (14 entries). Two of the
 * originals are dropped because their target doesn't exist in this shell:
 * - `compare.hud` toggled a Live Compare overlay that was never rebuilt here.
 * - `device.add` opened a device-catalog dialog; DevicesView owns its own dialogs now
 *   and the shell doesn't reach into view-owned UI, so only navigating to Devices
 *   (already covered by `nav.devices`) is reachable from here.
 * `nav.engineer` is new: the Race Engineer view didn't exist when the old palette
 * was written. `results.import` is the palette's copy of the planner/analysis
 * "Import results" action, listed only when the game has a results archive.
 */
export function buildShellCommands(context: ShellCommandContext): ShellCommand[] {
  const navCommands: ShellCommand[] = primaryNav.map((item, index) => ({
    id: `nav.${item.view.toLowerCase()}`,
    label: `Go to ${item.label}`,
    keywords: item.label.toLowerCase(),
    shortcut: shortcutLabel(context.platform, { kind: 'navigate', index }),
    run: () => context.navigate(item.view),
  }))

  return [
    ...navCommands,
    {
      id: 'nav.settings',
      label: 'Go to Settings',
      keywords: 'preferences profile updates',
      run: () => context.navigate('Settings'),
    },
    {
      id: 'nav.help',
      label: 'Open Help',
      keywords: 'reference diagnostics',
      run: () => context.navigate('Help'),
    },
    {
      id: 'shell.sidebar',
      label: 'Toggle sidebar',
      keywords: 'collapse expand navigation',
      run: context.toggleSidebar,
    },
    {
      id: 'dash.create',
      label: 'Create dash',
      keywords: 'new layout dashboard',
      run: () => {
        void context.send({ type: 'dash.create' })
        context.navigate('Dashes')
      },
    },
    {
      id: 'updates.check',
      label: 'Check for updates',
      keywords: 'release version',
      run: context.checkForUpdates,
    },
    ...(context.importResults
      ? [
          {
            id: 'results.import',
            label: 'Import race results',
            keywords: 'archive sessions laps history le mans ultimate',
            run: context.importResults,
          },
        ]
      : []),
    {
      id: 'help.shortcuts',
      label: 'Open keyboard shortcuts',
      keywords: 'keys commands help',
      run: () => context.navigate('Help'),
    },
  ]
}

export const filterCommands = (commands: ShellCommand[], query: string): ShellCommand[] => {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return commands
  return commands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(trimmed))
}
