import type { MenuItemConstructorOptions } from 'electron'
import type { ZoomStep } from './uiZoom.js'

/** Dev-only shortcut that reopens the main window in the other look, brand or macOS (see `main.ts`). */
export const TOGGLE_LOOK_ACCELERATOR = 'CmdOrCtrl+Alt+Shift+L'

/** Dev-only shortcut that opens the debug window (electron/debugWindow.ts), handled in `main.ts`. */
export const OPEN_DEBUG_ACCELERATOR = 'CmdOrCtrl+Alt+Shift+D'

/**
 * The macOS menu bar. macOS routes ⌘Q, ⌘H, ⌘M, ⌘W and the text-editing keys
 * (⌘C/⌘V/⌘X/⌘A/⌘Z) through the application menu (⌘W lives in the File menu's
 * Close Window, not in the Window menu), so a null menu would leave
 * inputs without copy/paste and the app without Quit. Only standard roles: the
 * app's own shortcuts (⌘K, ⌘1…7, ⌘[) are handled by the renderer and must not
 * be claimed here. Windows and Linux keep no menu bar.
 *
 * The View menu's zoom items only display their shortcuts too: `main.ts` reads Ctrl/⌘ +, − and 0
 * on every window, so they work on Windows and with the = and keypad keys.
 *
 * Dev builds add a Developer menu. Its look toggle and debug window only display their shortcuts:
 * `main.ts` handles the keys itself so they work on Windows too, which has no menu.
 */
export function macMenuTemplate({
  packaged,
  onToggleLook,
  onOpenDebug,
  onZoom,
}: {
  packaged: boolean
  onToggleLook: () => void
  onOpenDebug: () => void
  onZoom: (step: ZoomStep) => void
}): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', registerAccelerator: false, click: () => onZoom('reset') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', registerAccelerator: false, click: () => onZoom('in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', registerAccelerator: false, click: () => onZoom('out') },
      ],
    },
    { role: 'windowMenu' },
  ]
  if (!packaged) {
    template.push({
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { label: 'Toggle Brand / macOS Look', accelerator: TOGGLE_LOOK_ACCELERATOR, registerAccelerator: false, click: onToggleLook },
        { label: 'Open Debug Window', accelerator: OPEN_DEBUG_ACCELERATOR, registerAccelerator: false, click: onOpenDebug },
      ],
    })
  }
  return template
}
