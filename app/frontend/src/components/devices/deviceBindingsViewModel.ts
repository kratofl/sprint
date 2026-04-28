import type { DeviceBinding } from '@/lib/dash'
import type { CommandMeta } from '@/lib/controls'

const WRAPPER_ACTIONS = new Set(['next', 'prev'])

type BindingCardKind = 'global' | 'multi-function-widget'

interface ParsedWrapperCommandId {
  layoutId: string
  pageId: string
  groupId: string
  action: 'next' | 'prev'
}

export interface DeviceBindingCardRow {
  command: CommandMeta
  button: number
}

export interface DeviceBindingCard {
  key: string
  kind: BindingCardKind
  title: string
  subtitle?: string
  rows: DeviceBindingCardRow[]
}

export interface DeviceBindingsViewModel {
  cards: DeviceBindingCard[]
  hiddenBindingCount: number
}

export function buildDeviceBindingsViewModel({
  commands,
  bindings,
  activeDashId,
}: {
  commands: CommandMeta[]
  bindings: DeviceBinding[]
  activeDashId: string
}): DeviceBindingsViewModel {
  const buttonByCommand = new Map(bindings.map(binding => [binding.command, binding.button]))

  const globalRows: DeviceBindingCardRow[] = []
  const wrapperCards = new Map<string, DeviceBindingCard>()

  for (const command of commands) {
    const parsed = parseWrapperCommandId(command.id)
    const row = {
      command,
      button: buttonByCommand.get(command.id) ?? 0,
    }

    if (!parsed) {
      globalRows.push(row)
      continue
    }

    if (parsed.layoutId !== activeDashId) {
      continue
    }

    const key = `${parsed.layoutId}:${parsed.pageId}:${parsed.groupId}`
    const existing = wrapperCards.get(key)
    if (existing) {
      existing.rows.push(row)
      continue
    }

    const { title, subtitle } = describeWrapperCard(command.label)
    wrapperCards.set(key, {
      key,
      kind: 'multi-function-widget',
      title,
      subtitle,
      rows: [row],
    })
  }

  const cards: DeviceBindingCard[] = []
  if (globalRows.length > 0) {
    cards.push({
      key: 'global',
      kind: 'global',
      title: 'DEVICE_COMMANDS',
      rows: globalRows,
    })
  }

  cards.push(...Array.from(wrapperCards.values()).sort((left, right) => left.title.localeCompare(right.title)))

  return {
    cards,
    hiddenBindingCount: bindings.filter(binding => {
      const parsed = parseWrapperCommandId(binding.command)
      return parsed !== null && parsed.layoutId !== activeDashId
    }).length,
  }
}

function parseWrapperCommandId(commandId: string): ParsedWrapperCommandId | null {
  const parts = commandId.split('.')
  if (parts.length !== 6 || parts[0] !== 'dash' || parts[1] !== 'wrapper') {
    return null
  }

  const action = parts[5]
  if (!WRAPPER_ACTIONS.has(action)) {
    return null
  }

  return {
    layoutId: parts[2] ?? '',
    pageId: parts[3] ?? '',
    groupId: parts[4] ?? '',
    action: action as ParsedWrapperCommandId['action'],
  }
}

function describeWrapperCard(label: string): { title: string; subtitle?: string } {
  const base = label.replace(/ \/ (Next|Previous) Layer$/, '')
  const separator = base.lastIndexOf(' / ')
  if (separator === -1) {
    return { title: base }
  }

  return {
    title: base.slice(separator + 3),
    subtitle: base.slice(0, separator),
  }
}
