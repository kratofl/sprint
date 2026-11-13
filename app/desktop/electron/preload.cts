import { contextBridge, ipcRenderer } from 'electron'

/**
 * The entire renderer-facing surface. Sandboxed, context-isolated renderers
 * only ever see these methods on `window.sprint` — no ipcRenderer, no
 * Node globals, and no path to the bearer token guarding the native host.
 */
contextBridge.exposeInMainWorld('sprint', {
  getState: (): Promise<unknown> => ipcRenderer.invoke('sprint:get-state'),
  sendCommand: (command: unknown): Promise<unknown> => ipcRenderer.invoke('sprint:send-command', command),
  analysisTrace: (sessionId: string, lapNumber: number): Promise<unknown> => ipcRenderer.invoke('sprint:analysis-trace', sessionId, lapNumber),
  exportLap: (sessionId: string, lapNumber: number): Promise<unknown> => ipcRenderer.invoke('sprint:lap-export', sessionId, lapNumber),
  /** A lap file in two steps: open it (the host reads it, nothing is filed), then import or discard it. */
  openLapFile: (): Promise<unknown> => ipcRenderer.invoke('sprint:lap-open'),
  importLapFile: (token: string): Promise<unknown> => ipcRenderer.invoke('sprint:lap-import', token),
  discardLapFile: (token: string): Promise<unknown> => ipcRenderer.invoke('sprint:lap-discard', token),
  pickFolder: (title: string): Promise<unknown> => ipcRenderer.invoke('sprint:pick-folder', title),
  diagnosticsLogs: (minLevel: string, text: string): Promise<unknown> => ipcRenderer.invoke('sprint:diagnostics-logs', minLevel, text),
  planContext: (): Promise<unknown> => ipcRenderer.invoke('sprint:plan-context'),
  planTargets: (planId: string): Promise<unknown> => ipcRenderer.invoke('sprint:plan-targets', planId),
  setups: (): Promise<unknown> => ipcRenderer.invoke('sprint:setups'),
  setupSheet: (id: string, version: string | null): Promise<unknown> => ipcRenderer.invoke('sprint:setup-sheet', id, version),
  setupDriven: (id: string): Promise<unknown> => ipcRenderer.invoke('sprint:setup-driven', id),
  resultsImportScan: (includeDeclined: boolean): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-scan', includeDeclined),
  resultsImport: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import', ids),
  resultsImportDecline: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-decline', ids),
  /** Self-update (electron/updates.ts): the status now, then every change. */
  subscribeUpdates: (listener: (status: unknown) => void): (() => void) => {
    const onStatus = (_event: Electron.IpcRendererEvent, status: unknown): void => listener(status)
    ipcRenderer.on('sprint:updates', onStatus)
    ipcRenderer.send('sprint:updates-subscribe')
    return () => { ipcRenderer.removeListener('sprint:updates', onStatus) }
  },
  checkUpdates: (): Promise<unknown> => ipcRenderer.invoke('sprint:updates-check'),
  downloadUpdate: (): Promise<unknown> => ipcRenderer.invoke('sprint:updates-download'),
  restartToUpdate: (): Promise<unknown> => ipcRenderer.invoke('sprint:updates-restart'),
  signIn: (serverUrl: string, email: string, password: string, createAccount: boolean): Promise<unknown> =>
    ipcRenderer.invoke('sprint:account-sign-in', serverUrl, email, password, createAccount),
  signInWithDiscord: (serverUrl: string): Promise<unknown> => ipcRenderer.invoke('sprint:account-discord', serverUrl),
  cancelDiscordSignIn: (): Promise<unknown> => ipcRenderer.invoke('sprint:account-discord-cancel'),
  serverInfo: (serverUrl: string): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-server-info', serverUrl),
  signOut: (): Promise<unknown> => ipcRenderer.invoke('sprint:account-sign-out'),
  discoverServers: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-discover'),
  syncUp: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-push'),
  syncDown: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-pull'),
  /** Opens a dash in its own designer window, or brings that window forward (electron/designerWindows.ts). */
  openDashDesigner: (dashId: string): Promise<unknown> => ipcRenderer.invoke('sprint:open-dash-designer', dashId),
  /** Opens the pit wall, or brings it (or a page's or tile's own window) forward (electron/pitWallWindows.ts). */
  openPitWall: (target?: { kind: 'page' | 'tile'; id: string }): Promise<unknown> => ipcRenderer.invoke('sprint:open-pit-wall', target),
  /** A lap of the linked driver's for the pit wall's traces: current, last, best or target. */
  pitWallTrace: (lap: string): Promise<unknown> => ipcRenderer.invoke('sprint:pitwall-trace', lap),
  /** A training HUD window's feed (electron/hud.ts): its own part of each frame. */
  subscribeHud: (listener: (message: unknown) => void): (() => void) => {
    const onMessage = (_event: Electron.IpcRendererEvent, message: unknown): void => listener(message)
    ipcRenderer.on('sprint:hud', onMessage)
    ipcRenderer.send('sprint:hud-subscribe')
    return () => { ipcRenderer.removeListener('sprint:hud', onMessage) }
  },
  /** A HUD window's corner grip: the size it wants, and whether the drag has ended. */
  resizeHud: (width: number, height: number, done: boolean): void => ipcRenderer.send('sprint:hud-resize', width, height, done),
  subscribe: (listener: (state: unknown) => void): (() => void) => {
    const onState = (_event: Electron.IpcRendererEvent, state: unknown): void => listener(state)
    ipcRenderer.on('sprint:state', onState)
    ipcRenderer.send('sprint:subscribe')
    return () => {
      ipcRenderer.removeListener('sprint:state', onState)
      ipcRenderer.send('sprint:unsubscribe')
    }
  },
})
