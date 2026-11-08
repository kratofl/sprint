import { bridge } from '../bridge'

/**
 * Opening a dash for editing goes through `openDashDesigner` and nothing else, so the designer
 * can move without touching its callers. The designer is its own window
 * (electron/designerWindows.ts, `designer/DashDesigner.tsx`); opening a dash whose window is
 * already open brings that window forward.
 */
export const openDashDesigner = (dashId: string): void => {
  bridge.openDashDesigner(dashId).catch((error: unknown) => console.error('Opening the dash designer failed', dashId, error))
}
