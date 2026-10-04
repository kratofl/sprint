import type { MenuItemConstructorOptions } from 'electron'

/**
 * The macOS menu bar. macOS routes ⌘Q, ⌘H, ⌘M, ⌘W and the text-editing keys
 * (⌘C/⌘V/⌘X/⌘A/⌘Z) through the application menu (⌘W lives in the File menu's
 * Close Window, not in the Window menu), so a null menu would leave
 * inputs without copy/paste and the app without Quit. Only standard roles: the
 * app's own shortcuts (⌘K, ⌘1…7, ⌘[) are handled by the renderer and must not
 * be claimed here. Windows and Linux keep no menu bar.
 */
export function macMenuTemplate({ packaged }: { packaged: boolean }): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]
  if (!packaged) template.push({ label: 'Developer', submenu: [{ role: 'toggleDevTools' }] })
  return template
}
