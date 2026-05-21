export interface DashEditorRuntimeNotice {
  title: string
  description: string
  browserHint: string
  launchCommand: string
  waitCommand: string
  browserSurfaceUrl: string
  browserSurfaceNote: string
}

export function getDashEditorRuntimeNotice(desktopRuntimeAvailable: boolean): DashEditorRuntimeNotice | null {
  if (desktopRuntimeAvailable) return null

  return {
    title: 'DESKTOP RUNTIME REQUIRED',
    description: 'Dash Studio uses Wails bindings for layout creation, preview rendering, and widget catalog data.',
    browserHint: 'The Vite page at http://localhost:5173/ is only for browser-safe UI checks.',
    launchCommand: 'make dev-app-agent',
    waitCommand: 'pwsh -File .\\app\\scripts\\wait-desktop-browser.ps1',
    browserSurfaceUrl: 'http://127.0.0.1:34115',
    browserSurfaceNote: 'Use the default Wails browser URL above or replace the port with SPRINT_WAILS_DEVSERVER_PORT.',
  }
}
