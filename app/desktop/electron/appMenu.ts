import type { MenuItemConstructorOptions } from 'electron'

/** Dev-only shortcut that reopens the main window in the other OS look (see `main.ts`). */
export const TOGGLE_LOOK_ACCELERATOR = 'CmdOrCtrl+Alt+Shift+L'

/**
 * The macOS menu bar. macOS routes ⌘Q, ⌘H, ⌘M, ⌘W and the text-editing keys
 * (⌘C/⌘V/⌘X/⌘A/⌘Z) through the application menu (⌘W lives in the File menu's
 * Close Window, not in the Window menu), so a null menu would leave
 * inputs without copy/paste and the app without Quit. Only standard roles: the
 * app's own shortcuts (⌘K, ⌘1…7, ⌘[) are handled by the renderer and must not
 * be claimed here. Windows and Linux keep no menu bar.
 *
 * Dev builds add a Developer menu. Its look toggle only displays the shortcut:
 * `main.ts` handles the keys itself so they work on Windows too, which has no menu.
 */
export function macMenuTemplate({ packaged, onToggleLook }: { packaged: boolean; onToggleLook: () => void }): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]
  if (!packaged) {
    template.push({
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' },
        { label: 'Toggle Windows / macOS Look', accelerator: TOGGLE_LOOK_ACCELERATOR, registerAccelerator: false, click: onToggleLook },
      ],
    })
  }
  return template
}
