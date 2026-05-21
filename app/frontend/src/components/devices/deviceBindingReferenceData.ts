import type { CommandMeta } from '@/lib/controls'
import type { LayoutMeta } from '@/lib/dash'

interface DeviceBindingReferenceDataLoaders {
  listLayouts: () => Promise<LayoutMeta[]>
  getCommandCatalog: () => Promise<CommandMeta[]>
}

export interface DeviceBindingReferenceData {
  layouts: LayoutMeta[]
  deviceOnlyCmds: CommandMeta[]
}

export async function loadDeviceBindingReferenceData({
  listLayouts,
  getCommandCatalog,
}: DeviceBindingReferenceDataLoaders): Promise<DeviceBindingReferenceData> {
  const [layouts, commands] = await Promise.all([
    listLayouts().catch(() => [] as LayoutMeta[]),
    getCommandCatalog().catch(() => [] as CommandMeta[]),
  ])

  return {
    layouts,
    deviceOnlyCmds: selectDeviceBindingCommands(commands),
  }
}

export function selectDeviceBindingCommands(commands: CommandMeta[]): CommandMeta[] {
  return commands.filter(command => command.deviceOnly || isDashWrapperCycleCommand(command.id))
}

function isDashWrapperCycleCommand(commandId: string): boolean {
  const parts = commandId.split('.')
  if (parts.length !== 6 || parts[0] !== 'dash' || parts[1] !== 'wrapper') {
    return false
  }

  return parts[5] === 'next' || parts[5] === 'prev'
}
