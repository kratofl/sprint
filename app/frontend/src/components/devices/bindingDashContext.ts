import type { LayoutMeta, SavedDevice } from '@/lib/dash'

export interface BindingDashContext {
  activeDashId: string
  showDashPicker: boolean
}

export function resolveBindingDashContext({
  device,
  layouts,
  selectedDashId,
}: {
  device: SavedDevice
  layouts: LayoutMeta[]
  selectedDashId: string
}): BindingDashContext {
  const fallbackDashId = layouts[0]?.id ?? ''
  const layoutIds = new Set(layouts.map(layout => layout.id))
  const resolveExistingDashId = (dashId: string) =>
    dashId && layoutIds.has(dashId) ? dashId : fallbackDashId

  if (device.type === 'screen') {
    return {
      activeDashId: resolveExistingDashId(device.dashId),
      showDashPicker: false,
    }
  }

  return {
    activeDashId: resolveExistingDashId(selectedDashId),
    showDashPicker: true,
  }
}
